/** Detects a visibly rendered second hamburger after collapsing the sidebar. */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
await page.setViewportSize({ width: 660, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1540', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const count = async (label) => {
  const info = await page.evaluate(() => {
    const menuButtons = []
    for (const b of document.querySelectorAll('button')) {
      if (!b.querySelector('svg')) continue
      const r = b.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      // Hamburger icons live in the top-left corner.
      if (r.left > 80 || r.top > 70) continue
      const cs = getComputedStyle(b)
      // Walk ancestors for anything that hides it.
      let hidden = null
      let n = b
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n)
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) {
          hidden = `${n.tagName}.${(n.className||'').toString().slice(0,30)} ${s.display}/${s.visibility}/${s.opacity}`
          break
        }
        n = n.parentElement
      }
      menuButtons.push({
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        aria: b.getAttribute('aria-label'),
        parent: (b.parentElement?.className || '').toString().slice(0, 40),
        hiddenBy: hidden,
      })
    }
    return menuButtons
  })
  console.log(`${label}: ${info.length} 个候选`)
  for (const b of info) {
    console.log(`  box=${JSON.stringify(b.box)} aria=${b.aria} ${b.hiddenBy ? 'HIDDEN by ' + b.hiddenBy : 'VISIBLE'}  parent=${b.parent}`)
  }
}

await count('展开时')
await page.locator('nav button').first().click({ force: true }).catch(() => {})
await page.waitForTimeout(2500)
await count('收起后')
await page.screenshot({ path: '/tmp/topbar/collapsed-corner.png', clip: { x: 0, y: 0, width: 160, height: 70 } })
await browser.close()
