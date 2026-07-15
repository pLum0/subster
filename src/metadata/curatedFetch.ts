import type { ServerConfig } from '../store/configStore'
import { getArtists, search3, type Song } from '../subsonic/client'
import { JsonCache } from '../lib/cache'
import { artistKey, curatedEntries, curatedKey } from './curated'
import { shuffle } from '../subsonic/deck'

/**
 * Locate famous-canon songs that actually exist in the library.
 *
 * Canon songs are a tiny slice of any library (~2–3%), so they never surface
 * often enough in a random deck pull — we must fetch them on purpose. To keep
 * that cheap: pull the library's artist list once and only search for canon
 * songs whose artist is present (most searches would otherwise miss). Each
 * hit/miss is cached persistently, so coverage converges over sessions and the
 * per-game search budget shrinks to near zero.
 */
const songCache = new JsonCache<Song | null>('curated-lib-v1')

export async function findCuratedSongs(
  config: ServerConfig,
  opts: { musicFolderId?: string; want: number; maxSearches: number },
): Promise<Song[]> {
  const folderId = opts.musicFolderId ?? ''
  let libArtists: Set<string>
  try {
    libArtists = new Set((await getArtists(config, opts.musicFolderId)).map(artistKey))
  } catch {
    return []
  }

  const candidates = shuffle(
    curatedEntries.filter((e) => libArtists.has(artistKey(e.artist))),
    Math.random,
  )

  const found: Song[] = []
  let searches = 0
  for (const e of candidates) {
    if (found.length >= opts.want) break
    const key = curatedKey(e.artist, e.title)
    const cacheKey = `${config.baseUrl}|${folderId}|${key}`
    const cached = songCache.get(cacheKey)
    if (cached !== undefined) {
      if (cached) found.push(cached)
      continue
    }
    if (searches >= opts.maxSearches) continue // budget spent — keep scanning cache only
    searches++
    let song: Song | null = null
    try {
      const hits = await search3(config, {
        query: `${e.artist} ${e.title}`,
        songCount: 5,
        musicFolderId: opts.musicFolderId,
      })
      song = hits.find((s) => curatedKey(s.artist, s.title) === key) ?? null
    } catch {
      continue // transient failure: don't cache a miss
    }
    songCache.set(cacheKey, song)
    if (song) found.push(song)
  }
  return found
}
