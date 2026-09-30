/**
 * Directly exercises the engine's play(): two calls in a row must not produce
 * two audio sources.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
await page.setViewportSize({ width: 900, height: 800 })
await page.addInitScript((id) => {
  localStorage.setItem('yunyin.client.v1', id)
  window.__src = { live: 0, total: 0 }
  const proto = window.AudioContext.prototype
  const create = proto.createBufferSource
  proto.createBufferSource = function patched(...args) {
    const node = create.apply(this, args)
    window.__src.total += 1
    window.__src.live += 1
    const stop = node.stop.bind(node)
    node.stop = (...a) => { window.__src.live -= 1; return stop(...a) }
    return node
  }
}, process.env.CID || '')

await page.goto('http://127.0.0.1:1560', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6500)
await page.locator('text=每日推荐').first().click().catch(() => {})
await page.waitForTimeout(4000)
const rows = page.locator('.MuiListItem-root')
await rows.nth(0).dblclick({ force: true }).catch(() => {})
await page.waitForTimeout(5000)

// Reach the live Howl through Howler's own registry and play it repeatedly,
// exactly as a racing resume() + onload autoplay would.
const result = await page.evaluate(async () => {
  const howler = window.Howler
  const howl = howler && howler._howls && howler._howls[0]
  if (!howl) return { error: 'no howl found' }
  const before = { ...window.__src }
  // Two immediate plays: the bug produced two sources here.
  howl.play()
  howl.play()
  await new Promise((r) => setTimeout(r, 1500))
  return { before, after: { ...window.__src }, playing: howl.playing() }
})
console.log(JSON.stringify(result, null, 2))
await browser.close()
