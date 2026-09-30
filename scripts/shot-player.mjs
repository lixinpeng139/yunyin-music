/** Screenshots the full-screen player at a given viewport. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const W = Number(process.env.VW || 1440)
const H = Number(process.env.VH || 900)
const OUT = process.env.OUT || '/tmp/ui-np'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setViewportSize({ width: W, height: H })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1490', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4500)
const rows = page.locator('.MuiListItem-root')
for (let i = 0; i < 10; i += 1) {
  const t = await rows.nth(i).innerText().catch(() => '')
  if (t && t.length > 4) { await rows.nth(i).dblclick({ force: true }).catch(() => {}); break }
}
await page.waitForTimeout(4000)
const box = await page.evaluate(() => {
  const pick = [...document.querySelectorAll('img')]
    .map((img) => ({ img, r: img.getBoundingClientRect() }))
    .filter(({ r }) => r.top > window.innerHeight - 140 && r.width > 30 && r.width < 100)
    .sort((a, b) => b.r.width - a.r.width)[0]
  return pick ? { x: pick.r.left + pick.r.width / 2, y: pick.r.top + pick.r.height / 2 } : null
})
if (box) await page.mouse.click(box.x, box.y)
await page.waitForTimeout(2600)
await page.screenshot({ path: `${OUT}/player-${W}x${H}.png` })
console.log('shot', `${W}x${H}`)
await browser.close()
