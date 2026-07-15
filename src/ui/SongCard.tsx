import type { Song } from '../subsonic/client'
import { useConfigStore } from '../store/configStore'
import { coverArtUrl } from '../subsonic/client'
import { useT } from '../i18n'

/**
 * The mystery song. While `revealed` is false it shows nothing identifying —
 * just a spinning-record placeholder — so guessers can't peek. On reveal it
 * flips to the year, title, artist, and cover art.
 */
export function SongCard({
  song,
  revealed,
  result,
  playing,
  countdown,
  placeCountdown,
  disabled,
  onToggle,
}: {
  song: Song
  revealed: boolean
  result?: 'correct' | 'wrong' | null
  /** Whether the mystery song is currently playing (unrevealed only). */
  playing?: boolean
  /** Countdown value shown before the song starts (3→1), or null. */
  countdown?: number | null
  /** Last-seconds placement countdown (lock-on-end mode), or null. */
  placeCountdown?: number | null
  /** Disable the control (e.g. a 30s clip has been spent). */
  disabled?: boolean
  /** Tap the mystery card to play/pause. */
  onToggle?: () => void
}) {
  const server = useConfigStore((s) => s.server)
  const t = useT()

  if (!revealed) {
    // The mystery card itself is the play/pause control. In the last seconds of
    // a locked placement it turns into a big flashing countdown instead.
    const urgent = countdown == null && placeCountdown != null
    const spinning = playing && countdown == null && !urgent
    const ringClass = urgent
      ? 'h-36 w-36 rounded-full border-4 border-brand-500 animate-[pulse_1s_ease-in-out_infinite]'
      : `h-36 w-36 rounded-full border-4 border-slate-600 border-t-brand-500 animate-[spin_3s_linear_infinite] ${
          spinning ? '' : '[animation-play-state:paused]'
        }`
    return (
      <button
        onClick={onToggle}
        disabled={disabled || countdown != null}
        aria-label={playing ? t.a11y.pause : t.a11y.play}
        className="relative flex aspect-square w-56 items-center justify-center rounded-2xl bg-slate-800 shadow-xl"
      >
        <div className={ringClass} />
        {countdown != null ? (
          <span className="absolute text-7xl font-black text-brand-300">{countdown}</span>
        ) : urgent ? (
          <span className="absolute text-8xl font-black text-red-400">{placeCountdown}</span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className={`absolute h-12 w-12 fill-brand-400 ${disabled ? 'opacity-30' : ''}`}
            aria-hidden="true"
          >
            {playing ? (
              <>
                <rect x="6.5" y="5" width="4" height="14" rx="1.5" />
                <rect x="13.5" y="5" width="4" height="14" rx="1.5" />
              </>
            ) : (
              <path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.5-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2z" />
            )}
          </svg>
        )}
      </button>
    )
  }

  const ring =
    result === 'correct'
      ? 'ring-4 ring-emerald-500'
      : result === 'wrong'
        ? 'ring-4 ring-red-500'
        : ''

  return (
    <div className={`w-60 overflow-hidden rounded-2xl bg-slate-800 shadow-xl ${ring}`}>
      {server && song.coverArt ? (
        <img
          src={coverArtUrl(server, song.coverArt, 300)}
          alt=""
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="aspect-square w-full bg-slate-700" />
      )}
      <div className="p-3 text-center">
        <div className="text-5xl font-black text-brand-400">{song.year}</div>
        <div className="mt-1.5 truncate text-lg font-semibold">{song.title}</div>
        <div className="truncate text-base text-slate-400">{song.artist}</div>
      </div>
    </div>
  )
}
