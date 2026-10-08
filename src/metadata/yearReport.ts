import type { Song } from '../subsonic/client'
import type { RecordingSource } from '.'

/** Where wrong-year reports go: a new issue on the project's tracker. */
export const NEW_ISSUE_URL = 'https://github.com/pLum0/subster/issues/new'

/** What the report says about the setup besides the song itself. */
export interface ReportContext {
  appVersion: string
  platform: string
  /** From the server's ping, when it answered. */
  server?: { type?: string; version?: string }
}

const SOURCE: Record<RecordingSource, string> = {
  server: "the server's MusicBrainz ID",
  isrc: "the file's ISRC",
  album: "the album's tracklist",
  albumSearch: 'a search on the album',
  deezerIsrc: "Deezer's ISRC",
  text: 'a search on artist + title',
}

const MODE: Record<string, string> = {
  full: 'Full',
  noRanking: 'No Deezer',
  offline: 'Offline (file year as-is)',
}

/** One table cell: pipes and line breaks would break the Markdown table. */
const cell = (v: string | number | undefined) =>
  v === undefined || v === '' ? '–' : String(v).replace(/\|/g, '\\|').replace(/\s+/g, ' ')

/** A fallback's answer: undefined = not asked, null = asked, nothing found. */
const answer = (v: number | null | undefined) =>
  v === undefined ? 'not asked' : v === null ? 'nothing found' : String(v)

export function yearReportTitle(song: Song): string {
  return `Wrong year: "${song.title}" by ${song.artist} (shown as ${song.year ?? '?'})`
}

/**
 * The issue body for a wrong year: the song as the server sent it, how the
 * year was found, and the setup. Holds no server address, user name or other
 * personal data — only what describes the song and the app.
 */
export function yearReportBody(song: Song, ctx: ReportContext): string {
  const info = song.yearInfo
  const trace = info?.trace
  const mbid = song.musicBrainzId
  const rows: Array<[string, string | number | undefined]> = [
    ['Title', song.title],
    ['Artist', song.artists?.length ? song.artists.join(' / ') : song.artist],
    ['Album', song.album],
    ['Year tag', info?.tagYear],
    ['Genre', song.genre],
    ['MusicBrainz recording ID', mbid],
    ['ISRC', song.isrc?.join(', ')],
  ]

  const how: string[] = [`- Metadata mode: ${info ? (MODE[info.mode] ?? info.mode) : 'unknown'}`]
  if (trace) {
    const rec = trace.recording
    how.push(
      rec
        ? `- Recording: [${rec.mbid}](https://musicbrainz.org/recording/${rec.mbid}), found via ` +
            `${SOURCE[rec.source]}; its own year: ${rec.year ?? 'none (compilations only, or no date)'}`
        : '- Recording: none found',
      `- Earliest-release search: ${answer(trace.earliest)}`,
      `- Wikidata: ${answer(trace.wikidata)}`,
      `- Release-group search: ${answer(trace.releaseGroup)}`,
    )
  }

  const server = ctx.server?.type
    ? `${ctx.server.type}${ctx.server.version ? ` ${ctx.server.version}` : ''}`
    : 'unknown'

  return [
    `**Year shown:** ${song.year ?? '?'}`,
    `**Year expected:** <!-- the right year, ideally with a source -->`,
    '',
    '### Song, as the server sends it',
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`),
    '',
    '### How Subster found the year',
    '',
    ...how,
    '',
    '### Setup',
    '',
    `- Subster ${ctx.appVersion} (${ctx.platform})`,
    `- Server: ${server}`,
    '',
    '### Full tag list (optional)',
    '',
    '<!-- Optional, and fine to add later, e.g. from a computer: the details above are often',
    '     enough, but the app only sees what your server sends. Paste every tag of the file,',
    '     e.g. the output of  ffprobe -hide_banner "song.mp3"  or  exiftool "song.mp3",',
    '     or everything your tag editor shows. -->',
    '',
  ].join('\n')
}

/** A link that opens a new issue with title and body already filled in. */
export function yearReportUrl(song: Song, body: string): string {
  const q = new URLSearchParams({ title: yearReportTitle(song), body })
  return `${NEW_ISSUE_URL}?${q.toString()}`
}
