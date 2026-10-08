import type { Song } from './client'
import type { DeckOptions, MetadataMode } from './deck'
import { resolveOriginalYear, type ResolvedYear, type YearTrace } from '../metadata'

/** How a card's year was found, kept on the card for a wrong-year report. */
export interface YearInfo {
  mode: MetadataMode
  /** The file's own year tag, as the server sent it. */
  tagYear?: number
  /** Online only: what each source said (see resolveOriginalYear). */
  trace?: YearTrace
}

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
  const mode = deck.metadataMode ?? 'full'
  const online = mode !== 'offline'
  return async function makeCard(song: Song, deezerId?: number): Promise<Song | null> {
    const resolved: ResolvedYear | undefined = online
      ? await resolveOriginalYear(song, deezerId)
      : undefined
    if (resolved?.live) return null
    // Online, an unresolved year means neither MusicBrainz nor Wikidata knows
    // this recording, and the file's own tag is not a safe stand-in: measured
    // over hand-verified years it is wrong on nearly a quarter of songs,
    // almost always naming the compilation or album it was ripped from. A
    // wrong year makes a placement objectively wrong and the round
    // unwinnable, while a missing song only makes the deck shorter — so drop
    // it. Offline is the exception: there the tag is the only source we have.
    const year = resolved ? resolved.year : song.year
    if (!year || year <= 0) return null
    if (deck.yearFrom && year < deck.yearFrom) return null
    if (deck.yearTo && year > deck.yearTo) return null
    return { ...song, year, yearInfo: { mode, tagYear: song.year, trace: resolved?.trace } }
  }
}
