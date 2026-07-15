/**
 * Serialize async calls so at most one runs per `intervalMs`. Used to respect
 * the MusicBrainz 1 req/s rate limit. Returns a wrapper preserving arg/return
 * types; calls queue and resolve in order.
 */
export function rateLimit<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  intervalMs: number,
): (...args: A) => Promise<R> {
  let chain: Promise<unknown> = Promise.resolve()
  let last = 0

  return (...args: A): Promise<R> => {
    const run = async (): Promise<R> => {
      const wait = last + intervalMs - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      last = Date.now()
      return fn(...args)
    }
    const result = chain.then(run, run)
    // Keep the chain alive regardless of individual failures.
    chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
