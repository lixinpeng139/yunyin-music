import { chromium } from 'playwright'
const browser = await chromium.launch()
const W = Number(process.env.VW || 1440)
const H = Number(process.env.VH || 900)
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setViewportSize({ width: W, height: H })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto(process.argv[2] || 'http://127.0.0.1:1490', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
for (let i = 0; i < 8; i += 1) {
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
await page.waitForTimeout(2500)

const detail = await page.evaluate(() => {
  const dialog = document.querySelector('.MuiDialog-root')
  if (!dialog) return { error: 'not open' }
  const paper = dialog.querySelector('.MuiDialog-paper')
  const pr = paper.getBoundingClientRect()
  const band = (label, el) => {
    if (!el) return { label, missing: true }
    const r = el.getBoundingClientRect()
    return {
      label,
      left: Math.round(r.left - pr.left),
      right: Math.round(pr.right - r.right),
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  }
  const img = paper.querySelector('img')
  const artworkCol = img ? img.parentElement : null
  const lyrics = paper.querySelector('[class*="MuiBox-root"] > div[class*="MuiBox-root"]')
  const contentRow = artworkCol ? artworkCol.parentElement : null
  const slider = paper.querySelector('.MuiSlider-root')
  const transport = slider ? slider.closest('.MuiStack-root') : null
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    paper: { w: Math.round(pr.width) },
    bands: [
      band('artwork-col', artworkCol),
      band('content-row', contentRow),
      band('transport', transport),
      band('slider', slider),
    ],
  }
})
console.log(JSON.stringify({ ...detail, requested: { w: W, h: H }, actual: await page.evaluate(() => ({ w: innerWidth, h: innerHeight })) }, null, 2))
await browser.close()
