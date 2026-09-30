/**
 * Watches the underlying HTMLMediaElement while the engine pauses and resumes.
 *
 * The engine reports "playing" from its own bookkeeping; the media element is
 * the source of truth for whether audio is actually advancing.
 */
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
await page.setViewportSize({ width: 900, height: 700 })

await page.addInitScript(() => {
  window.__media = { calls: [], samples: [] }
  const proto = window.HTMLMediaElement.prototype
  const play = proto.play
  const pause = proto.pause
  proto.play = function patched(...a) {
    window.__media.calls.push({
      op: 'play',
      t: Math.round(performance.now()),
      before: +this.currentTime.toFixed(2),
      paused: this.paused,
      ready: this.readyState,
      src: (this.currentSrc || '').slice(-24),
    })
    return play.apply(this, a)
  }
  proto.pause = function patched(...a) {
    window.__media.calls.push({
      op: 'pause',
      t: Math.round(performance.now()),
      before: +this.currentTime.toFixed(2),
      ready: this.readyState,
    })
    return pause.apply(this, a)
  }
})

await page.addInitScript((id) => localStorage.setItem('yunyin.client.v1', id), process.env.CID || '')
await page.goto('http://127.0.0.1:1570/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

const out = await page.evaluate(async () => {
  const { audioEngine: e } = await import('/src/player/engine.ts')
  const ncm = await import('/src/api/ncm.ts')
  const tracks = await ncm.fetchDailySongs()
  const urls = await ncm.fetchSongUrls(tracks.slice(0, 6).map((t) => t.id), 'exhigh')
  let track = null
  for (const t of tracks) {
    const i = urls.get(t.id)
    if (i?.url) { track = { ...t, url: i.url, gain: i.gain }; break }
  }
  if (!track) return { error: 'no url' }

  e.setEvents({})
  e.load(track, { autoplay: true, gain: track.gain })
  await new Promise((r) => setTimeout(r, 4000))

  const trace = []
  for (let i = 1; i <= 3; i += 1) {
    e.pause()
    await new Promise((r) => setTimeout(r, 700))
    trace.push({ step: `pause ${i}`, enginePos: e.position, enginePlaying: e.playing })
    e.play()
    // Sample the engine position every 250 ms right after resuming.
    const series = []
    for (let k = 0; k < 8; k += 1) {
      await new Promise((r) => setTimeout(r, 250))
      series.push(e.position)
    }
    trace.push({ step: `resume ${i}`, series, enginePlaying: e.playing })
  }
  return { trace, calls: window.__media.calls, title: track.name }
})

if (out.error) { console.log('  错误:', out.error); await browser.close(); process.exit(1) }
console.log('  曲目:', out.title)
for (const t of out.trace) {
  if (t.series) {
    const adv = t.series[t.series.length - 1] - t.series[0]
    console.log(`  ${t.step.padEnd(10)} 采样=${JSON.stringify(t.series)}`)
    console.log(`  ${''.padEnd(10)} 前进 ${adv}ms ${adv > 800 ? '✓' : '⚠ 几乎不动'}`)
  } else {
    console.log(`  ${t.step.padEnd(10)} enginePos=${t.enginePos} playing=${t.enginePlaying}`)
  }
}
console.log('\n  媒体元素调用序列:')
for (const c of out.calls) {
  console.log(`    t=${String(c.t).padStart(6)} ${c.op.padEnd(5)} currentTime=${c.before}s paused=${c.paused ?? '-'} readyState=${c.ready}`)
}
await browser.close()
