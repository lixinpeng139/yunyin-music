#!/usr/bin/env node
/**
 * Login diagnostics for YunYin.
 *
 * Drives the real NetEase login flows through the same library the app bundles,
 * printing every request and response so a failure can be attributed instead of
 * guessed at. Credentials are passed on the command line and never written to
 * disk.
 *
 * Usage:
 *   node scripts/diagnose-login.mjs qr
 *   node scripts/diagnose-login.mjs captcha  <phone> [countrycode]
 *   node scripts/diagnose-login.mjs password <phone> <password> [countrycode]
 *
 * The `qr` mode renders the code in the terminal; scan it with the NetEase app.
 * Press Ctrl+C to stop.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = path.join(ROOT, 'sidecar', 'node_modules', 'NeteaseCloudMusicApi')
const require = createRequire(path.join(ROOT, 'sidecar', 'package.json'))

const qrcode = require('qrcode')
const api = require(path.join(LIB_DIR, 'main.js'))

/** Cookies worth showing in full; the rest are truncated. */
const INTERESTING = ['MUSIC_U', '__csrf', 'MUSIC_A', 'NMTID', '__remember_me']

function describeCookie(raw) {
  if (!raw) return '(none)'
  const parts = String(raw)
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
  const seen = new Map()
  for (const part of parts) {
    const index = part.indexOf('=')
    const name = part.slice(0, index)
    const value = part.slice(index + 1)
    if (!seen.has(name)) seen.set(name, value)
  }
  return [...seen.entries()]
    .map(([name, value]) => {
      const shown = INTERESTING.includes(name) ? value : `${value.slice(0, 12)}…`
      const mark = INTERESTING.includes(name) ? ' *' : ''
      return `${name}=${shown}${mark}`
    })
    .join('\n                             ')
}

/** Merges Set-Cookie strings into a jar the way the app's client does. */
function makeJar() {
  const jar = {}
  return {
    absorb(raw) {
      if (!raw) return []
      const list = Array.isArray(raw) ? raw : String(raw).split(/,(?=\s*[A-Za-z_][\w-]*=)/)
      const changed = []
      for (const entry of list) {
        const pair = entry.split(';')[0]?.trim()
        if (!pair) continue
        const eq = pair.indexOf('=')
        if (eq <= 0) continue
        const name = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        if (!name || !value) continue
        if (jar[name] !== value) changed.push(name)
        jar[name] = value
      }
      return [...new Set(changed)]
    },
    header() {
      return Object.entries(jar)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
    },
    raw() {
      return jar
    },
  }
}

function step(index, title) {
  console.log(`\n\u2501\u2501\u2501 ${index}. ${title} \u2501\u2501\u2501`)
}

function showResponse(label, result) {
  const body = result?.body ?? {}
  console.log(`  ${label}: code=${body.code ?? '(none)'} msg=${body.msg ?? body.message ?? '(none)'}`)
  if (body.data !== undefined && typeof body.data !== 'object') {
    console.log(`         data=${JSON.stringify(body.data)}`)
  }
  const cookie = Array.isArray(result?.cookie) ? result.cookie.join(';') : ''
  if (cookie) console.log(`         raw set-cookie: ${cookie.slice(0, 220)}`)
}

async function call(fn, query, jar, { anonymous = false } = {}) {
  const finalQuery = { ...query }
  if (!anonymous) {
    const header = jar.header()
    if (header) finalQuery.cookie = header
  }
  finalQuery.timestamp = finalQuery.timestamp ?? Date.now()
  const result = await fn(finalQuery)
  const changed = jar.absorb(result?.cookie)
  if (changed.length) console.log(`  cookie updated: ${changed.join(', ')}`)
  return result
}

