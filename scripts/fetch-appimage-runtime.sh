#!/usr/bin/env bash
# Caches the AppImage type-2 runtime that appimagetool would otherwise fetch
# from GitHub on every bundling run.
set -euo pipefail

CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/yunyin"
TARGET="$CACHE/runtime-x86_64"
URL="https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64"

mkdir -p "$CACHE"
if [ -s "$TARGET" ] && file "$TARGET" | grep -q "ELF 64-bit"; then
  echo "runtime already cached: $TARGET ($(du -h "$TARGET" | cut -f1))"
  exit 0
fi

echo "downloading $URL"
if ! curl -fsSL --retry 3 --connect-timeout 20 --max-time 180 -o "$TARGET.part" "$URL"; then
  # Some networks block GitHub releases; try a mirror before giving up.
  echo "github download failed, trying mirror"
  curl -fsSL --retry 3 --connect-timeout 20 --max-time 180 -o "$TARGET.part" \
    "https://mirror.ghproxy.com/$URL" || {
      echo "could not download the AppImage runtime" >&2
      exit 1
    }
fi

if ! file "$TARGET.part" | grep -q "ELF 64-bit"; then
  echo "downloaded file is not an ELF binary" >&2
  rm -f "$TARGET.part"
  exit 1
fi

mv "$TARGET.part" "$TARGET"
chmod +x "$TARGET"
echo "cached: $TARGET ($(du -h "$TARGET" | cut -f1))"
