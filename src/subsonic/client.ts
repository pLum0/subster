import md5 from 'blueimp-md5'
import type { ServerConfig } from '../store/configStore'
import type { YearInfo } from './cards'

const API_VERSION = '1.16.1'
const CLIENT_NAME = 'subster'

/** A single track from the Subsonic library — one "card" in the game. */
export interface Song {
  id: string
  title: string
  artist: string
  album?: string
  year?: number
  genre?: string
  duration?: number
  coverArt?: string
  /**
   * Every credited artist, when the server lists them (OpenSubsonic). With a
   * multi-valued artist tag, `artist` is these joined for display, e.g.
   * Navidrome's "Bruno Mars • Lupe Fiasco" — see mainArtist.
   */
  artists?: string[]
  /** OpenSubsonic recording MusicBrainz ID, when the server exposes it. */
  musicBrainzId?: string
  /** OpenSubsonic ISRC(s) — the server may return several. */
  isrc?: string[]
  /** Whether the song is starred ("Liked Songs" / favorites) on the server. */
  starred?: boolean
  /** How the card's year was found; set by cardMaker for wrong-year reports. */
  yearInfo?: YearInfo
}

export interface Genre {
  name: string
  songCount: number
}

export interface MusicFolder {
  id: string
  name: string
}

export interface Playlist {
  id: string
  name: string
  songCount: number
}

export interface GetRandomSongsOptions {
  size?: number
  fromYear?: number
  toYear?: number
  genre?: string
  musicFolderId?: string
}

/** Result of a connection test. */
export type PingResult =
  | { ok: true; serverVersion?: string; type?: string }
  | { ok: false; error: string; kind: 'auth' | 'network' | 'server'; code?: number }

/**
 * Derive Subsonic token auth from a plaintext password. Generates a random
 * salt and returns `{ salt, token }` where `token = md5(password + salt)`.
 * The raw password is never stored — only this pair (see ServerConfig).
 */
export function deriveAuth(password: string): { salt: string; token: string } {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return { salt, token: md5(password + salt) }
}

/** Hex-encode for the `p=enc:…` form, which survives any character safely. */
function hexEncode(value: string): string {
  return Array.from(new TextEncoder().encode(value), (b) => b.toString(16).padStart(2, '0')).join('')
}

function authParams(config: ServerConfig): Record<string, string> {
  const common = { u: config.username, v: API_VERSION, c: CLIENT_NAME, f: 'json' }
  // Legacy plain-password auth, only for servers that refuse the token scheme.
  return config.password
    ? { ...common, p: `enc:${hexEncode(config.password)}` }
    : { ...common, t: config.token, s: config.salt }
}

/** Normalize a base URL and build a fully-authenticated endpoint URL. */
export function buildUrl(
  config: ServerConfig,
  endpoint: string,
  params: Record<string, string | number | undefined | Array<string | number>> = {},
): string {
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = new URL(`${base}/rest/${endpoint}`)
  const all = { ...authParams(config), ...params }
  for (const [key, value] of Object.entries(all)) {
    if (value === undefined || value === '') continue
    // Arrays become repeated params (e.g. several songIndexToRemove).
    if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, String(v))
    else url.searchParams.set(key, String(value))
  }
  return url.toString()
}

/** URL for streaming a song into an <audio> element (no CORS needed). */
export function streamUrl(config: ServerConfig, id: string): string {
  return buildUrl(config, 'stream.view', { id })
}

/** URL for a cover-art image into an <img> element (no CORS needed). */
export function coverArtUrl(config: ServerConfig, id: string, size?: number): string {
  return buildUrl(config, 'getCoverArt.view', { id, size })
}

