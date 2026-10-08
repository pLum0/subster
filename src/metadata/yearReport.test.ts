import { describe, expect, it } from 'vitest'
import type { Song } from '../subsonic/client'
import { NEW_ISSUE_URL, yearReportBody, yearReportTitle, yearReportUrl } from './yearReport'

const getBack: Song = {
  id: 'abc',
  title: 'Get Back',
  artist: 'The Beatles',
  album: '1',
  year: 2003,
  genre: 'Rock',
  musicBrainzId: 'b2d2881c-d968-4926-82de-de874d37eea7',
  isrc: ['GBAYE0000941'],
  yearInfo: {
    mode: 'full',
    tagYear: 2000,
    trace: {
      recording: { mbid: 'b2d2881c-d968-4926-82de-de874d37eea7', source: 'server' },
      earliest: 2003,
      wikidata: null,
    },
  },
}

const ctx = { appVersion: '0.2.1', platform: 'Android', server: { type: 'navidrome', version: '0.53.3' } }

describe('yearReport', () => {
  it('names the song and the year it showed', () => {
    expect(yearReportTitle(getBack)).toBe('Wrong year: "Get Back" by The Beatles (shown as 2003)')
  })

  it('carries the tags, how the year was found, and the setup', () => {
    const body = yearReportBody(getBack, ctx)
    expect(body).toContain('**Year shown:** 2003')
    expect(body).toContain('| Year tag | 2000 |')
    expect(body).toContain('| ISRC | GBAYE0000941 |')
    expect(body).toContain('- Metadata mode: Full')
    expect(body).toContain(
      "[b2d2881c-d968-4926-82de-de874d37eea7](https://musicbrainz.org/recording/b2d2881c-d968-4926-82de-de874d37eea7), found via the server's MusicBrainz ID",
    )
    expect(body).toContain('- Earliest-release search: 2003')
    expect(body).toContain('- Wikidata: nothing found')
    expect(body).toContain('- Release-group search: not asked')
    expect(body).toContain('- Subster 0.2.1 (Android)')
    expect(body).toContain('- Server: navidrome 0.53.3')
    expect(body).toContain('### Full tag list (optional)')
  })

  it('keeps a pipe in a title from breaking the table', () => {
    const body = yearReportBody({ ...getBack, title: 'A | B' }, ctx)
    expect(body).toContain('| Title | A \\| B |')
  })

  it('says offline cards used the tag as-is and lists no lookups', () => {
    const body = yearReportBody({ ...getBack, yearInfo: { mode: 'offline', tagYear: 2000 } }, ctx)
    expect(body).toContain('- Metadata mode: Offline (file year as-is)')
    expect(body).not.toContain('Earliest-release search')
  })

  it('builds a prefilled new-issue link', () => {
    const url = new URL(yearReportUrl(getBack, 'body text'))
    expect(`${url.origin}${url.pathname}`).toBe(NEW_ISSUE_URL)
    expect(url.searchParams.get('title')).toBe(yearReportTitle(getBack))
    expect(url.searchParams.get('body')).toBe('body text')
  })
})
