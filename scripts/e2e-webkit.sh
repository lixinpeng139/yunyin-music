#!/usr/bin/env bash
# End-to-end WebKitGTK test: boots YunYin against a live API bridge and walks
# the main routes, checking rendering, routing, cover decoding and errors.
#
# Cleanup is done through a PID file rather than `pkill -f`, because a pattern
# broad enough to match the servers also matches this script's command line.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PROBE_API_PORT:-38502}"
WEB_PORT="${PROBE_WEB_PORT:-1422}"
PROBE=/tmp/webkit-probe
PIDFILE=/tmp/yunyin-e2e.pids

if [ ! -x "$PROBE" ]; then
  echo "[e2e] building the WebKitGTK probe..."
  gcc -O2 -o "$PROBE" "$ROOT/scripts/webkit-probe.c" \
    $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1) 2>/dev/null || {
    echo "[e2e] probe build failed"; exit 2; }
fi

if [ -f "$PIDFILE" ]; then
  while read -r pid; do [ -n "$pid" ] && kill "$pid" 2>/dev/null; done < "$PIDFILE"
  rm -f "$PIDFILE"
  sleep 1
fi

"$ROOT/sidecar/dist/yunyin-api-x86_64-unknown-linux-gnu" --port "$PORT" >/tmp/e2e-bridge.log 2>&1 &
BRIDGE=$!
(cd "$ROOT" && VITE_NCM_API="http://127.0.0.1:$PORT" npx vite --port "$WEB_PORT" --host 127.0.0.1 >/tmp/e2e-vite.log 2>&1) &
VITE=$!
printf '%s\n%s\n' "$BRIDGE" "$VITE" > "$PIDFILE"
trap 'kill $BRIDGE $VITE 2>/dev/null; rm -f "$PIDFILE"' EXIT

for _ in $(seq 1 60); do
  curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null && break
  sleep 0.5
done
for _ in $(seq 1 60); do
  curl -sf --max-time 2 "http://127.0.0.1:$WEB_PORT/" >/dev/null && break
  sleep 0.5
done
echo "[e2e] bridge: $(curl -s --max-time 3 "http://127.0.0.1:$PORT/health")"

SCRIPT="$(cat "${PROBE_JS:-$ROOT/scripts/e2e-webkit.js}")"

"$PROBE" "http://127.0.0.1:$WEB_PORT" "$SCRIPT" 180
STATUS=$?
echo "[e2e] probe exit=$STATUS"
exit $STATUS
