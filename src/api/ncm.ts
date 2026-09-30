import { ApiError, hasSession, request } from "./client";


import {
  toPlaylist,
  toPlaylists,
  toRecommendedTracks,
  toTrack,
  toTracks,
} from "./normalize";
import type {
  Album,
  Artist,
  Playlist,
  QualityLevel,
  Track,
  UserProfile,
} from "../types/ncm";

/* ------------------------------------------------------------------ *
 * Shared response envelopes
 * ------------------------------------------------------------------ */

interface Envelope<T> {
  code: number;
  data?: T;
  result?: T;
  [key: string]: unknown;
}

function pickArray<T>(body: unknown, ...keys: string[]): T[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
    // `{ data: { list: [...] } }` style nesting
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      for (const inner of [
        "list",
        "songs",
        "playlists",
        "data",
        "resources",
        "items",
      ]) {
        if (Array.isArray(nested[inner])) return nested[inner] as T[];
      }
    }
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

export interface Banner {
  imageUrl: string;
  /** Present when the banner links to a campaign page outside the app. */
  encodableTargetUrl?: string;
  typeTitle?: string;
  targetId?: number;
  targetType?: number;
  url?: string;
}

export async function fetchBanners(): Promise<Banner[]> {
  const body = await request<{ banners?: Banner[] }>("/banner", { type: 0 });
  return (body.banners ?? []).filter((b) => b.imageUrl);
}

/** 推荐歌单 (the "猜你喜欢" grid on the discover page). */
export async function fetchRecommendedPlaylists(
  limit = 12,
): Promise<Playlist[]> {
  const body = await request<Envelope<unknown[]>>("/personalized", { limit });
  return toPlaylists(pickArray(body, "result", "data"));
}

/** 推荐新音乐. */
export async function fetchNewSongs(limit = 12): Promise<Track[]> {
  const body = await request<Envelope<unknown[]>>("/personalized/newsong", {
    limit,
  });
  return toTracks(pickArray(body, "result", "data"));
}

/**
 * 私人雷达.
 *
 * NetEase exposes no standalone public radar endpoint — the radar feed *is* the
 * personalised playlist endpoint, whose entries carry a `copywriter` reason
 * line once signed in. (`personalized/playlist` looks like the obvious route
 * name but is not a real one, so probing it only wasted a round trip.)
 *
 * The feed is also intermittent: the same account can see five entries one
 * minute and none the next. Callers therefore treat an empty result as normal
 * and fall back to a general recommendation source rather than showing an error.
 */
export async function fetchRadarPlaylists(limit = 8): Promise<Playlist[]> {
  const body = await request<Envelope<unknown[]>>('/personalized', { limit })
  return toPlaylists(pickArray(body, 'result', 'data'))
}

export async function fetchTopPlaylists(
  limit = 12,
  cat = "全部",
): Promise<Playlist[]> {
  const body = await request<{ playlists?: unknown[] }>("/top/playlist", {
    limit,
    cat,
    order: "hot",
  });
  return toPlaylists(body.playlists ?? []);
}

/** 每日推荐歌曲 — requires a session; returns 30 tracks tailored per day. */
export async function fetchDailySongs(): Promise<Track[]> {
  const body =
    await request<Envelope<{ dailySongs?: unknown[] }>>("/recommend/songs");
  const data = (body.data ?? body) as {
    dailySongs?: unknown[];
    songs?: unknown[];
  };
  const list =
    data.dailySongs ?? data.songs ?? pickArray(body, "data", "recommend");
  return toRecommendedTracks(list);
}

/** 私人 FM — one track per call, the basis of 漫游 mode. */
export async function fetchPersonalFm(): Promise<Track[]> {
  const body = await request<Envelope<unknown[]>>("/personal_fm");
  return toTracks(pickArray(body, "data", "result"));
}

/**
 * 心动模式 — "intelligence" playback. Given a seed track the API returns a
 * crowd of similar songs drawn from the supplied playlist's style.
 */
export async function fetchIntelligenceList(
  songId: number,
  playlistId: number,
  count = 20,
  startSongId?: number,
): Promise<Track[]> {
  const body = await request<Envelope<unknown[]>>(
    "/playmode/intelligence/list",
    {
      id: songId,
      pid: playlistId,
      sid: startSongId ?? songId,
      count,
    },
  );
  return toTracks(pickArray(body, "data", "result"));
}

export interface TopList {
  id: number;
  name: string;
  coverImgUrl?: string;
  updateFrequency?: string;
  trackCount?: number;
  description?: string;
}

export async function fetchTopLists(): Promise<TopList[]> {
  const body = await request<{ list?: TopList[] }>("/toplist");
  return body.list ?? [];
}

