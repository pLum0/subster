import { useEffect, useState } from 'react'
import {
  addSongToPlaylist,
  getPlaylists,
  getPlaylistSongs,
  removeSongFromPlaylist,
  setSongStarred,
  type Playlist,
  type Song,
} from '../subsonic/client'
import { getEffectiveServer } from '../store/configStore'
import { useT } from '../i18n'

// Per-playlist row state: 'added'/'duplicate' mean the song is in the playlist
// (tapping again removes it); 'removed'/'failed'/undefined mean it isn't
// (tapping adds it).
type AddState = 'busy' | 'added' | 'duplicate' | 'removed' | 'failed'

/**
 * Icon overlay for the revealed song card: star ("like") the song and add it
 * to a playlist — for that "what a pearl, I want to keep this" moment.
 * Rendered only once the song is revealed, so it never spoils a blind guess.
 */
export function SongActions({ song }: { song: Song }) {
  const t = useT()
  const [liked, setLiked] = useState(!!song.starred)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [results, setResults] = useState<Record<string, AddState>>({})

  useEffect(() => {
    setLiked(!!song.starred)
    setPickerOpen(false)
    setResults({})
  }, [song.id, song.starred])

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
      </div>
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
