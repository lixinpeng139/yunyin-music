/** Compares the two Howler paths in the real engine, counting media elements. */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 400 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [err]', m.text().slice(0, 100)) })
await page.goto('http://127.0.0.1:1580/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.setContent(readFileSync('/tmp/mode-test.html', 'utf8'), { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(30000)
const text = await page.locator('#o').textContent()
console.log(text.split('\n').map((l) => '  ' + l).join('\n'))
await browser.close()