interface SubsonicEnvelope {
  'subsonic-response'?: {
    status: 'ok' | 'failed'
    version?: string
    type?: string
    error?: { code: number; message: string }
    randomSongs?: { song?: RawSong[] }
    searchResult3?: {
      song?: RawSong[]
      artist?: Array<{ id: string | number; name?: string }>
      album?: Array<{ id: string | number; name?: string; artist?: string }>
    }
    song?: RawSong
    artists?: { index?: Array<{ artist?: Array<{ id: string | number; name?: string }> }> }
    genres?: { genre?: RawGenre[] }
    musicFolders?: { musicFolder?: Array<{ id: string | number; name?: string }> }
    albumList2?: { album?: Array<{ songCount?: number }> }
    playlists?: { playlist?: RawPlaylist[] }
    playlist?: RawPlaylist & { entry?: RawSong[] }
  }
}

interface RawPlaylist {
  id: string | number
  name?: string
  songCount?: number
}

interface RawSong {
  id: string
  title?: string
  artist?: string
  album?: string
  year?: number
  genre?: string
  duration?: number
  coverArt?: string
  musicBrainzId?: string
  artists?: Array<{ id?: string; name?: string }>
  // OpenSubsonic may return isrc as a string or an array of strings.
  isrc?: string | string[]
  // ISO timestamp when starred, absent otherwise.
  starred?: string
}

interface RawGenre {
  value?: string
  songCount?: number
}

/**
 * Lets configStore — which owns the local-vs-remote decision — steer requests
 * without this module importing it (the dependency runs the other way).
 */
export interface AddressPolicy {
  /**
   * Map a possibly-stale config onto the address that is current *now*. Callers
   * capture a config once and may then run for minutes (the deck producer), so
   * without this every later request would re-probe an address we already know
   * is dead and pay the timeout again.
   */
  current(config: ServerConfig): ServerConfig
  /**
   * A request just failed at the transport layer. Return a replacement address
   * to retry once against, or null to let the failure stand.
   */
  onFailure(config: ServerConfig): ServerConfig | null
}

let addressPolicy: AddressPolicy | null = null

export function setAddressPolicy(policy: AddressPolicy | null): void {
  addressPolicy = policy
}

/** A request that never settles is worse than one that fails outright. */
const REQUEST_TIMEOUT_MS = 30_000
/**
 * Probing the LAN address gets a much shorter leash: off the home network the
 * socket typically hangs unanswered rather than being refused, and the user is
 * watching a spinner while it does. A LAN server that cannot answer in this
 * long is not the fast path we picked it for anyway.
 */
const LAN_PROBE_TIMEOUT_MS = 6_000

/**
 * `fetch` with a hard deadline. The AbortController alone is not enough:
 * Capacitor's native HTTP layer does not honour AbortSignal, so the race is
 * what actually bounds the wait — the signal just releases the browser path.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort()
          reject(new Error(`Request timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Perform an authenticated JSON API call. Throws a tagged error on transport
 * failure (network/CORS/timeout) or a Subsonic `failed` response.
 */
async function apiFetch(
  config: ServerConfig,
  endpoint: string,
  params: Record<string, string | number | undefined | Array<string | number>> = {},
): Promise<NonNullable<SubsonicEnvelope['subsonic-response']>> {
  const target = addressPolicy?.current(config) ?? config
  const onLan = !!target.localBaseUrl && target.baseUrl === target.localBaseUrl
  let res: Response
  try {
    res = await fetchWithTimeout(
      buildUrl(target, endpoint, params),
      onLan && addressPolicy ? LAN_PROBE_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    )
  } catch (e) {
    // A cross-origin fetch blocked by CORS lands here as a TypeError; a LAN
    // address left behind when the phone moved to mobile data lands here as a
    // timeout. Either way, give the address owner a chance to hand us another
    // one and retry, so the switch stays invisible to the user.
    const fallback = addressPolicy?.onFailure(target) ?? null
    if (!fallback) throw new ApiError('network', (e as Error).message || 'Network request failed')
    try {
      res = await fetchWithTimeout(buildUrl(fallback, endpoint, params), REQUEST_TIMEOUT_MS)
    } catch (retryError) {
      throw new ApiError('network', (retryError as Error).message || 'Network request failed')
    }
  }
  if (!res.ok) throw new ApiError('server', `HTTP ${res.status} ${res.statusText}`)

  let json: SubsonicEnvelope
  try {
    json = (await res.json()) as SubsonicEnvelope
  } catch {
    throw new ApiError('server', 'Response was not valid JSON (is this a Subsonic server?)')
  }
  const body = json['subsonic-response']
  if (!body) throw new ApiError('server', 'Missing subsonic-response envelope')
  if (body.status === 'failed') {
    const code = body.error?.code
    const kind = code === 40 ? 'auth' : 'server'
    throw new ApiError(kind, body.error?.message || 'Subsonic request failed', code)
  }
  return body
}

