import { mainArtist, type Song } from '../subsonic/client'
import { trackIsrc } from './deezer'
import {
  earliestRecordingYear,
  recordingMbidFromAlbum,
  recordingMbidFromIsrc,
  recordingMbidFromText,
  yearFromRecordingMbid,
  yearFromReleaseGroupSearch,
  type RecordingYear,
} from './musicbrainz'
import { yearFromWikidata } from './wikidata'

export { searchTrack } from './deezer'
export type { RecordingYear } from './musicbrainz'

/** Which step found the recording the year was read from. */
export type RecordingSource = 'server' | 'isrc' | 'album' | 'albumSearch' | 'deezerIsrc' | 'text'

/**
 * How `resolveOriginalYear` arrived at its answer, for a wrong-year report:
 * the recording it settled on and what every source said. Not cached — it is
 * rebuilt from the (cached) answers of each step.
 */
export interface YearTrace {
  recording?: { mbid: string; source: RecordingSource; year?: number }
  // For each fallback: undefined = not asked, null = asked and found nothing.
  earliest?: number | null
  wikidata?: number | null
  releaseGroup?: number | null
}

export interface ResolvedYear extends RecordingYear {
  trace: YearTrace
}

/**
 * Resolve the original release year (and live-ness) for a song.
 *
 * First find a recording (the file's MBID, else ISRC / the album's tracklist /
 * Deezer-ISRC / fuzzy text) and read its earliest *studio* release-group date.
 * Libraries whose server never exposes MBIDs — every Nextcloud Music one — live
 * on the lower rungs, so the album rung matters there: it is what tells a
 * "Mothership" rip of *No Quarter* apart from the Page & Plant one. If the recording is
 * live, we say so (caller drops it). If it's compilation-only (no clean date),
 * fall back to a release-group search that finds the original single/album.
 * Returns `{ live: false }` with no year only when nothing resolves (caller
 * then keeps the server's tag year).
 */
export async function resolveOriginalYear(
  song: Song,
  deezerTrackId?: number,
): Promise<ResolvedYear> {
  const artist = mainArtist(song)
  const trace: YearTrace = {}
  let live = false
  const consider = async (
    mbid: string | undefined,
    source: RecordingSource,
  ): Promise<number | undefined> => {
    if (!mbid) return undefined
    const r = await yearFromRecordingMbid(mbid)
    if (r.live) live = true
    trace.recording = { mbid, source, year: r.year }
    return r.year
  }
  const done = (year: number | undefined) => year !== undefined || live

  // 1. Recording MBID straight from the server (best case).
  let year = await consider(song.musicBrainzId, 'server')

  // 2-5. Only if the server gave no MBID: resolve one from what the tags do
  // carry. Strongest first — an exact identifier, then the album (which says
  // *which* recording this is), then Deezer's ISRC, then bare text.
  if (!done(year) && !song.musicBrainzId) {
    for (const isrc of song.isrc ?? []) {
      year = await consider(await recordingMbidFromIsrc(isrc), 'isrc')
      if (done(year)) break
    }
  }
  if (!done(year) && !song.musicBrainzId && song.album) {
    year = await consider(await recordingMbidFromAlbum(artist, song.title, song.album), 'album')
    if (!done(year)) {
      year = await consider(await recordingMbidFromText(artist, song.title, song.album), 'albumSearch')
    }
  }
  if (!done(year) && !song.musicBrainzId && deezerTrackId) {
    for (const isrc of await trackIsrc(deezerTrackId)) {
      year = await consider(await recordingMbidFromIsrc(isrc), 'deezerIsrc')
      if (done(year)) break
    }
  }
  if (!done(year) && !song.musicBrainzId) {
    year = await consider(await recordingMbidFromText(artist, song.title), 'text')
  }

  if (live) return { live: true, trace }

  // 5. Refine with the earliest recording year (MusicBrainz), which corrects
  // files tagged with a later comp/mix year (e.g. a "Butch Vig Mix" off a 2004
  // compilation → the song's 1991 first release).
  //
  // Only when MusicBrainz has NO clean studio year from the recording's own
  // release-groups (`year` is undefined) is the song likely old / comp-only /
  // poorly catalogued — the case where Wikidata's published year helps (e.g. a
  // 1936 chanson MusicBrainz dates 1992). Gating on that keeps the common,
  // well-tagged song at zero extra fetches. min() only moves the year earlier.
  const [searchYear, wdYear] = await Promise.all([
    earliestRecordingYear(artist, song.title),
    year === undefined ? yearFromWikidata(artist, song.title) : Promise.resolve(undefined),
  ])
  trace.earliest = searchYear ?? null
  if (year === undefined) trace.wikidata = wdYear ?? null
  const candidates = [year, searchYear, wdYear].filter((y): y is number => y !== undefined)
  if (candidates.length) return { year: Math.min(...candidates), live: false, trace }

  // 6. Still nothing → original release-group search (singles named after the song).
  const rgYear = await yearFromReleaseGroupSearch(artist, song.title)
  trace.releaseGroup = rgYear ?? null
  return { year: rgYear, live: false, trace }
}
