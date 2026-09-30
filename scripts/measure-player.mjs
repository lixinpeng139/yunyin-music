/** Measures the full-screen player at several window heights. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:1480'
const OUT = process.argv[3] || '/tmp/ui-np'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

for (const height of [900, 720, 640]) {
  const page = await browser.newPage({ viewport: { width: 1440, height } })
  await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5500)

  await page.locator('text=每日推荐').first().click().catch(() => {})
  await page.waitForTimeout(4000)

  // Song rows are ListItems (SongRow.tsx); double-click is the play gesture.
  const rows = page.locator('.MuiListItem-root')
  const n = await rows.count()
  let played = false
  for (let i = 0; i < Math.min(n, 12); i += 1) {
    const t = await rows.nth(i).innerText().catch(() => '')
    if (t && t.length > 4) {
      await rows.nth(i).dblclick({ force: true }).catch(() => {})
      played = true
      break
    }
  }
  console.log('  rows:', n, 'played:', played)
  await page.waitForTimeout(4000)

  // The bar's artwork toggles the overlay (PlayerBar.tsx:152).
  const box = await page.evaluate(() => {
    const pick = [...document.querySelectorAll('img')]
      .map((img) => ({ img, r: img.getBoundingClientRect() }))
      .filter(({ r }) => r.top > window.innerHeight - 140 && r.width > 30 && r.width < 100)
      .sort((a, b) => b.r.width - a.r.width)[0]
    if (!pick) return null
    return { x: pick.r.left + pick.r.width / 2, y: pick.r.top + pick.r.height / 2 }
  })
  if (box) await page.mouse.click(box.x, box.y)
  await page.waitForTimeout(2400)

  const info = await page.evaluate(() => {
    const dialog = document.querySelector('.MuiDialog-root')
    if (!dialog) return { error: 'not open' }
    const paper = dialog.querySelector('.MuiDialog-paper')
    const pr = paper.getBoundingClientRect()
    const find = (sel) => {
      const el = paper.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top - pr.top), bottom: Math.round(pr.bottom - r.bottom), h: Math.round(r.height) }
    }
    const slider = find('.MuiSlider-root')
    const cover = paper.querySelector('img')
    const cr = cover ? cover.getBoundingClientRect() : null
    return {
      viewport: window.innerHeight,
      paperH: Math.round(pr.height),
      cover: cr ? { w: Math.round(cr.width), h: Math.round(cr.height), top: Math.round(cr.top - pr.top) } : null,
      slider,
      overflows: pr.bottom > window.innerHeight + 1,
    }
  })
  console.log(`高度 ${height}:`, JSON.stringify(info))
  await page.screenshot({ path: `${OUT}/player-${height}.png` })
  await page.close()
}

await browser.close()
