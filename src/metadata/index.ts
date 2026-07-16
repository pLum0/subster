import type { Song } from '../subsonic/client'
import { trackIsrc } from './deezer'
import {
  earliestRecordingYear,
  recordingMbidFromIsrc,
  recordingMbidFromText,
  yearFromRecordingMbid,
  yearFromReleaseGroupSearch,
  type RecordingYear,
} from './musicbrainz'
import { yearFromWikidata } from './wikidata'

export { searchTrack } from './deezer'
export type { RecordingYear } from './musicbrainz'

/**
 * Resolve the original release year (and live-ness) for a song.
 *
 * First find a recording (the file's MBID, else ISRC / Deezer-ISRC / fuzzy
 * text) and read its earliest *studio* release-group date. If the recording is
 * live, we say so (caller drops it). If it's compilation-only (no clean date),
 * fall back to a release-group search that finds the original single/album.
 * Returns `{ live: false }` with no year only when nothing resolves (caller
 * then keeps the server's tag year).
 */
export async function resolveOriginalYear(
  song: Song,
  deezerTrackId?: number,
): Promise<RecordingYear> {
  let live = false
  const consider = async (mbid: string | undefined): Promise<number | undefined> => {
    if (!mbid) return undefined
    const r = await yearFromRecordingMbid(mbid)
    if (r.live) live = true
    return r.year
  }
  const done = (year: number | undefined) => year !== undefined || live

  // 1. Recording MBID straight from the server (best case).
  let year = await consider(song.musicBrainzId)

  // 2-4. Only if the server gave no MBID: resolve one via ISRC / Deezer / text.
  if (!done(year) && !song.musicBrainzId) {
    for (const isrc of song.isrc ?? []) {
      year = await consider(await recordingMbidFromIsrc(isrc))
      if (done(year)) break
    }
  }
  if (!done(year) && !song.musicBrainzId && deezerTrackId) {
    for (const isrc of await trackIsrc(deezerTrackId)) {
      year = await consider(await recordingMbidFromIsrc(isrc))
      if (done(year)) break
    }
  }
  if (!done(year) && !song.musicBrainzId) {
    year = await consider(await recordingMbidFromText(song.artist, song.title))
  }

  if (live) return { live: true }

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
    earliestRecordingYear(song.artist, song.title),
    year === undefined ? yearFromWikidata(song.artist, song.title) : Promise.resolve(undefined),
  ])
  const candidates = [year, searchYear, wdYear].filter((y): y is number => y !== undefined)
  if (candidates.length) return { year: Math.min(...candidates), live: false }

  // 6. Still nothing → original release-group search (singles named after the song).
  const rgYear = await yearFromReleaseGroupSearch(song.artist, song.title)
  return { year: rgYear, live: false }
}
