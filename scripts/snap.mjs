/**
 * Captures UI screenshots for design review.
 *
 * Pass a bridge clientId to render the signed-in experience; without one the
 * app shows its signed-out state, which hides most of the interface.
 *
 * Usage: node scripts/snap.mjs <baseUrl> <outDir> [clientId]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:1475'
const OUT = process.argv[3] || '/tmp/ui'
const CLIENT_ID = process.argv[4] || ''
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 140)))

if (CLIENT_ID) {
  // Reuse the session the packaged app already established.
  await page.addInitScript((id) => {
    localStorage.setItem('yunyin.client.v1', id)
  }, CLIENT_ID)
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.screenshot({ path: `${OUT}/01-discover.png` })
console.log('shot 01-discover')

const routes = [
  ['每日推荐', '02-daily'],
  ['私人雷达', '03-radar'],
  ['排行榜', '04-charts'],
  ['我喜欢的', '05-liked'],
  ['心动模式', '06-heart'],
]
for (const [label, name] of routes) {
  const item = page.locator(`text=${label}`).first()
  if (await item.count()) {
    await item.click().catch(() => {})
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log('shot', name)
  } else {
    console.log('skip', name)
  }
}

// Open a playlist to see the track list.
await page.locator('text=排行榜').first().click().catch(() => {})
await page.waitForTimeout(2500)
const card = page.locator('.MuiCard-root').first()
if (await card.count()) {
  await card.click().catch(() => {})
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/07-playlist.png` })
  console.log('shot 07-playlist')
}

await browser.close()
