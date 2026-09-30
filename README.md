# 云音 · YunYin

一个为 Linux 桌面（Arch + niri，或任何 Wayland 合成器）写的**网易云音乐第三方客户端**。
界面是 Material Design 3 风格的深色主题，不是官方客户端的复刻。

![发现页](docs/screenshots/01-discover.png)

## 功能

| 页面 | 说明 |
| --- | --- |
| **发现音乐** | 首页轮播、推荐歌单、推荐新音乐、热门歌单、排行榜入口 |
| **私人雷达** | 每日更新的个性化推荐，可展开曲目直接播放 |
| **每日推荐** | 每天 30 首，附收藏夹快捷入口，可换一批 |
| **心动模式** | 选一首种子歌曲，沿着它的风格不断延伸播放队列 |
| **漫游 · 私人FM** | 无限电台，自动续播，喜欢／不感兴趣一键操作 |
| **我喜欢的音乐** | 收藏歌曲全量同步，支持随机播放 |
| **排行榜 / 分类歌单** | 官方榜 + 按曲风筛选 |
| **歌单 / 专辑 / 歌手** | 详情页、模糊封面主视觉、虚拟滚动曲目列表 |
| **搜索** | `Ctrl K` 唤起命令面板，单曲 / 歌单 / 歌手 / 专辑分类结果 |
| **播放页** | 全屏歌词，逐行高亮，点击歌词跳转播放位置 |
| **播放队列** | 右侧抽屉，浏览与单曲移除 |

播放能力：列表循环 / 单曲循环 / 随机 / 心动 / 漫游五种模式，音质可在标准到超清母带之间
切换，支持媒体键（`playerctl` 可用），没有播放地址的歌曲会自动跳过并提示原因。

## 安装

### 从 AppImage 运行（推荐）

```bash
# 产物在 src-tauri/target/release/bundle/appimage/ 下
chmod +x 云音_0.1.0_amd64.AppImage
./云音_0.1.0_amd64.AppImage
```

### 关于可移植性

这个 AppImage **链接宿主系统的 WebKitGTK**，因此并不通用：它需要目标机器装有
`webkit2gtk-4.1` 及其 GStreamer 插件。打包脚本会把 `gstreamer-1.0` 的插件目录
一并放进 AppImage（否则播放会直接导致 web 进程 abort），但 WebKit 本体仍来自系统。

同版本 Arch 上可以直接跑。要在别的发行版分发，建议改用 deb / rpm，由包管理器声明依赖：

```bash
npm run app:deb      # 依赖里会写明 webkit2gtk-4.1 与 gstreamer 插件
```

### 注册到桌面（niri 启动器可直接搜到）

```bash
./scripts/install-desktop.sh /path/to/云音_0.1.0_amd64.AppImage
```

之后 `Mod+D` 里搜索「云音」即可。想在 niri 里直接绑定快捷键，在 `~/.config/niri/binds.kdl` 加：

```kdl
Mod+Shift+M { spawn "/path/to/云音_0.1.0_amd64.AppImage"; }
```

## 从源码运行

```bash
# 依赖：node >= 20、rust 工具链、gtk3 / webkit2gtk-4.1 / libsoup3 的开发头文件
# Arch: sudo pacman -S --needed base-devel nodejs rust gtk3 webkit2gtk-4.1 libsoup3

cd yunyin

# 1. 构建内嵌的 API 服务（首次会下载一份官方 Node 运行时用于打包）
(cd sidecar && npm install)
npm install
npm run build:sidecar        # 产出 sidecar/dist/yunyin-api-<triple>

# 2. 开发模式（热重载）
npm run app                  # = tauri dev

# 3. 发布构建（AppImage + deb）
npm run app:build
```

只想在浏览器里看看界面：

```bash
npm run dev                  # 前端，默认 http://localhost:1420
node sidecar/server.mjs --port 38471   # 另开一个终端跑 API 服务
```

## 登录

播放完整歌曲、每日推荐、私人雷达和心动模式都需要登录网易云账号。点侧栏的
「登录网易云」可以**扫码**或**手机号 / 验证码 / 密码**登录。

- 登录凭据只保存在本机，并且只在访问本机 API 服务（`127.0.0.1`）时使用。
- 会话由内嵌的 API 服务持有并写入 `~/.local/state/yunyin/sessions.json`
  （权限 `600`）。**不放在浏览器存储里**是有原因的：应用运行在 `tauri://` 源下，
  WebKit 会把该源发出的 `Cookie` 头直接丢弃，会话无法通过请求头传递。
- 本应用不收集、不上传任何数据。
- 请遵守网易云音乐的服务条款，支持正版。

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl K` | 打开搜索 |
| `空格` | 播放 / 暂停 |
| `← / →` | 后退 / 前进 5 秒 |
| `Shift ← / →` | 上一首 / 下一首 |
| `↑ / ↓` | 音量增减 5% |
| `Esc` | 关闭搜索 / 播放页 |

## 架构

```
┌────────────────────────────── Tauri v2 外壳 (Rust) ─────────────────────────────┐
│  src-tauri/src/lib.rs                                                           │
│    · 启动时挑一个空闲端口                                                        │
│    · 拉起内嵌的 yunyin-api 可执行文件（Node Single Executable Application）      │
│    · 轮询 /health，就绪后把 apiBase 通过 initialization script 注入 webview      │
│    · 退出时 SIGTERM 回收子进程                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  WebView (WebKitGTK)  ← React 19 + TypeScript + MUI v9（Material 3 主题）        │
│    src/api/         接口封装、Cookie 会话、歌词解析                              │
│    src/player/      Howler 播放引擎 + zustand 播放状态机（模式/队列/预取/上报）   │
│    src/components/  应用外壳、播放条、播放页、队列、登录、搜索                   │
│    src/pages/       各功能页面                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │ HTTP (127.0.0.1)
                                   ▼
