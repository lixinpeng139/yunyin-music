#!/usr/bin/env node
/**
 * YunYin API bridge.
 *
 * A small HTTP front-end over the `NeteaseCloudMusicApi` library. Upstream ships
 * an Express server that discovers its ~700 route modules with `fs.readdirSync`,
 * which cannot be bundled into one executable; YunYin needs only a few dozen
 * endpoints, so they are wired up explicitly here and the whole file is bundled
 * with esbuild and embedded into a Node SEA binary that ships with the app.
 *
 * Usage: yunyin-api --port 38471 [--host 127.0.0.1] [--lib <path to library>]
 */

import { createServer } from 'node:http'
import path from 'node:path'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(typeof __filename === 'string' ? __filename : process.argv[1] || '.')

// NetEase's `interface*.music.163.com` hosts publish both A and AAAA records.
// Node prefers IPv6, so on a host without a working IPv6 route every request
// first pays a full TCP timeout before falling back to IPv4 — which shows up as
// intermittent `ETIMEDOUT` / `ENETUNREACH` failures on login and search while
// plain HTTPS to the same domain still works. The host's IPv6 availability is
// therefore probed once at startup and, when absent, `dns.lookup` is pinned to
// IPv4 so the fallback attempt never happens.
//
// Override with YUNYIN_IP_FAMILY=ipv4 | ipv6 | auto (auto forces nothing).
{
  const dns = require('node:dns')
  const { execFileSync } = require('node:child_process')

  /**
   * True only when the kernel can actually route IPv6 traffic.
   *
   * Checking for a global address is not enough: a host can hold a stale
   * address with no working route, which fails exactly like having none. A
   * route lookup answers the real question without sending any traffic and
   * returns instantly.
   */
  function hasUsableIpv6() {
    try {
      const probe = execFileSync('ip', ['-6', 'route', 'get', '2400:3200::1'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return probe.includes('via') || probe.includes('dev')
    } catch {
      // Non-zero exit ("Network is unreachable"), a missing `ip` binary, or a
      // timeout all mean IPv6 is not usable here.
      return false
    }
  }

  const requested = (process.env.YUNYIN_IP_FAMILY || '').toLowerCase()
  const preference =
    requested === 'ipv4' || requested === 'ipv6'
      ? requested
      : requested === 'auto' || hasUsableIpv6()
        ? 'runtime'
        : 'ipv4'

  try {
    dns.setDefaultResultOrder(preference === 'ipv6' ? 'ipv6first' : 'ipv4first')
  } catch {
    /* older runtimes keep the default order */
  }

  if (preference === 'ipv4' || preference === 'ipv6') {
    const lookup = dns.lookup
    const family = preference === 'ipv6' ? 6 : 4
    dns.lookup = function lookupPinned(hostname, options, callback) {
      if (typeof options === 'function') {
        callback = options
        options = {}
      } else if (typeof options === 'number') {
        options = { family: options }
      }
      const asked = options && typeof options === 'object' ? { ...options } : {}
      if (!asked.family) {
        // Resolve both families, keep the preferred one, and fall back to the
        // unfiltered result only when it is absent.
        return lookup.call(dns, hostname, { ...asked, all: true }, (error, addresses) => {
          if (error) return callback(error)
          const kept = (addresses || []).filter((entry) => entry.family === family)
          if (!kept.length) return lookup.call(dns, hostname, asked, callback)
          if (asked.all) return callback(null, kept)
          return callback(null, kept[0].address, kept[0].family)
        })
      }
      return lookup.call(dns, hostname, asked, callback)
    }
    console.log(`[yunyin-api] DNS preference: ${preference}-only`)
  } else {
    console.log('[yunyin-api] DNS preference: runtime default')
  }
}

/** Inside a Single Executable Application this exposes the embedded assets. */
let sea = null
try {
  sea = require('node:sea')
} catch {
  sea = null
}

const isSea = Boolean(sea && typeof sea.isSea === 'function' && sea.isSea())

const args = process.argv.slice(2)
function argValue(flag, fallback) {
  const index = args.indexOf(flag)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const PORT = Number(argValue('--port', process.env.NCM_PORT || 38471))
const HOST = argValue('--host', process.env.NCM_HOST || '127.0.0.1')
const LIB_ARG = argValue('--lib', '')

/** Directory the packaged library believes it lives in (see build-sidecar.mjs). */
const VIRTUAL_ROOT = '/__yunyin__'

/** Loads the API library: the embedded bundle when packaged, else from disk. */
function loadLibrary() {
  if (isSea) {
    const module = { exports: {} }
    const source = sea.getAsset('ncm-api.cjs', 'utf8')
    // The bundle installs its own redirect for the library's route modules
    // before evaluating it, so this call works without a file system.
    const factory = new Function('module', 'exports', 'require', '__filename', '__dirname', source)
    factory(module, module.exports, require, 'ncm-api.cjs', VIRTUAL_ROOT)
    const loaded = module.exports?.default ?? module.exports
    if (!loaded || typeof loaded !== 'object') throw new Error('内嵌曲库导出为空')
    return loaded
  }

  const here = path.dirname(process.argv[1] || '.')
  const candidates = []
  if (LIB_ARG) candidates.push(LIB_ARG)
  candidates.push('NeteaseCloudMusicApi/main.js')
  candidates.push(path.join(here, '..', '..', 'ncm-api', 'node_modules', 'NeteaseCloudMusicApi', 'main.js'))
  candidates.push(path.join(here, '..', 'ncm-api', 'node_modules', 'NeteaseCloudMusicApi', 'main.js'))

  let lastError
  for (const candidate of candidates) {
    try {
      const loaded = require(candidate)
      const api = loaded?.default ?? loaded
      if (api && typeof api === 'object') return api
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`无法加载 NeteaseCloudMusicApi: ${lastError?.message ?? '未知错误'}`)
}

/**
 * Per-client cookie jars.
 *
 * The session cookie cannot travel in a `Cookie` header from the app: it runs
 * from a `tauri://` origin and WebKit silently drops that header, so the bridge
 * always received an empty session. Instead the renderer sends an opaque
 * `clientId` and the bridge keeps the cookies itself.
 */
const sessions = new Map()

/** Where the session jars live between runs. */
const SESSION_FILE = (() => {
  const base =
    process.env.XDG_STATE_HOME ||
    (process.env.HOME ? path.join(process.env.HOME, '.local', 'state') : null) ||
    process.env.TMPDIR ||
    '/tmp'
  return path.join(base, 'yunyin', 'sessions.json')
})()

/** Reads the persisted jars; a corrupt file is discarded rather than fatal. */
function loadSessions() {
  try {
    const raw = JSON.parse(readFileSync(SESSION_FILE, 'utf8'))
    for (const [clientId, cookies] of Object.entries(raw)) {
      if (!cookies || typeof cookies !== 'object') continue
      const jar = new Map()
      for (const [name, value] of Object.entries(cookies)) {
        if (typeof value === 'string' && value) jar.set(name, value)
      }
      if (jar.size) sessions.set(clientId, jar)
    }
    if (process.env.YUNYIN_DEBUG && sessions.size) {
      console.log(`[session] restored ${sessions.size} jar(s) from ${SESSION_FILE}`)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && process.env.YUNYIN_DEBUG) {
      console.log(`[session] could not read ${SESSION_FILE}: ${error?.message}`)
    }
  }
}

/** Drops jars that never obtained a session. */
function pruneSessions() {
  let dropped = 0
  for (const [clientId, jar] of sessions) {
    if (clientId === 'default') continue
    if (!jar.has('MUSIC_U')) {
      sessions.delete(clientId)
      dropped += 1
    }
  }
  return dropped
}

/** Writes the jars atomically so a crash cannot leave a half-written file. */
let saveTimer = null
function persistSessions() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      mkdirSync(path.dirname(SESSION_FILE), { recursive: true, mode: 0o700 })
      pruneSessions()
      const plain = {}
      for (const [clientId, jar] of sessions) {
        plain[clientId] = Object.fromEntries(jar)
      }
      const tmp = `${SESSION_FILE}.${process.pid}.tmp`
      // Session cookies are credentials: keep them readable only by the owner.
      writeFileSync(tmp, JSON.stringify(plain), { mode: 0o600 })
      renameSync(tmp, SESSION_FILE)
    } catch {
      /* persistence is best-effort; the in-memory jar still works */
    }
  }, 250)
  if (typeof saveTimer.unref === 'function') saveTimer.unref()
}

