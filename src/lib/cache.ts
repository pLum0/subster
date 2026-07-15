/**
 * Tiny persistent key→value cache backed by localStorage, with an in-memory
 * fallback when localStorage is unavailable (SSR, tests, private mode).
 * Values are JSON-serialized. Used to avoid re-hitting MusicBrainz/ListenBrainz
 * for songs we've already resolved.
 */
export class JsonCache<T> {
  private mem = new Map<string, T>()

  constructor(private namespace: string) {}

  private storageKey(key: string): string {
    return `subster.cache.${this.namespace}.${key}`
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
