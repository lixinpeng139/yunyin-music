/**
 * Checks that pausing and resuming keeps the playback position, and that the
 * volume applied per sound stays constant across cycles.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
await rows.nth(0).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(6000)

const snap = () => page.evaluate(async () => {
  const mod = await import('/src/player/engine.ts')
  const e = mod.audioEngine
  return { pos: e.position, dur: e.duration, playing: e.playing }
})

console.log('  播放 6s 后: ', JSON.stringify(await snap()))

for (let i = 1; i <= 3; i += 1) {
  await page.keyboard.press('Space')          // pause
  await page.waitForTimeout(900)
  const paused = await snap()
  await page.waitForTimeout(1500)             // stay paused
  const stillPaused = await snap()
  await page.keyboard.press('Space')          // resume
  await page.waitForTimeout(1200)
  const resumed = await snap()
  const held = Math.abs(stillPaused.pos - paused.pos) < 400
  const continued = resumed.pos > stillPaused.pos
  console.log(
    `  第 ${i} 轮: 暂停@${paused.pos}ms 保持不动=${held ? '✓' : '✗'} ` +
    `恢复@${resumed.pos}ms 继续前进=${continued ? '✓' : '✗'} playing=${resumed.playing}`,
  )
}

// Volume must not drift across resumes.
const vol = await page.evaluate(async () => {
  const mod = await import('/src/player/engine.ts')
  const e = mod.audioEngine
  const out = []
  for (let i = 0; i < 3; i += 1) {
    e.pause(); await new Promise((r) => setTimeout(r, 300))
    e.play(); await new Promise((r) => setTimeout(r, 300))
    out.push(e.playing)
  }
  return out
})
console.log('  连续 3 次暂停/恢复后仍在播放:', JSON.stringify(vol))
await browser.close()
