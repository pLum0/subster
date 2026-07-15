import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rateLimit } from './throttle'

beforeEach(() => {
  vi.useFakeTimers() // also mocks Date.now(), which the throttle chain reads
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit', () => {
  it('spaces call starts by at least intervalMs', async () => {
    const starts: number[] = []
    const limited = rateLimit(async (n: number) => {
      starts.push(Date.now())
      return n
    }, 1000)

    const all = Promise.all([limited(1), limited(2), limited(3)])
    await vi.advanceTimersByTimeAsync(5000)
    expect(await all).toEqual([1, 2, 3])

    expect(starts).toHaveLength(3)
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000)
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1000)
  })

  it('runs queued calls in FIFO order', async () => {
    const order: number[] = []
    const limited = rateLimit(async (n: number) => {
      order.push(n)
      return n
    }, 50)

    const all = Promise.all([limited(1), limited(2), limited(3)])
    await vi.advanceTimersByTimeAsync(1000)
    await all
    expect(order).toEqual([1, 2, 3])
  })

  it('keeps the chain alive after a rejected call', async () => {
    const limited = rateLimit(async (n: number) => {
      if (n === 2) throw new Error('boom')
      return n
    }, 50)

    const p1 = limited(1)
    const p2 = limited(2)
    const p3 = limited(3)
    p2.catch(() => {}) // pre-attach a handler so the rejection is not unhandled

    await vi.advanceTimersByTimeAsync(1000)
    await expect(p1).resolves.toBe(1)
    await expect(p2).rejects.toThrow('boom')
    await expect(p3).resolves.toBe(3)
  })
})
