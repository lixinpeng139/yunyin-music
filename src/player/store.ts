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

/** Past this point a play counts as "listened" and is reported to NetEase. */
const SCROBBLE_AFTER_MS = 20_000;
/** Past this point `previous()` restarts the track instead of stepping back. */
const RESTART_INSTEAD_OF_BACK_MS = 4_000;
/** A run of unplayable tracks this long means the list itself is the problem. */
const MAX_AUTO_SKIPS = 8;
/** How long an unplayable track stays on screen before we step over it. */
const AUTO_SKIP_DELAY_MS = 600;

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

let noticeSeq = 0;
/**
 * Which load owns the engine. Every awaited step compares the value it started
 * with against this, so a slow response for a track the user already skipped
 * away from cannot take over the player.
 */
let epoch = 0;
/** Consecutive automatic skips, reset as soon as a track really plays. */
let autoSkips = 0;
/** `init()` is called from an effect; StrictMode runs those twice. */
let initialised = false;
/**
 * The tier each cached URL was really resolved at, keyed by track id. The bulk
 * `/song/url` path in the API layer answers 320k no matter what tier was asked
 * for, so a URL is only trusted for the current setting when it was fetched at
 * that setting (or fetched at a higher quality than the user asked for).
 */
const urlTier = new Map<number, QualityLevel>();
/** Lookups in flight, so the prefetcher and the loader share one request. */
const inFlight = new Map<string, Promise<Track>>();

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

/** Ordering of the tiers we care about when comparing a URL against a setting. */
const TIER_RANK: Record<QualityLevel, number> = {
  standard: 0,
  higher: 1,
  exhigh: 2,
  lossless: 3,
  hires: 4,
  jyeffect: 4,
  sky: 4,
  jymaster: 5,
};

