/**
 * Opens the player and records layout changes over the first seconds, which is
 * when the interface visibly rearranges itself.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const W = Number(process.env.VW || 1055)
const H = Number(process.env.VH || 1205)
const OUT = process.env.OUT || '/tmp/ui-shift'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setViewportSize({ width: W, height: H })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1500', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4500)
const rows = page.locator('.MuiListItem-root')
for (let i = 0; i < 10; i += 1) {
  const t = await rows.nth(i).innerText().catch(() => '')
  if (t && t.length > 4) { await rows.nth(i).dblclick({ force: true }).catch(() => {}); break }
}
await page.waitForTimeout(4000)

// Record every geometry change inside the dialog for the next 6 seconds.
await page.evaluate(() => {
  window.__shift = []
  const dialog = document.querySelector('.MuiDialog-root')
  const target = dialog || document.body
  const sample = () => {
    const paper = document.querySelector('.MuiDialog-paper')
    if (!paper) return null
    const pr = paper.getBoundingClientRect()
    const pick = (sel) => {
      const el = paper.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top - pr.top), h: Math.round(r.height), w: Math.round(r.width) }
    }
    const img = paper.querySelector('img')
    const ir = img ? img.getBoundingClientRect() : null
    return {
      t: Math.round(performance.now()),
      paperH: Math.round(pr.height),
      scrollH: paper.scrollHeight,
      cover: ir ? { w: Math.round(ir.width), h: Math.round(ir.height), top: Math.round(ir.top - pr.top) } : null,
      slider: pick('.MuiSlider-root'),
      lyricsScroll: (() => {
        const boxes = [...paper.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 4 && d.clientHeight > 100)
        return boxes.map((d) => ({ h: d.clientHeight, sh: d.scrollHeight, w: d.clientWidth, sw: d.scrollWidth }))
      })(),
    }
  }
  const first = sample()
  window.__shift.push(first)
  const iv = setInterval(() => window.__shift.push(sample()), 250)
  setTimeout(() => clearInterval(iv), 6000)
  void target
})

const box = await page.evaluate(() => {
  const pick = [...document.querySelectorAll('img')]
    .map((img) => ({ img, r: img.getBoundingClientRect() }))
    .filter(({ r }) => r.top > window.innerHeight - 140 && r.width > 30 && r.width < 100)
    .sort((a, b) => b.r.width - a.r.width)[0]
  return pick ? { x: pick.r.left + pick.r.width / 2, y: pick.r.top + pick.r.height / 2 } : null
})

await page.evaluate(() => { window.__shift = [] })
if (box) await page.mouse.click(box.x, box.y)

// Screenshot almost immediately, then again after the dust settles.
await page.waitForTimeout(350)
await page.screenshot({ path: `${OUT}/t0-early.png` })
console.log('shot t0-early')
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/t3-late.png` })
console.log('shot t3-late')
await page.waitForTimeout(3000)

const series = await page.evaluate(() => window.__shift.filter(Boolean))
// Print only the samples where something changed.
const key = (s) => JSON.stringify([s.paperH, s.cover, s.slider, s.lyricsScroll])
let prev = null
console.log('\n布局变化序列:')
for (const s of series) {
  const k = key(s)
  if (k !== prev) {
    console.log(`  t=${s.t}ms  paperH=${s.paperH} scrollH=${s.scrollH}  cover=${s.cover ? s.cover.w + 'x' + s.cover.h + '@' + s.cover.top : '-'}  slider=${s.slider ? s.slider.top + '/h' + s.slider.h : '-'}`)
    if (s.lyricsScroll.length) console.log(`        可滚动区: ${JSON.stringify(s.lyricsScroll)}`)
    prev = k
  }
}
await browser.close()
