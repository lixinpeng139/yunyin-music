#!/usr/bin/env bash
# Runs YunYin from source so UI and bridge changes take effect immediately.
#
# Unlike the packaged AppImage (which embeds a frozen copy of the API bridge),
# this uses `sidecar/server.mjs` through the system Node, so edits to either the
# front-end or the bridge are picked up on restart.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PIDFILE=/tmp/yunyin-dev.pids
if [ -f "$PIDFILE" ]; then
  while read -r pid; do [ -n "$pid" ] && kill "$pid" 2>/dev/null; done < "$PIDFILE"
  rm -f "$PIDFILE"
  sleep 1
fi

echo "[dev] starting (Ctrl+C to stop)"
exec npm run app
