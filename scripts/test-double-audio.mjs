/**
 * Reproduces the doubled-audio bug by issuing two plays in a row and checking
 * whether the engine starts one source or two.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })
await page.addInitScript((id) => {
  localStorage.setItem('yunyin.client.v1', id)
  // Intercept at the AudioContext *instance* level, which Howler cannot bypass.
  const AC = window.AudioContext
  const origAC = AC.prototype.createBufferSource
  window.__src = { total: 0 }
  AC.prototype.createBufferSource = function patched(...args) {
    window.__src.total += 1
    return origAC.apply(this, args)
  }
}, process.env.CID || '')

await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
await rows.nth(0).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(5000)

// Reach the engine's own Howl via Howler's registry.
const r = await page.evaluate(async () => {
  const howls = (window.Howler && window.Howler._howls) || []
  const out = { howlCount: howls.length, probes: [] }
  for (const h of howls) {
    const before = window.__src.total
    h.play()
    h.play()
    await new Promise((res) => setTimeout(res, 900))
    const ids = h._sounds ? h._sounds.map((snd) => snd._id) : []
    out.probes.push({
      src: (h._src || '').toString().slice(-32),
      soundCount: ids.length,
      playingIds: ids.filter((id) => h.playing(id)).length,
      newSourcesAfterTwoPlays: window.__src.total - before,
    })
  }
  return out
})
console.log(JSON.stringify(r, null, 2))
const doubled = r.probes.some((p) => p.playingIds > 1 || p.newSourcesAfterTwoPlays > 1)
console.log(doubled ? '\n  ⚠ 两次 play() 产生了多个音源' : '\n  ✓ 两次 play() 只产生一个音源')
await browser.close()
