/**
 * Captures the screenshots used in README.md.
 *
 * Usage: node scripts/shoot.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:4174'
const OUT = process.argv[3] || 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
}
const settle = (ms) => page.waitForTimeout(ms)

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await shot('01-discover')

await page.goto(`${BASE}/playlist/3778678`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await shot('02-playlist')

await page.goto(`${BASE}/charts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)
await shot('03-charts')

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await page.keyboard.press('Control+k')
await page.waitForTimeout(500)
await page.keyboard.type('海阔天空', { delay: 40 })
await page.waitForTimeout(6000)
await shot('04-search')
await page.keyboard.press('Escape')
await settle(600)

await page.goto(`${BASE}/heart`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await shot('05-heart')

await page.goto(`${BASE}/roam`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await shot('06-roam')

await browser.close()
