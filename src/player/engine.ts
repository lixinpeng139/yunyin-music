import type { Track } from "../types/ncm";

/**
 * Playback engine: one track at a time on a single, persistent `<audio>` element.
 *
 * This replaces the previous Howler wrapper. That wrapper already ran on an
 * `<audio>` element (`html5: true`, and Howler sets `_webAudio = false` in that
 * case), so dropping Howler changes no codec coverage — whatever GStreamer can
 * decode still plays. What it removes is a layer of state we could not trust:
 *
 *   * `howl.playing(id)` reports `true` while paused, so pause/resume had to be
 *     mirrored by hand and the two copies could drift apart;
 *   * `pause()` on the Howl touched every pooled sound, so a later resume could
 *     land on a different one and restart the track from 0;
 *   * `load()` was skipped when `autoplay: false`, which left the engine "not
 *     paused" but with no source at all — `play()` then returned on its first
 *     line while the UI happily showed a playing, silent track.
 *
 * A media element has none of those failure modes: it owns its own position, it
 * survives any number of `pause()`/`play()` cycles, and one element means
 * exactly one stream in the system mixer.
 *
 * The element is created once and reused for every track — only `src` changes —
 * so nothing accumulates across a long session. Listeners are attached per load
 * and carry the load generation in their closure: `detach()` runs before the new
 * `src` is assigned, so an event from an aborted source cannot be mistaken for
 * one belonging to the track we just started.
 */

export interface AudioEvents {
  /** Metadata is in; `durationMs` is 0 when the source reports no duration. */
  onLoad?: (durationMs: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onPlay?: () => void;
  onPause?: () => void;
  /** Fires ~4×/second while playing, plus after every seek. */
  onProgress?: (positionMs: number, durationMs: number) => void;
  /** The element ran out of data (or got it back). */
  onBuffering?: (buffering: boolean) => void;
  /**
   * The browser refused a programmatic `play()`. This is *not* a broken track:
   * the caller should ask for a click instead of discarding the URL.
   */
  onBlocked?: () => void;
}

export type EngineState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";

/** `MediaError` codes, spelled out so we never depend on the global existing. */
const ERR_ABORTED = 1;
const ERR_NETWORK = 2;
const ERR_DECODE = 3;
const ERR_SRC_NOT_SUPPORTED = 4;

/** How close to the end a `play()` may start and still count as "restart". */
const RESTART_THRESHOLD_MS = 250;

export class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private listeners: Array<[string, EventListener]> = [];
  private events: AudioEvents = {};
  private state: EngineState = "idle";
  private currentId: number | null = null;
  /** Bumped on every `load()`; handlers from an older load bail out. */
  private generation = 0;
  /** Position to apply once metadata arrives (a write before that is ignored). */
  private pendingSeekMs: number | null = null;
  private volumeLevel = 0.8;
  private muted = false;
  /** Equal-loudness normalisation reported by the API for the current track. */
  private gainDb = 0;
  /** Set when the browser refused a play() that a real click could allow. */
  private blocked = false;

  setEvents(events: AudioEvents) {
    this.events = events;
  }

  get trackId() {
    return this.currentId;
  }

  get engineState(): EngineState {
    return this.state;
  }

  get playing(): boolean {
    const el = this.el;
    return !!el && !el.paused && !el.ended && this.currentId !== null;
  }

  /** True once the current source has enough data to start. */
  get ready(): boolean {
    const el = this.el;
    return !!el && this.currentId !== null && el.readyState >= 2;
  }

