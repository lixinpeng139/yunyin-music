import type { Album, Artist, Playlist, RawSong, Track } from "../types/ncm";

/** NetEase image URLs accept a sizing suffix; request the exact size we need. */
export function img(url: string | undefined, size = 300): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  const clean = url.split("?")[0] ?? "";
  return `${clean}?param=${size}y${size}`;
}

const PLACEHOLDER_ALBUM: Album = { id: 0, name: "未知专辑" };

function pickArtists(raw: RawSong): Artist[] {
  if (Array.isArray(raw.ar) && raw.ar.length) return raw.ar;
  if (Array.isArray(raw.artists) && raw.artists.length) return raw.artists;
  return [];
}

function pickAlbum(raw: RawSong, parent?: RawSong): Album {
  const source = raw.al ?? raw.album ?? parent?.al ?? parent?.album;
  if (source && (source.name || source.picUrl)) return source;
  // `personalized/newsong` nests an album-less song under `song` but keeps a
  // `picUrl` on the wrapper.
  const cover = raw.picUrl ?? parent?.picUrl;
  if (cover) return { id: 0, name: "未知专辑", picUrl: cover };
  return PLACEHOLDER_ALBUM;
}

/** `mainTitle` + `additionalTitle` is how radar/intelligence rows are shaped. */
function pickName(raw: RawSong): string {
  const base = raw.name || raw.mainTitle || "未知曲目";
  return base;
}

function pickSubtitle(raw: RawSong): string | undefined {
  const extra = raw.additionalTitle?.trim();
  if (extra) return extra;
  const alias = raw.alias?.[0]?.trim();
  if (alias && alias !== raw.name) return alias;
  return undefined;
}

/**
 * Collapses the many shapes the API uses for "a song" into one `Track`.
 * Handles: search results, playlist tracks, `song/detail`, `personalized/newsong`
 * (nested `song`), `personal_fm`, `recommend/songs`, and `playmode/intelligence/list`.
 */
export function toTrack(raw: RawSong | null | undefined): Track | null {
  if (!raw || typeof raw !== "object") return null;

  // `personalized/newsong` items look like { id, name, picUrl, song: {...} }
  const inner =
    raw.song && typeof raw.song === "object" && raw.song.id ? raw.song : raw;

  const id = Number(inner.id ?? raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const artists = pickArtists(inner).length
    ? pickArtists(inner)
    : pickArtists(raw);
  const album = pickAlbum(inner, raw);

  const duration = Number(
    inner.dt ?? inner.duration ?? raw.dt ?? raw.duration ?? 0,
  );

  return {
    id,
    name: pickName(inner),
    subtitle: pickSubtitle(inner),
    artists,
    artistText: artists.length
      ? artists.map((a) => a.name).join(" / ")
      : "未知艺术家",
    album,
    duration: Number.isFinite(duration) ? duration : 0,
    fee: inner.fee ?? raw.fee,
    mvId: (inner.mv ?? raw.mv) || undefined,
  };
}

export function toTracks(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return [];
  const out: Track[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const track = toTrack(item as RawSong);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

/** `recommend/songs` wraps each track as `{ ...song, recommendedReason, alg }`. */
export function toRecommendedTracks(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return [];
  const out: Track[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const wrapper = item as RawSong & {
      recommendedReason?: string;
      reason?: string;
      alg?: string;
    };
    const track = toTrack(wrapper);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

export function toPlaylist(raw: unknown): Playlist | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Playlist & {
    coverImgUrl?: string;
    picUrl?: string;
    copywriter?: string;
  };
  const id = Number(p.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    ...p,
    id,
    name: p.name || "未命名歌单",
    coverImgUrl: p.coverImgUrl || p.picUrl,
    creatorName: p.creator?.nickname ?? p.creatorName,
  };
}

export function toPlaylists(raw: unknown): Playlist[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toPlaylist).filter((p): p is Playlist => Boolean(p));
}

/** 12345 -> "1.2万" (NetEase's own convention). */
export function formatCount(value: number | undefined): string {
  if (!value || value < 0) return "0";
  if (value < 10_000) return String(value);
  if (value < 100_000_000) {
    const wan = value / 10_000;
    return `${wan >= 100 ? Math.round(wan) : wan.toFixed(1).replace(/\.0$/, "")}万`;
  }
  const yi = value / 100_000_000;
  return `${yi.toFixed(1).replace(/\.0$/, "")}亿`;
}

/** Milliseconds -> "3:45" (or "1:02:03" for long mixes). */
export function formatDuration(ms: number | undefined): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** Unix millis -> "2024-05-01". */
export function formatDate(ms: number | undefined): string {
  if (!ms) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** NetEase `fee` codes -> a short badge, or null when freely playable. */
export function feeBadge(
  fee: number | undefined,
): { label: string; tone: "vip" | "paid" | "free" } | null {
  switch (fee) {
    case 1:
      return { label: "VIP", tone: "vip" };
    case 4:
      return { label: "付费", tone: "paid" };
    case 8:
      return { label: "低音质", tone: "free" };
    default:
      return null;
  }
}
