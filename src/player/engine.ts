import { Howl, Howler } from "howler";
import type { Track } from "../types/ncm";

/**
 * Thin wrapper over Howler that plays one track at a time.
 *
 * Howler is used through its `html5: true` path because the webview's Web Audio
 * path would require CORS headers on NetEase's CDN, which we do not control.
 * A single long-lived instance is swapped per track to keep the media element
 * pool from growing.
 */

export interface AudioEvents {
  onLoad?: (durationMs: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export class AudioEngine {
  private howl: Howl | null = null;
  private currentId: number | null = null;
  /**
   * The Howl that already has an audio source running, and the sound id it was
   * started with.
   *
   * Web Audio is the path Howler actually takes here, and each `play()` there
   * builds a fresh BufferSourceNode wired straight to the output — so calling it
   * twice plays the same track twice, which is heard as a doubled/echoing vocal.
   * The HTML5 path tolerates a repeated `play()` (it just resumes), which is why
   * this was easy to miss.
   */
  private playingHowl: Howl | null = null;
  private playingId: number | null = null;
  private events: AudioEvents = {};
  private pendingSeek: number | null = null;
  private voulmeLevel = 0.8;

  setEvents(events: AudioEvents) {
    this.events = events;
  }

  get trackId() {
    return this.currentId;
  }

  get playing() {
    const howl = this.howl;
    if (!howl) return false;
    return howl.playing(this.playingId ?? undefined);
  }

  /** Position in milliseconds. */
  get position(): number {
    if (!this.howl || this.currentId === null) return 0;
    const seconds = this.howl.seek();
    return typeof seconds === "number" ? Math.round(seconds * 1000) : 0;
  }

  get duration(): number {
    if (!this.howl) return 0;
    const seconds = this.howl.duration();
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
  }

  load(
    track: Track,
    opts: { autoplay: boolean; positionMs?: number; gain?: number },
  ) {
    this.dispose();
    if (!track.url) {
      this.events.onError?.("这首歌曲没有可用的播放地址");
      return;
    }
    this.currentId = track.id;
    this.pendingSeek =
      opts.positionMs && opts.positionMs > 500 ? opts.positionMs : null;

    const volume = this.effectiveVolume(opts.gain);
    const howl = new Howl({
      src: [track.url],
      html5: true,
      volume,
      // `format` is inferred from the URL extension; the API sometimes omits it.
      format: [guessFormat(track.url)],
      xhr: { method: "GET" },
      onload: () => {
        this.events.onLoad?.(this.duration);
        if (this.pendingSeek != null) {
          this.howl?.seek(this.pendingSeek / 1000);
          this.pendingSeek = null;
        }
        if (opts.autoplay) this.play();
      },
      onplay: () => this.events.onPlay?.(),
      onpause: () => this.events.onPause?.(),
      onend: () => {
        this.playingHowl = null;
        this.playingId = null;
        this.events.onEnd?.();
      },
      onloaderror: (_id, error) => {
        this.events.onError?.(describeHowlerError(error));
      },
      onplayerror: (_id, error) => {
        // WebKit blocks playback that was not started from a user gesture.
        this.events.onError?.(describeHowlerError(error));
      },
    });
    this.howl = howl;
    if (opts.autoplay) {
      // Force the underlying media element to load so `onload` fires promptly.
      howl.load();
    }
  }

  play() {
    const howl = this.howl;
    if (!howl) return;

    // Already sounding this exact Howl: starting again would layer another
    // source on top of the first.
    if (this.playingHowl === howl && howl.playing(this.playingId ?? undefined)) {
      return;
    }

    // Stop anything still running on this Howl before starting.
    //
    // Howler's `play()` with no id only reuses an existing sound when exactly
    // one is paused; otherwise it activates another one from the pool. Over a
    // few pause/resume cycles the Howl accumulated several sounds that all
    // stayed audible — heard as a doubled, echoing vocal. Collapsing to a single
    // source first makes that impossible.
    this.stopAllSounds(howl);

    const id = howl.play();
    this.playingHowl = howl;
    this.playingId = typeof id === "number" ? id : null;
  }

  /**
   * Silences every sound belonging to a Howl, without unloading it.
   *
   * `_sounds` is Howler's internal pool and is not part of its public types,
   * hence the local shape declaration.
   */
  private stopAllSounds(howl: Howl) {
    const pool = (howl as unknown as { _sounds?: Array<{ _id: number }> })
      ._sounds;
    for (const sound of pool ?? []) {
      try {
        howl.stop(sound._id);
      } catch {
        /* already gone */
      }
    }
  }

  pause() {
    this.howl?.pause();
    this.playingHowl = null;
    this.playingId = null;
  }

  stop() {
    this.howl?.stop();
    this.playingHowl = null;
    this.playingId = null;
  }

  seek(positionMs: number) {
    if (!this.howl) return;
    if (this.currentId === null) return;
    this.howl.seek(Math.max(0, positionMs) / 1000);
  }

  setVolume(volume: number) {
    this.voulmeLevel = Math.min(1, Math.max(0, volume));
    if (this.howl) this.howl.volume(this.effectiveVolume());
  }

  setMuted(muted: boolean) {
    Howler.mute(muted);
  }

  private effectiveVolume(gainDb?: number) {
    let volume = this.voulmeLevel;
    // Equal-loudness normalisation from the API, in dB. Only applied when the
    // payload looks sane, since some tracks report absurd values.
    const gain = gainDb ?? 0;
    if (Number.isFinite(gain) && gain !== 0 && Math.abs(gain) < 12) {
      volume *= 10 ** (gain / 20);
    }
    return Math.min(1, Math.max(0, volume));
  }

  dispose() {
    if (this.howl) {
      try {
        this.howl.unload();
      } catch {
        /* already torn down */
      }
    }
    this.howl = null;
    this.currentId = null;
    this.pendingSeek = null;
    this.playingHowl = null;
    this.playingId = null;
  }

  /** Call once on boot so the audio context resumes after the first gesture. */
  static unlock() {
    const ctx = Howler.ctx as AudioContext | undefined;
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }
}

function guessFormat(url: string): string {
  const clean = url.split("?")[0] ?? "";
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  if (["mp3", "flac", "m4a", "aac", "wav", "ogg", "opus"].includes(ext))
    return ext;
  return "mp3";
}

function describeHowlerError(error: unknown): string {
  const code = typeof error === "number" ? error : Number(error);
  switch (code) {
    case 1:
      return "音频加载被中止";
    case 2:
      return "网络错误，无法加载音频";
    case 3:
      return "音频解码失败";
    case 4:
      return "音频格式不被支持，或播放地址已失效";
    default:
      return "播放失败，请稍后重试";
  }
}

export const audioEngine = new AudioEngine();
