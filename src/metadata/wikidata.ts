import { JsonCache } from '../lib/cache'
import { rateLimit } from '../lib/throttle'

/**
 * Wikidata is a supplementary original-year source for songs whose MusicBrainz
 * data only has late reissue dates — typically pre-war or otherwise poorly
 * catalogued tracks (e.g. Jean Sablon's "Vous qui passez sans me voir", which
 * MusicBrainz dates 1992 but Wikidata publishes as 1936). It's free, needs no
 * auth, and returns `Access-Control-Allow-Origin: *`, so it also works in a
 * plain browser build (unlike Deezer).
 *
 * Matching is deliberately strict: many songs share a title (Wikidata has a
 * 2007 "De temps en temps" by Grégory Lemarchal that is NOT Joséphine Baker's),
 * so a candidate must (a) have the exact base title, (b) mention the artist in
 * its description, and (c) be typed as a song/single/composition. On any doubt
 * we return nothing rather than risk a wrong-early year.
 */
const WD = 'https://www.wikidata.org/w/api.php'

// Wikidata "instance of" (P31) classes that count as a song/recording/release.
const SONG_TYPES = new Set([
  'Q7366', // song
  'Q134556', // single
  'Q207628', // musical composition
  'Q2188189', // musical work
  'Q105543609', // musical work/composition
  'Q4132319', // composition
])

const yearCache = new JsonCache<number | null>('wd-year-v1')

// Wikimedia asks CORS clients to identify via Api-User-Agent (the real
// User-Agent header is forbidden in browsers; harmless to also send natively).
const UA = 'Subster/0.1.0 (+https://github.com/pLum0/subster)'
const throttled = rateLimit(
  (url: string) =>
    fetch(url, { headers: { Accept: 'application/json', 'Api-User-Agent': UA, 'User-Agent': UA } }),
  300,
)

/** Lowercase, strip diacritics + punctuation — so "Joséphine" matches "josephine". */
function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Drop "(… Mix)", "[Remastered]", " - Single Version" qualifiers. */
function stripQualifiers(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s[-–—]\s.*$/, ' ')
    .trim()
}

interface SearchResult {
  search?: Array<{ id: string; label?: string; description?: string }>
}
interface Snak {
  mainsnak?: { datavalue?: { value?: { id?: string; time?: string } } }
}
interface Entities {
  entities?: Record<string, { claims?: Record<string, Snak[]> }>
}

/** Original publication/inception year for a song, or undefined if not found. */
export async function yearFromWikidata(artist: string, title: string): Promise<number | undefined> {
  const key = `${artist}::${title}`.toLowerCase().replace(/\s+/g, ' ').trim()
  const cached = yearCache.get(key)
  if (cached !== undefined) return cached ?? undefined

  const wantTitle = norm(stripQualifiers(title))
  const wantArtist = norm(artist)
  if (!wantTitle || !wantArtist) return undefined

  let year: number | undefined
  try {
    const term = encodeURIComponent(stripQualifiers(title) || title)
    const sres = await throttled(
      `${WD}?action=wbsearchentities&search=${term}&language=en&uselang=en&format=json&limit=10&origin=*`,
    )
    if (!sres.ok) return undefined // don't poison the cache on a transient error
    const sdata = (await sres.json()) as SearchResult
    // Keep only candidates whose title matches AND whose description names the
    // artist (rejects same-title songs by someone else).
    const ids = (sdata.search ?? [])
      .filter(
        (e) =>
          norm(stripQualifiers(e.label ?? '')) === wantTitle &&
          norm(e.description ?? '').includes(wantArtist),
      )
      .map((e) => e.id)
      .slice(0, 5)
    if (!ids.length) {
      yearCache.set(key, null)
      return undefined
    }

    const eres = await throttled(
      `${WD}?action=wbgetentities&ids=${ids.join('%7C')}&props=claims&format=json&origin=*`,
    )
    if (!eres.ok) return undefined
    const edata = (await eres.json()) as Entities
    const years: number[] = []
    for (const id of ids) {
      const claims = edata.entities?.[id]?.claims
      if (!claims) continue
      const types = (claims['P31'] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id)
      if (!types.some((q) => q && SONG_TYPES.has(q))) continue
      for (const prop of ['P577', 'P571'] as const) {
        for (const c of claims[prop] ?? []) {
          const m = /^\+?(\d{4})/.exec(c.mainsnak?.datavalue?.value?.time ?? '')
          if (m) years.push(Number(m[1]))
        }
      }
    }
    if (years.length) year = Math.min(...years)
  } catch {
    return undefined
  }
  yearCache.set(key, year ?? null)
  return year
}
