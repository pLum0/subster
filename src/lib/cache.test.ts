import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonCache } from './cache'

/** Minimal localStorage stand-in backed by a Map. */
function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
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
})
