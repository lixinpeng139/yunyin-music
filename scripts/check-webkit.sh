#!/usr/bin/env bash
# Validates the front-end inside WebKitGTK - the engine Tauri actually uses.
# Starts the API bridge and the Vite dev server, runs the probe, then cleans up.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=38471
PROBE=/tmp/webkit-probe

# Kills leftover children from an earlier run. The patterns are assembled at
# run time so this script's own command line never matches them.
kill_matching() {
  local pattern="$1"
  local pid
  for pid in $(pgrep -f "$pattern" 2>/dev/null); do
    [ "$pid" = "$$" ] && continue
    kill "$pid" 2>/dev/null || true
  done
}
kill_matching "yunyin-api-x86_64 --port $PORT"
kill_matching "vite --port 1420"
sleep 1

"$ROOT/sidecar/dist/yunyin-api-x86_64-unknown-linux-gnu" --port "$PORT" >/tmp/probe-bridge.log 2>&1 &
BRIDGE=$!
(cd "$ROOT" && npx vite --port 1420 --host 127.0.0.1 >/tmp/probe-vite.log 2>&1) &
VITE=$!
trap 'kill $BRIDGE $VITE 2>/dev/null' EXIT

for _ in $(seq 1 40); do
  curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null && break
  sleep 0.5
done
for _ in $(seq 1 40); do
  curl -sf --max-time 2 "http://127.0.0.1:1420/" >/dev/null && break
  sleep 0.5
done
echo "[check] bridge=$(curl -s --max-time 3 http://127.0.0.1:$PORT/health)"

SCRIPT='(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  };
  const report = (o) => window.webkit.messageHandlers.probe.postMessage(JSON.stringify(o));

  await waitFor(() => document.querySelector("h1"), 30000);
  const h1 = await waitFor(() => document.querySelector("h1") && document.querySelector("h1").textContent, 30000);
  if (!h1) { report({ ok: false, error: "app did not render (no h1)" }); return; }

  // Data must come from the local bridge.
  const playlists = await waitFor(() => document.querySelectorAll("[data-cover]").length > 4, 30000);

  // CSS features the theme relies on.
  const probeEl = document.createElement("div");
  probeEl.style.cssText = "aspect-ratio: 1 / 1; backdrop-filter: blur(4px); mask-image: linear-gradient(#000,#000);";
  document.body.appendChild(probeEl);
  const cs = getComputedStyle(probeEl);
  const cssSupport = {
    aspectRatio: cs.aspectRatio || cs.getPropertyValue("aspect-ratio"),
    backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
    maskImage: cs.maskImage || cs.webkitMaskImage,
  };
  probeEl.remove();

  // Covers must decode at a non-zero size.
  const imgs = [...document.querySelectorAll("img")].filter((i) => i.currentSrc || i.src);
  const sized = imgs.filter((i) => i.getBoundingClientRect().width > 8 && i.naturalWidth > 0);

  // The <audio> path Howler uses must exist.
  const audio = document.createElement("audio");
  const canPlay = {
    mp3: audio.canPlayType("audio/mpeg"),
    aac: audio.canPlayType("audio/mp4"),
    flac: audio.canPlayType("audio/flac"),
  };

  report({
    ok: true,
    title: document.title,
    firstHeading: h1,
    coverImages: imgs.length,
    decodedCovers: sized.length,
    playlistCards: playlists,
    cssSupport,
    canPlay,
    hasNowPlayingBar: document.body.innerText.includes("还没有播放音乐"),
  });
})();'

"$PROBE" http://127.0.0.1:1420 "$SCRIPT" 90
STATUS=$?
echo "[check] probe exit=$STATUS"
exit $STATUS
