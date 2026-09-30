import { create } from "zustand";
import { AudioEngine, audioEngine } from "./engine";
import {
  fetchIntelligenceList,
  fetchPersonalFm,
  fetchSongUrls,
  scrobble,
} from "../api/ncm";
import { sessionPresentCached } from "../api/session";
import { useAuth } from "../store/auth";
import type { QualityLevel, Track } from "../types/ncm";

/** How the queue advances. */
export type PlayMode = "list" | "single" | "shuffle" | "heart" | "roam";

export const MODE_LABELS: Record<PlayMode, string> = {
  list: "列表循环",
  single: "单曲循环",
  shuffle: "随机播放",
  heart: "心动模式",
  roam: "漫游模式",
};

export interface PlayerNotice {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

/** A queue origin, used to power "播放全部" and heart mode seeding. */
export interface QueueSource {
  kind:
    | "playlist"
    | "album"
    | "artist"
    | "search"
    | "fm"
    | "daily"
    | "radar"
    | "liked";
  id?: number;
  name?: string;
}

interface PlayerState {
  queue: Track[];
  index: number;
  playing: boolean;
  /** Position in milliseconds, ticked while playing. */
  position: number;
  /** Duration in milliseconds as reported by the media element. */
  duration: number;
  volume: number;
  muted: boolean;
  mode: PlayMode;
  quality: QualityLevel;
  source: QueueSource | null;
  /** Track ids the account has liked; drives the heart toggle. */
  liked: Set<number>;
  resolving: boolean;
  notice: PlayerNotice | null;
  /** Seed used by heart mode: the track + playlist it derives neighbours from. */
  heartSeed: { songId: number; playlistId: number } | null;