export const usePlayer = create<PlayerState>((set, get) => {
  /**
   * Runs an async step and turns a failure into a message.
   *
   * Every public action here is called as `void usePlayer.getState().next()` or
   * awaited by a page that flips a busy flag, and the API layer *does* throw on
   * a bad response. Letting that escape means an unhandled rejection and — on
   * the heart page — a button that stays disabled forever. So nothing public
   * rejects; failures end up in `notice`, which is what the user sees anyway.
   */
  async function guard(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      console.error(`[player] ${label}`, error);
      set({ resolving: false, playing: false });
      get().notify(`${label}失败，请稍后重试`, "error");
    }
  }

  /**
   * True when a cached URL can be used for `quality` as-is. A URL fetched at a
   * higher tier is fine too — the user asked for at least that much.
   */
  function urlFitsQuality(track: Track, quality: QualityLevel): boolean {
    if (!track.url) return false;
    const fetched = urlTier.get(track.id);
    if (!fetched) return false;
    if (fetched === quality) return true;
    return TIER_RANK[fetched] >= TIER_RANK[quality];
  }

  /**
   * Fills in `url`/`gain`/`bitrate` for tracks that need it and remembers which
   * tier each URL came back at.
   */
  async function hydrate(
    tracks: Track[],
    quality: QualityLevel,
  ): Promise<Track[]> {
    const missing = tracks.filter((track) => !track.url);
    if (!missing.length) return tracks;

    // The API layer only honours the exact tier on the single-id endpoint; a
    // bulk call always answers 320k. Record what we really got.
    const granted: QualityLevel = missing.length === 1 ? quality : "higher";

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
      urlTier.set(track.id, granted);
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

  /** Resolves one track, sharing an in-flight lookup for the same id + tier. */
  function resolveOne(track: Track, quality: QualityLevel): Promise<Track> {
    const key = `${track.id}@${quality}`;
    const running = inFlight.get(key);
    if (running) return running;
    const task = hydrate([{ ...track, url: undefined }], quality)
      .then((done) => done[0] ?? track)
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, task);
    return task;
  }

  /** Merges freshly resolved fields back into the queue, keeping row identity. */
  function mergeIntoQueue(fresh: Track[]) {
    if (!fresh.length) return;
    const byId = new Map(fresh.map((track) => [track.id, track]));
    set((state) => ({
      queue: state.queue.map((track) => {
        const updated = byId.get(track.id);
        return updated ? { ...track, ...updated } : track;
      }),
    }));
  }

  /**
   * Warms the next track at the exact tier the user selected (one request) and
   * the three after it in bulk (one request, 320k), so a single skip never
   * waits on the network and a real request is only made when that bulk URL
   * turns out to be below the selected tier.
   */
  function prefetch(from: number) {
    const { queue, quality } = get();
    const next = queue[from];
    if (next && !urlFitsQuality(next, quality)) {
      // Best effort: a failed prefetch only means the real load has to wait for
      // the network, so it must never surface as an error of its own.
      void resolveOne(next, quality)
        .then((done) => {
          if (done.url) mergeIntoQueue([done]);
        })
        .catch(() => {});
    }
    const later = queue.slice(from + 1, from + 4).filter((track) => !track.url);
    if (later.length) {
      void hydrate(later, quality)
        .then((done) => {
          mergeIntoQueue(done.filter((track) => track.url));
        })
        .catch(() => {});
    }
  }

  function clearUrlCache() {
    urlTier.clear();
    inFlight.clear();
  }

  /**
   * Steps over a track the API refuses to serve, but only for a while: a queue
   * where nothing is playable should stop and say so rather than spin.
   */
  function scheduleAutoSkip(token: number) {
    autoSkips += 1;
    if (autoSkips > Math.min(get().queue.length, MAX_AUTO_SKIPS)) {
      autoSkips = 0;
      set({ playing: false });
      get().notify("这个列表里的歌曲都无法播放", "error");
      return;
    }
    if (get().queue.length <= 1) return;
    window.setTimeout(() => {
      if (token !== epoch) return;
      void get().next({ userInitiated: false });
    }, AUTO_SKIP_DELAY_MS);
  }

  async function loadIndex(
    index: number,
    opts: { autoplay: boolean; positionMs?: number },
  ) {
    const state = get();
    const track = state.queue[index];
    if (!track) return;
    const token = ++epoch;

    set({
      index,
      position: opts.positionMs ?? 0,
      duration: track.duration || 0,
      resolving: true,
    });

    // A cached URL from a lower tier than the one selected is worth one more
    // request: that is what used to make "next" silently play at 320k.
    let ready = track;
    if (!urlFitsQuality(track, state.quality)) {
      const fresh = await resolveOne(track, state.quality);
      if (token !== epoch) return;
      // Never trade a working URL for a failed lookup.
      if (fresh.url) {
        ready = { ...track, ...fresh };
        mergeIntoQueue([ready]);
      }
    }
    if (token !== epoch) return;

    if (!ready.url) {
      set({ resolving: false, playing: false });
      get().notify(ready.unplayableReason ?? "这首歌曲暂时无法播放", "error");
      scheduleAutoSkip(token);
      return;
    }

    audioEngine.setEvents({
      onLoad: (durationMs) => {
        if (token !== epoch) return;
        autoSkips = 0;
        set({
          duration: durationMs || ready.duration || 0,
          resolving: false,
        });
      },
      onPlay: () => {
        if (token !== epoch) return;
        set({ playing: true, resolving: false });
      },
      onPause: () => {
        if (token !== epoch) return;
        set({ playing: false });
      },
      onEnd: () => {
        if (token !== epoch) return;
        void handleEnded();
      },
      onProgress: (positionMs, durationMs) => {
        if (token !== epoch) return;
        // Only touch what actually moved: this fires four times a second and
        // every write re-renders whatever subscribes to it.
        const patch: Partial<PlayerState> = {};
        if (positionMs !== get().position) patch.position = positionMs;
        if (durationMs > 0 && durationMs !== get().duration)
          patch.duration = durationMs;
        if (get().resolving) patch.resolving = false;
        if (Object.keys(patch).length) set(patch);
      },
      onBuffering: (buffering) => {
        if (token !== epoch) return;
        if (buffering && !get().playing) return;
        set({ resolving: buffering });
      },
      onBlocked: () => {
        if (token !== epoch) return;
        // Not a broken track — WebKit just wants a click first.
        set({ playing: false, resolving: false });
        get().notify("浏览器阻止了自动播放，请点一下播放按钮", "info");
      },
      onError: (message) => {
        if (token !== epoch) return;
        set({ playing: false, resolving: false });
        get().notify(message, "error");
        // A dead URL is worse than no URL: drop it so a retry re-resolves.
        urlTier.delete(track.id);
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
    audioEngine.setMuted(state.muted);
    audioEngine.load(ready, {
      autoplay: opts.autoplay,
      positionMs: opts.positionMs,
      gain: ready.gain,
    });
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
      autoSkips = 0;
      set({ queue: clean, mode, source: source ?? null, heartSeed: null });
      writePref(MODE_KEY, mode);
      await guard("载入歌曲", () =>
        loadIndex(index, { autoplay: options.autoplay ?? true }),
      );
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
        autoSkips = 0;
        await guard("载入歌曲", () => loadIndex(existing, { autoplay: true }));
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
      const state = get();
      if (index < 0 || index >= state.queue.length) return;
      const queue = state.queue.filter((_, i) => i !== index);

      if (!queue.length) {
        epoch += 1;
        audioEngine.dispose();
        set({
          queue,
          index: -1,
          playing: false,
          position: 0,
          duration: 0,
          resolving: false,
        });
        return;
      }

      if (index < state.index) {
        set({ queue, index: state.index - 1 });
        return;
      }
      if (index > state.index) {
        set({ queue });
        return;
      }

      // The row that was sounding is gone. Move the audio with the list, or the
      // UI shows one track while a removed one keeps playing.
      const nextIdx = Math.min(state.index, queue.length - 1);
      set({ queue, index: nextIdx });
      void guard("载入歌曲", () =>
        loadIndex(nextIdx, { autoplay: state.playing }),
      );
    },

    clearQueue() {
      epoch += 1;
      autoSkips = 0;
      audioEngine.dispose();
      set({
        queue: [],
        index: -1,
        playing: false,
        position: 0,
        duration: 0,
        source: null,
        resolving: false,
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
      // Pausing is always truthful: the element is asked to pause immediately.
      set({ playing: false });
    },

    resume() {
      const { queue, index } = get();
      if (index < 0 || !queue[index]) return;
      audioEngine.setVolume(get().volume);
      audioEngine.setMuted(get().muted);
      audioEngine.play();
      // `playing` is set from the element's own `play` event. Claiming it here
      // is what used to leave the UI showing playback that was not happening.
    },

    async next(options = {}) {
      const state = get();
      const track = state.current();
      // A skip counts as a play once a meaningful portion has been heard.
      if (track && options.userInitiated && state.position > SCROBBLE_AFTER_MS) {
        void scrobble(track, state.position);
      }
      if (options.userInitiated) autoSkips = 0;
      await guard("切歌", async () => {
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
        await loadIndex(target, { autoplay: true });
      });
    },

    async previous() {
      const state = get();
      // Match every other player: restart the track unless near its start.
      if (state.position > RESTART_INSTEAD_OF_BACK_MS) {
        audioEngine.seek(0);
        set({ position: 0 });
        return;
      }
      if (state.queue.length <= 1) {
        audioEngine.seek(0);
        set({ position: 0 });
        return;
      }
      autoSkips = 0;
      const target =
        state.index - 1 < 0 ? state.queue.length - 1 : state.index - 1;
      await guard("载入歌曲", () => loadIndex(target, { autoplay: true }));
    },

    seek(positionMs) {
      const duration = get().duration;
      const target = Math.max(0, positionMs);
      const clamped = duration > 0 ? Math.min(target, duration) : target;
      audioEngine.seek(clamped);
      set({ position: clamped });
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
        clearUrlCache();
        set({ quality });
        return;
      }
      // Every cached URL belongs to the old tier.
      const position = audioEngine.position || get().position;
      clearUrlCache();
      set((state) => ({
        quality,
        queue: state.queue.map((track) => ({ ...track, url: undefined })),
      }));
      // Reload at the same spot and in the same state. Passing the position is
      // what stops a quality switch from restarting the track — and reloading
      // even while paused is what stops it from going permanently silent.
      void guard("切换音质", () =>
        loadIndex(index, { autoplay: playing, positionMs: position }),
      );
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
      const { queue, index } = get();
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
      await guard("开启心动模式", async () => {
        const batch = await fetchIntelligenceList(anchor.songId, playlistId, 20);
        const hydrated = await hydrate(batch, state.quality);
        if (!hydrated.length) {
          get().notify("没有取到心动推荐，请稍后再试", "error");
          return;
        }
        await get().playQueue(hydrated, 0, state.source, { mode: "heart" });
        set({ heartSeed: { songId: anchor.songId, playlistId } });
      });
    },

    async startRoamMode() {
      if (!sessionPresentCached()) {
        get().notify("漫游模式需要登录后使用", "info");
        return;
      }
      const state = get();
      set({ mode: "roam" });
      writePref(MODE_KEY, "roam");
      await guard("开启漫游模式", async () => {
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
      });
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
      if (initialised) return;
      initialised = true;
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
      // A refused play() is retried from the next real gesture. The listener
      // stays installed rather than firing once: WebKit can refuse a play at
      // any point — an auto-advance after a track ends is as programmatic as
      // the first load — and `unlock()` does nothing unless something was
      // actually refused.
      const retry = () => AudioEngine.unlock();
      window.addEventListener("pointerdown", retry);
      window.addEventListener("keydown", retry);
    },
  };
});