export class ApiError extends Error {
  constructor(
    public kind: 'auth' | 'network' | 'server',
    message: string,
    /** Subsonic error code, when the failure came from the server. */
    public code?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Subsonic error 41 — the server only accepts the legacy password scheme. */
export const TOKEN_AUTH_UNSUPPORTED = 41

/** Subsonic error 70 — the requested item doesn't exist (e.g. a stale song id). */
export const NOT_FOUND = 70

/**
 * The artist to look a song up by, and to tell artists apart in a deck. With
 * several credited, the first: a joined credit like "Bruno Mars • Lupe Fiasco"
 * matches nothing on MusicBrainz or in the famous-songs list, while "Bruno
 * Mars" does. The display keeps the full credit.
 */
export function mainArtist(song: Pick<Song, 'artist' | 'artists'>): string {
  return song.artists && song.artists.length > 1 ? (song.artists[0] as string) : song.artist
}

function toSong(raw: RawSong): Song {
  return {
    id: raw.id,
    title: raw.title ?? 'Unknown title',
    artist: raw.artist ?? 'Unknown artist',
    album: raw.album,
    year: typeof raw.year === 'number' ? raw.year : undefined,
    genre: raw.genre,
    duration: raw.duration,
    coverArt: raw.coverArt,
    artists: raw.artists?.map((a) => a.name ?? '').filter(Boolean),
    musicBrainzId: raw.musicBrainzId,
    isrc: raw.isrc ? (Array.isArray(raw.isrc) ? raw.isrc : [raw.isrc]) : undefined,
    starred: raw.starred != null || undefined,
  }
}

/**
 * Test the connection and credentials. Never throws — returns a PingResult.
 * `error` is the raw transport/server message; the UI localizes the common
 * cases via `kind` (e.g. network → CORS hint).
 */
export async function ping(config: ServerConfig): Promise<PingResult> {
  try {
    const body = await apiFetch(config, 'ping.view')
    return { ok: true, serverVersion: body.version, type: body.type }
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, error: e.message, kind: e.kind, code: e.code }
    }
    return { ok: false, error: (e as Error).message, kind: 'network' }
  }
}

/**
 * Test a server and hand back the config that actually authenticates.
 *
 * Token auth is tried first and is what almost every server wants. Only when
 * one refuses it outright (error 41 — Nextcloud Music) do we fall back to
 * sending the password, because that stores the password itself on the device
 * instead of a value derived from it. Never throws.
 */
export async function connect(
  base: Omit<ServerConfig, 'salt' | 'token' | 'password'>,
  password: string,
): Promise<{ ok: true; config: ServerConfig } | Extract<PingResult, { ok: false }>> {
  const withToken: ServerConfig = { ...base, ...deriveAuth(password) }
  const tokenAttempt = await ping(withToken)
  if (tokenAttempt.ok) return { ok: true, config: withToken }
  if (tokenAttempt.code !== TOKEN_AUTH_UNSUPPORTED) return tokenAttempt

  const withPassword: ServerConfig = { ...withToken, password }
  const passwordAttempt = await ping(withPassword)
  return passwordAttempt.ok ? { ok: true, config: withPassword } : passwordAttempt
}

