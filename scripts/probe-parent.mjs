/** Prints the ancestor chain of the ghost hamburger button. */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
await page.setViewportSize({ width: 660, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1540', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.locator('nav button').first().click({ force: true }).catch(() => {})
await page.waitForTimeout(2500)

console.log(await page.evaluate(() => {
  const ghosts = [...document.querySelectorAll('button')].filter((b) => {
    const r = b.getBoundingClientRect()
    return r.left < 80 && r.top < 70 && r.width > 8 && b.getAttribute('aria-label') === '展开侧栏' && !b.closest('[class*="MuiStack-root"]')
  })
  const out = []
  for (const g of ghosts) {
    const chain = []
    let n = g
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n)
      const r = n.getBoundingClientRect()
      chain.push(
        `${n.tagName}.${(n.className || '').toString().split(' ').slice(0, 3).join('.')}` +
        ` [pos=${cs.position} z=${cs.zIndex} box=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}]` +
        (n.getAttribute('role') ? ` role=${n.getAttribute('role')}` : '') +
        (n.getAttribute('aria-hidden') ? ` aria-hidden=${n.getAttribute('aria-hidden')}` : ''),
      )
      n = n.parentElement
    }
    out.push(chain)
  }
  return JSON.stringify(out, null, 2)
}))
await browser.close()
