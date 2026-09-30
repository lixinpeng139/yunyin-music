#!/usr/bin/env node
/**
 * One-shot login verification for a phone + captcha pair.
 *
 * Performs the whole chain the app performs, then proves the session is
 * actually useful by asking for a playback URL, which is the thing a logged-in
 * account unlocks. Prints raw responses so a failure is attributable.
 *
 * Usage: node scripts/verify-login.mjs <phone> --password <password> [countrycode]
 *        node scripts/verify-login.mjs <phone> <captcha> [countrycode]
 *
 * The captcha is taken from argv and never written to disk.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mirror the bridge: prefer IPv4 so a host without a working IPv6 route does
// not pay a TCP timeout on every request.
const dns = await import('node:dns')
try {
  dns.default.setDefaultResultOrder('ipv4first')
} catch {
  /* keep the runtime default */
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB = path.join(ROOT, 'sidecar', 'node_modules', 'NeteaseCloudMusicApi')
const api = (await import(path.join(LIB, 'main.js'))).default

const argv = process.argv.slice(2)
const phone = argv[0]
const usePassword = argv[1] === '--password'
const secret = usePassword ? argv[2] : argv[1]
const countrycode = (usePassword ? argv[3] : argv[2]) || '86'
if (!phone || !secret) {
  console.error(
    '用法:\n  node scripts/verify-login.mjs <phone> --password <password> [countrycode]\n' +
      '  node scripts/verify-login.mjs <phone> <captcha> [countrycode]',
  )
  process.exit(2)
}

const jar = {}
function absorb(raw) {
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
}
const header = () =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

const INTERESTING = ['MUSIC_U', '__csrf', 'MUSIC_A', 'NMTID', '__remember_me']
function show(name) {
  const entries = Object.entries(jar)
  if (!entries.length) return console.log(`  ${name}: (空)`)
  const lines = entries.map(([k, v]) => {
    const mark = INTERESTING.includes(k) ? ' *' : ''
    const shown = INTERESTING.includes(k) ? v : `${v.slice(0, 10)}…`
    return `${k}=${shown}${mark}`
  })
  console.log(`  ${name}:`)
  for (const line of lines) console.log(`    ${line}`)
}

async function call(label, fn, query, { anonymous = false } = {}) {
  const finalQuery = { ...query, timestamp: Date.now() }
  if (!anonymous) {
    const h = header()
    if (h) finalQuery.cookie = h
  }
  try {
    const result = await fn(finalQuery)
    const body = result?.body ?? {}
    console.log(`\n[${label}] code=${body.code}`)
    if (body.msg || body.message) console.log(`  msg: ${body.msg ?? body.message}`)
    const changed = absorb(result?.cookie)
    if (changed.length) console.log(`  cookie 更新: ${changed.join(', ')}`)
    return body
  } catch (error) {
    const body = error?.body ?? {}
    console.log(`\n[${label}] 抛错 status=${error?.status} code=${body.code}`)
    console.log(`  msg: ${body.msg ?? body.message ?? error?.message}`)
    return body
  }
}

console.log(`════ 1. ${usePassword ? '密码' : '验证码'}登录 ════`)
const login = await call(
  'login/cellphone',
  api.login_cellphone,
  usePassword
    ? { phone, password: secret, ctcode: countrycode, countrycode }
    : { phone, captcha: secret, ctcode: countrycode, countrycode },
  { anonymous: true },
)
show('会话')
if (login.code !== 200) {
  console.log('\n登录失败，后续步骤无意义。')
  process.exit(1)
}
console.log(`  账号: ${login.profile?.nickname ?? '(未返回 profile)'} uid=${login.profile?.userId ?? '?'}`)

console.log('\n════ 2. 用会话查询账号（App 登录后立刻做的事）════')
const account = await call('user/account', api.user_account, {})
if (!account.profile) {
  console.log('\n✗ 会话无法获取账号信息')
  process.exit(1)
}
console.log(`  ✓ ${account.profile.nickname} (uid=${account.profile.userId})`)

console.log('\n════ 3. 收藏列表 ════')
const uid = account.profile.userId
const liked = await call('likelist', api.likelist, { uid })
console.log(`  收藏 ${liked.ids?.length ?? 0} 首`)

console.log('\n════ 4. 每日推荐（需要登录）════')
const daily = await call('recommend/songs', api.recommend_songs, {})
const songs = daily.data?.dailySongs ?? []
console.log(`  每日推荐 ${songs.length} 首`)
if (songs[0]) console.log(`  第一首: ${songs[0].name} — ${songs[0].ar?.map((a) => a.name).join('/')}`)

console.log('\n════ 5. 歌曲播放地址（登录的核心价值）════')
const target = songs[0]?.id ?? 347230
const url = await call('song/url/v1', api.song_url_v1, { id: target, level: 'exhigh' })
const info = url.data?.[0]
if (info?.url) {
  console.log(`  ✓ 拿到播放地址 (br=${info.br}, size=${info.size})`)
  console.log(`    ${String(info.url).slice(0, 120)}`)
} else {
  console.log(`  ✗ 没有播放地址 (fee=${info?.fee}, code=${info?.code})`)
}

console.log('\n════ 6. 心动模式（需要登录 + 歌单）════')
const playlistId = 3778678
const intel = await call('playmode/intelligence/list', api.playmode_intelligence_list, {
  id: target,
  pid: playlistId,
  sid: target,
  count: 5,
})
console.log(`  推荐 ${intel.data?.length ?? 0} 首`)

console.log('\n════ 7. 私人 FM（需要登录）════')
const fm = await call('personal_fm', api.personal_fm, {})
console.log(`  FM 返回 ${fm.data?.length ?? 0} 首`)

console.log('\n完成。')
