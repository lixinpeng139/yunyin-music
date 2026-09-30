/** Opens the full-screen player by dispatching a real click at its coordinates. */
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://127.0.0.1:1480'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Play something first: the overlay needs a current track.
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4500)
const rows = page.locator('[role="button"]')
const n = await rows.count()
let started = false
for (let i = 2; i < Math.min(n, 16); i += 1) {
  const t = await rows.nth(i).innerText().catch(() => '')
  if (t && t.length > 4 && !t.includes('播放全部') && !t.includes('换一批')) {
    await rows.nth(i).dblclick().catch(() => {})
    started = true
    break
  }
}
console.log('playback started:', started)
await page.waitForTimeout(4000)

// Find the clickable artwork in the player bar and click its centre.
const box = await page.evaluate(() => {
  // The image inside the bar whose closest clickable ancestor toggles the view.
  const imgs = [...document.querySelectorAll('img')]
  const barImg = imgs
    .map((img) => ({ img, r: img.getBoundingClientRect() }))
    .filter(({ r }) => r.top > window.innerHeight - 130 && r.width > 30 && r.width < 90)
    .sort((a, b) => b.r.width - a.r.width)[0]
  if (!barImg) return null
  const r = barImg.r
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
console.log('bar artwork at:', box)
if (box) await page.mouse.click(box.x, box.y)
await page.waitForTimeout(2600)

const open = await page.evaluate(() => Boolean(document.querySelector('.MuiDialog-root')))
console.log('player open:', open)
if (open) await page.screenshot({ path: '/tmp/ui-np/player.png' })
await browser.close()
