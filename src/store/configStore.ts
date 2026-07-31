import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { App as CapApp } from '@capacitor/app'
import { resolveEffectiveServer, setAddressPolicy } from '../subsonic/client'

/**
 * Subsonic server credentials. We store the derived salt+token (not the raw
 * password) so a compromised localStorage doesn't leak the plaintext password.
 * The salt+token pair is still credential-equivalent for API access, so this
 * only ever lives on the host device that connects to Subsonic.
 */
export interface ServerConfig {
  name: string
  /** Primary (remote/public) address — always required. */
  baseUrl: string
  /** Optional LAN address, preferred when it answers (checked per session). */
  localBaseUrl?: string
  username: string
  salt: string
  token: string
}

interface ConfigState {
  server: ServerConfig | null
  /**
   * `server` with `baseUrl` swapped to whichever address is reachable right
   * now (see resolveEffectiveServer). Runtime-only, never persisted; null
   * while unresolved — consumers fall back to `server`.
   */
  effective: ServerConfig | null
  setServer: (server: ServerConfig) => void
  setEffective: (server: ServerConfig | null) => void
  clearServer: () => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      server: null,
      effective: null,
      setServer: (server) => set({ server, effective: null }),
      setEffective: (effective) => set({ effective }),
      clearServer: () => set({ server: null, effective: null }),
    }),
    {
      name: 'subster.server',
      // Only the config itself persists; `effective` is per-session.
      partialize: (s) => ({ server: s.server }) as ConfigState,
    },
  ),
)

/** The address-resolved server to use for API/stream calls (hook form). */
export function useEffectiveServer(): ServerConfig | null {
  return useConfigStore((s) => s.effective ?? s.server)
}

/** The address-resolved server to use for API/stream calls (non-hook form). */
export function getEffectiveServer(): ServerConfig | null {
  const s = useConfigStore.getState()
  return s.effective ?? s.server
}

// Resolve local-vs-remote once on app start and whenever the config changes.
// Cheap: a no-op unless a localBaseUrl is configured.
async function refreshEffective(server: ServerConfig | null) {
  if (!server?.localBaseUrl) return
  const effective = await resolveEffectiveServer(server)
  // The config may have changed while we were pinging — only apply if not.
  if (useConfigStore.getState().server === server) {
    useConfigStore.getState().setEffective(effective)
  }
}
void refreshEffective(useConfigStore.getState().server)
useConfigStore.subscribe((state, prev) => {
  if (state.server !== prev.server) void refreshEffective(state.server)
})

// The phone can move between WiFi and mobile data while we are backgrounded,
// which flips whether the LAN address is reachable. Re-check on every return to
// the foreground; without this the address stays pinned until the app is killed.
CapApp.addListener('appStateChange', ({ isActive }) => {
  if (isActive) void refreshEffective(useConfigStore.getState().server)
}).catch(() => {
  // No Capacitor runtime (plain browser build) — resolve-on-start still applies.
})

/**
 * Walking back in the front door should put us on the LAN again promptly —
 * going out through the public address and back in over WiFi is markedly slower
 * than talking to the server directly, so staying demoted is a real cost.
 *
 * Only runs while we are *not* on the LAN, never blocks anything, and can only
 * ever promote: resolveEffectiveServer moves us onto the local address purely
 * on the strength of a ping that just succeeded. Losing the LAN is detected the
 * other way round, by requests failing, so there is no probe in the hot path.
 */
const LAN_RECHECK_MS = 20_000

setInterval(() => {
  const { server, effective } = useConfigStore.getState()
  if (!server?.localBaseUrl) return
  if ((effective ?? server).baseUrl === server.localBaseUrl) return // already fast
  void refreshEffective(server)
}, LAN_RECHECK_MS)

/**
 * Give up on the LAN address and use the public one for everything that
 * follows. Returns false if there was nothing to demote (no LAN configured, or
 * we were already on the public address). Callers outside an API request — the
 * audio element, which fetches its own URL — use this to recover too.
 */
export function demoteFromLan(): boolean {
  const { server, effective } = useConfigStore.getState()
  const current = effective ?? server
  if (!server?.localBaseUrl || current?.baseUrl !== server.localBaseUrl) return false
  useConfigStore.getState().setEffective(server)
  return true
}

/**
 * Demote only after confirming the LAN address really is gone. The audio
 * element cannot tell "the server vanished" from "this file is corrupt", and a
 * single bad rip must not cost a user at home their fast local path for the
 * rest of the game — so pay one short ping before giving it up.
 */
export async function demoteIfLanUnreachable(): Promise<boolean> {
  const { server, effective } = useConfigStore.getState()
  const current = effective ?? server
  if (!server?.localBaseUrl || current?.baseUrl !== server.localBaseUrl) return false
  const resolved = await resolveEffectiveServer(server)
  if (resolved.baseUrl === server.localBaseUrl) return false // LAN answers: the file is the problem
  useConfigStore.getState().setEffective(resolved)
  return true
}

// A switch that happens mid-session gets caught here instead: the first request
// to fail against the LAN address demotes us to the public one and retries, so
// the user sees a brief stall rather than an error.
setAddressPolicy({
  // Long-running callers (the deck producer) capture a config once and keep
  // using it. Once we have demoted, redirect those to the live address instead
  // of letting each one rediscover that the LAN is gone.
  //
  // Strictly one-way: a caller that deliberately names the primary address —
  // the connection test in Server setup — must never be steered onto the LAN,
  // or it would report success for a public URL that does not work.
  current(config) {
    const { server, effective } = useConfigStore.getState()
    if (!server?.localBaseUrl || !effective) return config
    const staleLan =
      config.baseUrl === server.localBaseUrl && effective.baseUrl !== server.localBaseUrl
    return staleLan ? effective : config
  },

  onFailure(failed) {
    const { server } = useConfigStore.getState()
    // Only the LAN address has somewhere to fall back to; anything else is a
    // real failure and should surface.
    if (!server?.localBaseUrl || failed.baseUrl !== server.localBaseUrl) return null
    demoteFromLan()
    return server
  },
})
