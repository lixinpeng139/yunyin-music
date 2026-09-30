import { chromium } from 'playwright'
const W = Number(process.env.VW || 1055), H = Number(process.env.VH || 1205)
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
await page.waitForTimeout(2500)

console.log(JSON.stringify(await page.evaluate(() => {
  const paper = document.querySelector('.MuiDialog-paper')
  if (!paper) return { error: 'not open' }
  const pr = paper.getBoundingClientRect()
  // Walk down from the paper, reporting each container's box.
  const chain = []
  let node = paper.firstElementChild
  const describe = (el, label) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      label,
      top: Math.round(r.top - pr.top),
      h: Math.round(r.height),
      flex: cs.flex,
      display: cs.display,
      dir: cs.flexDirection,
      align: cs.alignItems,
      justify: cs.justifyContent,
    }
  }
  const wrapper = paper.children[2] // after the two backdrop layers
  if (wrapper) {
    chain.push(describe(wrapper, 'wrapper'))
    const [topBar, contentRow, transport] = wrapper.children
    if (topBar) chain.push(describe(topBar, 'topbar'))
    if (contentRow) {
      chain.push(describe(contentRow, 'content-row'))
      const [artwork, lyrics] = contentRow.children
      if (artwork) chain.push(describe(artwork, 'artwork-col'))
      if (lyrics) {
        chain.push(describe(lyrics, 'lyrics'))
        const inner = lyrics.firstElementChild
        if (inner) chain.push(describe(inner, 'lyrics-inner'))
      }
    }
    if (transport) chain.push(describe(transport, 'transport'))
  }
  return { viewport: innerHeight, paperH: Math.round(pr.height), chain }
}), null, 2))
await browser.close()
