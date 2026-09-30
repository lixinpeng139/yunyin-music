/** Measures the top bar with the sidebar collapsed at several widths. */
import { chromium } from 'playwright'

const browser = await chromium.launch()
for (const W of [660, 900, 1280]) {
  const page = await browser.newPage({ viewport: { width: W, height: 800 } })
  await page.setViewportSize({ width: W, height: 800 })
  await page.addInitScript((id) => {
    localStorage.setItem('yunyin.client.v1', id)
    // Start with the rail collapsed, the state the user reported.
    localStorage.setItem('yunyin.sidebar', 'closed')
  }, process.env.CID || '')
  await page.goto('http://127.0.0.1:1540', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5500)

  const info = await page.evaluate(() => {
    // The top strip is the first row of the shell.
    const bar = [...document.querySelectorAll('.MuiStack-root')].find(
      (el) => el.getBoundingClientRect().top < 6 && el.getBoundingClientRect().height < 70,
    )
    if (!bar) return { error: 'bar not found' }
    const br = bar.getBoundingClientRect()
    const kids = [...bar.children].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName,
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 22),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
      }
    })
    const search = kids.find((k) => k.text.includes('搜索'))
    return {
      viewport: innerWidth,
      barW: Math.round(br.width),
      barRight: Math.round(br.right),
      overflow: Math.round(br.right) > innerWidth + 1,
      searchRight: search ? search.right : null,
      searchOverflows: search ? search.right > innerWidth : null,
      kids,
    }
  })
  console.log(`\n宽度 ${W}:`)
  console.log(`  顶栏宽 ${info.barW}  右边界 ${info.barRight}  溢出=${info.overflow}`)
  console.log(`  搜索框右边界 ${info.searchRight}  超出视口=${info.searchOverflows}`)
  for (const k of info.kids ?? []) {
    console.log(`    ${k.tag.padEnd(8)} x=${k.left}..${k.right} w=${k.w}  ${k.text}`)
  }
  await page.screenshot({ path: `/tmp/topbar/topbar-${W}.png`, clip: { x: 0, y: 0, width: W, height: 120 } })
  await page.close()
}
await browser.close()
