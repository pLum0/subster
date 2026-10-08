/**
 * Tiny persistent key→value cache backed by localStorage, with an in-memory
 * fallback when localStorage is unavailable (SSR, tests, private mode).
 * Values are JSON-serialized. Used to avoid re-hitting MusicBrainz/ListenBrainz
 * for songs we've already resolved.
 */
const PREFIX = 'subster.cache.'

/**
 * How long a cached miss counts before it is asked again: about four months.
 * Long enough that a library's misses don't slow every deck build, short
 * enough that a recording added to MusicBrainz in the meantime gets found.
 */
export const MISS_RETRY_MS = 120 * 24 * 60 * 60 * 1000

/**
 * A stored miss: the value plus when it was looked up. Found answers are
 * stored bare, so they and every entry written before misses expired read
 * back unchanged.
 */
interface StoredMiss {
  missAt: number
  v: unknown
}

const isStoredMiss = (x: unknown): x is StoredMiss =>
  typeof x === 'object' && x !== null && typeof (x as StoredMiss).missAt === 'number' && 'v' in x

export interface CacheOptions<T> {
  /**
   * Retry lookups that found nothing. A miss is stored with its time and
   * counts as not cached once it is older than `after` (default
   * MISS_RETRY_MS). Found answers stay permanent.
   */
  retryMisses?: { isMiss?: (value: T) => boolean; after?: number }
}

// Live instances, so clearAll() can also drop their in-memory copies.
const instances = new Set<JsonCache<unknown>>()

/** Remove every localStorage key starting with `prefix`; returns the count. */
function removeStored(prefix: string): number {
  let removed = 0
  try {
    const ls = globalThis.localStorage
    if (!ls) return 0
    for (let i = ls.length - 1; i >= 0; i--) {
      const key = ls.key(i)
      if (key?.startsWith(prefix)) {
        ls.removeItem(key)
        removed++
      }
    }
  } catch {
    // localStorage unavailable — nothing stored to remove.
  }
  return removed
}

export class JsonCache<T> {
  private mem = new Map<string, T>()

  private isMiss?: (value: T) => boolean
  private missRetryMs: number

  constructor(
    private namespace: string,
    options: CacheOptions<T> = {},
  ) {
    instances.add(this as JsonCache<unknown>)
    const retry = options.retryMisses
    if (retry) this.isMiss = retry.isMiss ?? ((v) => v === null)
    this.missRetryMs = retry?.after ?? MISS_RETRY_MS
  }

  /**
   * Wipe every subster cache: all live instances' memory plus every
   * `subster.cache.*` localStorage key — including orphaned namespaces from
   * older app versions. Returns the number of stored entries removed.
   * Zustand-persisted state (server config, game) lives under other keys and
   * is untouched.
   */
  static clearAll(): number {
    for (const c of instances) c.mem.clear()
    return removeStored(PREFIX)
  }

  /**
   * Remove every stored entry of a namespace that is no longer used, so a
   * superseded cache doesn't sit in localStorage forever. Returns the number
   * of entries removed.
   */
  static dropNamespace(namespace: string): number {
    return removeStored(`${PREFIX}${namespace}.`)
  }

  private storageKey(key: string): string {
    return `${PREFIX}${this.namespace}.${key}`
  }

  get(key: string): T | undefined {
    if (this.mem.has(key)) return this.mem.get(key)
    try {
      const raw = globalThis.localStorage?.getItem(this.storageKey(key))
      if (raw == null) return undefined
      const parsed: unknown = JSON.parse(raw)
      if (this.isMiss) {
        if (isStoredMiss(parsed)) {
          // An old miss: forget it, so the caller looks it up again.
          if (Date.now() - parsed.missAt > this.missRetryMs) return undefined
          const value = parsed.v as T
          this.mem.set(key, value)
          return value
        }
        // A miss from before misses were timestamped: retry it once.
        if (this.isMiss(parsed as T)) return undefined
      }
      const value = parsed as T
      this.mem.set(key, value)
      return value
    } catch {
      return undefined
    }
  }

  set(key: string, value: T): void {
    this.mem.set(key, value)
    try {
      const stored: unknown = this.isMiss?.(value) ? { missAt: Date.now(), v: value } : value
      globalThis.localStorage?.setItem(this.storageKey(key), JSON.stringify(stored))
    } catch {
      // Quota/availability errors are non-fatal — the in-memory copy still works.
    }
  }
}
