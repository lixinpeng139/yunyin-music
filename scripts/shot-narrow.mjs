/** Screenshots the player at the width the user's compositor column gives it. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const W = Number(process.env.VW || 660)
const H = Number(process.env.VH || 800)
const OUT = process.env.OUT || '/tmp/ui-narrow'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setViewportSize({ width: W, height: H })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1520', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)

// Play from the discover page: its song grid is a plain click.
const before = await page.locator('.MuiListItem-root').count()
console.log('  list rows on discover:', before)
if (before === 0) {
  // Fall back to a card, which navigates to a playlist with rows.
  await page.locator('.MuiCard-root').first().click().catch(() => {})
  await page.waitForTimeout(4500)
}
const rows = page.locator('.MuiListItem-root')
const n = await rows.count()
console.log('  rows now:', n)
for (let i = 0; i < Math.min(n, 12); i += 1) {
  const t = await rows.nth(i).innerText().catch(() => '')
  if (t && t.length > 4) {
    await rows.nth(i).dblclick({ force: true }).catch(() => {})
    break
  }
}
await page.waitForTimeout(4500)

// Open the overlay from the player bar artwork.
const box = await page.evaluate(() => {
  const pick = [...document.querySelectorAll('img')]
    .map((img) => ({ img, r: img.getBoundingClientRect() }))
    .filter(({ r }) => r.top > window.innerHeight - 150 && r.width > 20 && r.width < 120)
    .sort((a, b) => b.r.width - a.r.width)[0]
  return pick ? { x: pick.r.left + pick.r.width / 2, y: pick.r.top + pick.r.height / 2 } : null
})
console.log('  bar artwork:', box)
if (box) await page.mouse.click(box.x, box.y)
await page.waitForTimeout(4200)

const open = await page.evaluate(() => Boolean(document.querySelector('.MuiDialog-paper')))
console.log('  player open:', open)
if (!open) { await browser.close(); process.exit(1) }

await page.screenshot({ path: `${OUT}/narrow-settled.png` })
console.log(JSON.stringify(await page.evaluate(() => {
  const paper = document.querySelector('.MuiDialog-paper')
  const pr = paper.getBoundingClientRect()
  const img = paper.querySelector('img')
  const r = img ? img.getBoundingClientRect() : null
  return {
    viewport: { w: innerWidth, h: innerHeight },
    cover: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    scrollers: [...paper.querySelectorAll('div')]
      .filter((d) => d.scrollHeight > d.clientHeight + 4)
      .map((d) => ({ h: d.clientHeight, sh: d.scrollHeight })),
  }
})))
await browser.close()