loadSessions()

function sessionFor(clientId) {
  const key = typeof clientId === 'string' && clientId ? clientId : 'default'
  let entry = sessions.get(key)
  if (!entry) {
    entry = new Map()
    sessions.set(key, entry)
  }
  return entry
}

/** Parses `name=value; ...` into the session jar. */
function absorbIntoSession(jar, raw) {
  if (!raw) return
  for (const part of String(raw).split(/[;,]/)) {
    const pair = part.trim()
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (!name || !value) continue
    if (['Max-Age', 'Expires', 'Path', 'Domain', 'SameSite', 'Secure', 'HttpOnly'].includes(name)) {
      continue
    }
    if (jar.get(name) !== value) {
      jar.set(name, value)
      persistSessions()
    }
  }
}

function sessionCookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => name + '=' + value).join('; ')
}

/** Cookie values that belong to this process and must not be replayed. */
const VOLATILE_COOKIES = new Set(['MUSIC_A'])

function sanitizeCookie(raw) {
  if (!raw) return undefined
  const kept = String(raw)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const name = part.slice(0, part.indexOf('='))
      return name && !VOLATILE_COOKIES.has(name)
    })
  return kept.length ? kept.join('; ') : undefined
}

function parseQuery(searchParams) {
  const query = {}
  for (const [key, value] of searchParams.entries()) {
    if (key === 'cookie') continue
    query[key] = value
  }
  return query
}

