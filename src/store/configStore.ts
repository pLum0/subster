import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveEffectiveServer } from '../subsonic/client'

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
