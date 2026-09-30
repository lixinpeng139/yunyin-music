/** Captures the full-screen player and the queue drawer. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:1475'
const OUT = process.argv[2] || '/tmp/ui-player'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Start a track from the daily page so the player has content.
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(3500)
const row = page.locator('[role="button"]').filter({ hasText: /./ }).nth(2)
await row.dblclick().catch(() => {})
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/10-playing.png` })
console.log('shot 10-playing')

// Expand to the full-screen player via the mini cover in the player bar.
const cover = page.locator('img').last()
await cover.click({ force: true }).catch(() => {})
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/11-nowplaying.png` })
console.log('shot 11-nowplaying')
await browser.close()
