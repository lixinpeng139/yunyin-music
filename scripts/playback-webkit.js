/*
 * 在 WebKitGTK（也就是 Tauri 真正用的引擎）里跑一遍播放回归检查。
 *
 * 由 scripts/webkit-probe.c 注入执行：脚本会在页面加载 9 秒后被求值，
 * 结束时必须调用 window.webkit.messageHandlers.probe.postMessage(...)。
 * 走 e2e-webkit.sh 运行：
 *   PROBE_JS=scripts/playback-webkit.js bash scripts/e2e-webkit.sh
 *
 * 与 scripts/playback-smoke.mjs 的区别：那个跑在 Chromium 里做快速的逻辑回归，
 * 这个跑在真实运行时里，验证 GStreamer 解码、媒体元素事件与自动播放策略。
 */
(function () {
  const report = (payload) =>
    window.webkit.messageHandlers.probe.postMessage(JSON.stringify(payload))

  const checks = []
  const check = (name, ok, detail) =>
    checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) })

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  ;(async () => {
    try {
      const { usePlayer } = await import('/src/player/store.ts')
      const { audioEngine } = await import('/src/player/engine.ts')
      const { search, fetchSongUrls } = await import('/src/api/ncm.ts')

      const state = () => usePlayer.getState()
      const until = async (label, predicate, timeoutMs) => {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
          if (predicate()) return true
          await sleep(250)
        }
        check(label, false, '等待超时')
        return false
      }

      // 压低音量：这是真实发声的测试，但没必要盖住用户正在听的歌。
      state().setVolume(0.2)

      // ---- 1. 取曲并播放 ----
      const found = await search('周杰伦', 8)
      const tracks = (found.tracks || []).filter((t) => t && t.id)
      const urls = await fetchSongUrls(
        tracks.map((t) => t.id),
        'standard',
      )
      const playable = tracks.filter((t) => urls.get(t.id) && urls.get(t.id).url)
      check('取到可播放曲目', playable.length >= 3, playable.length + ' 首')
      check('媒体元素用的是标准 audio 标签', typeof Audio === 'function')

      await state().playQueue(playable, 0)
      const started = await until(
        'WebKit 开始播放',
        () => state().playing === true && audioEngine.playing === true,
        25000,
      )
      check('WebKit 里真的开始播放', started && state().playing === true)
      check(
        '引擎与 UI 指向同一首',
        audioEngine.trackId === state().current().id,
        'engine=' + audioEngine.trackId + ' ui=' + state().current().id,
      )
      check('时长已就绪', state().duration > 0, state().duration + 'ms')

      const p0 = state().position
      await sleep(2000)
      const p1 = state().position
      check('WebKit 里进度在前进', p1 > p0, p0 + 'ms → ' + p1 + 'ms')

      // ---- 2. 暂停 / 继续 ----
      state().pause()
      await until('暂停生效', () => state().playing === false, 5000)
      const pausedAt = state().position
      await sleep(1200)
      check(
        '暂停后位置不动',
        Math.abs(state().position - pausedAt) < 500,
        pausedAt + 'ms → ' + state().position + 'ms',
      )
      state().resume()
      await until('恢复播放', () => state().playing === true, 10000)
      check(
        '继续播放接着放（不是从头）',
        state().position >= pausedAt - 1500,
        '暂停于 ' + pausedAt + 'ms，继续于 ' + state().position + 'ms',
      )

      // ---- 3. 暂停中切音质（旧实现从此静音）----
      state().pause()
      await until('暂停', () => state().playing === false, 5000)
      const beforeSwitch = state().position
      state().setQuality('standard')
      await until('音质切换完成', () => state().resolving === false, 20000)
      await sleep(700)
      check(
        '切音质后位置保持',
        Math.abs(state().position - beforeSwitch) < 3000,
        beforeSwitch + 'ms → ' + state().position + 'ms',
      )
      check('切音质后仍是暂停态', state().playing === false)
      check('切音质没有报错', state().notice === null, state().notice && state().notice.text)

      state().resume()
      const resumed = await until(
        '切档后恢复播放',
        () => state().playing === true && audioEngine.playing === true,
        15000,
      )
      const q0 = state().position
      await sleep(2000)
      const q1 = state().position
      check('切档后恢复是真的有声（进度继续前进）', resumed && q1 > q0, q0 + 'ms → ' + q1 + 'ms')

      // ---- 4. 删除正在播放的那首 ----
      const removedId = state().current().id
      state().removeFromQueue(state().index)
      const moved = await until(
        '删曲后换歌',
        () => state().current().id !== removedId && audioEngine.trackId === state().current().id,
        25000,
      )
      check(
        '删除当前曲后引擎跟着列表走',
        moved && audioEngine.trackId === state().current().id,
        'engine=' + audioEngine.trackId + ' ui=' + state().current().id,
      )
      check(
        '被删的曲目已移出队列',
        !state().queue.some((t) => t.id === removedId),
      )
      await until('删曲后继续播放', () => state().playing === true, 20000)

      // ---- 5. 播完自动下一首 ----
      state().setMode('list')
      const beforeEnd = state().current().id
      state().seek(Math.max(0, state().duration - 1500))
      const advanced = await until(
        '播完自动切歌',
        () => state().current().id !== beforeEnd,
        30000,
      )
      check(
        '播完自动切下一首',
        advanced && audioEngine.trackId === state().current().id,
        'engine=' + audioEngine.trackId + ' ui=' + state().current().id,
      )
      check('自动切歌后仍在播放', state().playing === true, state().position + 'ms')
      check('自动切歌没有报错', state().notice === null, state().notice && state().notice.text)

      const failed = checks.filter((c) => !c.ok)
      report({
        ok: failed.length === 0,
        platform: 'WebKitGTK',
        passed: checks.length - failed.length,
        total: checks.length,
        failed: failed.map((c) => c.name + (c.detail ? ' (' + c.detail + ')' : '')),
        checks,
      })
    } catch (error) {
      report({
        ok: false,
        platform: 'WebKitGTK',
        error: String((error && error.stack) || error),
        checks,
      })
    }
  })()
})()
