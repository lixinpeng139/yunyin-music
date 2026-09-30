/**
 * Confirms typing no longer issues requests and that Enter issues exactly one.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 660, height: 800 } })
await page.setViewportSize({ width: 660, height: 800 })

const calls = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes('/search')) calls.push(u.replace(/^.*\/\/[^/]+/, '').slice(0, 46))
})

await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1550', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Open the search overlay with the keyboard shortcut.
await page.keyboard.press('Control+k')
await page.waitForTimeout(1200)
const input = page.locator('input').first()
await input.click()
await input.type('love', { delay: 120 })
await page.waitForTimeout(1500)
console.log(`  输入 "love" 后请求数: ${calls.length}  ${JSON.stringify(calls)}`)

calls.length = 0
await page.keyboard.press('Enter')
await page.waitForTimeout(3000)
console.log(`  按回车后请求数:   ${calls.length}  ${JSON.stringify(calls)}`)
await page.screenshot({ path: '/tmp/kb/search.png' })
await browser.close()
