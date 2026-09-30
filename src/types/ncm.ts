/** Domain types for the NetEase Cloud Music API payloads YunYin consumes. */

export interface Artist {
  id: number;
  name: string;
  picUrl?: string;
  alias?: string[];
  albumSize?: number;
  musicSize?: number;
  briefDesc?: string;
}

export interface Album {
  id: number;
  name: string;
  picUrl?: string;
  artists?: Artist[];
  artist?: Artist;
  publishTime?: number;
  size?: number;
  company?: string;
  description?: string;
}

/** A track in its *raw* API shape. `song/url` results are merged in later. */
export interface RawSong {
  id: number;
  name: string;
  /** Some endpoints (radar / intelligence) use `mainTitle` instead of `name`. */
  mainTitle?: string;
  additionalTitle?: string | null;
  alias?: string[];
  ar?: Artist[];
  artists?: Artist[];
  al?: Album;
  album?: Album;
  dt?: number;
  duration?: number;
  fee?: number;
  mv?: number;
  no?: number;
  pop?: number;
  st?: number;
  /** Present on `personalized/newsong` results. */
  song?: RawSong;
  picUrl?: string;
}

/** Normalised track used across the whole UI. */
export interface Track {
  id: number;
  name: string;
  /** Secondary line, e.g. "Live 版 (电影《…》主题曲)". */
  subtitle?: string;
  artists: Artist[];
  artistText: string;
  album: Album;
  /** Milliseconds. */
  duration: number;
  /** Playback URL once resolved by `song/url/v1`. */
  url?: string;
  /** Bitrate actually served, in bits/s. */
  bitrate?: number;
  /** Loudness normalisation gain from the API, in dB. */
  gain?: number;
  /** Peak sample value from the API, used to normalise gain. */
  peak?: number;
  fee?: number;
  mvId?: number;
  /** Why a track cannot be played, when the API refused to serve a URL. */
  unplayableReason?: string;
}

export interface Playlist {
  id: number;
  name: string;
  coverImgUrl?: string;
  picUrl?: string;
  description?: string;
  trackCount?: number;
  playCount?: number;
  subscribedCount?: number;
  creator?: { userId: number; nickname: string; avatarUrl?: string };
  creatorName?: string;
  updateTime?: number;
  tags?: string[];
  /** Whether the signed-in account follows this playlist. */
  subscribed?: boolean;
  tracks?: Track[];
  /** Radar / recommendation endpoints attach a human readable reason. */
  recReason?: string;
  copywriter?: string;
  alg?: string;
}

export interface UserProfile {
  userId: number;
  nickname: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  signature?: string;
  vipType?: number;
  level?: number;
  follows?: number;
  followeds?: number;
  playlistCount?: number;
}

export interface LyricLine {
  /** Milliseconds from track start. */
  time: number;
  text: string;
  /** Translation / romanisation to render under the main line. */
  sub?: string;
}

export interface ParsedLyric {
  lines: LyricLine[];
  /** `true` when the payload only carried unsynced text. */
  plainOnly: boolean;
}

export type QualityLevel =
  | "standard"
  | "higher"
  | "exhigh"
  | "lossless"
  | "hires"
  | "jyeffect"
  | "sky"
  | "jymaster";

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  standard: "标准",
  higher: "较高",
  exhigh: "极高",
  lossless: "无损",
  hires: "Hi-Res",
  jyeffect: "高清环绕声",
  sky: "沉浸环绕声",
  jymaster: "超清母带",
};
