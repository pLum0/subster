import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonCache, MISS_RETRY_MS } from './cache'

/** Minimal localStorage stand-in backed by a Map. */
function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('JsonCache', () => {
  it('round-trips a value through set/get', () => {
    const cache = new JsonCache<{ n: number }>('roundtrip')
    cache.set('k', { n: 42 })
    expect(cache.get('k')).toEqual({ n: 42 })
  })

  it('distinguishes a stored null from an absent key', () => {
    // The metadata modules rely on this: `null` means "looked up, no result"
    // (cached miss), `undefined` means "never looked up".
    const cache = new JsonCache<string | null>('nullable')
    cache.set('miss', null)
    expect(cache.get('miss')).toBeNull()
    expect(cache.get('never-set')).toBeUndefined()
  })

  it('keeps values in the in-memory layer when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    const cache = new JsonCache<number>('memonly')
    cache.set('k', 7)
    expect(cache.get('k')).toBe(7)
  })

  it('namespaces localStorage keys per cache name', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    const a = new JsonCache<number>('ns-a')
    a.set('k', 1)

    // A different cache name must not see the key; a fresh instance with the
    // same name must (proving it went through localStorage, not just memory).
    expect(new JsonCache<number>('ns-b').get('k')).toBeUndefined()
    expect(new JsonCache<number>('ns-a').get('k')).toBe(1)
  })

  it('clearAll wipes stored entries and the in-memory layer, but nothing else', () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    // Non-cache keys (e.g. zustand-persisted config) must survive.
    ls.setItem('subster.config', '{"server":"keep"}')
    // Orphaned entries from an old app version have no live instance.
    ls.setItem('subster.cache.old-namespace-v1.stale', '1930')

    const a = new JsonCache<number>('clear-a')
    const b = new JsonCache<number>('clear-b')
    a.set('x', 1)
    b.set('y', 2)

    expect(JsonCache.clearAll()).toBe(3)
    expect(a.get('x')).toBeUndefined() // memory gone too, not just storage
    expect(b.get('y')).toBeUndefined()
    expect(ls.getItem('subster.cache.old-namespace-v1.stale')).toBeNull()
    expect(ls.getItem('subster.config')).toBe('{"server":"keep"}')

    // A cleared cache keeps working.
    a.set('x', 9)
    expect(a.get('x')).toBe(9)
  })

  it('clearAll clears memory and returns 0 when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    const cache = new JsonCache<number>('clear-memonly')
    cache.set('k', 5)
    expect(JsonCache.clearAll()).toBe(0)
    expect(cache.get('k')).toBeUndefined()
  })

  it('dropNamespace removes only that namespace’s stored entries', () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    ls.setItem('subster.cache.gone-v1.a', '1')
    ls.setItem('subster.cache.gone-v1.b', '2')
    ls.setItem('subster.cache.gone-v10.c', '3') // shares the prefix, not the namespace
    ls.setItem('subster.config', '{}')

    expect(JsonCache.dropNamespace('gone-v1')).toBe(2)
    expect(ls.getItem('subster.cache.gone-v1.a')).toBeNull()
    expect(ls.getItem('subster.cache.gone-v10.c')).toBe('3')
    expect(ls.getItem('subster.config')).toBe('{}')
  })
})

describe('JsonCache retryMisses', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('forgets a stored miss once it is older than the retry period', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01'))
    new JsonCache<number | null>('miss-a', { retryMisses: {} }).set('k', null)

    // Fresh instances, so the answer has to come from localStorage.
    vi.setSystemTime(Date.now() + MISS_RETRY_MS - DAY)
    expect(new JsonCache<number | null>('miss-a', { retryMisses: {} }).get('k')).toBeNull()
    vi.setSystemTime(Date.now() + 2 * DAY)
    expect(new JsonCache<number | null>('miss-a', { retryMisses: {} }).get('k')).toBeUndefined()
  })

  it('keeps found answers forever and stores them bare', () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.useFakeTimers()
    new JsonCache<number | null>('miss-b', { retryMisses: {} }).set('k', 1970)
    expect(ls.getItem('subster.cache.miss-b.k')).toBe('1970')
    vi.setSystemTime(Date.now() + 10 * MISS_RETRY_MS)
    expect(new JsonCache<number | null>('miss-b', { retryMisses: {} }).get('k')).toBe(1970)
  })

  it('retries a miss stored before misses had a time', () => {
    const ls = fakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    ls.setItem('subster.cache.miss-c.k', 'null')
    expect(new JsonCache<number | null>('miss-c', { retryMisses: {} }).get('k')).toBeUndefined()
    // Without the option, null stays a permanent miss as before.
    expect(new JsonCache<number | null>('miss-c').get('k')).toBeNull()
  })

  it('uses a custom miss test and retry period', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    vi.useFakeTimers()
    const opts = { retryMisses: { isMiss: (v: string[]) => v.length === 0, after: DAY } }
    new JsonCache<string[]>('miss-d', opts).set('empty', [])
    new JsonCache<string[]>('miss-d', opts).set('full', ['GBAYE0000941'])
    vi.setSystemTime(Date.now() + 2 * DAY)
    expect(new JsonCache<string[]>('miss-d', opts).get('empty')).toBeUndefined()
    expect(new JsonCache<string[]>('miss-d', opts).get('full')).toEqual(['GBAYE0000941'])
  })
})
