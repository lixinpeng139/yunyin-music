/** Inspects the Tooltip's body-level touch clone in the collapsed corner. */
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
  for (const b of document.querySelectorAll('body > div button, body > div[role="presentation"] button')) {
    const r = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    out.push({
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      aria: b.getAttribute('aria-label'),
      parentCls: (b.parentElement?.className || '').toString().slice(0, 50),
      visibility: cs.visibility,
      display: cs.display,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      position: cs.position,
      zIndex: cs.zIndex,
      top: cs.top,
      left: cs.left,
    })
  }
  // What actually receives a click at the hamburger's centre?
  const probe = document.elementFromPoint(27, 26)
  const chain = []
  let n = probe
  for (let i = 0; i < 5 && n; i += 1) { chain.push(`${n.tagName}.${(n.className||'').toString().split(' ').slice(0,2).join('.')}`); n = n.parentElement }
  return { clones: out, hitTestAt_27_26: chain }
}), null, 2))
await browser.close()
