/** Compares Howler's Web Audio and html5 paths against the NetEase CDN. */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 700, height: 400 } })
page.on('console', (m) => console.log('  [console]', m.text().slice(0, 120)))

// Serve the page from the dev server so /node_modules resolves.
await page.goto('http://127.0.0.1:1560/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.setContent(readFileSync('/tmp/h5test/index.html', 'utf8'))
await page.waitForTimeout(12000)
const text = await page.locator('#out').textContent()
console.log(text.split('\n').map((l) => '  ' + l).join('\n'))
await browser.close()