┌────────────────── yunyin-api（Node SEA，约 128 MB，无需系统 Node） ──────────────┐
│  sidecar/server.mjs        显式声明用到的几十个接口路由                          │
│  NeteaseCloudMusicApi      负责 weapi/eapi 加密与出站请求                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 为什么 API 服务要打包成单独的可执行文件

NetEaseCloudMusicApi 是一个 Node 库，网易那套 `weapi` 加密依赖它。它按目录扫描 377 个
路由模块（`fs.readdirSync` + 动态 `require`），而 Node 的 Single Executable Application
里没有文件系统可用。`scripts/build-sidecar.mjs` 的做法：

1. 生成 `virtual-modules.cjs`，把每个路由模块的文件名映射到静态打包后的副本，并接管
   `fs.readdirSync` / `fs.promises.readdir` / `Module._load`；
2. 生成一个入口，**先**加载这个 hook 再加载库本体，保证库枚举模块时 hook 已生效；
3. 用 esbuild 把两者打成一个文件，作为 SEA asset 嵌进可执行文件。

SEA 的基底用的是**官方预编译 Node** 而不是发行版自带的：Arch 的 `node` 在 postject 注入
后会直接 core dump，官方构建则正常。

## 已知限制

- **版权 / VIP 歌曲**：账号无权播放时接口返回空地址，界面显示「不可播放」并自动跳过。
- **AAC 编码**：能否解码取决于系统装的 GStreamer 插件；mp3 与 flac 已确认可用。
- **心动模式 / 私人雷达 / 每日推荐**：需要有效登录态，未登录时显示登录引导页。
- 未实现：MV 播放、评论、云盘、播客、一起听。

## 开发提示

```bash
npm run typecheck         # tsc --noEmit
npm run build:web         # 类型检查 + 前端构建
npm run build:sidecar     # 重新打包 API 可执行文件
./scripts/e2e-webkit.sh   # 在 WebKitGTK 里跑端到端校验（与 Tauri 同一引擎）
```

`scripts/webkit-probe.c` 是一个很小的 GTK3 + WebKitGTK 宿主，用来在真实引擎里验证 CSS
特性、封面解码、路由与搜索；`scripts/e2e-webkit.js` 是它执行的测试脚本；
`scripts/install-desktop.sh` 负责注册桌面入口。

### 登录失败的常见原因

网易对登录有较严格的风控，以下三种情况都会导致登录被拒。云音的登录弹窗里有
「登录诊断」面板，会显示网易返回的真实错误码，照着下表对照即可：

| 网易错误码 | 提示 | 原因与处理 |
| --- | --- | --- |
| `8810` | 您当前的网络环境存在安全风险 | **关掉 VPN / 代理再登录。** 机房 IP 会被判定为代理 |
| `10004` | 当前登录存在安全风险 | 系统时间不准（常见于 Windows 双系统）。开启 NTP 同步后重试 |
| `406` | 操作频繁，请稍候再试 | 同一出口 IP 的短信额度用尽，等待一段时间即可 |
| `509` | 密码错误超过限制 | 密码连续错误触发限制，等待解除或改用验证码登录 |
| `503` | 验证码错误 | 验证码输错或已过期，重新获取 |

另外，如果你的机器没有可用的 IPv6 路由（`ip -6 route get 2400:3200::1` 报
Network is unreachable），API 服务会在启动时自动把 DNS 锁定到 IPv4，避免每个
请求先耗掉一个 IPv6 超时。日志里会打印 `DNS preference: ipv4-only`。

### 关于双系统的时间

Windows 默认把硬件时钟当本地时间写，Linux 当 UTC 读，从 Windows 重启回 Linux 会差
一个时区。任选其一修正：

```bash
# 方案 A：让 Linux 按本地时间读硬件时钟
sudo timedatectl set-local-rtc 1 --adjust-system-clock

# 方案 B：在 Windows 管理员 PowerShell 里让 Windows 按 UTC 写硬件时钟
# reg add "HKLM\SYSTEM\CurrentControlSet\Control\TimeZoneInformation" /v RealTimeIsUniversal /t REG_DWORD /d 1 /f
```

### 打包

`tauri build --bundles appimage` 会调用 linuxdeploy，而 linuxdeploy 自带的 appimagetool
每次都要从 GitHub 下载 AppImage 运行时；它的下载器不跟随 GitHub releases 的 302 跳转，
于是在很多网络下打包会失败并只报一句没用的 `failed to run linuxdeploy`。

本仓库把这一步拆开了：

```bash
./scripts/fetch-appimage-runtime.sh   # 只需执行一次，缓存 AppImage 运行时
npm run app:build                    # = build:sidecar + scripts/build-appimage.sh
```

`scripts/build-appimage.sh` 先让 Tauri 编译好二进制并准备好 AppDir，再用缓存的运行时直接
打包 AppDir，全程不访问 GitHub。只想要 deb 用 `npm run app:deb`。

## 许可

MIT。本项目与网易云音乐官方无关，「网易云音乐」是其所有者的商标。