/** Public route -> library function name. */
const ROUTES = new Map(
  Object.entries({
    '/search': 'search',
    '/search/suggest': 'search_suggest',
    '/search/hot': 'search_hot',
    '/banner': 'banner',
    '/personalized': 'personalized',
    '/personalized/newsong': 'personalized_newsong',
    '/personalized/private/new': 'personalized_privatecontent',
    '/personalized/djprogram': 'personalized_djprogram',
    '/top/playlist': 'top_playlist',
    '/top/playlist/highquality': 'top_playlist_highquality',
    '/toplist': 'toplist',
    '/toplist/artist': 'toplist_artist',
    '/homepage/block/page': 'homepage_block_page',
    '/homepage/dragon/ball': 'homepage_dragon_ball',
    '/recommend/songs': 'recommend_songs',
    '/recommend/resource': 'recommend_resource',
    '/personal_fm': 'personal_fm',
    '/personal/fm': 'personal_fm',
    '/fm_trash': 'fm_trash',
    '/playmode/intelligence/list': 'playmode_intelligence_list',
    '/playmode/song/vector': 'playmode_song_vector',
    '/song/url': 'song_url',
    '/song/url/v1': 'song_url_v1',
    '/song/detail': 'song_detail',
    '/song/lyric': 'lyric',
    '/lyric': 'lyric',
    '/lyric/new': 'lyric_new',
    '/song/like/check': 'song_like_check',
    '/like': 'like',
    '/likelist': 'likelist',
    '/scrobble': 'scrobble',
    '/playlist/detail': 'playlist_detail',
    '/playlist/track/all': 'playlist_track_all',
    '/playlist/tracks': 'playlist_tracks',
    '/playlist/subscribe': 'playlist_subscribe',
    '/playlist/create': 'playlist_create',
    '/playlist/track/add': 'playlist_track_add',
    '/playlist/track/delete': 'playlist_track_delete',
    '/album': 'album',
    '/album/sublist': 'album_sublist',
    '/album/sub': 'album_sub',
    '/artist/detail': 'artist_detail',
    '/artist/top/song': 'artist_top_song',
    '/artist/songs': 'artist_songs',
    '/artist/album': 'artist_album',
    '/artist/list': 'artist_list',
    '/artists': 'artists',
    '/user/account': 'user_account',
    '/user/detail': 'user_detail',
    '/user/playlist': 'user_playlist',
    '/user/subcount': 'user_subcount',
    '/user/level': 'user_level',
    '/login/qr/key': 'login_qr_key',
    '/login/qr/create': 'login_qr_create',
    '/login/qr/check': 'login_qr_check',
    '/login/cellphone': 'login_cellphone',
    '/login/status': 'login_status',
    '/login/refresh': 'login_refresh',
    '/logout': 'logout',
    '/captcha/sent': 'captcha_sent',
    '/captcha/verify': 'captcha_verify',
    '/register/anonimous': 'register_anonimous',
    '/recent/listen/list': 'recent_listen_list',
    '/record/recent/song': 'record_recent_song',
    '/daily_signin': 'daily_signin',
    '/simi/song': 'simi_song',
    '/simi/playlist': 'simi_playlist',
  }),
)

