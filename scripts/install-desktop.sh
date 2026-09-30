#!/usr/bin/env bash
# Registers YunYin with the desktop so niri's launcher (fuzzel/rofi/anyrun)
# and the Wayland session can start it like any other application.
#
# Usage: scripts/install-desktop.sh [path-to-AppImage-or-binary]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${1:-}"
APPDIR="$HOME/.local/share/applications"
ICONDIR="$HOME/.local/share/icons/hicolor"

if [ -z "$BIN" ]; then
  # Prefer a built AppImage, then the release binary.
  BIN=$(find "$ROOT/src-tauri/target/release/bundle/appimage" -maxdepth 1 -name '*.AppImage' 2>/dev/null | head -1 || true)
  [ -z "$BIN" ] && BIN="$ROOT/src-tauri/target/release/yunyin"
fi
if [ ! -x "$BIN" ]; then
  echo "找不到可执行文件: $BIN" >&2
  echo "请先运行 npm run app:build，或把 AppImage 路径作为参数传入。" >&2
  exit 1
fi
BIN="$(readlink -f "$BIN")"

# Icons, in the sizes freedesktop expects.
for size in 32 64 128 256 512; do
  src="$ROOT/src-tauri/icons/${size}x${size}.png"
  [ "$size" = "256" ] && src="$ROOT/src-tauri/icons/128x128@2x.png"
  [ "$size" = "512" ] && src="$ROOT/src-tauri/icons/icon.png"
  if [ -f "$src" ]; then
    install -Dm644 "$src" "$ICONDIR/${size}x${size}/apps/yunyin.png"
  fi
done

mkdir -p "$APPDIR"
cat > "$APPDIR/yunyin.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=云音
Name[en]=YunYin
GenericName=音乐播放器
GenericName[en]=Music Player
Comment=网易云音乐第三方桌面客户端（私人雷达 / 每日推荐 / 心动模式 / 私人FM）
Comment[en]=Unofficial NetEase Cloud Music client for Linux
Exec=$BIN
Icon=yunyin
Terminal=false
Categories=AudioVideo;Audio;Player;Music;
Keywords=music;audio;player;netease;yunyin;音乐;网易云;
StartupNotify=true
StartupWMClass=yunyin
DESKTOP

command -v update-desktop-database >/dev/null && update-desktop-database "$APPDIR" >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICONDIR" >/dev/null 2>&1 || true

echo "已安装桌面入口: $APPDIR/yunyin.desktop"
echo "可执行文件:       $BIN"
echo
echo "niri 绑定示例（~/.config/niri/binds.kdl）:"
echo "    Mod+Shift+M { spawn \"$BIN\"; }"
