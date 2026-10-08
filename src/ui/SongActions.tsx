import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  addSongToPlaylist,
  getPlaylists,
  getPlaylistSongs,
  mainArtist,
  ping,
  removeSongFromPlaylist,
  setSongStarred,
  type Playlist,
  type Song,
} from '../subsonic/client'
import { getEffectiveServer } from '../store/configStore'
import { useExclusionStore, useIsExcluded } from '../store/exclusionStore'
import type { Exclusion } from '../subsonic/exclusions'
import { useT } from '../i18n'
import { yearReportBody, yearReportUrl, type ReportContext } from '../metadata/yearReport'

// Per-playlist row state: 'added'/'duplicate' mean the song is in the playlist
// (tapping again removes it); 'removed'/'failed'/undefined mean it isn't
// (tapping adds it).
type AddState = 'busy' | 'added' | 'duplicate' | 'removed' | 'failed'

/**
 * Icon overlay for the revealed song card: star ("like") the song and add it
 * to a playlist — for that "what a pearl, I want to keep this" moment — or
 * exclude the song or its artist from ever being dealt again, or report a
 * wrong year.
 * Rendered only once the song is revealed, so it never spoils a blind guess.
 */
export function SongActions({ song }: { song: Song }) {
  const t = useT()
  const [liked, setLiked] = useState(!!song.starred)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [excludeOpen, setExcludeOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const toggleExclusion = useExclusionStore((s) => s.toggle)
  const songExclusion: Exclusion = { kind: 'song', title: song.title, artist: song.artist }
  const artistExclusion: Exclusion = { kind: 'artist', name: mainArtist(song) }
  const songExcluded = useIsExcluded(songExclusion)
  const artistExcluded = useIsExcluded(artistExclusion)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [results, setResults] = useState<Record<string, AddState>>({})

  // Keyed on the song only: toggleLike mutates song.starred in place, and
  // including it here would re-run this on the next render — closing the picker
  // the user just opened.
  useEffect(() => {
    setLiked(!!song.starred)
    setPickerOpen(false)
    setExcludeOpen(false)
    setReportOpen(false)
    setResults({})
  }, [song.id])

  async function toggleLike() {
    const server = getEffectiveServer()
    if (!server) return
    const next = !liked
    setLiked(next) // optimistic; revert if the server says no
    try {
      await setSongStarred(server, song.id, next)
      song.starred = next // keep the deck's copy honest for re-reveals
    } catch {
      setLiked(!next)
    }
  }

  async function togglePicker() {
    setExcludeOpen(false)
    setReportOpen(false)
    setPickerOpen((v) => !v)
    if (playlists) return
    const server = getEffectiveServer()
    if (!server) return
    try {
      setPlaylists(await getPlaylists(server))
    } catch {
      setPlaylists([])
    }
  }

  async function toggleInPlaylist(p: Playlist) {
    const server = getEffectiveServer()
    const state = results[p.id]
    if (!server || state === 'busy') return
    setResults((r) => ({ ...r, [p.id]: 'busy' }))
    try {
      if (state === 'added' || state === 'duplicate') {
        // Tapping a playlist that has the song removes it again (undo).
        await removeSongFromPlaylist(server, p.id, song.id)
        setResults((r) => ({ ...r, [p.id]: 'removed' }))
        return
      }
      // Deny duplicates: check the playlist's current songs first.
      const existing = await getPlaylistSongs(server, p.id)
      if (existing.some((s) => s.id === song.id)) {
        setResults((r) => ({ ...r, [p.id]: 'duplicate' }))
        return
      }
      await addSongToPlaylist(server, p.id, song.id)
      setResults((r) => ({ ...r, [p.id]: 'added' }))
    } catch {
      // Most common cause: someone else's playlist (not editable by this user).
      setResults((r) => ({ ...r, [p.id]: 'failed' }))
    }
  }

  const iconBtn =
    'flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/70 shadow backdrop-blur-sm active:bg-slate-700/80'

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <button
          onClick={() => void toggleLike()}
          aria-pressed={liked}
          aria-label={liked ? t.game.unlike : t.game.like}
          className={`${iconBtn} ${liked ? 'text-rose-400' : 'text-white'}`}
        >
          <HeartIcon filled={liked} />
        </button>
        <button
          onClick={() => void togglePicker()}
          aria-expanded={pickerOpen}
          aria-label={t.game.addToPlaylist}
          className={`${iconBtn} ${pickerOpen ? 'text-brand-300' : 'text-white'}`}
        >
          <PlaylistAddIcon />
        </button>
        <button
          onClick={() => {
            setPickerOpen(false)
            setReportOpen(false)
            setExcludeOpen((v) => !v)
          }}
          aria-expanded={excludeOpen}
          aria-label={t.game.exclude}
          className={`${iconBtn} ${songExcluded || artistExcluded ? 'text-red-400' : excludeOpen ? 'text-brand-300' : 'text-white'}`}
        >
          <BanIcon />
        </button>
        <button
          onClick={() => {
            setPickerOpen(false)
            setExcludeOpen(false)
            setReportOpen((v) => !v)
          }}
          aria-expanded={reportOpen}
          aria-label={t.game.reportYear}
          className={`${iconBtn} ${reportOpen ? 'text-brand-300' : 'text-white'}`}
        >
          <FlagIcon />
        </button>
      </div>
      {reportOpen && <ReportPanel song={song} />}
      {excludeOpen && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-xl bg-slate-900/95 p-1.5 text-left shadow-xl ring-1 ring-slate-600">
          <span className="block px-2 pb-1 pt-0.5 text-xs text-slate-400">{t.game.exclude}</span>
          {(
            [
              [songExclusion, songExcluded, t.game.excludeSong],
              [artistExclusion, artistExcluded, t.game.excludeArtist(mainArtist(song))],
            ] as const
          ).map(([e, on, label]) => (
            <button
              key={e.kind}
              onClick={() => toggleExclusion(e)}
              aria-pressed={on}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 active:bg-slate-700/60"
            >
              <span>{label}</span>
              {on && <span className="shrink-0 text-red-400">✓</span>}
            </button>
          ))}
        </div>
      )}
      {pickerOpen && (
        <div className="absolute right-0 top-full z-20 mt-1.5 max-h-64 w-52 overflow-y-auto rounded-xl bg-slate-900/95 p-1.5 text-left shadow-xl ring-1 ring-slate-600">
          {playlists === null ? (
            <span className="block px-2 py-1.5 text-sm text-slate-500">…</span>
          ) : playlists.length === 0 ? (
            <span className="block px-2 py-1.5 text-sm text-slate-500">{t.game.noPlaylists}</span>
          ) : (
            playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => void toggleInPlaylist(p)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 active:bg-slate-700/60"
              >
                <span className="truncate">{p.name}</span>
                {results[p.id] === 'busy' && <span className="shrink-0 text-slate-500">…</span>}
                {results[p.id] === 'added' && (
                  <span className="shrink-0 text-emerald-400">{t.game.addedToPlaylist}</span>
                )}
                {results[p.id] === 'duplicate' && (
                  <span className="shrink-0 text-slate-400">{t.game.alreadyInPlaylist}</span>
                )}
                {results[p.id] === 'removed' && (
                  <span className="shrink-0 text-slate-400">{t.game.removedFromPlaylist}</span>
                )}
                {results[p.id] === 'failed' && (
                  <span className="shrink-0 text-red-400">{t.game.addFailed}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

/** Three list lines with a + at the lower right — the classic add-to-playlist glyph. */
function PlaylistAddIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h14M4 11h14M4 16h7" />
      <path d="M17.5 13.5v6M14.5 16.5h6" />
    </svg>
  )
}

/** A circle with a slash — "never again". */
/**
 * Wrong-year report: the details a maintainer needs, copied to the clipboard
 * so the user can report them whenever they have time, and optionally
 * prefilled into a new GitHub issue right away. The text is also shown, so the
 * user sees what they would submit and can copy it by hand if copying fails.
 */
function ReportPanel({ song }: { song: Song }) {
  const t = useT()
  const [server, setServer] = useState<ReportContext['server']>()
  const [copied, setCopied] = useState<boolean | null>(null)

  // The server's software and version are worth one ping; the address is not
  // part of the report.
  useEffect(() => {
    const config = getEffectiveServer()
    if (!config) return
    let live = true
    void ping(config).then((r) => {
      if (live && r.ok) setServer({ type: r.type, version: r.serverVersion })
    })
    return () => {
      live = false
    }
  }, [])

  const body = yearReportBody(song, {
    appVersion: __APP_VERSION__,
    platform: Capacitor.isNativePlatform() ? 'Android' : 'web',
    server,
  })

  const button =
    'block w-full rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white active:bg-brand-700'

  async function copy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl bg-slate-900/95 p-2 text-left shadow-xl ring-1 ring-slate-600">
      <span className="block px-1 pb-1 text-xs text-slate-400">{t.game.reportYear}</span>
      <p className="px-1 pb-2 text-xs text-slate-300">{t.game.reportYearHint}</p>
      <div className="flex flex-col gap-1.5">
        <button onClick={() => void copy()} className={button}>
          {t.game.reportYearCopy}
        </button>
        {/* Optional. A real link, not window.open: on Android the WebView hands
            it to the browser. It copies too, so the text is on the clipboard
            whichever way the user goes. */}
        <a
          href={yearReportUrl(song, body)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void copy()}
          className={button}
        >
          {t.game.reportYearOpen}
        </a>
      </div>
      {copied === true && <p className="px-1 pt-1.5 text-xs text-emerald-400">{t.game.reportYearCopied}</p>}
      {copied === false && <p className="px-1 pt-1.5 text-xs text-red-400">{t.game.reportYearCopyFailed}</p>}
      <textarea
        readOnly
        value={body}
        onFocus={(e) => e.currentTarget.select()}
        rows={6}
        className="mt-2 w-full resize-none rounded-lg bg-slate-800 p-2 font-mono text-[10px] leading-snug text-slate-300"
      />
    </div>
  )
}

function FlagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  )
}

function BanIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  )
}
