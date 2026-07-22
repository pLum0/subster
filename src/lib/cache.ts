/**
 * Tiny persistent key→value cache backed by localStorage, with an in-memory
 * fallback when localStorage is unavailable (SSR, tests, private mode).
 * Values are JSON-serialized. Used to avoid re-hitting MusicBrainz/ListenBrainz
 * for songs we've already resolved.
 */
const PREFIX = 'subster.cache.'

// Live instances, so clearAll() can also drop their in-memory copies.
const instances = new Set<JsonCache<unknown>>()

export class JsonCache<T> {
  private mem = new Map<string, T>()

  constructor(private namespace: string) {
    instances.add(this as JsonCache<unknown>)
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
    let removed = 0
    try {
      const ls = globalThis.localStorage
      if (!ls) return 0
      for (let i = ls.length - 1; i >= 0; i--) {
        const key = ls.key(i)
        if (key?.startsWith(PREFIX)) {
          ls.removeItem(key)
          removed++
        }
      }
    } catch {
      // localStorage unavailable — memory was still cleared.
    }
    return removed
  }

  private storageKey(key: string): string {
    return `${PREFIX}${this.namespace}.${key}`
  }

  get(key: string): T | undefined {
    if (this.mem.has(key)) return this.mem.get(key)
    try {
      const raw = globalThis.localStorage?.getItem(this.storageKey(key))
      if (raw == null) return undefined
      const value = JSON.parse(raw) as T
      this.mem.set(key, value)
      return value
    } catch {
      return undefined
    }
  }

  set(key: string, value: T): void {
    this.mem.set(key, value)
    try {
      globalThis.localStorage?.setItem(this.storageKey(key), JSON.stringify(value))
    } catch {
      // Quota/availability errors are non-fatal — the in-memory copy still works.
    }
  }
}
