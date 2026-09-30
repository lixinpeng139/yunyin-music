/**
 * Counts the audio sources actually feeding the output.
 *
 * Each AudioBufferSourceNode connected to the destination shows up as a
 * separate stream in the system mixer, so this count should match what the
 * volume panel displays — one entry per playing track.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })

await page.addInitScript((id) => {
  localStorage.setItem('yunyin.client.v1', id)
  window.__ctx = null
  const Orig = window.AudioContext
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a)
      window.__ctx = this
    }
  }
}, process.env.CID || '')

await page.goto(process.env.BASE || 'http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Instrument once the app has created its context.
await page.evaluate(() => {
  const ctx = window.__ctx
  if (!ctx) return
  window.__nodes = []
  const create = ctx.createBufferSource.bind(ctx)
  ctx.createBufferSource = () => {
    const node = create()
    const rec = { started: false, stopped: false, startedAt: 0 }
    const start = node.start.bind(node)
    const stop = node.stop.bind(node)
    node.start = (...a) => { rec.started = true; rec.startedAt = performance.now(); window.__nodes.push(rec); return start(...a) }
    node.stop = (...a) => { rec.stopped = true; return stop(...a) }
    return node
  }
})

const live = () => page.evaluate(() => {
  const n = window.__nodes || []
  return {
    total: n.length,
    live: n.filter((x) => x.started && !x.stopped).length,
    detail: n.map((x) => (x.started ? (x.stopped ? 'stopped' : 'LIVE') : 'created')),
  }
})

// Start playback.
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
await rows.nth(0).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(5000)
console.log('  播放 1 首后:', JSON.stringify(await live()))

// Pause / resume a few times, then switch tracks, as a user would.
for (let i = 1; i <= 3; i += 1) {
  await page.keyboard.press('Space'); await page.waitForTimeout(800)
  await page.keyboard.press('Space'); await page.waitForTimeout(1200)
  console.log(`  第 ${i} 轮暂停/恢复:`, JSON.stringify(await live()))
}
await rows.nth(1).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(4000)
console.log('  切到第 2 首:', JSON.stringify(await live()))
await rows.nth(2).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(4000)
const final = await live()
console.log('  切到第 3 首:', JSON.stringify(final))
console.log(final.live > 1 ? `\n  ⚠ 有 ${final.live} 个音源同时输出（系统面板会显示多个播放流）` : '\n  ✓ 只有一个音源')
await browser.close()
