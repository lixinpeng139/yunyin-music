/** Collapses the sidebar by clicking, then reports overlaps in the top-left. */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
await page.setViewportSize({ width: 660, height: 800 })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1540', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const report = async (label) => {
  const info = await page.evaluate(() => {
    const boxes = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 14 || r.height < 14) continue
      if (r.left > 300 || r.top > 70) continue
      const cs = getComputedStyle(el)
      // Leaf-ish elements only: skip full-window wrappers.
      if (r.width > 320 || r.height > 60) continue
      boxes.push({
        tag: el.tagName,
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 16),
        x: Math.round(r.left), y: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        z: cs.zIndex, pos: cs.position,
      })
    }
    // Report intersecting pairs, which is what "overlap" means.
    const overlaps = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i], b = boxes[j]
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (ox > 3 && oy > 3) {
          overlaps.push(`${a.tag}(${a.x},${a.y},${a.w}x${a.h})${a.text ? ' "' + a.text + '"' : ''}  ×  ${b.tag}(${b.x},${b.y},${b.w}x${b.h})${b.text ? ' "' + b.text + '"' : ''}`)
        }
      }
    }
    const sidebar = document.querySelector('nav')
    return {
      sidebar: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
      boxes: boxes.length,
      overlaps,
    }
  })
  console.log(`\n${label}:`)
  console.log(`  侧栏宽度: ${info.sidebar}   左上角元素数: ${info.boxes}`)
  if (info.overlaps.length === 0) console.log('  无重叠')
  else for (const o of info.overlaps) console.log('  ⚠ ' + o)
  await page.screenshot({ path: `/tmp/topbar/${label}.png`, clip: { x: 0, y: 0, width: 420, height: 100 } })
}

await report('01-展开')
// Collapse via the chevron in the rail header.
const chevron = page.locator('nav button').first()
await chevron.click({ force: true }).catch(() => {})
await page.waitForTimeout(2000)
await report('02-收起后')

await browser.close()
