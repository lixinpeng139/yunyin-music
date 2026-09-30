/**
 * Drives the real AudioEngine directly across pause/resume cycles.
 *
 * The engine module is loaded from the dev server, so this exercises exactly the
 * code that ships — no UI, no store, no guessing about which layer is at fault.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
await page.setViewportSize({ width: 900, height: 700 })
await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

const result = await page.evaluate(async () => {
  const mod = await import('/src/player/engine.ts')
  const engine = mod.audioEngine
  // Howler is reachable through the already-loaded bundle; re-importing it by
  // bare specifier does not resolve inside the page.
  const howler = window.Howler
  if (!howler) return [{ error: 'Howler not on window' }]

  // A short, reliable public-domain clip.
  // Resolve a real, playable URL through the app's own API layer.
  const ncm = await import('/src/api/ncm.ts')
  const tracks = await ncm.fetchDailySongs()
  const track = tracks.find((t) => t.url)
  if (!track) return [{ error: 'no playable track' }]
  await ncm.hydrate([track]).catch(() => {})

  const report = (prevId) => {
    const h = howler._howls[howler._howls.length - 1]
    if (!h) return { noHowl: true }
    const ids = (h._sounds || []).map((s) => s._id)
    const playing = ids.filter((id) => h.playing(id))
    return {
      pool: ids.length,
      playing: playing.length,
      oldStillSounding: prevId != null ? h.playing(prevId) : null,
    }
  }

  const seq = []
  engine.setEvents({})
  engine.load(track, { autoplay: false })
  await new Promise((r) => setTimeout(r, 4000))
  seq.push({ step: 'load', ...report() })

  // Six play/pause cycles: the pattern that used to layer sources.
  for (let i = 1; i <= 6; i += 1) {
    engine.play()
    await new Promise((r) => setTimeout(r, 1200))
    const afterPlay = report()
    engine.pause()
    await new Promise((r) => setTimeout(r, 600))
    seq.push({ step: `cycle ${i}`, afterPlay, afterPause: report() })
  }

  // Repeated immediate plays with no pause between them.
  engine.play()
  engine.play()
  engine.play()
  await new Promise((r) => setTimeout(r, 1500))
  seq.push({ step: 'triple play', ...report() })

  return seq
})

if (!Array.isArray(result)) {
  console.log('  意外结果:', JSON.stringify(result))
} else {
  for (const r of result) {
    if (r && r.error) { console.log('  错误:', r.error); continue }
    if (r && r.afterPlay) {
      console.log(`  ${String(r.step).padEnd(12)} play后=${JSON.stringify(r.afterPlay)}  pause后=${JSON.stringify(r.afterPause)}`)
    } else if (r) {
      console.log(`  ${String(r.step ?? '?').padEnd(12)} ${JSON.stringify(r)}`)
    }
  }
}
const worst = Math.max(...result.map((r) => (r.afterPlay ? r.afterPlay.playing : r.playing || 0)))
console.log(`\n  峰值同时播放音源数: ${worst}  ${worst > 1 ? '⚠ 重音' : '✓ 正常'}`)
await browser.close()
