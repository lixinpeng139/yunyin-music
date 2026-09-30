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
  /**
   * Where playback was when it was paused.
   *
   * Howler's html5 mode builds an <audio> per sound in the Howl, and
   * `howl.pause()` with no id pauses **all** of them — including one that resets
   * `currentTime` to 0. Resuming therefore has to re-assert the position rather
   * than trusting the element to still be where it was.
   */
  private pausedAtMs: number | null = null;
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
      onplay: () => {
        // `volume()` on the Howl would touch every pooled sound and stack gain,
        // so it is applied to the sounding id only.
        if (this.playingId !== null) {
          this.howl?.volume(this.effectiveVolume(), this.playingId);
        }
        this.events.onPlay?.();
      },
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

    if (this.playingHowl === howl && howl.playing(this.playingId ?? undefined)) {
      return; // already sounding this Howl
    }

    if (this.playingId !== null && this.playingHowl === howl) {
      // Resume the sound that was paused, then put the position back: the pause
      // may have reset the element to 0.
      const resumeAt = this.pausedAtMs;
      howl.play(this.playingId);
      if (resumeAt && resumeAt > 500) {
        this.howl?.seek(resumeAt / 1000, this.playingId);
      }
      this.pausedAtMs = null;
      return;
    }

    // First start for this Howl: one source, addressed by its id.
    const id = howl.play();
    this.playingHowl = howl;
    this.playingId = typeof id === "number" ? id : null;
    this.pausedAtMs = null;
  }


  pause() {
    if (!this.howl) return;
    // Record first: pausing may zero the element's currentTime.
    const at = this.position;
    if (at > 0) this.pausedAtMs = at;
    // Address the sounding id only; the no-arg form hits every pooled element.
    if (this.playingId !== null) this.howl.pause(this.playingId);
    else this.howl.pause();
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
