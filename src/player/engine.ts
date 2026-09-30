import { Howl, Howler } from "howler";
import type { Track } from "../types/ncm";

/**
 * Plays one track at a time on top of Howler.
 *
 * Howler ends up on its **Web Audio** path here regardless of the `html5`
 * option — the audio context is created when the module loads, so `html5` is
 * already fixed. That matters because the two paths behave differently:
 *
 *   * Every sound gets a GainNode connected to the master output, and each live
 *     connection shows up as a separate stream in the system mixer. `unload()`
 *     does not sever it, so discarding a Howl without disconnecting first leaked
 *     a stream per track and more than one could be audible at once — heard as a
 *     doubled, echoing vocal.
 *   * `howl.pause()` with no id pauses every pooled sound, and one of them
 *     resets `currentTime` to 0, which made a resume restart the track.
 *   * `howl.playing(id)` stays true while paused, so it cannot be used to decide
 *     whether playback needs resuming.
 *
 * The engine therefore tracks its own paused state, records the position across
 * a pause, and addresses the sounding sound **by id** everywhere.
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
  /** Id of the sound playing within the current Howl. */
  private playingId: number | null = null;
  private events: AudioEvents = {};
  private pendingSeek: number | null = null;
  private voulmeLevel = 0.8;
  /** Playback paused by us; Howler cannot report this reliably. */
  private paused = false;
  /** Position when the pause happened, so a resume can restore it. */
  private pausedAtMs: number | null = null;
  /** Loudness normalisation from the API for the current track, in dB. */
  private gainDb = 0;

  setEvents(events: AudioEvents) {
    this.events = events;
  }

  get trackId() {
    return this.currentId;
  }

  get playing() {
    if (!this.howl || this.paused) return false;
    return this.howl.playing(this.playingId ?? undefined);
  }

  /** Position in milliseconds. */
  get position(): number {
    if (!this.howl || this.currentId === null) return 0;
    const seconds =
      this.playingId === null ? this.howl.seek() : this.howl.seek(this.playingId);
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
    this.gainDb = opts.gain ?? 0;
    this.pendingSeek =
      opts.positionMs && opts.positionMs > 500 ? opts.positionMs : null;

    const howl = new Howl({
      src: [track.url],
      // Howler keeps `src`/`format` construction-only, hence one Howl per track.
      format: [guessFormat(track.url)],
      volume: this.effectiveVolume(),
      html5: true,
      xhr: { method: "GET" },
      onload: () => {
        this.events.onLoad?.(this.duration);
        if (this.pendingSeek != null && this.playingId !== null) {
          this.howl?.seek(this.pendingSeek / 1000, this.playingId);
          this.pendingSeek = null;
        }
        // Started here rather than right after construction: issuing `play()`
        // while the buffer is still decoding left a sound stuck with no audio.
        if (opts.autoplay) this.play();
      },
      onplay: () => {
        this.paused = false;
        // Scoped to the sounding id; the Howl-level setter touches every pooled
        // node and can stack gain.
        if (this.playingId !== null) {
          this.howl?.volume(this.effectiveVolume(), this.playingId);
        }
        this.events.onPlay?.();
      },
      onpause: () => this.events.onPause?.(),
      onend: () => {
        this.paused = false;
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
    if (opts.autoplay) howl.load();
  }

  play() {
    const howl = this.howl;
    if (!howl) return;

    // Idempotence must come from our own flag: a paused sound still reports
    // `playing === true`, so asking Howler here would skip the resume entirely
    // and leave the track silent.
    if (!this.paused) return;

    const id = this.playingId ?? howl.play();
    if (typeof id !== "number") return;
    this.playingId = id;

    const resumeAt = this.pausedAtMs;
    howl.play(id);
    // The pause may have reset the element, so re-assert where we were.
    if (resumeAt && resumeAt > 500) howl.seek(resumeAt / 1000, id);
    this.pausedAtMs = null;
    this.paused = false;
  }

  pause() {
    if (!this.howl) return;
    // Read the position before pausing; afterwards it may already be 0.
    const at = this.position;
    if (at > 0) this.pausedAtMs = at;
    // Address the sounding id only — the no-arg form hits every pooled sound.
    if (this.playingId !== null) this.howl.pause(this.playingId);
    else this.howl.pause();
    this.paused = true;
  }

  stop() {
    if (!this.howl) return;
    if (this.playingId !== null) this.howl.stop(this.playingId);
    else this.howl.stop();
    this.paused = false;
    this.pausedAtMs = null;
  }

  seek(positionMs: number) {
    if (!this.howl) return;
    const seconds = Math.max(0, positionMs) / 1000;
    if (this.playingId !== null) this.howl.seek(seconds, this.playingId);
    else this.howl.seek(seconds);
  }

  setVolume(volume: number) {
    this.voulmeLevel = Math.min(1, Math.max(0, volume));
    if (!this.howl) return;
    const level = this.effectiveVolume();
    if (this.playingId !== null) this.howl.volume(level, this.playingId);
    else this.howl.volume(level);
  }

  setMuted(muted: boolean) {
    Howler.mute(muted);
  }

  dispose() {
    const howl = this.howl as unknown as {
      _sounds?: Array<{
        _node?: { disconnect?: () => void; bufferSource?: { disconnect?: () => void } };
        _panner?: { disconnect?: () => void };
      }>;
      unload: () => void;
    } | null;

    if (howl) {
      // Sever the graph before unloading. `unload()` leaves each sound's GainNode
      // connected to the master output, and every live connection is a stream in
      // the system mixer — discarding Howls without this leaked one per track.
      for (const sound of howl._sounds ?? []) {
        for (const node of [sound._panner, sound._node, sound._node?.bufferSource]) {
          try {
            node?.disconnect?.();
          } catch {
            /* already disconnected */
          }
        }
      }
      try {
        howl.unload();
      } catch {
        /* already torn down */
      }
    }
    this.howl = null;
    this.currentId = null;
    this.playingId = null;
    this.pendingSeek = null;
    this.paused = false;
    this.pausedAtMs = null;
  }

  private effectiveVolume() {
    let volume = this.voulmeLevel;
    // Equal-loudness normalisation from the API, in dB. Only applied when the
    // payload looks sane, since some tracks report absurd values.
    const gain = this.gainDb;
    if (Number.isFinite(gain) && gain !== 0 && Math.abs(gain) < 12) {
      volume *= 10 ** (gain / 20);
    }
    return Math.min(1, Math.max(0, volume));
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
