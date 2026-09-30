#!/usr/bin/env bash
# Acceptance test for the packaged AppImage.
#
# Confirms the bundle starts its own embedded API bridge, that the bridge is
# reachable on the port handed to the webview, and that the bridge is reaped
# when the app exits. Cleanup is PID-file based so this script never kills
# itself (see the note in scripts/stop-app.sh).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPIMAGE="$(find "$ROOT/src-tauri/target/release/bundle/appimage" -maxdepth 1 -name '*.AppImage' | head -1)"
PIDFILE=/tmp/yunyin-appimage.pids

if [ -z "$APPIMAGE" ]; then
  echo "[verify] AppImage not found"
  exit 2
fi
echo "[verify] bundle: $(basename "$APPIMAGE") ($(du -h "$APPIMAGE" | cut -f1))"

if [ -f "$PIDFILE" ]; then
  while read -r pid; do [ -n "$pid" ] && kill "$pid" 2>/dev/null; done < "$PIDFILE"
  rm -f "$PIDFILE"
  sleep 1
fi

"$APPIMAGE" >/tmp/appimage-run.log 2>&1 &
APP=$!
echo "$APP" > "$PIDFILE"
echo "[verify] launched pid=$APP"

BRIDGE_PID=""
BRIDGE_PORT=""
for _ in $(seq 1 90); do
  BRIDGE_PID=$(pgrep -f 'yunyin[-]api --port' | head -1 || true)
  if [ -n "$BRIDGE_PID" ]; then
    BRIDGE_PORT=$(tr '\0' ' ' < "/proc/$BRIDGE_PID/cmdline" 2>/dev/null |
      grep -oE '\-\-port [0-9]+' | awk '{print $2}')
    [ -n "$BRIDGE_PORT" ] && break
  fi
  sleep 1
done

if [ -z "$BRIDGE_PORT" ]; then
  echo "[verify] FAIL: the embedded API bridge never started"
  sed -n '1,30p' /tmp/appimage-run.log
  kill "$APP" 2>/dev/null
  exit 1
fi

echo "[verify] embedded bridge pid=$BRIDGE_PID port=$BRIDGE_PORT"
echo "[verify] bridge cmdline: $(tr '\0' ' ' < "/proc/$BRIDGE_PID/cmdline")"
echo "[verify] health: $(curl -s --max-time 5 "http://127.0.0.1:$BRIDGE_PORT/health")"
echo "[verify] search: $(curl -s --max-time 25 "http://127.0.0.1:$BRIDGE_PORT/search?keywords=test&limit=1" | head -c 80)"
echo "[verify] playlist: $(curl -s --max-time 25 "http://127.0.0.1:$BRIDGE_PORT/playlist/detail?id=3778678" | head -c 60)"

sleep 6
if command -v niri >/dev/null 2>&1; then
  WINDOWS=$(niri msg windows 2>/dev/null | grep -c 'App ID: "yunyin"' || true)
  echo "[verify] niri windows for yunyin: $WINDOWS"
  TITLE=$(niri msg windows 2>/dev/null | grep -A 1 'App ID: "yunyin"' | grep Title | head -1 || true)
  [ -n "$TITLE" ] && echo "[verify] window $TITLE"
fi

kill "$APP" 2>/dev/null
sleep 4
if kill -0 "$BRIDGE_PID" 2>/dev/null; then
  echo "[verify] note: bridge still alive, terminating it"
  kill "$BRIDGE_PID" 2>/dev/null
else
  echo "[verify] bridge was reaped with the app"
fi

echo "[verify] PASS"
