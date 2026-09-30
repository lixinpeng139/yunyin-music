/**
 * Confirms the entrance animations are real: plays them again and reads the
 * staggered delays that each card was given.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))

await page.goto('http://127.0.0.1:1475', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const cards = await page.evaluate(() =>
  [...document.querySelectorAll('.MuiCard-root')].slice(0, 10).map((el) => {
    const cs = getComputedStyle(el)
    return { name: cs.animationName, dur: cs.animationDuration, delay: cs.animationDelay }
  }),
)
console.log('卡片动画（前 10 张）:')
for (const c of cards) console.log(`  ${c.name.padEnd(16)} ${c.dur.padEnd(8)} delay=${c.delay}`)

// Replay: strip the animation, force a reflow, then read the start state.
const replay = await page.evaluate(() => {
  const el = document.querySelectorAll('.MuiCard-root')[3]
  if (!el) return null
  el.style.animation = 'none'
  void el.offsetHeight
  el.style.animation = ''
  void el.offsetHeight
  const cs = getComputedStyle(el)
  return { opacity: cs.opacity, transform: cs.transform, animation: cs.animationName }
})
console.log('重放第 4 张卡片的起始状态:', JSON.stringify(replay))

// Reduced motion must collapse everything.
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
const reduced = await page.evaluate(() => {
  const el = document.querySelector('.MuiCard-root')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { duration: cs.animationDuration, opacity: cs.opacity }
})
console.log('prefers-reduced-motion:', JSON.stringify(reduced))
console.log('页面错误:', errors.length ? errors : '(无)')
await browser.close()
