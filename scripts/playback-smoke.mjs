/**
 * 播放回归测试：真实 sidecar + vite + Chromium，跑一遍播放链路。
 *
 * 覆盖的是重写后最容易再次退化的几条路径：
 *   1. 匿名账号能否真的播起来（position 在前进，而不只是 playing=true）
 *   2. 「一个音源」：整场只创建 1 个 <audio>、0 个 AudioContext
 *   3. 暂停 / 继续不丢位置（旧实现 resume 会从头播）
 *   4. 暂停中切音质：位置保持，且继续播放真的有声（旧实现从此永久静音）
 *   5. 删除正在播放的那首：音频跟着列表走（旧实现 UI 换了、音箱里还是旧歌）
 *   6. next()：换曲后引擎与 UI 指的是同一首
 *
 * 用法：node scripts/playback-smoke.mjs
 * 隔离性：sidecar 用临时 XDG_STATE_HOME，不读也不写你真实的
 * ~/.local/state/yunyin/sessions.json。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHILD_ENV = { ...process.env }

let failures = 0
let checks = 0
const children = []
let stateDir = ''

function check(name, ok, detail = '') {
  checks += 1
  if (!ok) failures += 1
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  → ${detail}` : ''}`)
}

function note(text) {
  console.log(`    · ${text}`)
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

function launch(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...CHILD_ENV, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  children.push(child)
  return child
}

function cleanup() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {
        /* already gone */
      }
    }
  }
  if (stateDir) {
    try {
      rmSync(stateDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

const apiPort = await freePort()
const webPort = await freePort()
stateDir = mkdtempSync(path.join(tmpdir(), 'yunyin-playback-'))
const apiBase = `http://127.0.0.1:${apiPort}`
const webBase = `http://127.0.0.1:${webPort}`

console.log('云音播放回归测试')
console.log(`  sidecar   ${apiBase}`)
console.log(`  前端      ${webBase}`)
console.log(`  隔离状态  ${stateDir}`)

launch(['sidecar/server.mjs', '--port', String(apiPort), '--host', '127.0.0.1'], {
  XDG_STATE_HOME: path.join(stateDir, 'state'),
})
if (!(await waitForHttp(`${apiBase}/health`, 25000))) {
  console.error('sidecar 未能就绪，测试中止')
  process.exit(1)
}

launch(
  [
    'node_modules/vite/bin/vite.js',
    '--port',
    String(webPort),
    '--host',
    '127.0.0.1',
    '--strictPort',
  ],
  { VITE_NCM_API: apiBase },
)
if (!(await waitForHttp(webBase, 40000))) {
  console.error('vite 未能就绪，测试中止')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } })

const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`)
})

// 统计音频资源：整场只允许 1 个 <audio>、0 个 AudioContext。
await page.addInitScript(() => {
  localStorage.setItem('yunyin.quality', 'standard')
  localStorage.setItem('yunyin.volume', '1')
  window.__audioEls = []
  window.__ctxCount = 0
  const OrigAudio = window.Audio
  window.Audio = class extends OrigAudio {
    constructor(...args) {
      super(...args)
      window.__audioEls.push(this)
    }
  }
  for (const key of ['AudioContext', 'webkitAudioContext']) {
    const Orig = window[key]
    if (!Orig) continue
    window[key] = class extends Orig {
      constructor(...args) {
        super(...args)
        window.__ctxCount += 1
      }
    }
  }
})

const snapshot = () =>
  page.evaluate(async () => {
    const { usePlayer } = await import('/src/player/store.ts')
    const { audioEngine } = await import('/src/player/engine.ts')
    const state = usePlayer.getState()
    const el = window.__audioEls?.[0] ?? null
    return {
      playing: state.playing,
      resolving: state.resolving,
      position: state.position,
      duration: state.duration,
      index: state.index,
      queueLength: state.queue.length,
      currentId: state.current()?.id ?? null,
      currentUrl: state.current()?.url ?? null,
      quality: state.quality,
      notice: state.notice?.text ?? null,
      engineTrackId: audioEngine.trackId,
      enginePlaying: audioEngine.playing,
      engineDuration: audioEngine.duration,
      audioElements: window.__audioEls?.length ?? -1,
      audioContexts: window.__ctxCount ?? -1,
      soundingElements: (window.__audioEls ?? []).filter((e) => !e.paused).length,
      elPaused: el ? el.paused : null,
      elTime: el ? Number(el.currentTime.toFixed(2)) : null,
      elSrc: el ? el.currentSrc || el.src : null,
    }
  })

const call = (method, ...args) =>
  page.evaluate(
    async ({ method, args }) => {
      const { usePlayer } = await import('/src/player/store.ts')
      const state = usePlayer.getState()
      return state[method](...args)
    },
    { method, args },
  )

const removeCurrent = () =>
  page.evaluate(async () => {
    const { usePlayer } = await import('/src/player/store.ts')
    const state = usePlayer.getState()
    state.removeFromQueue(state.index)
  })

async function waitFor(label, predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let last = await snapshot()
  while (Date.now() < deadline) {
    if (predicate(last)) return last
    await page.waitForTimeout(300)
    last = await snapshot()
  }
  throw new Error(`${label} 超时；当前状态 ${JSON.stringify(last)}`)
}

try {
  console.log('\n[1] 启动与选曲')
  await page.goto(webBase, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root > *', { timeout: 30000 })
  // 任意一次真实点击，等价于用户交互（Chromium 的自动播放策略看这个）。
  await page.mouse.click(3, 3)
  await page.waitForTimeout(1200)

  const prepared = await page.evaluate(async () => {
    const { search, fetchSongUrls } = await import('/src/api/ncm.ts')
    const { usePlayer } = await import('/src/player/store.ts')
    const found = await search('周杰伦', 8)
    const tracks = (found.tracks ?? []).filter((t) => t?.id)
    const urls = await fetchSongUrls(
      tracks.map((t) => t.id),
      'standard',
    )
    const playable = tracks.filter((t) => urls.get(t.id)?.url)
    if (playable.length < 3) return { playable: playable.length }
    await usePlayer.getState().playQueue(playable, 0)
    return { playable: playable.length }
  })
  check('匿名账号能取到可播放曲目', prepared.playable >= 3, `${prepared.playable} 首`)

  console.log('\n[2] 播放中')
  const playing = await waitFor('开始播放', (s) => s.playing && s.elPaused === false)
  check('playing 为真且元素未暂停', playing.playing && playing.elPaused === false)
  check(
    '引擎与 UI 指向同一首',
    playing.engineTrackId === playing.currentId,
    `engine=${playing.engineTrackId} ui=${playing.currentId}`,
  )
  check('整场只创建 1 个 <audio>', playing.audioElements === 1, `${playing.audioElements} 个`)
  check('没有 AudioContext（无 Web Audio 图）', playing.audioContexts === 0, `${playing.audioContexts} 个`)
  check('同时发声的元素只有 1 个', playing.soundingElements === 1, `${playing.soundingElements} 个`)
  check('时长已就绪', playing.duration > 0 || playing.engineDuration > 0, `${playing.duration}ms`)

  const t0 = (await snapshot()).position
  await page.waitForTimeout(2000)
  const t1 = (await snapshot()).position
  check('进度在前进（事件驱动刷新有效）', t1 > t0, `${t0}ms → ${t1}ms`)

  console.log('\n[3] 暂停 / 继续')
  await call('pause')
  const paused = await waitFor('进入暂停', (s) => s.playing === false && s.elPaused === true)
  const pausedAt = paused.position
  await page.waitForTimeout(1200)
  const stillPaused = await snapshot()
  check('暂停后位置不动', Math.abs(stillPaused.position - pausedAt) < 400, `${pausedAt}ms → ${stillPaused.position}ms`)

  await call('resume')
  const resumed = await waitFor('恢复播放', (s) => s.playing === true && s.elPaused === false)
  check(
    '继续播放从暂停处接着放（不是从头）',
    resumed.position >= pausedAt - 1500,
    `暂停于 ${pausedAt}ms，继续于 ${resumed.position}ms`,
  )

  console.log('\n[4] 暂停中切音质（旧实现从此静音）')
  await call('pause')
  await waitFor('暂停', (s) => s.playing === false)
  const beforeSwitch = await snapshot()
  await call('setQuality', 'standard')
  await waitFor('音质切换完成', (s) => s.resolving === false, 25000)
  await page.waitForTimeout(600)
  const settled = await snapshot()
  check(
    '切音质后位置保持',
    Math.abs(settled.position - beforeSwitch.position) < 3000,
    `${beforeSwitch.position}ms → ${settled.position}ms`,
  )
  check('切音质后仍是暂停态', settled.playing === false)
  check('切音质没有弹出错误', settled.notice === null, settled.notice ?? '')

  await call('resume')
  await waitFor('切档后恢复播放', (s) => s.playing === true && s.elPaused === false)
  const q0 = (await snapshot()).position
  await page.waitForTimeout(1800)
  const q1 = await snapshot()
  check('切档后恢复是真的有声（位置继续前进）', q1.position > q0, `${q0}ms → ${q1.position}ms`)

  console.log('\n[5] 删除正在播放的那首')
  const beforeRemove = await snapshot()
  const removedId = beforeRemove.currentId
  await removeCurrent()
  const afterRemove = await waitFor(
    '换到下一首',
    (s) => s.currentId !== removedId && s.engineTrackId === s.currentId,
    25000,
  )
  check(
    '引擎跟着列表换到新曲',
    afterRemove.engineTrackId === afterRemove.currentId,
    `engine=${afterRemove.engineTrackId} ui=${afterRemove.currentId}`,
  )
  const queueHasRemoved = await page.evaluate(async (id) => {
    const { usePlayer } = await import('/src/player/store.ts')
    return usePlayer.getState().queue.some((t) => t.id === id)
  }, removedId)
  check('队列中没有被删除的曲目', queueHasRemoved === false)
  await waitFor('删除后继续播放', (s) => s.playing === true && s.elPaused === false, 25000)

  console.log('\n[6] 下一首')
  const beforeNext = await snapshot()
  await call('next', { userInitiated: true })
  const afterNext = await waitFor(
    '切到下一首',
    (s) => s.currentId !== beforeNext.currentId && s.engineTrackId === s.currentId,
    25000,
  )
  check('next 后引擎与 UI 一致', afterNext.engineTrackId === afterNext.currentId)
  check('next 后仍在播放', afterNext.playing === true || afterNext.resolving === true)
  check('没有累积出第二个 <audio>', afterNext.audioElements === 1, `${afterNext.audioElements} 个`)
  check('没有累积出 AudioContext', afterNext.audioContexts === 0, `${afterNext.audioContexts} 个`)

  console.log('\n[7] 自然播完：单曲循环')
  await call('setMode', 'single')
  // 跳到结尾前 1.5 秒，等元素自己触发 ended。
  const beforeLoop = await snapshot()
  await call('seek', Math.max(0, beforeLoop.duration - 1500))
  const looped = await waitFor(
    '单曲循环回到开头',
    (s) => s.currentId === beforeLoop.currentId && s.position < 8000 && s.playing === true,
    30000,
  )
  check('单曲循环后仍是同一首', looped.currentId === beforeLoop.currentId)
  check('单曲循环后从开头继续播', looped.position < 8000, `${looped.position}ms`)

  console.log('\n[8] 自然播完：列表循环自动下一首')
  await call('setMode', 'list')
  const beforeEnded = await snapshot()
  await call('seek', Math.max(0, beforeEnded.duration - 1500))
  const advanced = await waitFor(
    '播完自动切下一首',
    (s) => s.currentId !== beforeEnded.currentId && s.engineTrackId === s.currentId,
    30000,
  )
  check('自动切歌后引擎与 UI 一致', advanced.engineTrackId === advanced.currentId)
  check('自动切歌后仍在播放', advanced.playing === true, `position=${advanced.position}ms`)
  check('自动切歌没有报错', advanced.notice === null, advanced.notice ?? '')

  console.log('\n[9] 控制台')
  const realErrors = consoleErrors.filter(
    (text) => !/favicon|ERR_CONNECTION_REFUSED.*favicon/i.test(text),
  )
  check('没有页面级错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} catch (error) {
  failures += 1
  console.error(`\n测试中断：${error.message}`)
  try {
    console.error('最后状态：', JSON.stringify(await snapshot()))
  } catch {
    /* page may be gone */
  }
} finally {
  await browser.close()
  cleanup()
}

console.log(`\n结果：${checks - failures}/${checks} 项通过`)
process.exit(failures === 0 ? 0 : 1)
