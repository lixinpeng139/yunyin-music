import { chromium } from 'playwright'
const W = Number(process.env.VW || 660), H = Number(process.env.VH || 800)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setViewportSize({ width: W, height: H })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1530', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)
const rows = page.locator('.MuiListItem-root')
let n = await rows.count()
if (n === 0) { await page.locator('.MuiCard-root').first().click().catch(()=>{}); await page.waitForTimeout(4500); n = await rows.count() }
for (let i = 0; i < Math.min(n, 12); i += 1) {
  const t = await rows.nth(i).innerText().catch(() => '')
  if (t && t.length > 4) { await rows.nth(i).dblclick({ force: true }).catch(() => {}); break }
}
await page.waitForTimeout(4200)
const box = await page.evaluate(() => {
  const p = [...document.querySelectorAll('img')].map(i=>({i,r:i.getBoundingClientRect()}))
    .filter(({r})=>r.top>innerHeight-150&&r.width>20&&r.width<120).sort((a,b)=>b.r.width-a.r.width)[0]
  return p ? { x: p.r.left+p.r.width/2, y: p.r.top+p.r.height/2 } : null
})
if (box) await page.mouse.click(box.x, box.y)
await page.waitForTimeout(4200)
console.log(JSON.stringify(await page.evaluate(() => {
  const paper = document.querySelector('.MuiDialog-paper')
  // Find whatever is actually scrolled.
  const scrolled = [...document.querySelectorAll('*')]
    .filter((el) => el.scrollTop > 0)
    .map((el) => ({ cls: (el.className || '').toString().slice(0, 44), top: el.scrollTop, tag: el.tagName }))
  if (!paper) return { error: 'not open' }
  const img = paper.querySelector('img')
  const r = img ? img.getBoundingClientRect() : null
  const slider = paper.querySelector('.MuiSlider-root')
  const sr = slider ? slider.getBoundingClientRect() : null
  return {
    viewportH: innerHeight,
    coverTop: r ? Math.round(r.top) : null,
    coverBottom: r ? Math.round(r.bottom) : null,
    coverH: r ? Math.round(r.height) : null,
    sliderBottom: sr ? Math.round(sr.bottom) : null,
    coverFullyVisible: r ? r.top >= 0 : null,
    controlsVisible: sr ? sr.bottom <= innerHeight : null,
    paperTop: Math.round(paper.getBoundingClientRect().top),
    paperH: Math.round(paper.getBoundingClientRect().height),
    bodyScrollTop: document.scrollingElement ? document.scrollingElement.scrollTop : null,
    scrolledElements: scrolled,
  }
})))
await page.screenshot({ path: '/tmp/ui-top/top.png' })
await browser.close()
