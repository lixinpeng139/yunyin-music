/**
 * End-to-end script evaluated inside WebKitGTK by scripts/webkit-probe.c.
 *
 * Walks every route of the app against a live API bridge and reports a JSON
 * summary through the `probe` script-message handler. Kept as a separate file
 * (rather than an inline shell string) so quoting stays readable.
 */
;(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const report = (payload) =>
    window.webkit.messageHandlers.probe.postMessage(JSON.stringify(payload))

  const waitFor = async (probe, timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const value = probe()
        if (value) return value
      } catch {
        /* element not there yet */
      }
      await sleep(200)
    }
    return null
  }

  const errors = []
  window.addEventListener('error', (event) => errors.push('error: ' + (event.message || event.type)))
  window.addEventListener('unhandledrejection', (event) =>
    errors.push('rejection: ' + String(event.reason)),
  )

  const heading = () => {
    const node = document.querySelector('h1')
    return node ? node.textContent.trim() : null
  }
  const decodedCovers = () =>
    [...document.querySelectorAll('img')].filter((img) => {
      const rect = img.getBoundingClientRect()
      return rect.width > 8 && rect.height > 8 && img.naturalWidth > 0
    }).length
  const rows = () => document.querySelectorAll('.MuiListItem-root').length

  const navigate = (path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const steps = {}

  // 1. Discover renders with real artwork from the bridge.
  steps.discover = await waitFor(() => heading() === '发现音乐' && decodedCovers() > 5, 60000)

  // 2. Client-side routing through every top-level section.
  //
  // Several sections are gated behind a NetEase session and intentionally
  // render a "sign in required" panel instead of their own heading, so a route
  // counts as reachable when either appears.
  const visit = async (path, expected, gateText) => {
    navigate(path)
    return waitFor(() => {
      const value = heading()
      if (value && value.includes(expected)) return value
      if (gateText && document.body.innerText.includes(gateText)) return gateText
      return null
    }, 30000)
  }

  steps.radar = await visit('/radar', '雷达', '私人雷达需要登录')
  steps.daily = await visit('/daily', '每日推荐', '每日推荐需要登录')
  steps.heart = await visit('/heart', '心动模式', '心动模式需要登录')
  steps.roam = await visit('/roam', '漫游', '漫游模式需要登录')
  steps.charts = await visit('/charts', '排行榜')
  steps.liked = await visit('/liked', '喜欢', '登录后查看我喜欢的音乐')

  // 3. A real playlist lists its tracks.
  navigate('/playlist/3778678')
  steps.playlistRows = await waitFor(() => {
    const count = rows()
    return count > 20 ? count : null
  }, 60000)
  steps.playlistHeading = heading()

  // 4. Search overlay through the keyboard shortcut, then a real query.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  const input = await waitFor(
    () => document.querySelector('input[placeholder*="\u641c\u7d22"]'),
    10000,
  )
  steps.searchOpened = Boolean(input)
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '\u6d77\u9614\u5929\u7a7a')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    steps.searchResults = await waitFor(() => rows() > 0, 30000)
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(600)

  // 5. The login dialog opens and offers both flows.
  const loginButton = [...document.querySelectorAll('button')].find((button) =>
    button.textContent.includes('\u767b\u5f55\u7f51\u6613\u4e91'),
  )
  if (loginButton) {
    loginButton.click()
    steps.loginDialog = await waitFor(
      () =>
        document.body.innerText.includes('\u626b\u7801\u767b\u5f55') &&
        document.body.innerText.includes('\u624b\u673a\u767b\u5f55'),
      15000,
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(400)
  }

  // 6. The audio element Howler builds must be available and decodable.
  const audio = document.createElement('audio')
  steps.audioElement = typeof audio.play === 'function'
  steps.audioCanPlay = {
    mp3: audio.canPlayType('audio/mpeg'),
    flac: audio.canPlayType('audio/flac'),
    aac: audio.canPlayType('audio/mp4'),
  }

  report({
    ok: Object.values(steps).every((value) => value !== null && value !== false),
    steps,
    decodedCovers: decodedCovers(),
    totalImages: document.querySelectorAll('img').length,
    hostFeatures: {
      aspectRatio: CSS.supports('aspect-ratio', '1 / 1'),
      backdropFilter: CSS.supports('backdrop-filter', 'blur(4px)'),
      maskImage: CSS.supports('mask-image', 'linear-gradient(#000,#000)'),
      gap: CSS.supports('gap', '1rem'),
    },
    errors,
  })
})()
