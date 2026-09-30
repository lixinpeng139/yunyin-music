/** Identifies the two overlapping buttons in the collapsed top-left corner. */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
await page.setViewportSize({ width: 660, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1540', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.locator('nav button').first().click({ force: true }).catch(() => {})
await page.waitForTimeout(2500)

console.log(JSON.stringify(await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('button, [role="button"], a, svg')) {
    const r = el.getBoundingClientRect()
    if (r.left > 70 || r.top > 60 || r.width < 8 || r.height < 8) continue
    // Walk up to find the enclosing element with an identifiable identity.
    const chain = []
    let n = el
    for (let i = 0; i < 4 && n; i += 1) {
      chain.push(`${n.tagName}.${(n.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`)
      n = n.parentElement
    }
    out.push({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 60),
      text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 14),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      chain,
    })
  }
  return out
}), null, 2))
await browser.close()
