import type { ServerConfig } from '../store/configStore'
import { getArtists, getMusicFolders, mainArtist, search3, type Song } from '../subsonic/client'
import { JsonCache } from '../lib/cache'
import { artistKey, curatedEntries, curatedKey, onHitLists } from './curated'
import { interleave, shuffle } from '../subsonic/deck'

/**
 * Locate famous-canon songs that actually exist in the library.
 *
 * Canon songs are a tiny slice of any library (~2–3%), so they never surface
 * often enough in a random deck pull — we must fetch them on purpose. To keep
 * that cheap: pull the library's artist list once and only search for canon
 * songs whose artist is present (most searches would otherwise miss). Whether
 * each canon song is in the library is cached persistently, so the misses —
 * the vast majority — cost no search after the first time.
 *
 * Only that yes/no is cached, never the song itself: server ids (song, cover
 * art) change when a file is moved or retagged or the server migrates its
 * database, and a cached id then points at nothing — the song "fails to play".
 * A known hit is searched again each game to get its current id.
 */
// Keyed by server id and library, not address: a server reached on its LAN
// address at home and its public one outside is still the same library.
const inLibraryCache = new JsonCache<boolean>('curated-in-lib-v2')
// Keyed by address, and with a separate "all libraries" scope.
JsonCache.dropNamespace('curated-in-lib-v1')
// Held whole songs, stale ids included — superseded by the yes/no cache above.
JsonCache.dropNamespace('curated-lib-v1')

/** Searches in flight at once — known hits are many, and each is a round trip. */
const CONCURRENCY = 4

/**
 * The canon songs whose artist is in the chosen libraries, each with where to
 * search for it, plus the lookup that searches and records the answer.
 * `fresh` ignores what is cached, so every song is searched again.
 */
async function canonCandidates(config: ServerConfig, musicFolderIds?: string[], fresh = false) {
  // Subsonic scopes a search to one library at a time, so each library is a
  // scope of its own. "All libraries" is every library rather than one
  // unscoped search, so a game over any selection reads the same cache, and
  // one scan of the server covers them all. `undefined` (search everything)
  // only for a server that can't list its libraries.
  let scopes: Array<string | undefined> = musicFolderIds?.length ? musicFolderIds : []
  if (!scopes.length) {
    const folders = await getMusicFolders(config).catch(() => [])
    scopes = folders.length ? folders.map((f) => f.id) : [undefined]
  }
  // Which scopes hold each artist — a canon song is then searched for only
  // where its artist actually is, not once per library.
  const artistScopes = new Map<string, Array<string | undefined>>()
  const artistLists = await Promise.allSettled(scopes.map((f) => getArtists(config, f)))
  if (artistLists.every((r) => r.status === 'rejected')) return null
  artistLists.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    for (const name of r.value) {
      const k = artistKey(name)
      const list = artistScopes.get(k) ?? []
      if (!list.includes(scopes[i])) list.push(scopes[i])
      artistScopes.set(k, list)
    }
  })

  const cacheKey = (scope: string | undefined, key: string) =>
    `${config.id}|${scope ?? ''}|${key}`
  const byArtists = curatedEntries.filter((e) => artistScopes.has(artistKey(e.artist)))
  const candidates = shuffle(byArtists, Math.random)
    .map((e) => {
      const key = curatedKey(e.artist, e.title)
      const where = (artistScopes.get(artistKey(e.artist)) ?? [])
        .map((scope) => ({ scope, known: fresh ? undefined : inLibraryCache.get(cacheKey(scope, key)) }))
        .filter((w) => w.known !== false)
        // A scope it is known to be in goes first.
        .sort((a, b) => Number(b.known === true) - Number(a.known === true))
      return { e, key, where, known: where.some((w) => w.known === true) }
    })
    .filter((c) => c.where.length > 0)

  const lookup = async ({ e, key, where }: (typeof candidates)[number]): Promise<Song | null> => {
    for (const { scope } of where) {
      let hits: Song[]
      try {
        hits = await search3(config, {
          query: `${e.artist} ${e.title}`,
          songCount: 5,
          musicFolderId: scope,
        })
      } catch {
        return null // transient failure: don't cache a miss
      }
      const song = hits.find((s) => curatedKey(mainArtist(s), s.title) === key) ?? null
      inLibraryCache.set(cacheKey(scope, key), song !== null)
      if (song) return song
    }
    return null
  }

  return { candidates, lookup, byArtists: byArtists.length }
}

export async function findCuratedSongs(
  config: ServerConfig,
  opts: {
    musicFolderIds?: string[]
    want: number
    maxSearches: number
    /** Only songs on these hit lists; unset or empty = every list. */
    hitLists?: string[]
  },
): Promise<Song[]> {
  const canon = await canonCandidates(config, opts.musicFolderIds)
  if (!canon) return []
  const { lookup } = canon
  const candidates = canon.candidates.filter((c) => onHitLists(c.e, opts.hitLists))
  // Alternate known hits with songs not searched yet. A known hit is a
  // near-sure find, so it keeps the budget productive; the unsearched ones
  // keep the canon rotating. Searching known hits first instead locked every
  // game onto the first game's finds: the search stops at `want`, so only
  // those ever became known, and the rest of the library's canon was never
  // looked at again.
  const ordered = interleave([
    candidates.filter((c) => c.known),
    candidates.filter((c) => !c.known),
  ])

  const found: Song[] = []
  const budget = ordered.slice(0, opts.maxSearches)
  for (let i = 0; i < budget.length && found.length < opts.want; i += CONCURRENCY) {
    const songs = await Promise.all(budget.slice(i, i + CONCURRENCY).map(lookup))
    for (const song of songs) if (song) found.push(song)
  }
  return found.slice(0, opts.want)
}

/**
 * Search the whole canon on this server, up front. A game only searches as
 * many songs as its deck needs, so without this the canon is learned a few
 * dozen songs per game and early games repeat themselves. Everything is
 * searched again, cached answers included: a game never re-checks a song it
 * found missing, so this is also how songs added to the library since get
 * noticed. Returns how many canon songs the server
 * holds, how many are by artists it holds, and how many are bundled; null if
 * its libraries couldn't be read.
 */
export async function scanCuratedSongs(
  config: ServerConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<{ inLibrary: number; byArtists: number; bundled: number } | null> {
  const canon = await canonCandidates(config, undefined, true)
  if (!canon) return null
  const { candidates: todo, lookup, byArtists } = canon
  let inLibrary = 0
  onProgress?.(0, todo.length)
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const songs = await Promise.all(todo.slice(i, i + CONCURRENCY).map(lookup))
    inLibrary += songs.filter(Boolean).length
    onProgress?.(Math.min(i + CONCURRENCY, todo.length), todo.length)
  }
  return { inLibrary, byArtists, bundled: curatedEntries.length }
}
