#!/usr/bin/env bash
# Builds the AppImage without depending on GitHub.
#
# `tauri build --bundles appimage` shells out to linuxdeploy, which calls its
# bundled appimagetool. That appimagetool downloads the AppImage type-2 runtime
# from GitHub on every run, and its downloader cannot follow the redirect GitHub
# releases use — so on many networks the bundle step dies with the unhelpful
# `failed to run linuxdeploy`.
#
# This script does what the Tauri bundler does, minus that download:
#   1. `tauri build` compiles the binary and prepares a complete AppDir,
#   2. appimagetool packages that AppDir using a locally cached runtime.
#
# Run scripts/fetch-appimage-runtime.sh once beforehand.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUNTIME="${APPIMAGE_RUNTIME_FILE:-$HOME/.cache/yunyin/runtime-x86_64}"
LD_ROOT="$HOME/.cache/yunyin/linuxdeploy"
APPIMAGE_TOOL="$LD_ROOT/plugins/linuxdeploy-plugin-appimage/appimagetool-prefix/AppRun"
BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle/appimage"
APP_DIR="$BUNDLE_DIR/yunyin.AppDir"
OUTPUT="$BUNDLE_DIR/yunyin_0.1.0_amd64.AppImage"

if [ ! -s "$RUNTIME" ]; then
  echo "[bundle] runtime missing at $RUNTIME" >&2
  echo "[bundle] run scripts/fetch-appimage-runtime.sh first" >&2
  exit 1
fi

# Unpack linuxdeploy once so its bundled appimagetool is reachable directly.
if [ ! -x "$APPIMAGE_TOOL" ]; then
  echo "[bundle] unpacking linuxdeploy into $LD_ROOT"
  mkdir -p "$LD_ROOT"
  LD_APPIMAGE="$(find "$HOME/.cache/tauri" -maxdepth 1 -name 'linuxdeploy-*.AppImage' | head -1)"
  if [ -z "$LD_APPIMAGE" ]; then
    echo "[bundle] linuxdeploy not cached; run a plain 'tauri build' once to fetch it" >&2
    exit 1
  fi
  (cd "$LD_ROOT" && "$LD_APPIMAGE" --appimage-extract >/dev/null 2>&1) &&
    mv "$LD_ROOT"/squashfs-root/* "$LD_ROOT"/ 2>/dev/null
  rmdir "$LD_ROOT/squashfs-root" 2>/dev/null
fi

if [ ! -x "$APPIMAGE_TOOL" ]; then
  echo "[bundle] appimagetool not found at $APPIMAGE_TOOL" >&2
  exit 1
fi

# Tauri resolves `externalBin` entries from src-tauri/binaries, so the freshly
# built sidecar has to be copied there first. Skipping this once shipped a
# bundle containing a stale bridge, and every "fix" appeared not to work.
TRIPLE="$(ls sidecar/dist/ | sed -n 's/^yunyin-api-\(.*\)$/\1/p' | head -1)"
if [ -z "$TRIPLE" ]; then
  echo "[bundle] no built sidecar found in sidecar/dist" >&2
  exit 1
fi
FRESH="sidecar/dist/yunyin-api-$TRIPLE"
STAGED="src-tauri/binaries/yunyin-api-$TRIPLE"
mkdir -p src-tauri/binaries
if ! cmp -s "$FRESH" "$STAGED"; then
  echo "[bundle] staging the fresh sidecar into src-tauri/binaries"
  cp -f "$FRESH" "$STAGED"
else
  echo "[bundle] staged sidecar already current"
fi

# 1. Compile and let Tauri prepare the AppDir. The appimage bundling step is
#    expected to fail here, so only its side effects matter.
echo "[bundle] building binary and preparing the AppDir"
export PATH="$HOME/.cargo/bin:$PATH"
npx tauri build 2>&1 | grep -viE "^\s*Compiling|^\s*Building" | tail -5 || true

if [ ! -f "$APP_DIR/AppRun" ]; then
  echo "[bundle] AppDir was not prepared ($APP_DIR/AppRun missing)" >&2
  exit 1
fi

# 1b. Bundle the GStreamer plugins.
#
# linuxdeploy copies the GStreamer *core* libraries out of the system but none of
# its plugins, so the bundled webview ended up with a core library and an empty
# plugin registry. WebKit asks for appsink / appsrc / autoaudiosink, finds
# nothing, trips an assertion and aborts the whole web process — that is what
# crashed the app the moment playback started.
APP_USR="$APP_DIR/usr"
GST_SYS="/usr/lib/gstreamer-1.0"
GST_DST="$APP_USR/lib/gstreamer-1.0"
if [ -d "$GST_SYS" ]; then
  mkdir -p "$GST_DST"
  cp -a "$GST_SYS"/. "$GST_DST"/ 2>/dev/null || true
  echo "[bundle] staged $(find "$GST_DST" -name '*.so' | wc -l) GStreamer plugins"

  # Pull in the libraries those plugins need and the bundle does not already have.
  while read -r dep; do
    [ -e "$dep" ] || continue
    name="$(basename "$dep")"
    if [ ! -e "$APP_USR/lib/$name" ]; then
      cp -L "$dep" "$APP_USR/lib/$name" 2>/dev/null || true
    fi
  done <<EOF
$(find "$GST_DST" -name '*.so' -exec ldd {} + 2>/dev/null | awk '/=> \/usr\//{print $3}' | sort -u)
EOF
  echo "[bundle] resolved plugin dependencies"
else
  echo "[bundle] no GStreamer plugins on this system; playback may be unavailable" >&2
fi

# 2. Package the AppDir ourselves, reusing the cached runtime.
echo "[bundle] packaging the AppImage"
rm -f "$OUTPUT"
if ! ARCH=x86_64 "$APPIMAGE_TOOL" --runtime-file "$RUNTIME" --no-appstream "$APP_DIR" "$OUTPUT" 2>&1 | tail -4; then
  echo "[bundle] appimagetool failed" >&2
  exit 1
fi

if [ ! -s "$OUTPUT" ]; then
  echo "[bundle] no AppImage produced" >&2
  exit 1
fi

echo "[bundle] done: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
