import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1475', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const data = await page.evaluate(() => {
  const nav = document.querySelector('nav')
  if (!nav) return { error: 'no nav' }
  const navRect = nav.getBoundingClientRect()
  const rows = []
  for (const child of nav.children) {
    const r = child.getBoundingClientRect()
    rows.push({
      tag: child.tagName,
      cls: (child.className || '').toString().slice(0, 40),
      text: (child.innerText || '').replace(/\s+/g, ' ').slice(0, 40),
      top: Math.round(r.top - navRect.top),
      height: Math.round(r.height),
    })
  }
  const chip = [...nav.querySelectorAll('*')].find((el) => (el.innerText || '').includes('VIP'))
  const chipRect = chip ? chip.getBoundingClientRect() : null
  return {
    navHeight: Math.round(navRect.height),
    children: rows,
    chip: chipRect ? { top: Math.round(chipRect.top - navRect.top), height: Math.round(chipRect.height) } : null,
  }
})
console.log(JSON.stringify(data, null, 2))
await browser.close()