export async function getRandomSongs(
  config: ServerConfig,
  options: GetRandomSongsOptions = {},
): Promise<Song[]> {
  const body = await apiFetch(config, 'getRandomSongs.view', {
    size: options.size ?? 100,
    fromYear: options.fromYear,
    toYear: options.toYear,
    genre: options.genre,
    musicFolderId: options.musicFolderId,
  })
  return (body.randomSongs?.song ?? []).map(toSong)
}

const ALBUM_PAGE = 500

/**
 * How many songs a library holds. Subsonic has no direct count, so it adds up
 * the library's albums, a page of 500 at a time. A huge library stops at
 * `maxPages` (5,000 albums by default) and reports what was counted: enough
 * to know it is huge, which is all its callers need.
 */
export async function librarySongCount(
  config: ServerConfig,
  musicFolderId: string,
  maxPages = 10,
): Promise<number> {
  let total = 0
  for (let page = 0; page < maxPages; page++) {
    const body = await apiFetch(config, 'getAlbumList2.view', {
      type: 'alphabeticalByName',
      size: ALBUM_PAGE,
      offset: page * ALBUM_PAGE,
      musicFolderId,
    })
    const albums = body.albumList2?.album ?? []
    for (const album of albums) total += album.songCount ?? 0
    if (albums.length < ALBUM_PAGE) break
  }
  return total
}

/**
 * Why a song's stream failed, as far as the server can tell: it no longer
 * knows the id, it couldn't be reached (or refused us), or it serves the song
 * fine — so the file itself won't decode.
 */
export type StreamFailure = 'missing' | 'unreachable' | 'undecodable'

/**
 * Classify a failed stream. An `<audio>` element reports every failure —
 * HTTP error, Subsonic error, undecodable file — as the same opaque error, so
 * ask the server about the song directly.
 */
export async function diagnoseStreamFailure(
  config: ServerConfig,
  id: string,
): Promise<StreamFailure> {
  try {
    await apiFetch(config, 'getSong.view', { id })
    return 'undecodable'
  } catch (e) {
    return e instanceof ApiError && e.code === NOT_FOUND ? 'missing' : 'unreachable'
  }
}

/**
 * All artist names in the library (one call). Used as a cheap pre-filter so we
 * only search for canon songs whose artist actually exists here.
 */
export async function getArtists(config: ServerConfig, musicFolderId?: string): Promise<string[]> {
  const body = await apiFetch(config, 'getArtists.view', { musicFolderId })
  const names: string[] = []
  for (const idx of body.artists?.index ?? []) {
    for (const a of idx.artist ?? []) if (a.name) names.push(a.name)
  }
  return names
}

/** Full-text song search (Subsonic search3), used to locate specific canon songs. */
export async function search3(
  config: ServerConfig,
  opts: { query: string; songCount?: number; musicFolderId?: string },
): Promise<Song[]> {
  const body = await apiFetch(config, 'search3.view', {
    query: opts.query,
    songCount: opts.songCount ?? 20,
    artistCount: 0,
    albumCount: 0,
    musicFolderId: opts.musicFolderId,
  })
  return (body.searchResult3?.song ?? []).map(toSong)
}

export interface LibraryArtist {
  id: string
  name: string
}

export interface LibraryAlbum {
  id: string
  name: string
  artist: string
}

/** Search artists, albums and songs at once — for picking what to exclude. */
export async function searchLibrary(
  config: ServerConfig,
  query: string,
): Promise<{ artists: LibraryArtist[]; albums: LibraryAlbum[]; songs: Song[] }> {
  const body = await apiFetch(config, 'search3.view', {
    query,
    artistCount: 5,
    albumCount: 5,
    songCount: 10,
  })
  const r = body.searchResult3
  return {
    artists: (r?.artist ?? []).map((a) => ({ id: String(a.id), name: a.name ?? '' })).filter((a) => a.name),
    albums: (r?.album ?? [])
      .map((a) => ({ id: String(a.id), name: a.name ?? '', artist: a.artist ?? '' }))
      .filter((a) => a.name),
    songs: (r?.song ?? []).map(toSong),
  }
}

