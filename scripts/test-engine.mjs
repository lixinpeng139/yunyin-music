/**
 * Drives the real AudioEngine through play / pause / resume cycles.
 *
 * The page is booted at the dev server so `import.meta.env.VITE_NCM_API` points
 * at a live bridge, and the session id is injected so API calls are signed in.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
await page.setViewportSize({ width: 900, height: 700 })
await page.addInitScript(
  (id) => localStorage.setItem('yunyin.client.v1', id),
  process.env.CID || '',
)
await page.goto(process.env.BASE || 'http://127.0.0.1:1580/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

const result = await page.evaluate(async () => {
  const { audioEngine: e } = await import('/src/player/engine.ts')
  const ncm = await import('/src/api/ncm.ts')

  const tracks = await ncm.fetchDailySongs()
  if (!tracks.length) return { error: 'no tracks' }
  const urls = await ncm.fetchSongUrls(tracks.slice(0, 6).map((t) => t.id), 'exhigh')
  let track = null
  for (const t of tracks) {
    const i = urls.get(t.id)
    if (i?.url) { track = { ...t, url: i.url, gain: i.gain }; break }
  }
  if (!track) return { error: 'no playable url' }

  const cycles = []
  e.setEvents({})
  e.load(track, { autoplay: true, gain: track.gain })

  // Wait for the media to report a duration.
  let loadedAt = null
  const t0 = performance.now()
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250))
    if (e.duration > 0) { loadedAt = Math.round(performance.now() - t0); break }
  }

  for (let i = 1; i <= 6; i += 1) {
    await new Promise((r) => setTimeout(r, 2000))
    const beforePause = e.position
    e.pause()
    await new Promise((r) => setTimeout(r, 400))
    const atPause = e.position
    await new Promise((r) => setTimeout(r, 600))
    const held = e.position
    e.play()
    await new Promise((r) => setTimeout(r, 400))
    const justResumed = e.position
    await new Promise((r) => setTimeout(r, 1600))
    const afterResume = e.position
    cycles.push({
      i,
      beforePause,
      atPause,
      heldOk: Math.abs(held - atPause) < 250,
      justResumed,
      afterResume,
      advanced: afterResume - justResumed,
      backToZero: justResumed < 200,
      playing: e.playing,
    })
  }
  return { cycles, loadedAt, title: track.name, dur: e.duration }
})

if (result.error) {
  console.log('  错误:', result.error)
} else {
  console.log(`  曲目: ${result.title}   加载耗时 ${result.loadedAt}ms   时长 ${result.dur}ms\n`)
  for (const c of result.cycles) {
    console.log(
      `  第 ${c.i} 轮  暂停前 ${String(c.beforePause).padStart(6)}ms  ` +
      `暂停后 ${String(c.held).padStart(6)}ms(保持=${c.heldOk ? '✓' : '✗'})  ` +
      `恢复瞬间 ${String(c.justResumed).padStart(6)}ms  ` +
      `1.6s后 ${String(c.afterResume).padStart(6)}ms  ` +
      `前进 ${c.advanced}ms ${c.advanced > 1000 ? '✓' : '⚠'}  playing=${c.playing}`,
    )
  }
  const zero = result.cycles.filter((c) => c.backToZero).length
  const stuck = result.cycles.filter((c) => c.advanced <= 1000).length
  const notHeld = result.cycles.filter((c) => !c.heldOk).length
  console.log(`\n  恢复到 0:00 的次数: ${zero}   恢复后不前进: ${stuck}   暂停未保持: ${notHeld}`)
  console.log(zero === 0 && stuck === 0 && notHeld === 0 ? '  ✓ 全部正常' : '  ⚠ 存在问题')
}
await browser.close()
