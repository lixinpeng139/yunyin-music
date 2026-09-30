/**
 * Drives the real AudioEngine through play / pause / resume cycles and reports
 * the position at each step, which is where the reported bugs live.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
await page.setViewportSize({ width: 900, height: 700 })
await page.goto('http://127.0.0.1:1570/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

const result = await page.evaluate(async () => {
  const { audioEngine: e } = await import('/src/player/engine.ts')
  const ncm = await import('/src/api/ncm.ts')

  // fetchDailySongs returns tracks without playback urls; resolve one the same
  // way the player does.
  const tracks = await ncm.fetchDailySongs()
  if (!tracks.length) return { error: 'no tracks' }
  const ids = tracks.slice(0, 6).map((t) => t.id)
  const urls = await ncm.fetchSongUrls(ids, 'exhigh')   // returns a Map
  let track = null
  for (const t of tracks) {
    const info = urls.get(t.id)
    if (info?.url) { track = { ...t, url: info.url, gain: info.gain }; break }
  }
  if (!track) return { error: 'no playable url among ' + ids.length + ' tracks' }

  const log = []
  const snap = (label) => {
    log.push({
      label,
      pos: e.position,
      dur: e.duration,
      playing: e.playing,
    })
  }

  e.setEvents({})
  const t0 = performance.now()
  e.load(track, { autoplay: true, gain: track.gain })
  // Poll until the media reports a duration, so the load latency is visible.
  let loadedAt = null
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    if (e.duration > 0) { loadedAt = Math.round(performance.now() - t0); break }
  }
  log.push({ label: `loaded after ${loadedAt ?? '>20000'}ms`, pos: e.position, dur: e.duration, playing: e.playing })
  await new Promise((r) => setTimeout(r, 3000))
  snap('play 3s more')

  for (let i = 1; i <= 8; i += 1) {
    e.pause()
    await new Promise((r) => setTimeout(r, 600))
    const a = e.position
    await new Promise((r) => setTimeout(r, 900))
    const b = e.position
    const held = Math.abs(b - a) < 300
    e.play()
    await new Promise((r) => setTimeout(r, 2500))
    const after = e.position
    log.push({
      label: `cycle ${i}`,
      pos: after,
      dur: e.duration,
      playing: e.playing,
      held,
      jumpedBack: after < a - 200,
      atZero: after < 50,
    })
  }
  return { log, title: track.name }
})

if (result.error) {
  console.log('  错误:', result.error)
} else {
  console.log('  曲目:', result.title)
  let prev = null
  for (const r of result.log) {
    const delta = prev === null ? '' : `  Δ=${r.pos - prev}ms`
    console.log(
      `  ${String(r.label).padEnd(22)} pos=${String(r.pos).padStart(6)}ms dur=${r.dur} playing=${r.playing}` +
        (r.held === undefined ? '' : ` held=${r.held}`) +
        (r.jumpedBack ? ' JUMPED-BACK' : '') +
        (r.atZero ? ' AT-ZERO' : ''),
    )
    prev = r.pos
  }
  const cycles = result.log.filter((r) => r.label.startsWith('cycle'))
  const zero = cycles.filter((r) => r.atZero).length
  const back = cycles.filter((r) => r.jumpedBack).length
  const notHeld = cycles.filter((r) => r.held === false).length
  console.log(`\n  8 轮结果: 停在 0:00 ${zero} 次 | 位置倒退 ${back} 次 | 暂停未保持 ${notHeld} 次`)
  console.log(zero === 0 && back === 0 ? '  ✓ 正常' : '  ⚠ 复现了用户报告的问题')
}
await browser.close()