export async function getGenres(config: ServerConfig): Promise<Genre[]> {
  const body = await apiFetch(config, 'getGenres.view')
  return (body.genres?.genre ?? []).map((g) => ({
    name: g.value ?? '',
    songCount: g.songCount ?? 0,
  }))
}

/** Top-level libraries (e.g. "Music", "Audiobooks") for scoping the deck. */
export async function getMusicFolders(config: ServerConfig): Promise<MusicFolder[]> {
  const body = await apiFetch(config, 'getMusicFolders.view')
  return (body.musicFolders?.musicFolder ?? []).map((f) => ({
    id: String(f.id),
    name: f.name ?? String(f.id),
  }))
}

/** All playlists visible to this user — an alternative deck source. */
export async function getPlaylists(config: ServerConfig): Promise<Playlist[]> {
  const body = await apiFetch(config, 'getPlaylists.view')
  return (body.playlists?.playlist ?? []).map((p) => ({
    id: String(p.id),
    name: p.name ?? String(p.id),
    songCount: p.songCount ?? 0,
  }))
}

/** Star ("like") or unstar a song — Navidrome shows starred songs as favorites. */
export async function setSongStarred(
  config: ServerConfig,
  id: string,
  starred: boolean,
): Promise<void> {
  await apiFetch(config, starred ? 'star.view' : 'unstar.view', { id })
}

/** Append a song to an existing playlist. */
export async function addSongToPlaylist(
  config: ServerConfig,
  playlistId: string,
  songId: string,
): Promise<void> {
  await apiFetch(config, 'updatePlaylist.view', { playlistId, songIdToAdd: songId })
}

/**
 * Remove a song from a playlist. The Subsonic API removes by *position*, so
 * the playlist is fetched first and every occurrence of the song is removed
 * (one call — the indices refer to the playlist as it currently is).
 * Returns false when the song wasn't in the playlist.
 */
export async function removeSongFromPlaylist(
  config: ServerConfig,
  playlistId: string,
  songId: string,
): Promise<boolean> {
  const body = await apiFetch(config, 'getPlaylist.view', { id: playlistId })
  const indices = (body.playlist?.entry ?? [])
    .map((e, i) => (e.id === songId ? i : -1))
    .filter((i) => i >= 0)
  if (!indices.length) return false
  await apiFetch(config, 'updatePlaylist.view', { playlistId, songIndexToRemove: indices })
  return true
}

/** The songs of one playlist, deduped (a playlist may repeat a track). */
export async function getPlaylistSongs(config: ServerConfig, id: string): Promise<Song[]> {
  const body = await apiFetch(config, 'getPlaylist.view', { id })
  const seen = new Set<string>()
  return (body.playlist?.entry ?? []).map(toSong).filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
}

/**
 * Pick the reachable base URL for this session: if a local (LAN) address is
 * configured, ping it with a short timeout and use it when it answers;
 * otherwise fall back to the primary address. Never throws.
 */
export async function resolveEffectiveServer(
  config: ServerConfig,
  timeoutMs = 2500,
): Promise<ServerConfig> {
  const local = config.localBaseUrl?.trim()
  if (!local || local === config.baseUrl) return config
  const candidate: ServerConfig = { ...config, baseUrl: local }
  try {
    // Must be the bounded race, not a bare AbortController: Capacitor's native
    // HTTP ignores the signal, so off-network this probe would hang forever and
    // the address would never get re-resolved at all.
    const res = await fetchWithTimeout(buildUrl(candidate, 'ping.view'), timeoutMs)
    if (res.ok) {
      const json = (await res.json()) as SubsonicEnvelope
      if (json['subsonic-response']?.status === 'ok') return candidate
    }
  } catch {
    // Unreachable or timed out → use the primary address.
  }
  return config
}
