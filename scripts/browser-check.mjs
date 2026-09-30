import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.APP_URL || 'http://127.0.0.1:4174'
const OUT = process.env.SHOT_DIR || '/tmp/yunyin-shots'
const errors = []
const logs = []

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

page.on('console', (msg) => {
  const text = `${msg.type()}: ${msg.text()}`
  logs.push(text)
  if (msg.type() === 'error') errors.push(text)
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('requestfailed', (req) => {
  const url = req.url()
  if (url.startsWith('http://127.0.0.1:38471') || url.includes('126.net')) return
  errors.push(`requestfailed: ${url} ${req.failure()?.errorText}`)
})

async function shot(name) {
  await mkdir(OUT, { recursive: true })
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`  shot -> ${name}.png`)
}

async function waitForText(text, timeout = 25000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout })
    return true
  } catch { return false }
}

console.log('== opening app ==')
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const booted = await waitForText('发现音乐', 30000)
console.log('  booted (发现音乐 visible):', booted)
await page.waitForTimeout(6000)
await shot('01-discover')

// Report what the discover page actually rendered.
const stats = await page.evaluate(() => ({
  title: document.title,
  headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 14).map((n) => n.textContent?.trim()),
  covers: document.querySelectorAll('img').length,
  playButtons: [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 12),
  playerBar: document.body.innerText.includes('还没有播放音乐'),
}))
console.log('  page stats:', JSON.stringify(stats, null, 2))

console.log('== navigating to 私人雷达 ==')
await page.getByRole('link', { name: '私人雷达' }).first().click().catch(async () => {
  await page.goto(`${BASE}/radar`, { waitUntil: 'domcontentloaded' })
})
await page.waitForTimeout(5000)
await shot('02-radar')

console.log('== navigating to 每日推荐 ==')
await page.goto(`${BASE}/daily`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await shot('03-daily')

console.log('== navigating to 心动模式 ==')
await page.goto(`${BASE}/heart`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await shot('04-heart')

console.log('== navigating to 漫游 ==')
await page.goto(`${BASE}/roam`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await shot('05-roam')

console.log('== navigating to 排行榜 ==')
await page.goto(`${BASE}/charts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await shot('06-charts')

console.log('== a playlist detail page ==')
await page.goto(`${BASE}/playlist/3778678`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
await shot('07-playlist')
const plStats = await page.evaluate(() => ({
  rows: document.querySelectorAll('.MuiListItem-root').length,
  h1: document.querySelector('h1')?.textContent?.trim(),
}))
console.log('  playlist stats:', JSON.stringify(plStats))

console.log('== search overlay (Ctrl+K) ==')
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.keyboard.press('Control+k')
await page.waitForTimeout(600)
await page.keyboard.type('周杰伦', { delay: 40 })
await page.waitForTimeout(5000)
await shot('08-search')

console.log('== open now-playing view ==')
await page.goto(`${BASE}/playlist/3778678`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
// Double-click the first song row to start playback.
const firstRow = page.locator('.MuiListItem-root').first()
await firstRow.dblclick().catch(() => {})
await page.waitForTimeout(5000)
await shot('09-player-started')

console.log('\n===== CONSOLE ERRORS (' + errors.length + ') =====')
for (const e of errors.slice(0, 25)) console.log('  ' + e)

await browser.close()
