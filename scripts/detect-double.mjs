/**
 * Detects simultaneous playback: two or more media elements sounding at once.
 *
 * `play()` is patched on HTMLMediaElement before the app boots so every attempt
 * is recorded, and the elements are polled to see how many are actually
 * advancing at the same time.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })

await page.addInitScript((id) => {
  localStorage.setItem('yunyin.client.v1', id)
  window.__audio = { plays: [], maxConcurrent: 0, samples: [] }
  const proto = window.HTMLMediaElement.prototype
  const original = proto.play
  proto.play = function patchedPlay(...args) {
    window.__audio.plays.push({
      t: Math.round(performance.now()),
      src: (this.currentSrc || this.src || '').slice(-40),
      tag: this.tagName,
    })
    return original.apply(this, args)
  }
}, process.env.CID || '')

await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)

// Start playback from the daily page.
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
const n = await rows.count()
console.log('  rows:', n)
if (n === 0) { console.log('  无可播放行'); await browser.close(); process.exit(1) }

// Rapidly switch tracks, which is the reported trigger.
for (let i = 0; i < 5; i += 1) {
  await rows.nth(i).dblclick({ force: true }).catch(() => {})
  await page.waitForTimeout(1200)
}
await page.waitForTimeout(3000)

// Count how many media elements are advancing.
const concurrent = await page.evaluate(async () => {
  const els = [...document.querySelectorAll('audio')]
  const first = els.map((e) => e.currentTime)
  await new Promise((r) => setTimeout(r, 1200))
  const second = els.map((e) => e.currentTime)
  return els.map((e, i) => ({
    paused: e.paused,
    advanced: +(second[i] - first[i]).toFixed(2),
    src: (e.currentSrc || '').slice(-36),
  }))
})

const stats = await page.evaluate(() => ({
  totalPlays: window.__audio.plays.length,
  plays: window.__audio.plays.slice(-10),
  audioElements: document.querySelectorAll('audio').length,
  // Which path did Howler actually take?
  usingWebAudio: window.Howler ? window.Howler.usingWebAudio : 'unknown',
  ctxState: window.Howler && window.Howler.ctx ? window.Howler.ctx.state : 'n/a',
  howls: window.Howler ? window.Howler._howls.length : 'n/a',
}))

console.log(`  audio 元素数: ${stats.audioElements}`)
console.log(`  Howler 使用 WebAudio: ${stats.usingWebAudio}   ctx=${stats.ctxState}`)
console.log(`  Howler 实例数: ${stats.howls}`)
console.log(`  play() 调用次数: ${stats.totalPlays}`)
console.log('  最近调用:')
for (const p of stats.plays) console.log(`    t=${p.t} ${p.src}`)
console.log('  元素状态（1.2 秒内的推进量）:')
for (const c of concurrent) {
  console.log(`    paused=${c.paused} advanced=${c.advanced}s  ${c.src}`)
}
const sounding = concurrent.filter((c) => !c.paused && c.advanced > 0.3).length
console.log(`  >>> 同时发声的元素: ${sounding}  ${sounding > 1 ? '⚠ 重音！' : '✓ 正常'}`)
await browser.close()
