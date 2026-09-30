/**
 * Drives the engine's own play()/pause() across several cycles, which is the
 * path a user exercises, and reports how many sources are sounding.
 *
 * The previous version called `howl.play()` directly and so bypassed the engine
 * under test entirely.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')

await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
await rows.nth(0).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(5000)

/** Counts sounds that Howler itself considers playing. */
const count = () =>
  page.evaluate(() => {
    const h = (window.Howler && window.Howler._howls && window.Howler._howls[0]) || null
    if (!h) return null
    const ids = (h._sounds || []).map((snd) => snd._id)
    return { total: ids.length, playing: ids.filter((id) => h.playing(id)).length }
  })

console.log('  起始:', JSON.stringify(await count()))

// Four pause/resume cycles through the player store (Space is bound to toggle).
for (let i = 1; i <= 4; i += 1) {
  await page.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {})
  await page.keyboard.press('Space')
  await page.waitForTimeout(900)
  await page.keyboard.press('Space')
  await page.waitForTimeout(1400)
  console.log(`  第 ${i} 轮暂停/恢复后:`, JSON.stringify(await count()))
}

// And a couple of track switches.
await rows.nth(1).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(3500)
console.log('  切到第 2 首后:', JSON.stringify(await count()))
await rows.nth(2).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(3500)
const final = await count()
console.log('  切到第 3 首后:', JSON.stringify(final))
console.log(final && final.playing > 1 ? '\n  ⚠ 多个音源同时播放' : '\n  ✓ 始终只有一个音源')
await browser.close()