  current: () => Track | null;
  playQueue: (
    tracks: Track[],
    startIndex: number,
    source?: QueueSource | null,
    options?: { mode?: PlayMode; autoplay?: boolean },
  ) => Promise<void>;
  playTrack: (track: Track, source?: QueueSource | null) => Promise<void>;
  appendToQueue: (tracks: Track[], options?: { next?: boolean }) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  next: (options?: { userInitiated?: boolean }) => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setQuality: (quality: QualityLevel) => void;
  setMode: (mode: PlayMode) => Promise<void>;
  startHeartMode: (seed?: {
    songId: number;
    playlistId: number;
  }) => Promise<void>;
  startRoamMode: () => Promise<void>;
  toggleLike: (trackId: number) => void;
  setLiked: (ids: number[]) => void;
  notify: (text: string, tone?: PlayerNotice["tone"]) => void;
  dismissNotice: () => void;
  /** Restores prefs and wires engine callbacks. Called once at boot. */
  init: () => void;
}

const QUALITY_KEY = "yunyin.quality";
const VOLUME_KEY = "yunyin.volume";
const MODE_KEY = "yunyin.mode";

function readPref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

let ticker: number | null = null;
let noticeSeq = 0;
/** Guards against two tracks racing to resolve/play at once. */
let playToken = 0;

const ALL_MODES: PlayMode[] = ["list", "single", "shuffle", "heart", "roam"];
const ALL_QUALITIES: QualityLevel[] = [
  "standard",
  "higher",
  "exhigh",
  "lossless",
  "hires",
  "jyeffect",
  "sky",
  "jymaster",
];

export const usePlayer = create<PlayerState>((set, get) => {
  function stopTicker() {
    if (ticker !== null) {
      window.clearInterval(ticker);
      ticker = null;
    }
  }

  function startTicker() {
    stopTicker();
    ticker = window.setInterval(() => {
      const { playing } = get();
      if (!playing) return;
      set({
        position: audioEngine.position,
        duration: audioEngine.duration || get().duration,
      });
    }, 250);
  }

  /**
   * Makes sure the given tracks have a playable `url`, asking the API for the
   * ones that are still missing. Returns the hydrated tracks.
   */
  async function hydrate(
    tracks: Track[],
    quality: QualityLevel,
  ): Promise<Track[]> {
    const missing = tracks.filter((track) => !track.url);
    if (!missing.length) return tracks;

    const urls = await fetchSongUrls(
      missing.map((track) => track.id),
      quality,
    );
    return tracks.map((track) => {
      const info = urls.get(track.id);
      if (!info) return track;
      if (!info.url) {
        return {
          ...track,
          url: undefined,
          unplayableReason:
            info.fee === 1
              ? "VIP 专属，当前账号无权播放"
              : "版权限制，暂无可用音源",
        };
      }
      return {
        ...track,
        url: info.url,
        bitrate: info.br,
        gain: info.gain,
        peak: info.peak,
        fee: info.fee ?? track.fee,
        unplayableReason: undefined,
      };
    });
  }

  /** Resolves upcoming tracks in the background so `next()` never stalls. */
  function prefetch(from: number) {
    const { queue, quality } = get();
    const upcoming = queue.slice(from, from + 4).filter((track) => !track.url);
    if (!upcoming.length) return;
    void hydrate(upcoming, quality).then((hydrated) => {
      if (!hydrated.length) return;
      const byId = new Map(hydrated.map((track) => [track.id, track]));
      set((state) => ({
        queue: state.queue.map((track) => {
          const fresh = byId.get(track.id);
          // Only merge URL data; identity of the queue entry is preserved.
          return fresh && fresh.url ? { ...track, ...fresh } : track;
        }),
      }));
    });
  }

  async function loadIndex(index: number, autoplay: boolean) {
    const state = get();
    const track = state.queue[index];
    if (!track) return;
    const token = ++playToken;

    set({ index, position: 0, duration: track.duration, resolving: true });
    let ready = track;
    if (!ready.url) {
      const [hydrated] = await hydrate([track], state.quality);
      if (token !== playToken) return;
      ready = hydrated ?? track;
      set((current) => ({
        queue: current.queue.map((item, i) =>
          i === index ? { ...item, ...ready } : item,
        ),
      }));
    }
    if (token !== playToken) return;

    if (!ready.url) {
      set({ resolving: false, playing: false });
      get().notify(ready.unplayableReason ?? "这首歌曲暂时无法播放", "error");
      // Skip past unplayable tracks instead of stalling the queue.
      if (get().queue.length > 1) {
        window.setTimeout(() => {
          if (token === playToken) void get().next({ userInitiated: false });
        }, 600);
      }
      return;
    }

    audioEngine.setEvents({
      onLoad: (durationMs) => {
        if (token !== playToken) return;
        set({ duration: durationMs || ready.duration, resolving: false });
      },
      onPlay: () => {
        if (token !== playToken) return;
        set({ playing: true, resolving: false });
        startTicker();
      },
      onPause: () => {
        if (token !== playToken) return;
        set({ playing: false });
        stopTicker();
      },
      onEnd: () => {
        if (token !== playToken) return;
        void handleEnded();
      },
      onError: (message) => {
        if (token !== playToken) return;
        set({ playing: false, resolving: false });
        get().notify(message, "error");
        // A dead URL is worse than no URL: drop it so a retry re-resolves.
        set((current) => ({
          queue: current.queue.map((item, i) =>
            i === index
              ? { ...item, url: undefined, unplayableReason: message }
              : item,
          ),
        }));
      },
    });

    audioEngine.setVolume(state.volume);
    audioEngine.load(ready, { autoplay, gain: ready.gain });
    if (!autoplay) set({ playing: false, resolving: false });
    prefetch(index + 1);
  }

  async function handleEnded() {
    const { mode } = get();
    if (mode === "single") {
      set({ position: 0 });
      audioEngine.seek(0);
      audioEngine.play();
      return;
    }
    // Report the finished play, then advance.
    const track = get().current();
    if (track) void scrobble(track, get().duration);
    await get().next({ userInitiated: false });
  }

  /** Picks the next index according to the active mode. */
  function nextIndex(current: number): number | null {
    const { queue, mode } = get();
    if (!queue.length) return null;
    if (mode === "shuffle") {
      if (queue.length === 1) return 0;
      let candidate = current;
      // Avoid repeating the same track back to back.
      while (candidate === current)
        candidate = Math.floor(Math.random() * queue.length);
      return candidate;
    }
    const next = current + 1;
    if (next < queue.length) return next;
    if (mode === "roam" || mode === "heart") return null; // more tracks will be appended
    return 0;
  }

  async function extendSpecialModes(): Promise<boolean> {
    const { mode, quality, heartSeed, queue } = get();
    if (mode === "roam") {
      if (!sessionPresentCached()) return false;
      const [fresh] = await fetchPersonalFm();
      if (!fresh) return false;
      const hydrated = await hydrate([fresh], quality);
      const track = hydrated[0];
      if (!track) return false;
      set((state) => ({ queue: [...state.queue, track] }));
      return true;
    }
    if (mode === "heart") {
      if (!sessionPresentCached() || !heartSeed) return false;
      const last = queue[queue.length - 1];
      const batch = await fetchIntelligenceList(
        heartSeed.songId,
        heartSeed.playlistId,
        10,
        last?.id ?? heartSeed.songId,
      );
      const fresh = batch.filter(
        (track) => !queue.some((item) => item.id === track.id),
      );
      if (!fresh.length) return false;
      const hydrated = await hydrate(fresh, quality);
      set((state) => ({ queue: [...state.queue, ...hydrated] }));
      return true;
    }
    return false;
  }

  return {
    queue: [],
    index: -1,
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
    mode: "list",
    quality: "exhigh",
    source: null,
    liked: new Set<number>(),
    resolving: false,
    notice: null,
    heartSeed: null,

    current: () => {
      const { queue, index } = get();
      return index >= 0 && index < queue.length ? queue[index]! : null;
    },

    async playQueue(tracks, startIndex, source = null, options = {}) {
      const clean = tracks.filter(Boolean);
      if (!clean.length) {
        get().notify("这个列表里没有可播放的歌曲", "error");
        return;
      }
      const index = Math.min(Math.max(0, startIndex), clean.length - 1);
      const mode = options.mode ?? get().mode;
      set({ queue: clean, mode, source: source ?? null, heartSeed: null });
      writePref(MODE_KEY, mode);
      await loadIndex(index, options.autoplay ?? true);
    },

    async playTrack(track, source = null) {
      const state = get();
      // Reuse the existing queue when the track is already in it.
      const existing = state.queue.findIndex((item) => item.id === track.id);
      if (existing >= 0) {
        if (existing === state.index) {
          if (!state.playing) get().resume();
          return;
        }
        await loadIndex(existing, true);
        return;
      }
      await get().playQueue(
        [...state.queue, track],
        state.queue.length,
        source ?? state.source,
      );
    },

    appendToQueue(tracks, options = {}) {
      if (!tracks.length) return;
      set((state) => {
        if (!state.queue.length) return { queue: tracks };
        if (options.next) {
          const copy = [...state.queue];
          copy.splice(state.index + 1, 0, ...tracks);
          return { queue: copy };
        }
        // Appending the same track twice is almost always a mistake.
        const additions = tracks.filter(
          (track) => !state.queue.some((item) => item.id === track.id),
        );
        return { queue: [...state.queue, ...additions] };
      });
      prefetch(get().index + 1);
    },

    removeFromQueue(index) {
      set((state) => {
        if (index < 0 || index >= state.queue.length) return state;
        const queue = state.queue.filter((_, i) => i !== index);
        let nextIdx = state.index;
        if (index < state.index) nextIdx = state.index - 1;
        else if (index === state.index)
          nextIdx = Math.min(state.index, queue.length - 1);
        return { queue, index: nextIdx };
      });
    },

    clearQueue() {
      playToken += 1;
      audioEngine.dispose();
      stopTicker();
      set({
        queue: [],
        index: -1,
        playing: false,
        position: 0,
        duration: 0,
        source: null,
      });
    },

    toggle() {
      const { playing, queue, index } = get();
      if (index < 0 || !queue.length) return;
      if (playing) get().pause();
      else get().resume();
    },

    pause() {
      audioEngine.pause();
      set({ playing: false });
      stopTicker();
    },

    resume() {
      audioEngine.setVolume(get().volume);
      audioEngine.play();
      set({ playing: true });
      startTicker();
    },

    async next(options = {}) {
      const state = get();
      const track = state.current();
      // A skip counts as a play once a meaningful portion has been heard.
      if (track && options.userInitiated && state.position > 20_000) {
        void scrobble(track, state.position);
      }
      let target = nextIndex(state.index);
      if (target === null) {
        const extended = await extendSpecialModes();
        if (!extended) {
          set({ playing: false });
          if (options.userInitiated) get().notify("已经没有更多推荐了", "info");
          return;
        }
        target = get().queue.length - 1;
      }
      await loadIndex(target, true);
    },

    async previous() {
      const state = get();
      // Match every other player: restart the track unless near its start.
      if (state.position > 4000) {
        audioEngine.seek(0);
        set({ position: 0 });
        return;
      }
      if (state.queue.length <= 1) {
        audioEngine.seek(0);
        set({ position: 0 });
        return;
      }
      const target =
        state.index - 1 < 0 ? state.queue.length - 1 : state.index - 1;
      await loadIndex(target, true);
    },

    seek(positionMs) {
      audioEngine.seek(positionMs);
      set({ position: Math.max(0, positionMs) });
    },

    setVolume(volume) {
      const clamped = Math.min(1, Math.max(0, volume));
      audioEngine.setVolume(clamped);
      audioEngine.setMuted(false);
      writePref(VOLUME_KEY, String(clamped));
      set({ volume: clamped, muted: false });
    },

    toggleMute() {
      const muted = !get().muted;
      audioEngine.setMuted(muted);
      set({ muted });
    },

    setQuality(quality) {
      writePref(QUALITY_KEY, quality);
      const { index, playing } = get();
      if (index < 0) {
        set({ quality });
        return;
      }
      // Force a re-resolve at the new tier: every cached URL is dropped, the
      // current track reloads immediately and the rest refill via prefetch.
      set((state) => ({
        quality,
        queue: state.queue.map((track) => ({ ...track, url: undefined })),
      }));
      void loadIndex(index, playing);
    },

    async setMode(mode) {
      writePref(MODE_KEY, mode);
      if (mode === "heart") {
        await get().startHeartMode();
        return;
      }
      if (mode === "roam") {
        await get().startRoamMode();
        return;
      }
      set({ mode, heartSeed: null });
      const { queue, index, playing } = get();
      if (mode === "shuffle" && queue.length > 1) {
        // Shuffle the remainder so the current track keeps playing.
        const head = queue.slice(0, index + 1);
        const tail = queue.slice(index + 1);
        for (let i = tail.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [tail[i], tail[j]] = [tail[j]!, tail[i]!];
        }
        set({ queue: [...head, ...tail] });
      }
      if (playing) startTicker();
    },

    async startHeartMode(seed) {
      if (!sessionPresentCached()) {
        get().notify("心动模式需要登录后使用", "info");
        return;
      }
      const state = get();
      const current = seed ?? state.heartSeed ?? null;
      const anchor =
        current ??
        (state.current()
          ? { songId: state.current()!.id, playlistId: 0 }
          : null);
      // 心动模式 only works with a playlist the account owns. Prefer an explicit
      // seed, then the playlist currently playing, and finally fall back to
      // "我喜欢的音乐" — passing the user id instead makes the API answer 400.
      const playlistId =
        anchor?.playlistId ||
        (state.source?.kind === "playlist" ? (state.source.id ?? 0) : 0) ||
        useAuth.getState().likedPlaylistId ||
        0;
      if (!anchor || !playlistId) {
        get().notify(
          useAuth.getState().likedPlaylistId === null
            ? "正在读取你的歌单，请稍后再试一次"
            : "请先在歌单中播放一首歌，再开启心动模式",
          "info",
        );
        return;
      }
      set({ mode: "heart", heartSeed: { songId: anchor.songId, playlistId } });
      writePref(MODE_KEY, "heart");
      const batch = await fetchIntelligenceList(anchor.songId, playlistId, 20);
      const hydrated = await hydrate(batch, state.quality);
      if (!hydrated.length) {
        get().notify("没有取到心动推荐，请稍后再试", "error");
        return;
      }
      await get().playQueue(hydrated, 0, state.source, { mode: "heart" });
      set({ heartSeed: { songId: anchor.songId, playlistId } });
    },

    async startRoamMode() {
      if (!sessionPresentCached()) {
        get().notify("漫游模式需要登录后使用", "info");
        return;
      }
      const state = get();
      set({ mode: "roam" });
      writePref(MODE_KEY, "roam");
      const batch = await fetchPersonalFm();
      if (!batch.length) {
        get().notify("私人 FM 暂时没有内容", "error");
        return;
      }
      const hydrated = await hydrate(batch, state.quality);
      const playable = hydrated.filter((track) => track.url);
      if (!playable.length) {
        get().notify("私人 FM 返回的歌曲暂时无法播放", "error");
        return;
      }
      await get().playQueue(
        playable,
        0,
        { kind: "fm", name: "私人漫游" },
        { mode: "roam" },
      );
    },

    toggleLike(trackId) {
      set((state) => {
        const liked = new Set(state.liked);
        const nowLiked = !liked.has(trackId);
        if (nowLiked) liked.add(trackId);
        else liked.delete(trackId);
        return { liked };
      });
    },

    setLiked(ids) {
      set({ liked: new Set(ids) });
    },

    notify(text, tone = "info") {
      noticeSeq += 1;
      set({ notice: { id: noticeSeq, text, tone } });
    },

    dismissNotice() {
      set({ notice: null });
    },

    init() {
      const quality = readPref<QualityLevel>(
        QUALITY_KEY,
        ALL_QUALITIES,
        "exhigh",
      );
      const mode = readPref<PlayMode>(MODE_KEY, ALL_MODES, "list");
      const volumeRaw = Number(localStorage.getItem(VOLUME_KEY) ?? "0.8");
      const volume = Number.isFinite(volumeRaw)
        ? Math.min(1, Math.max(0, volumeRaw))
        : 0.8;
      // `heart` and `roam` need a live session before they can do anything, so
      // a restored session that no longer works falls back to list looping.
      set({
        quality,
        mode: mode === "heart" || mode === "roam" ? "list" : mode,
        volume,
      });
      audioEngine.setVolume(volume);
      // WebKit leaves the audio context suspended until a real user gesture.
      const unlock = () => AudioEngine.unlock();
      window.addEventListener("pointerdown", unlock, { once: true });
    },
  };
});
