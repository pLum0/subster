import type { Song } from './client'
import type { DeckOptions } from './deck'
import { resolveOriginalYear, type RecordingYear } from '../metadata'

/**
 * Build the per-song card maker for a deck configuration.
 *
 * With `onlineMeta` on (default), a card's year is corrected via
 * MusicBrainz/Wikidata (see resolveOriginalYear) and live recordings are
 * dropped. With it off, the card uses the file-tag year as-is and **no
 * network request of any kind is made here** — that is the enforceable half
 * of the external-API-free guarantee (the other half is the deck builder
 * skipping Deezer, see gameStore). Either way, yearless songs and songs
 * outside the configured year range yield `null`.
 */
export function cardMaker(deck: DeckOptions) {
  const online = deck.onlineMeta !== false
  return async function makeCard(song: Song, deezerId?: number): Promise<Song | null> {
    const resolved: RecordingYear = online
      ? await resolveOriginalYear(song, deezerId)
      : { live: false }
    if (resolved.live) return null
    const year = resolved.year ?? song.year
    if (!year || year <= 0) return null
    if (deck.yearFrom && year < deck.yearFrom) return null
    if (deck.yearTo && year > deck.yearTo) return null
    return { ...song, year }
  }
}