const NO_STORE = new Set([
  '/song/url',
  '/song/url/v1',
  '/login/qr/check',
  '/user/account',
  '/recommend/songs',
  '/personal_fm',
  '/playmode/intelligence/list',
])

function send(res, status, body) {
  const payload = JSON.stringify(body ?? {})
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Cookie',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // The renderer sets `Accept` explicitly, which makes it a non-safelisted
    // request header and therefore subject to a preflight. Omitting it here
    // blocked every request and the app reported the bridge as unreachable.
    'Access-Control-Max-Age': '600',
  })
  res.end(payload)
}

function start(api) {
  process.on('uncaughtException', (error) => {
  // The bridge must stay up even if one request misbehaves; a dead bridge looks
  // like a network outage to the app and hides the real error.
  console.error('[yunyin-api] uncaught exception (server kept alive):', error?.message ?? error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[yunyin-api] unhandled rejection:', reason)
})

const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      send(res, 204, null)
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
    const route = url.pathname.replace(/\/+$/, '') || '/'

    if (route === '/' || route === '/health') {
      const clientId = url.searchParams.get('clientId') || 'default'
      const jar = sessionFor(clientId)
      send(res, 200, {
        ok: true,
        service: 'yunyin-api',
        uptime: Math.round(process.uptime()),
        signedIn: jar.has('MUSIC_U'),
      })
      return
    }

    if (route === '/__diag__') {
      console.log(`[diag] ${url.searchParams.get('probe') ?? ''}`)
      send(res, 200, { ok: true })
      return
    }

    if (route === '/__logout__') {
      jar.clear()
      persistSessions()
      send(res, 200, { ok: true })
      return
    }

    const handlerName = ROUTES.get(route)
    if (!handlerName) {
      send(res, 404, { code: 404, msg: `未实现的接口: ${route}` })
      return
    }
    const handler = api[handlerName]
    if (typeof handler !== 'function') {
      send(res, 501, { code: 501, msg: `接口不可用: ${handlerName}` })
      return
    }

    const started = Date.now()
    const query = parseQuery(url.searchParams)
    const clientId = url.searchParams.get('clientId') || 'default'
    const jar = sessionFor(clientId)
    // Still honour an explicit header when one arrives (the dev server and any
    // http:// origin can send it); otherwise fall back to the stored jar.
    absorbIntoSession(jar, sanitizeCookie(req.headers.cookie) || url.searchParams.get('cookie'))
    const cookie = sessionCookieHeader(jar)
    if (cookie) query.cookie = cookie
    query.timestamp = query.timestamp || Date.now()

    if (process.env.YUNYIN_DEBUG) {
      console.log(
        `[jar] ${route} clientId=${String(clientId).slice(0, 12)} jarSize=${jar.size} musicU=${jar.has('MUSIC_U')} outCookieLen=${cookie ? cookie.length : 0}`,
      )
    }

    if (process.env.YUNYIN_DEBUG && (route === '/user/account' || route === '/login/qr/check')) {
      const raw = req.headers.cookie || ''
      const names = raw
        .split(';')
        .map((part) => part.trim().split('=')[0])
        .filter(Boolean)
      const musicU = /(?:^|;\s*)MUSIC_U=([^;]*)/.exec(raw)
      console.log(
        `[in] ${route} names=[${names.join(',')}]` +
          ` MUSIC_U=${musicU ? musicU[1].length + 'B' : 'ABSENT'}` +
          ` total=${raw.length}B`,
      )
    }

    try {
      const result = await handler(query)
      const body = result?.body ?? result ?? {}
      if (Array.isArray(result?.cookie) && result.cookie.length) {
        // Keep the session in the bridge; the renderer never sees these values.
        for (const entry of result.cookie) absorbIntoSession(jar, entry)
        if (process.env.YUNYIN_DEBUG && route === '/login/qr/check' && body.code !== 801) {
          console.log(
            `[qr] code=${body.code} sessionMusicU=${jar.has('MUSIC_U')} jarSize=${jar.size}`,
          )
        }
      }
      if (process.env.YUNYIN_DEBUG && route === '/login/qr/check' && body.code !== 801) {
        // The QR handshake is the one flow whose success depends entirely on the
        // cookies coming back, so log exactly what was returned.
        const names = (result?.cookie ?? [])
          .map((entry) => String(entry).split('=')[0])
          .filter(Boolean);
        console.log(
          `[qr] code=${body.code} set-cookie=${names.join(',') || '(none)'}` +
            ` hasMUSIC_U=${String(body.cookie ?? '').includes('MUSIC_U=')}` +
            ` bodyKeys=${Object.keys(body).join(',')}`,
        );
      }
      if (NO_STORE.has(route)) res.setHeader('Cache-Control', 'no-store')
      send(res, 200, body)
      if (process.env.YUNYIN_DEBUG) {
        const ms = Date.now() - started
        const sent = typeof body?.cookie === 'string' ? body.cookie.length : 0
        const got = (req.headers.cookie || '').length
        console.log(
          `[req] ${route} code=${body?.code} ${ms}ms in-cookie=${got}B out-cookie=${sent}B` +
            (body?.cookie ? ` hasMUSIC_U=${String(body.cookie).includes('MUSIC_U=')}` : ''),
        )
      }
    } catch (error) {
      // The library rejects with its own `answer` object: a transport failure
      // carries `{ status: 502, body: { code, msg } }` while an API-level
      // rejection carries the upstream body. Both shapes have to be unwrapped,
      // otherwise the caller only ever sees a generic message.
      const body = error?.body && typeof error.body === 'object' ? error.body : {}
      const status = Number(error?.status) || Number(body.code) || 500
      const code = Number(body.code) || (status === 200 ? 500 : status)
      const message =
        body.msg ||
        body.message ||
        (typeof error?.message === 'string' ? error.message : '') ||
        '接口调用失败'

      console.error(`[yunyin-api] ${route} failed: code=${code} msg=${message}`)
      const payload = { ...body, code, msg: message, message }
      if (process.env.NCM_DEBUG) {
        payload.detail = String(error?.stack || error)
      }
      send(res, 200, payload)
    }
  })

  server.listen(PORT, HOST, () => {
    // The parent process watches stdout for this line.
    console.log(`[yunyin-api] listening on http://${HOST}:${PORT}`)
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 1500).unref()
    })
  }
}

try {
  if (isSea) console.log('[yunyin-api] running as a single executable')
  start(loadLibrary())
} catch (error) {
  console.error(`[yunyin-api] fatal: ${error?.message ?? error}`)
  process.exit(1)
}
