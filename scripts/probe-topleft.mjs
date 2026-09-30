/** Measures the top-left corner with the sidebar both open and collapsed. */
import { chromium } from 'playwright'

const browser = await chromium.launch()
for (const state of ['open', 'closed']) {
  const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
  await page.setViewportSize({ width: 660, height: 800 })
  await page.addInitScript(
    (cfg) => {
      localStorage.setItem('yunyin.client.v1', cfg.id)
      localStorage.setItem('yunyin.sidebar', cfg.state)
    },
    { id: process.env.CID || '', state },
  )
  await page.goto('http://127.0.0.1:1540', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5500)

  const info = await page.evaluate(() => {
    // Every element whose box intersects the top-left 260x70 region.
    const hits = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (r.right < 0 || r.bottom < 0) continue
      if (r.left > 260 || r.top > 70) continue
      const cs = getComputedStyle(el)
      hits.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 34),
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 20),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        pos: cs.position,
        z: cs.zIndex,
      })
    }
    // Keep only the outermost few: a nesting dump is noise.
    return hits.filter((h) => h.w > 20 && h.h > 16).slice(0, 14)
  })
  console.log(`\n侧栏 ${state}:`)
  for (const h of info) {
    console.log(`  ${h.tag.padEnd(7)} @(${h.x},${h.y}) ${h.w}x${h.h} pos=${h.pos.padEnd(8)} z=${h.z.padEnd(5)} ${h.text}`)
  }
  await page.screenshot({ path: `/tmp/topbar/${state}-topleft.png`, clip: { x: 0, y: 0, width: 320, height: 90 } })
  await page.close()
}
await browser.close()
