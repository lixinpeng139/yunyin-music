/**
 * Counts the audio sources actually reaching the output.
 *
 * Howler uses Web Audio here, and every `play()` creates a BufferSourceNode
 * connected straight to the destination — so the number of live sources is a
 * direct measure of whether a track is doubled.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })

await page.addInitScript((id) => {
  localStorage.setItem('yunyin.client.v1', id)
  window.__src = { live: 0, total: 0, log: [] }
  const proto = window.AudioContext.prototype
  const connect = proto.createBufferSource
  proto.createBufferSource = function patched(...args) {
    const node = connect.apply(this, args)
    window.__src.total += 1
    window.__src.live += 1
    window.__src.log.push({ t: Math.round(performance.now()), event: 'start', live: window.__src.live })
    const stop = node.stop.bind(node)
    node.stop = (...stopArgs) => {
      window.__src.live -= 1
      window.__src.log.push({ t: Math.round(performance.now()), event: 'stop', live: window.__src.live })
      return stop(...stopArgs)
    }
    return node
  }
}, process.env.CID || '')

await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')

// Play one track and let it settle, then exercise the paths that re-issue play.
await rows.nth(0).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(4500)
const afterLoad = await page.evaluate(() => ({ ...window.__src, log: undefined }))

// Pause then resume twice: each resume used to add another source.
for (let i = 0; i < 2; i += 1) {
  await page.keyboard.press('Space').catch(() => {})
  await page.waitForTimeout(700)
  await page.keyboard.press('Space').catch(() => {})
  await page.waitForTimeout(900)
}
await page.waitForTimeout(2000)
const afterToggle = await page.evaluate(() => ({ ...window.__src, log: undefined }))
const log = await page.evaluate(() => window.__src.log)

console.log(`  加载一首后:  累计音源=${afterLoad.total}  存活=${afterLoad.live}`)
console.log(`  暂停/恢复后: 累计音源=${afterToggle.total}  存活=${afterToggle.live}`)
console.log('  音源事件序列:')
for (const e of log.slice(-12)) console.log(`    t=${e.t} ${e.event} live=${e.live}`)
console.log(`\n  >>> ${afterToggle.live > 1 ? '⚠ 存在多个音源同时播放（重音）' : '✓ 同一时刻只有一个音源'}`)
await browser.close()