/* ------------------------------------------------------------------ *
 * Playlists & tracks
 * ------------------------------------------------------------------ */

export interface PlaylistDetail {
  playlist: Playlist;
  tracks: Track[];
}

export async function fetchPlaylistDetail(id: number): Promise<PlaylistDetail> {
  // `noCache` keeps the 30-track preview plus the full id list fresh.
  const body = await request<{ playlist?: Record<string, unknown> }>(
    "/playlist/detail",
    {
      id,
      s: 0,
    },
  );
  const raw = body.playlist;
  if (!raw) throw new ApiError("/playlist/detail", 404, "歌单不存在或已被删除");
  const playlist = toPlaylist(raw);
  if (!playlist) throw new ApiError("/playlist/detail", 404, "歌单数据异常");
  const tracks = toTracks(raw.tracks);
  playlist.tracks = tracks;
  playlist.trackCount = Number(raw.trackCount ?? tracks.length);
  const creator = raw.creator as Playlist["creator"] | undefined;
  playlist.creatorName = creator?.nickname ?? playlist.creatorName;
  return { playlist, tracks };
}

/** Full track list for playlists larger than the 30-track detail preview. */
export async function fetchPlaylistTracks(
  id: number,
  limit = 1000,
): Promise<Track[]> {
  const body = await request<{ songs?: unknown[] }>("/playlist/track/all", {
    id,
    limit,
    offset: 0,
  });
  return toTracks(body.songs ?? []);
}

export async function fetchAlbum(
  id: number,
): Promise<{ album: Album; tracks: Track[] }> {
  const body = await request<{ album?: Album; songs?: unknown[] }>("/album", {
    id,
  });
  return {
    album: body.album ?? { id, name: "未知专辑" },
    tracks: toTracks(body.songs ?? []),
  };
}

export async function fetchArtist(id: number): Promise<{
  artist: Artist;
  hotSongs: Track[];
  albums: Album[];
}> {
  const [detail, songs, albums] = await Promise.all([
    request<{ artist?: Artist }>("/artist/detail", { id }).catch(() => ({
      artist: undefined,
    })),
    request<{ songs?: unknown[] }>("/artist/top/song", { id }),
    request<{ hotAlbums?: Album[] }>("/artist/album", { id, limit: 24 }).catch(
      () => ({
        hotAlbums: [] as Album[],
      }),
    ),
  ]);
  return {
    artist: detail.artist ?? { id, name: "未知艺术家" },
    hotSongs: toTracks(songs.songs ?? []),
    albums: albums.hotAlbums ?? [],
  };
}

/* ------------------------------------------------------------------ *
 * Playback URLs
 * ------------------------------------------------------------------ */

export interface SongUrlInfo {
  id: number;
  url: string | null;
  br: number;
  size: number;
  level?: string;
  fee?: number;
  gain?: number;
  peak?: number;
  code?: number;
}

/**
 * Resolves playback URLs for up to ~100 tracks in one call.
 *
 * When the account cannot serve the requested tier the API answers with
 * `url: null`, so a second attempt at `standard` is made before a track is
 * declared unplayable.
 */
export async function fetchSongUrls(
  ids: number[],
  level: QualityLevel = "exhigh",
  signal?: AbortSignal,
): Promise<Map<number, SongUrlInfo>> {
  const out = new Map<number, SongUrlInfo>();
  if (!ids.length) return out;

  const unique = [...new Set(ids)];
  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += 100)
    batches.push(unique.slice(i, i + 100));

  const ask = async (batch: number[], tier: QualityLevel) => {
    // The v1 endpoint only accepts a single id; the legacy endpoint accepts a
    // comma separated list and is used for the bulk path.
    if (tier === "standard" && batch.length > 1) {
      const body = await request<{ data?: SongUrlInfo[] }>(
        "/song/url",
        { id: batch.join(","), br: 320000 },
        { signal },
      );
      return body.data ?? [];
    }
    if (batch.length === 1) {
      const body = await request<{ data?: SongUrlInfo[] }>(
        "/song/url/v1",
        { id: batch[0], level: tier },
        { signal },
      );
      return body.data ?? [];
    }
    const body = await request<{ data?: SongUrlInfo[] }>(
      "/song/url",
      { id: batch.join(","), br: tier === "lossless" ? 999000 : 320000 },
      { signal },
    );
    return body.data ?? [];
  };

  for (const batch of batches) {
    const collected: SongUrlInfo[] = [];
    try {
      collected.push(...(await ask(batch, level)));
    } catch {
      /* fall through to the standard-tier retry below */
    }
    const missing = batch.filter(
      (id) => !collected.some((item) => item.id === id && item.url),
    );
    if (missing.length && level !== "standard") {
      try {
        collected.push(...(await ask(missing, "standard")));
      } catch {
        /* leave them unresolved */
      }
    }
    for (const info of collected) {
      const previous = out.get(info.id);
      if (!previous || (!previous.url && info.url)) out.set(info.id, info);
    }
  }
  return out;
}

