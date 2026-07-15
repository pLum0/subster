import { JsonCache } from '../lib/cache'
import { rateLimit } from '../lib/throttle'

/**
 * MusicBrainz is our original-year source. We take the earliest first-release
 * date across a recording's release-*groups*, but only **studio** ones — we
 * skip Compilation and Live release-groups, because a "Greatest Hits" or an OST
 * reissue carries a late date that isn't the song's real origin. When a file's
 * recording is linked *only* to compilations (so there's no clean date at all),
 * the caller falls back to `yearFromReleaseGroupSearch`, which finds the
 * original single/album release-group directly.
 * MusicBrainz sends `Access-Control-Allow-Origin: *`; rate-limited to ~1 req/s.
 */
const MB = 'https://musicbrainz.org/ws/2'

/** Original-year lookup result: year (if a clean studio release exists) + live flag. */
export interface RecordingYear {
  year?: number
  live: boolean
}

const yearByMbid = new JsonCache<RecordingYear>('mb-year-v3')
const yearByRgSearch = new JsonCache<number | null>('mb-rg-year')
const earliestByText = new JsonCache<number | null>('mb-earliest-v1')
const mbidByIsrc = new JsonCache<string | null>('mb-isrc')
const mbidByText = new JsonCache<string | null>('mb-text')

// MusicBrainz asks clients to identify themselves (rate-limit policy). Browsers
// silently drop the forbidden User-Agent header, so this only takes effect in
// the Capacitor native-HTTP path.
const USER_AGENT = 'Subster/0.1.0 (+https://github.com/pLum0/subster)'

const throttled = rateLimit(
  (url: string) =>
    fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }),
  1100,
)

export function yearOf(date: string | undefined): number | undefined {
  const m = /^(\d{4})/.exec(date ?? '')
  return m ? Number(m[1]) : undefined
}

interface RecordingLookup {
  title?: string
  disambiguation?: string
  releases?: Array<{
    date?: string
    'release-group'?: { 'first-release-date'?: string; 'secondary-types'?: string[] }
  }>
}

export function looksLive(text: string | undefined): boolean {
  return /\b(live|unplugged|concert|konzert|koncert|en vivo|en directo|dal vivo)\b/i.test(text ?? '')
}
interface IsrcLookup {
  recordings?: Array<{ id: string }>
}
interface RecordingSearch {
  recordings?: Array<{ id: string; score?: number; 'artist-credit'?: Array<{ name?: string }> }>
}

interface RgSearch {
  'release-groups'?: Array<{
    score?: number
    title?: string
    'first-release-date'?: string
    'secondary-types'?: string[]
  }>
}

const isCompOrLive = (types: string[] | undefined) =>
  (types ?? []).some((t) => /compilation|live/i.test(t))

// Match-time normalizer. Kept separate from curated.ts's norm() (which also
// strips articles/parentheticals) and from deezer.ts's cache key on purpose:
// each serves a different matching contract, and the `${artist}::${title}`
// keys below are persisted cache keys that must stay byte-stable.
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Original year for a recording MBID. Uses the earliest **studio** (non-comp,
 * non-live) release-group date; returns no year if the recording only appears
 * on compilations (caller then tries the release-group search). Also flags live
 * recordings (title/disambiguation, or all its releases being live).
 */
export async function yearFromRecordingMbid(mbid: string): Promise<RecordingYear> {
  const cached = yearByMbid.get(mbid)
  if (cached !== undefined) return cached

  let result: RecordingYear = { live: false }
  try {
    const res = await throttled(`${MB}/recording/${mbid}?inc=releases+release-groups&fmt=json`)
    if (!res.ok) return { live: false } // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as RecordingLookup
    const rels = (data.releases ?? []).map((r) => ({
      year: yearOf(r['release-group']?.['first-release-date']) ?? yearOf(r.date),
      types: r['release-group']?.['secondary-types'],
    }))
    const cleanYears = rels
      .filter((r) => r.year !== undefined && !isCompOrLive(r.types))
      .map((r) => r.year as number)
    const dated = rels.filter((r) => r.year !== undefined)

    const titleLive = looksLive(data.title) || looksLive(data.disambiguation)
    const allLive = dated.length > 0 && dated.every((r) => (r.types ?? []).some((t) => /live/i.test(t)))

    result = {
      year: cleanYears.length ? Math.min(...cleanYears) : undefined,
      live: titleLive || allLive,
    }
  } catch {
    return { live: false } // transient failure: don't cache
  }
  yearByMbid.set(mbid, result)
  return result
}

/**
 * Fallback: find a song's original year by searching release-*groups* for the
 * artist + title and taking the earliest dated non-comp/non-live one. This
 * surfaces the original single/album even when the file's recording is only
 * linked to compilations (e.g. an OST or Greatest-Hits rip).
 */
