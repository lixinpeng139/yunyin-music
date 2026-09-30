/**
 * Screenshots the player early and again after it settles.
 *
 * The first frame after opening can differ from the settled one, so both are
 * captured — reviewing only the settled frame has hidden real problems.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const W = Number(process.env.VW || 1055)
const H = Number(process.env.VH || 1205)
const OUT = process.env.OUT || '/tmp/ui-np-final'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setViewportSize({ width: W, height: H })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1510', { waitUntil: 'domcontentloaded' })
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

await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/${W}x${H}-early.png` })
await page.waitForTimeout(3200)
await page.screenshot({ path: `${OUT}/${W}x${H}-settled.png` })

const geo = await page.evaluate(() => {
  const paper = document.querySelector('.MuiDialog-paper')
  if (!paper) return { error: 'not open' }
  const pr = paper.getBoundingClientRect()
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { l: Math.round(r.left - pr.left), w: Math.round(r.width), t: Math.round(r.top - pr.top), h: Math.round(r.height) }
  }
  const img = paper.querySelector('img')
  const scrollers = [...paper.querySelectorAll('div')]
    .filter((d) => d.scrollHeight > d.clientHeight + 4)
    .map((d) => ({ h: d.clientHeight, sh: d.scrollHeight, w: d.clientWidth, sw: d.scrollWidth }))
  return {
    viewport: { w: innerWidth, h: innerHeight },
    paperH: Math.round(pr.height),
    paperScrollH: paper.scrollHeight,
    paperScrollW: paper.scrollWidth,
    cover: box(img),
    grid: box(img?.closest('.MuiBox-root')?.parentElement),
    scrollers,
  }
})
console.log(JSON.stringify(geo))
await browser.close()