  /** Position in milliseconds. */
  get position(): number {
    const el = this.el;
    if (!el || this.currentId === null) return 0;
    const seconds = el.currentTime;
    return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 1000)) : 0;
  }

  /** Duration in milliseconds, 0 until metadata arrives. */
  get duration(): number {
    const el = this.el;
    if (!el || this.currentId === null) return 0;
    const seconds = el.duration;
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
  }

  /**
   * Points the engine at a track. Always loads, even when `autoplay` is false —
   * that is what lets a later `play()` succeed without a reload, and it is the
   * bug that used to leave a paused quality switch permanently silent.
   */
  load(
    track: Track,
    opts: { autoplay: boolean; positionMs?: number; gain?: number },
  ) {
    const el = this.ensureElement();
    this.detach();
    this.generation += 1;
    const gen = this.generation;

    this.state = "idle";
    this.currentId = null;
    this.pendingSeekMs = null;
    this.blocked = false;

    if (!track.url) {
      this.state = "error";
      this.events.onError?.("这首歌曲没有可用的播放地址");
      return;
    }

    this.currentId = track.id;
    this.gainDb = opts.gain ?? 0;
    // Resuming a few hundred ms in is indistinguishable from a restart, and
    // seeking that early only makes the start stutter.
    this.pendingSeekMs =
      opts.positionMs && opts.positionMs > 500 ? Math.round(opts.positionMs) : null;
    this.state = "loading";

    this.attach(el, gen);
    el.src = track.url;
    this.applyVolume();
    el.load();
    if (opts.autoplay) this.play();
  }

  /**
   * Starts or resumes. Idempotent: calling it on a track that is already
   * sounding does nothing, and a paused track resumes from where it stopped
   * because the element kept the position itself.
   */
  play() {
    const el = this.el;
    if (!el || this.currentId === null || !el.getAttribute("src")) return;
    if (!el.paused && !el.ended) return;

    const durationSec = this.durationSeconds();
    if (el.ended || (durationSec > 0 && el.currentTime >= durationSec - RESTART_THRESHOLD_MS / 1000)) {
      this.seekTo(0);
    }

    const gen = this.generation;
    const started = el.play();
    // The `play` event drives `onPlay`; the promise only reports refusals.
    if (started && typeof started.then === "function") {
      started.catch((error: unknown) => {
        if (gen !== this.generation) return;
        if (isAutoplayBlock(error)) {
          this.blocked = true;
          this.state = "paused";
          this.events.onBlocked?.();
          return;
        }
        // An abort means a newer load (or a pause) won the race: not an error.
        if (error instanceof DOMException && error.name === "AbortError") return;
        this.fail(describePlayError(error));
      });
    }
  }

  pause() {
    const el = this.el;
    if (!el) return;
    // The element keeps `currentTime`, so nothing has to be remembered here.
    el.pause();
    if (this.state === "playing" || this.state === "ready") this.state = "paused";
  }

  stop() {
    const el = this.el;
    if (!el) return;
    el.pause();
    this.seekTo(0);
    this.state = "paused";
  }

  seek(positionMs: number) {
    const el = this.el;
    if (!el || this.currentId === null) return;
    const target = Math.max(0, Math.round(positionMs));
    const duration = this.duration;
    const clamped = duration > 0 ? Math.min(target, duration) : target;
    // Before metadata a write to `currentTime` is ignored, so hold it instead.
    if (el.readyState < 1) {
      this.pendingSeekMs = clamped;
      return;
    }
    this.seekTo(clamped);
    this.events.onProgress?.(this.position, this.duration);
  }

  setVolume(volume: number) {
    this.volumeLevel = clamp01(volume);
    this.applyVolume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyVolume();
  }

  /** Releases the source. The element itself is kept for the next track. */
  dispose() {
    const el = this.el;
    this.generation += 1;
    if (el) {
      this.detach();
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* the element is already torn down */
      }
    }
    this.state = "idle";
    this.currentId = null;
    this.pendingSeekMs = null;
    this.blocked = false;
  }

  /**
   * Call from a real user gesture. WebKit lets a page that has been interacted
   * with start media without a fresh click, so a `play()` it refused earlier is
   * worth retrying here. No-op when nothing was refused.
   */
  static unlock() {
    audioEngine.retryBlocked();
  }

  /** Re-attempts a play() the browser refused; safe to call at any time. */
  retryBlocked() {
    if (!this.blocked) return;
    this.blocked = false;
    this.play();
  }

  // ---------------------------------------------------------------- internals

  private ensureElement(): HTMLAudioElement {
    if (!this.el) {
      const el = new Audio();
      el.preload = "auto";
      // No `crossOrigin`: plain playback does not need CORS, and asking for it
      // would turn a working track into a failure on a CDN that omits the header.
      this.el = el;
    }
    return this.el;
  }

  private attach(el: HTMLAudioElement, gen: number) {
    const live = () => gen === this.generation && this.el === el;
    const on = (type: string, handler: (event: Event) => void) => {
      const listener = handler as EventListener;
      el.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };

    on("loadedmetadata", () => {
      if (!live()) return;
      this.state = "ready";
      this.events.onLoad?.(this.duration);
      if (this.pendingSeekMs != null) {
        this.seekTo(this.pendingSeekMs);
        this.pendingSeekMs = null;
      }
    });

    on("durationchange", () => {
      if (!live()) return;
      if (Number.isFinite(el.duration)) this.events.onLoad?.(this.duration);
    });

    on("play", () => {
      if (!live()) return;
      this.state = "playing";
      this.blocked = false;
      this.events.onPlay?.();
    });

    on("playing", () => {
      if (!live()) return;
      this.events.onBuffering?.(false);
    });

    on("pause", () => {
      if (!live()) return;
      // Reaching the end also flips `paused` in some builds; that is not a pause.
      if (el.ended) return;
      this.state = "paused";
      this.events.onPause?.();
    });

    on("ended", () => {
      if (!live()) return;
      this.state = "ended";
      this.events.onEnd?.();
    });

    on("timeupdate", () => {
      if (!live()) return;
      this.events.onProgress?.(this.position, this.duration);
    });

    on("seeked", () => {
      if (!live()) return;
      this.events.onProgress?.(this.position, this.duration);
    });

    on("waiting", () => {
      if (!live()) return;
      this.events.onBuffering?.(true);
    });

    on("stalled", () => {
      if (!live()) return;
      this.events.onBuffering?.(true);
    });

    on("canplay", () => {
      if (!live()) return;
      this.events.onBuffering?.(false);
    });

    on("error", () => {
      if (!live()) return;
      const code = el.error?.code;
      // Aborts are ours: they happen when we swap `src` or dispose.
      if (code === ERR_ABORTED) return;
      this.fail(describeMediaError(code));
    });
  }

  private detach() {
    const el = this.el;
    if (!el) return;
    for (const [type, listener] of this.listeners) {
      el.removeEventListener(type, listener);
    }
    this.listeners = [];
  }

  private fail(message: string) {
    this.state = "error";
    this.events.onError?.(message);
  }

  private durationSeconds(): number {
    const el = this.el;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return 0;
    return el.duration;
  }

  private seekTo(ms: number) {
    const el = this.el;
    if (!el) return;
    try {
      el.currentTime = Math.max(0, ms) / 1000;
    } catch {
      /* metadata is not in yet; `pendingSeekMs` covers that case */
    }
  }

  private applyVolume() {
    const el = this.el;
    if (!el) return;
    el.muted = this.muted;
    el.volume = this.effectiveVolume();
  }

  private effectiveVolume() {
    let volume = this.volumeLevel;
    // Equal-loudness normalisation from the API, in dB. Only applied when the
    // payload looks sane, since some tracks report absurd values. A positive
    // gain cannot be honoured — an element's volume tops out at 1, and routing
    // through Web Audio just to boost would reintroduce the graph we removed.
    const gain = this.gainDb;
    if (Number.isFinite(gain) && gain !== 0 && Math.abs(gain) < 12) {
      volume *= 10 ** (gain / 20);
    }
    return clamp01(volume);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isAutoplayBlock(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

function describeMediaError(code: number | undefined): string {
  switch (code) {
    case ERR_NETWORK:
      return "网络错误，无法加载音频";
    case ERR_DECODE:
      return "音频解码失败";
    case ERR_SRC_NOT_SUPPORTED:
      return "音频格式不被支持，或播放地址已失效";
    default:
      return "播放失败，请稍后重试";
  }
}

function describePlayError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotSupportedError") {
    return "音频格式不被支持，或播放地址已失效";
  }
  return "播放失败，请稍后重试";
}

export const audioEngine = new AudioEngine();
