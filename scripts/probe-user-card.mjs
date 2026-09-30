import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1475', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const info = await page.evaluate(() => {
  const nav = document.querySelector('nav')
  const card = nav.children[1]
  const cs = getComputedStyle(card)
  const kids = [...card.children].map((k) => {
    const r = k.getBoundingClientRect()
    const kcs = getComputedStyle(k)
    return {
      tag: k.tagName,
      text: (k.innerText || '').replace(/\s+/g, ' ').slice(0, 24),
      height: Math.round(r.height),
      alignSelf: kcs.alignSelf,
      flex: kcs.flex,
      heightCss: kcs.height,
    }
  })
  return {
    parentDisplay: getComputedStyle(nav).display,
    parentFlexDirection: getComputedStyle(nav).flexDirection,
    cardHeight: Math.round(card.getBoundingClientRect().height),
    cardDisplay: cs.display,
    cardAlignItems: cs.alignItems,
    cardFlexDirection: cs.flexDirection,
    cardAlignSelf: cs.alignSelf,
    cardFlex: cs.flex,
    cardPadding: cs.padding,
    children: kids,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
