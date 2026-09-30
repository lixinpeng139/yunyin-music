/**
 * Checks whether the page's scroll position affects the player overlay.
 *
 * A `position: fixed` overlay inside a transformed or scrolled ancestor is
 * positioned relative to that ancestor rather than the viewport, which shows up
 * as the whole panel being shifted.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
await page.setViewportSize({ width: 660, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1520', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)

// Scroll the main content area down, the way browsing a long page does.
const scrolled = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll('*')].filter(
    (el) => el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 300,
  )
  const main = candidates.sort((a, b) => b.clientHeight - a.clientHeight)[0]
  if (!main) return null
  main.scrollTop = Math.round(main.scrollHeight * 0.55)
  return { cls: main.className.slice(0, 40), top: main.scrollTop, sh: main.scrollHeight }
})
console.log('scrolled container:', scrolled)
await page.waitForTimeout(800)

// Play a track and open the overlay.
const rows = page.locator('.MuiListItem-root')
const n = await rows.count()
for (let i = 0; i < Math.min(n, 12); i += 1) {
  const t = await rows.nth(i).innerText().catch(() => '')
  if (t && t.length > 4) { await rows.nth(i).dblclick({ force: true }).catch(() => {}); break }
}
await page.waitForTimeout(4000)
const box = await page.evaluate(() => {
  const pick = [...document.querySelectorAll('img')]
    .map((img) => ({ img, r: img.getBoundingClientRect() }))
    .filter(({ r }) => r.top > window.innerHeight - 150 && r.width > 20 && r.width < 120)
    .sort((a, b) => b.r.width - a.r.width)[0]
  return pick ? { x: pick.r.left + pick.r.width / 2, y: pick.r.top + pick.r.height / 2 } : null
})
if (box) await page.mouse.click(box.x, box.y)
await page.waitForTimeout(4000)

console.log(JSON.stringify(await page.evaluate(() => {
  const dialog = document.querySelector('.MuiDialog-root')
  const paper = document.querySelector('.MuiDialog-paper')
  if (!paper) return { error: 'not open' }
  const pr = paper.getBoundingClientRect()
  const img = paper.querySelector('img')
  const ir = img ? img.getBoundingClientRect() : null
  const wrapper = paper.children[2]
  const wr = wrapper ? wrapper.getBoundingClientRect() : null
  const cs = wrapper ? getComputedStyle(wrapper) : null
  return {
    viewport: { w: innerWidth, h: innerHeight },
    paperRect: { top: Math.round(pr.top), h: Math.round(pr.height) },
    paperScrollTop: paper.scrollTop,
    wrapperRect: wr ? { top: Math.round(wr.top), h: Math.round(wr.height) } : null,
    wrapperOverflow: cs ? cs.overflow : null,
    wrapperTransform: cs ? cs.transform : null,
    coverTop: ir ? Math.round(ir.top) : null,
    coverH: ir ? Math.round(ir.height) : null,
    dialogTransform: (() => {
      let el = dialog, chain = []
      while (el && el !== document.body) {
        const t = getComputedStyle(el).transform
        if (t && t !== 'none') chain.push({ cls: (el.className||'').toString().slice(0,30), t })
        el = el.parentElement
      }
      return chain
    })(),
  }
}, null), null, 2))
await browser.close()