/** Reports a play to NetEase so 听歌排行 / 每日推荐 stay accurate. */
export async function scrobble(
  track: Track,
  playedMs: number,
  sourceId = 0,
): Promise<void> {
  if (!hasSession()) return;
  try {
    await request("/scrobble", {
      id: track.id,
      sourceid: sourceId || track.album.id || 0,
      time: Math.max(1, Math.round(playedMs / 1000)),
    });
  } catch {
    /* scrobbling is best-effort */
  }
}

/* ------------------------------------------------------------------ *
 * Lyrics
 * ------------------------------------------------------------------ */

export interface RawLyricPayload {
  lrc?: { lyric?: string };
  tlyric?: { lyric?: string };
  romalrc?: { lyric?: string };
  yrc?: { lyric?: string };
}

export async function fetchLyric(id: number): Promise<RawLyricPayload> {
  return request<RawLyricPayload>("/lyric", { id });
}

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

export interface AccountInfo {
  profile: UserProfile | null;
  likedIds: number[];
}

export async function fetchAccount(): Promise<AccountInfo> {
  if (!hasSession()) return { profile: null, likedIds: [] };
  const body = await request<{
    profile?: UserProfile;
    account?: { id?: number };
  }>("/user/account");
  const profile = body.profile ?? null;
  if (!profile) return { profile: null, likedIds: [] };
  const uid = profile.userId ?? body.account?.id;
  let likedIds: number[] = [];
  const tasks: Promise<unknown>[] = [];

  if (uid) {
    tasks.push(
      request<{ ids?: number[] }>("/likelist", { uid })
        .then((like) => {
          likedIds = like.ids ?? [];
        })
        .catch(() => {
          likedIds = [];
        }),
      // The listening level is not part of /user/account; without this the
      // sidebar showed "Lv.—".
      request<{ level?: number }>("/user/detail", { uid })
        .then((detail) => {
          if (typeof detail.level === "number") profile.level = detail.level;
        })
        .catch(() => {}),
    );
    await Promise.all(tasks);
  }
  return { profile, likedIds };
}

export async function fetchUserPlaylists(uid: number): Promise<Playlist[]> {
  const body = await request<{ playlist?: unknown[] }>("/user/playlist", {
    uid,
    limit: 100,
  });
  return toPlaylists(body.playlist ?? []);
}

export async function fetchLikedSongs(uid: number): Promise<Track[]> {
  const body = await request<{ ids?: number[] }>("/likelist", { uid });
  const ids = body.ids ?? [];
  if (!ids.length) return [];
  const out: Track[] = [];
  // `song/detail` accepts ~500 ids per call.
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const detail = await request<{ songs?: unknown[] }>("/song/detail", {
      ids: chunk.join(","),
    });
    out.push(...toTracks(detail.songs ?? []));
  }
  return out;
}

export async function setSongLiked(id: number, liked: boolean): Promise<void> {
  await request("/like", { id, like: liked });
}

export async function setPlaylistSubscribed(
  id: number,
  subscribed: boolean,
): Promise<void> {
  await request("/playlist/subscribe", { id, t: subscribed ? 1 : 2 });
}

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */

export interface QrSession {
  key: string;
  qrImage: string;
}

export async function createQrSession(): Promise<QrSession> {
  const keyBody = await request<{ data?: { unikey?: string } }>(
    "/login/qr/key",
    { timestamp: Date.now() },
    { anonymous: true },
  );
  const key = keyBody.data?.unikey;
  if (!key) throw new ApiError("/login/qr/key", 500, "无法获取二维码标识");
  const qrBody = await request<{ data?: { qrimg?: string } }>(
    "/login/qr/create",
    { key, qrimg: true, timestamp: Date.now() },
    { anonymous: true },
  );
  const qrImage = qrBody.data?.qrimg;
  if (!qrImage)
    throw new ApiError("/login/qr/create", 500, "无法生成登录二维码");
  return { key, qrImage };
}

export type QrState = 800 | 801 | 802 | 803 | 800;

export interface QrPollResult {
  code: number;
  message: string;
  cookie?: string;
  /** Set when the poll failed for transport reasons rather than a verdict. */
  transient?: boolean;
}

