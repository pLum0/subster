import { MediaSession } from '@jofr/capacitor-media-session'

/**
 * Thin wrapper around a single HTMLAudioElement, used only on the host/DJ
 * device to play the mystery song. Supports a start offset (random-start mode),
 * fade in/out, and a clip window that auto-stops after N seconds of actual
 * playback.
 *
 * A native MediaSession (via @jofr/capacitor-media-session) is registered so
 * playback keeps going when the app is backgrounded / the screen locks: on
 * Android the plugin starts a foreground service with a media notification
 * (the WebView otherwise force-sleeps and pauses `<audio>` in the background).
 */
class AudioPlayer {
  private el: HTMLAudioElement | null = null
  private clipHandler: (() => void) | null = null
  private fadeTimer: ReturnType<typeof setInterval> | null = null

  private element(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio()
      this.setupMediaSession()
    }
    return this.el
  }

  /**
   * Register the media session (once). Metadata is deliberately generic —
   * revealing the title/artist on the lock-screen notification would spoil the
   * guess. Play/pause handlers wire the notification + hardware keys to us.
   */
  private setupMediaSession(): void {
    // `artwork` must be present — the Android plugin NPEs on a null array.
    void MediaSession.setMetadata({ title: 'Mystery song', artist: 'Subster', artwork: [] }).catch(
      () => {},
    )
    void MediaSession.setActionHandler({ action: 'play' }, () => this.resume()).catch(() => {})
    void MediaSession.setActionHandler({ action: 'pause' }, () => this.pause()).catch(() => {})
  }

  private setPlaybackState(state: 'playing' | 'paused' | 'none'): void {
    void MediaSession.setPlaybackState({ playbackState: state }).catch(() => {})
  }

  private clearFade(): void {
    if (this.fadeTimer) clearInterval(this.fadeTimer)
    this.fadeTimer = null
  }

  /** Ramp volume to `target` over `seconds`, then run `onDone`. */
  private ramp(target: number, seconds: number, onDone?: () => void): void {
    const el = this.element()
    this.clearFade()
    if (seconds <= 0) {
      el.volume = target
      onDone?.()
      return
    }
    const stepMs = 50
    const from = el.volume
    const steps = Math.max(1, Math.round((seconds * 1000) / stepMs))
    let i = 0
    this.fadeTimer = setInterval(() => {
      i++
      const v = from + (target - from) * (i / steps)
      el.volume = Math.max(0, Math.min(1, v))
      if (i >= steps) {
        this.clearFade()
        el.volume = target
        onDone?.()
      }
    }, stepMs)
  }

  /**
   * Load (if needed) and play `url`, seeking to `startAt` seconds first.
   * With `fadeInSeconds`, the volume ramps up from 0 (used for random-start so a
   * mid-song entry doesn't jump in abruptly).
   */
  async play(url: string, startAt = 0, opts: { fadeInSeconds?: number } = {}): Promise<void> {
    const el = this.element()
    this.clearFade()
    const fadeIn = opts.fadeInSeconds ?? 0
    const seekAndPlay = () => {
      try {
        if (startAt > 0 && Math.abs(el.currentTime - startAt) > 0.5) el.currentTime = startAt
        if (fadeIn > 0) {
          el.volume = 0
          el.play().catch(() => {})
          this.ramp(1, fadeIn)
        } else {
          el.volume = 1
          el.play().catch(() => {})
        }
        this.setPlaybackState('playing')
      } catch {
        // Autoplay can be blocked until a gesture; UI triggers cover this.
      }
    }
    if (el.src !== url) {
      el.src = url
      el.addEventListener('loadedmetadata', seekAndPlay, { once: true })
    } else {
      seekAndPlay()
    }
  }

  /** Resume from the current position (no seek). No-op if nothing is loaded. */
  resume(): void {
    if (!this.el || !this.el.src) return
    this.el.play().catch(() => {})
    this.setPlaybackState('playing')
  }

  /**
   * Fade the current playback out over `seconds`, then pause. Used when skipping
   * to the next song so the outgoing track bows out under the countdown.
   */
  fadeOut(seconds: number): void {
    if (!this.el || this.el.paused) return
    this.clearClip()
    this.ramp(0, seconds, () => {
      this.el?.pause()
      this.setPlaybackState('paused')
    })
  }

  /**
   * Watch playback until it ends — either after `clipSeconds` past `startAt`
   * (clip mode), or at the song's natural end (`clipSeconds: null`, full song).
   * Fades the volume over the last `fadeSeconds`, reports remaining seconds via
   * `onTick`, and fires `onEnd` exactly once. Uses timeupdate so pausing doesn't
   * burn the window.
   */
  watch(opts: {
    startAt: number
    clipSeconds: number | null
    onEnd: () => void
    onTick?: (remaining: number) => void
    fadeSeconds?: number
  }): void {
    const el = this.element()
    this.clearClip()
    const fade = opts.fadeSeconds ?? 0
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.volume = 1
      el.pause()
      this.setPlaybackState('paused')
      this.clearClip()
      opts.onEnd()
    }
    const onTime = () => {
      const endAt =
        opts.clipSeconds != null
          ? opts.startAt + opts.clipSeconds
          : isFinite(el.duration)
            ? el.duration
            : Infinity
      const remaining = endAt - el.currentTime
      opts.onTick?.(Math.max(0, remaining))
      if (remaining <= 0) {
        finish()
        return
      }
      if (fade > 0 && remaining <= fade) el.volume = Math.max(0, remaining / fade)
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', finish)
    this.clipHandler = () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', finish)
    }
  }

  private clearClip(): void {
    this.clipHandler?.()
    this.clipHandler = null
  }

  /**
   * Detach the clip/lock watcher but keep playing (used on reveal): the song
   * plays on until the next turn, and no clip-end/lock timer fires. Restores
   * full volume in case a clip fade-out was mid-way.
   */
  unwatch(): void {
    this.clearClip()
    this.clearFade()
    if (this.el) this.el.volume = 1
  }

  pause(): void {
    this.clearFade()
    this.el?.pause()
    this.setPlaybackState('paused')
  }

  stop(): void {
    this.clearFade()
    this.clearClip()
    this.setPlaybackState('none')
    if (!this.el) return
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
  }

  get playing(): boolean {
    return !!this.el && !this.el.paused
  }
}

export const audioPlayer = new AudioPlayer()