async function runQr(jar) {
  step(1, '申请二维码 key')
  const keyResult = await call(api.login_qr_key, {}, jar)
  showResponse('login/qr/key', keyResult)
  const key = keyResult.body?.data?.unikey
  if (!key) throw new Error('没有拿到 unikey，无法继续')

  step(2, '生成二维码')
  const createResult = await call(api.login_qr_create, { key, qrimg: true }, jar)
  showResponse('login/qr/create', createResult)
  const qrurl = createResult.body?.data?.qrurl
  if (!qrurl) throw new Error('没有拿到 qrurl，无法继续')
  console.log(`  qrurl: ${qrurl}`)
  // A PNG is more reliable than terminal output across fonts and terminals.
  const pngPath = path.join(ROOT, 'qr-login.png')
  writeFileSync(pngPath, await qrcode.toBuffer(qrurl, { width: 420, margin: 2 }))
  console.log(`\n  二维码已保存: ${pngPath}`)
  console.log('  用网易云音乐 App 扫描这个文件里的二维码（也可以在终端里扫下面这个）：\n')
  console.log(
    await qrcode.toString(qrurl, { type: 'terminal', small: true, errorCorrectionLevel: 'L' }),
  )

  step(3, '轮询扫码状态')
  const started = Date.now()
  let last = ''
  for (;;) {
    const result = await call(api.login_qr_check, { key, noCookie: true }, jar)
    const body = result.body ?? {}
    const line = `code=${body.code} msg=${body.message ?? body.msg ?? ''}`
    const elapsed = Math.round((Date.now() - started) / 1000)
    if (line !== last) {
      console.log(`  [${elapsed}s] ${line}`)
      last = line
    } else if (elapsed % 20 === 0) {
      console.log(`  [${elapsed}s] ${line} (仍在等待)`)
    }
    if (body.code === 803) {
      const cookie = Array.isArray(result.cookie) ? result.cookie.join(';') : ''
      console.log(`\n  [${elapsed}s] code=803 登录成功`)
      console.log('\n  接口返回的完整 body 字段:')
      console.log(`    ${Object.keys(body).join(', ')}`)
      for (const field of ['account', 'profile', 'bindings', 'cookie']) {
        const value = body[field]
        if (value === undefined) continue
        const shown = typeof value === 'object' ? JSON.stringify(value).slice(0, 160) : String(value).slice(0, 160)
        console.log(`    ${field} = ${shown}`)
      }
      console.log('\n  收到的 Set-Cookie：')
      console.log(`    ${describeCookie(cookie)}`)
      console.log(`\n  合并后的会话（后续请求会带上的）：\n    ${describeCookie(jar.header())}`)
      return true
    }
    if (body.code === 800) {
      console.log('  二维码已过期')
      return false
    }
    if (Date.now() - started > 240_000) {
      console.log('  等待超时（4 分钟），停止')
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

async function runCaptcha(jar, phone, countrycode) {
  step(1, `发送验证码到 ${phone}`)
  const sent = await call(api.captcha_sent, { phone, countrycode }, jar, { anonymous: true })
  showResponse('captcha/sent', sent)
  if (sent.body?.code !== 200) {
    console.log('\n  验证码没有发出去，后面的步骤无法继续。')
    return false
  }

  if (!process.stdin.isTTY) {
    console.log('\n  验证码已发出（当前不是交互终端，无法继续读取验证码）。')
    console.log('  请在终端里直接运行本命令以完成验证码登录。')
    return 'sent'
  }
  console.log('\n  请输入收到的验证码，然后回车：')
  const captcha = await new Promise((resolve) => {
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (data) => resolve(String(data).trim()))
  })

  step(2, '用验证码登录')
  const result = await call(api.login_cellphone, { phone, captcha, countrycode }, jar, {
    anonymous: true,
  })
  showResponse('login/cellphone', result)
  if (result.body?.code !== 200) return false
  const cookie = Array.isArray(result.cookie) ? result.cookie.join(';') : ''
  console.log(`\n  会话：\n    ${describeCookie(jar.header() || cookie)}`)
  return true
}

async function runPassword(jar, phone, password, countrycode) {
  step(1, `用密码登录 ${phone}`)
  const result = await call(api.login_cellphone, { phone, password, countrycode }, jar, {
    anonymous: true,
  })
  showResponse('login/cellphone', result)
  if (result.body?.code !== 200) return false
  console.log(`\n  会话：\n    ${describeCookie(jar.header())}`)
  return true
}

async function verifySession(jar) {
  step(4, '用会话查询账号信息（App 登录后做的第一件事）')
  const account = await call(api.user_account, {}, jar)
  const body = account.body ?? {}
  console.log(`  user/account: code=${body.code} profile=${body.profile ? body.profile.nickname : 'null'}`)
  if (!body.profile) {
    console.log('  ✗ 会话无法获取账号信息 —— 这正是 App 里「登录后卡住」的原因')
    return false
  }
  console.log(`  ✓ 账号: ${body.profile.nickname} (uid=${body.profile.userId})`)

  const uid = body.profile.userId
  const liked = await call(api.likelist, { uid }, jar)
  console.log(`  likelist: code=${liked.body?.code} ids=${liked.body?.ids?.length ?? 0}`)
  return true
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2)
  const jar = makeJar()

  if (mode === 'qr') {
    const ok = await runQr(jar)
    if (ok) await verifySession(jar)
    return
  }
  if (mode === 'captcha') {
    const [phone, countrycode = '86'] = rest
    if (!phone) throw new Error('用法: diagnose-login.mjs captcha <phone> [countrycode]')
    const outcome = await runCaptcha(jar, phone, countrycode)
    if (outcome === true) await verifySession(jar)
    return
  }
  if (mode === 'password') {
    const [phone, password, countrycode = '86'] = rest
    if (!phone || !password) {
      throw new Error('用法: diagnose-login.mjs password <phone> <password> [countrycode]')
    }
    const ok = await runPassword(jar, phone, password, countrycode)
    if (ok) await verifySession(jar)
    return
  }

  console.log(`未知模式: ${mode ?? '(空)'}
用法:
  node scripts/diagnose-login.mjs qr
  node scripts/diagnose-login.mjs captcha  <phone> [countrycode]
  node scripts/diagnose-login.mjs password <phone> <password> [countrycode]`)
  process.exitCode = 2
}

main().catch((error) => {
  console.error(`\n诊断中断: ${error?.message ?? error}`)
  process.exitCode = 1
})