export async function checkQrSession(key: string): Promise<QrPollResult> {
  // Two deliberate choices here, both learned the hard way:
  //
  // 1. No `noCookie` parameter. That flag only controls whether the library
  //    hands the upstream `Set-Cookie` headers back to the caller; setting it
  //    meant the 803 response carried just NMTID, so `MUSIC_U` — the actual
  //    session — was dropped and the app could never fetch the account
  //    afterwards.
  // 2. XHR instead of fetch. WebKitGTK's fetch can hang forever on this
  //    endpoint: the request reaches the bridge, the bridge answers, and the
  //    promise still never settles — which also stalls the timers scheduled
  //    around it. XHR answers normally and has a real timeout.
  // 3. The handshake's 800/801/802/803 codes are answers, not failures. Declaring
  //    them accepted keeps the body — including the 803 session cookie — intact
  //    instead of being converted into a thrown error.
  try {
    const body = await request<{
      code?: number;
      message?: string;
      cookie?: string;
    }>("/login/qr/check", { key, timestamp: Date.now() }, {
      anonymous: true,
      retries: 0,
      acceptedCodes: [800, 801, 802, 803],
    });

    const code = body.code ?? 801;
    const messages: Record<number, string> = {
      800: "二维码已过期，请刷新",
      801: "等待扫码",
      802: "已扫码，请在手机上确认",
      803: "登录成功",
    };
    return { code, message: body.message ?? messages[code] ?? "" };
  } catch (error) {
    // A transport hiccup must NOT be reported as a failed login: the caller
    // would hide the QR code and the user would have to refresh repeatedly.
    // Report it as "keep waiting" and let the next poll decide.
    void error;
    return {
      code: -1,
      message: "网络波动，正在重试…",
      transient: true,
    };
  }
}

export async function sendCaptcha(
  phone: string,
  countrycode = "86",
): Promise<void> {
  // The library reads `ctcode` (and silently defaults to 86), so both names
  // are sent to keep non-mainland numbers working.
  await request(
    "/captcha/sent",
    { phone, ctcode: countrycode, countrycode, timestamp: Date.now() },
    { anonymous: true },
  );
}

export async function loginWithCaptcha(
  phone: string,
  captcha: string,
  countrycode = "86",
): Promise<void> {
  await request(
    "/login/cellphone",
    { phone, captcha, ctcode: countrycode, countrycode, timestamp: Date.now() },
    { anonymous: true },
  );
}

export async function loginWithPassword(
  phone: string,
  password: string,
  countrycode = "86",
): Promise<void> {
  await request(
    "/login/cellphone",
    { phone, password, ctcode: countrycode, countrycode, timestamp: Date.now() },
    { anonymous: true },
  );
}

export async function logout(): Promise<void> {
  try {
    await request("/logout", { timestamp: Date.now() });
  } catch {
    /* the local session is cleared regardless */
  }
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export interface SearchResult {
  tracks: Track[];
  playlists: Playlist[];
  artists: Artist[];
  albums: Album[];
  songCount: number;
}

export async function search(
  keywords: string,
  limit = 40,
): Promise<SearchResult> {
  const [songs, playlists, artists, albums] = await Promise.all([
    request<{ result?: { songs?: unknown[]; songCount?: number } }>("/search", {
      keywords,
      type: 1,
      limit,
    }),
    request<{ result?: { playlists?: unknown[] } }>("/search", {
      keywords,
      type: 1000,
      limit: 12,
    }).catch(() => ({ result: undefined })),
    request<{ result?: { artists?: Artist[] } }>("/search", {
      keywords,
      type: 100,
      limit: 12,
    }).catch(() => ({ result: undefined })),
    request<{ result?: { albums?: Album[] } }>("/search", {
      keywords,
      type: 10,
      limit: 12,
    }).catch(() => ({ result: undefined })),
  ]);

  return {
    tracks: toTracks(songs.result?.songs ?? []),
    songCount: songs.result?.songCount ?? 0,
    playlists: toPlaylists(playlists.result?.playlists ?? []),
    artists: artists.result?.artists ?? [],
    albums: albums.result?.albums ?? [],
  };
}

export async function fetchSearchSuggestions(
  keywords: string,
): Promise<string[]> {
  if (!keywords.trim()) return [];
  const body = await request<{
    result?: { songs?: unknown[]; albums?: unknown[]; artists?: unknown[] };
  }>("/search/suggest", { keywords, type: "mobile" }).catch(() => ({
    result: undefined,
  }));
  const bucket = body.result;
  if (!bucket) return [];
  const names = new Set<string>();
  for (const song of (bucket.songs ?? []) as { name?: string }[])
    if (song.name) names.add(song.name);
  for (const artist of (bucket.artists ?? []) as { name?: string }[])
    if (artist.name) names.add(artist.name);
  for (const album of (bucket.albums ?? []) as { name?: string }[])
    if (album.name) names.add(album.name);
  return [...names].slice(0, 8);
}

/** Ensures a raw song object can be played; used by the queue hydrator. */
export { toTrack };
