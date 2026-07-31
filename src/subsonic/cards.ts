import type { Song } from './client'
import type { DeckOptions } from './deck'
import { resolveOriginalYear, type RecordingYear } from '../metadata'

/**
 * Build the per-song card maker for a deck configuration.
 *
 * In `full` and `noRanking` mode a card's year is corrected via
 * MusicBrainz/Wikidata (see resolveOriginalYear) and live recordings are
 * dropped — neither service is Deezer, so dropping the ranking does not cost
 * year accuracy. In `offline` mode the card uses the file-tag year as-is and
 * **no network request of any kind is made here** — that is the enforceable
 * half of the external-API-free guarantee (the other half is the deck builder
 * skipping Deezer, see gameStore). In every mode, yearless songs and songs
 * outside the configured year range yield `null`.
 */
export function cardMaker(deck: DeckOptions) {
  const online = (deck.metadataMode ?? 'full') !== 'offline'
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
