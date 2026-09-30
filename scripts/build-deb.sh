#!/usr/bin/env bash
#
# Builds the .deb and fixes up the one thing Tauri derives from `productName`
# that should stay Chinese: the launcher's display name.
#
# `productName` has to be ASCII (`yunyin`) because Debian package names may only
# contain [a-z0-9+.-]; a non-ASCII value produced `Package: 云音`, which dpkg
# rejects outright. Everything else the user sees — window title, desktop Name —
# is set separately.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUNDLE="$ROOT/src-tauri/target/release/bundle/deb"
export PATH="$HOME/.cargo/bin:$PATH"

echo "[deb] building"
npx tauri build --bundles deb 2>&1 | grep -E "Bundling|Finished|error" | tail -4 || true

DEB="$(ls -t "$BUNDLE"/yunyin_*.deb 2>/dev/null | head -1)"
if [ -z "$DEB" ] || [ ! -s "$DEB" ]; then
  echo "[deb] no package produced" >&2
  exit 1
fi

# Unpack, rename the launcher entry, repack. `dpkg-deb` is not available on Arch,
# so the archive is assembled directly — a .deb is ar(1) over three members.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
ar x "$DEB"
mkdir -p data && tar xf data.tar.gz -C data

DESKTOP="$(find data -name 'yunyin.desktop' | head -1)"
if [ -n "$DESKTOP" ]; then
  sed -i 's/^Name=yunyin$/Name=云音/' "$DESKTOP"
  sed -i 's/^GenericName=.*//' "$DESKTOP" 2>/dev/null || true
  # Keep the file ASCII-named; only the display field is Chinese.
  echo "[deb] launcher display name set to 云音"
fi

# Rebuild md5sums so the package stays self-consistent.
if [ -f md5sums ]; then
  (cd data && find . -type f ! -path './DEBIAN/*' -exec md5sum {} + > "../md5sums.new" 2>/dev/null) || true
  [ -s md5sums.new ] && mv md5sums.new md5sums
  tar czf control.tar.gz -C . control md5sums 2>/dev/null || tar czf control.tar.gz control
fi

tar czf data.tar.gz -C data .
printf '2.0\n' > debian-binary
rm -f "$DEB"
ar rcs "$DEB" debian-binary control.tar.gz data.tar.gz

echo "[deb] done: $DEB ($(du -h "$DEB" | cut -f1))"