export async function yearFromReleaseGroupSearch(
  artist: string,
  title: string,
): Promise<number | undefined> {
  const key = `${artist}::${title}`.toLowerCase().replace(/\s+/g, ' ').trim()
  const cached = yearByRgSearch.get(key)
  if (cached !== undefined) return cached ?? undefined

  const esc = (s: string) => s.replace(/(["\\])/g, '\\$1')
  const query = `artist:"${esc(artist)}" AND releasegroup:"${esc(title)}"`
  const wanted = normalize(title)
  let year: number | undefined
  try {
    const res = await throttled(
      `${MB}/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=25`,
    )
    if (!res.ok) return undefined // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as RgSearch
    const years = (data['release-groups'] ?? [])
      .filter((rg) => {
        if (isCompOrLive(rg['secondary-types'])) return false
        // Match by title containment (catches "Song / B-side" singles etc.)
        // rather than a brittle score cutoff.
        const rgTitle = normalize(rg.title ?? '')
        return rgTitle.includes(wanted) || wanted.includes(rgTitle)
      })
      .map((rg) => yearOf(rg['first-release-date']))
      .filter((y): y is number => y !== undefined)
    if (years.length) year = Math.min(...years)
  } catch {
    return undefined
  }
  yearByRgSearch.set(key, year ?? null)
  return year
}

interface RecSearchFull {
  recordings?: Array<{
    id: string
    score?: number
    title?: string
    disambiguation?: string
    'artist-credit'?: Array<{ name?: string }>
    releases?: Array<{
      date?: string
      'release-group'?: {
        'primary-type'?: string
        'secondary-types'?: string[]
        'first-release-date'?: string
      }
    }>
  }>
}

/**
 * The earliest **studio** year across *all* recordings of a song (matched by
 * exact title + artist), taken from one recording search. This is the reliable
 * "original year" lower bound: a file might be a legit later reissue recording
 * (e.g. "Let It Be… Naked", 2003, a real Album — so the per-recording lookup
 * correctly returns 2003), but the *song* first appeared in 1970. The caller
 * takes `min(recordingYear, earliestStudioYear)`, which can only pull the year
 * earlier; constrained to same-title/same-artist studio releases, an earlier
 * match is virtually always the true original, so it never goes wrong-late.
 */
export async function earliestStudioYear(
  artist: string,
  title: string,
): Promise<number | undefined> {
  const key = `${artist}::${title}`.toLowerCase().replace(/\s+/g, ' ').trim()
  const cached = earliestByText.get(key)
  if (cached !== undefined) return cached ?? undefined

  const want = normalize(title)
  const wantArtist = artist.toLowerCase()
  const esc = (s: string) => s.replace(/(["\\])/g, '\\$1')
  const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}"`
  let year: number | undefined
  try {
    const res = await throttled(
      `${MB}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=100`,
    )
    if (!res.ok) return undefined // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as RecSearchFull
    const years: number[] = []
    for (const rec of data.recordings ?? []) {
      if ((rec.score ?? 0) < 90) continue
      if (normalize(rec.title ?? '') !== want) continue
      if (looksLive(rec.title) || looksLive(rec.disambiguation)) continue
      const credited = (rec['artist-credit'] ?? []).some((c) =>
        (c.name ?? '').toLowerCase().includes(wantArtist),
      )
      if (!credited) continue
      for (const rel of rec.releases ?? []) {
        const rg = rel['release-group']
        if (isCompOrLive(rg?.['secondary-types'])) continue
        const pt = rg?.['primary-type']
        if (pt && !/album|single|ep/i.test(pt)) continue
        const y = yearOf(rel.date) ?? yearOf(rg?.['first-release-date'])
        if (y) years.push(y)
      }
    }
    if (years.length) year = Math.min(...years)
  } catch {
    return undefined
  }
  earliestByText.set(key, year ?? null)
  return year
}

/** Resolve a recording MBID from an ISRC (exact). */
export async function recordingMbidFromIsrc(isrc: string): Promise<string | undefined> {
  const cached = mbidByIsrc.get(isrc)
  if (cached !== undefined) return cached ?? undefined

  let mbid: string | undefined
  try {
    const res = await throttled(`${MB}/isrc/${encodeURIComponent(isrc)}?fmt=json`)
    if (!res.ok) return undefined // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as IsrcLookup
    mbid = data.recordings?.[0]?.id
  } catch {
    return undefined
  }
  mbidByIsrc.set(isrc, mbid ?? null)
  return mbid
}

/** Last-resort fuzzy match: recording MBID from artist/title text (unreliable). */
export async function recordingMbidFromText(
  artist: string,
  title: string,
): Promise<string | undefined> {
  const k = `${artist}::${title}`.toLowerCase().replace(/\s+/g, ' ').trim()
  const cached = mbidByText.get(k)
  if (cached !== undefined) return cached ?? undefined

  const esc = (s: string) => s.replace(/(["\\])/g, '\\$1')
  const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}"`
  let mbid: string | undefined
  try {
    const res = await throttled(`${MB}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=3`)
    if (!res.ok) return undefined // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as RecordingSearch
    const best = data.recordings?.find(
      (r) => (r.score ?? 0) >= 90 && r['artist-credit']?.[0]?.name?.toLowerCase().includes(artist.toLowerCase()),
    )
    mbid = best?.id
  } catch {
    return undefined
  }
  mbidByText.set(k, mbid ?? null)
  return mbid
}
