#!/usr/bin/env bash
# Stops any YunYin processes left over from an earlier run.
# Matching is deliberately narrow so this script never matches itself.
set -u

mapfile -t pids < <(pgrep -f 'target/debug/[y]unyin' || true)
for pid in "${pids[@]:-}"; do
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
done

mapfile -t sidecars < <(pgrep -f '[y]unyin-api-x86_64' || true)
for pid in "${sidecars[@]:-}"; do
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
done

sleep 2
echo "remaining:"
pgrep -af 'target/debug/[y]unyin|[y]unyin-api-x86_64' || echo "  none"
