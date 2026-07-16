import md5 from 'blueimp-md5'
import type { ServerConfig } from '../store/configStore'

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
  /** OpenSubsonic recording MusicBrainz ID, when the server exposes it. */
  musicBrainzId?: string
  /** OpenSubsonic ISRC(s) — the server may return several. */
  isrc?: string[]
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
  | { ok: false; error: string; kind: 'auth' | 'network' | 'server' }

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

function authParams(config: ServerConfig): Record<string, string> {
  return {
    u: config.username,
    t: config.token,
    s: config.salt,
    v: API_VERSION,
    c: CLIENT_NAME,
    f: 'json',
  }
}

/** Normalize a base URL and build a fully-authenticated endpoint URL. */
export function buildUrl(
  config: ServerConfig,
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = new URL(`${base}/rest/${endpoint}`)
  const all = { ...authParams(config), ...params }
  for (const [key, value] of Object.entries(all)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
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
    searchResult3?: { song?: RawSong[] }
    artists?: { index?: Array<{ artist?: Array<{ id: string | number; name?: string }> }> }
    genres?: { genre?: RawGenre[] }
    musicFolders?: { musicFolder?: Array<{ id: string | number; name?: string }> }
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
  // OpenSubsonic may return isrc as a string or an array of strings.
  isrc?: string | string[]
}

interface RawGenre {
  value?: string
  songCount?: number
}

/**
 * Perform an authenticated JSON API call. Throws a tagged error on transport
 * failure (network/CORS) or a Subsonic `failed` response.
 */
async function apiFetch(
  config: ServerConfig,
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<NonNullable<SubsonicEnvelope['subsonic-response']>> {
  let res: Response
  try {
    res = await fetch(buildUrl(config, endpoint, params), { headers: { Accept: 'application/json' } })
  } catch (e) {
    // A cross-origin fetch blocked by CORS also lands here as a TypeError.
    throw new ApiError('network', (e as Error).message || 'Network request failed')
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
    throw new ApiError(kind, body.error?.message || 'Subsonic request failed')
  }
  return body
}

export class ApiError extends Error {
  constructor(
    public kind: 'auth' | 'network' | 'server',
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
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
    musicBrainzId: raw.musicBrainzId,
    isrc: raw.isrc ? (Array.isArray(raw.isrc) ? raw.isrc : [raw.isrc]) : undefined,
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
      return { ok: false, error: e.message, kind: e.kind }
    }
    return { ok: false, error: (e as Error).message, kind: 'network' }
  }
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
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(buildUrl(candidate, 'ping.view'), {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      const json = (await res.json()) as SubsonicEnvelope
      if (json['subsonic-response']?.status === 'ok') return candidate
    }
  } catch {
    // Unreachable or timed out → use the primary address.
  }
  return config
}
