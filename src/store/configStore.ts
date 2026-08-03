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
  /** Stable identity — `name` is user-editable and may be left blank. */
  id: string
  name: string
  /** Primary (remote/public) address — always required. */
  baseUrl: string
  /** Optional LAN address, preferred when it answers (checked per session). */
  localBaseUrl?: string
  username: string
  salt: string
  token: string
  /**
   * Set only for servers that reject token auth and demand the legacy
   * plain-password scheme — Nextcloud Music answers token auth with error 41,
   * "Token-based authentication not supported". When present it is sent
   * instead of salt+token, which means the password itself lives on the
   * device rather than a derivative of it. The setup screen detects this and
   * warns; an app password is the sensible thing to use there.
   */
  password?: string
}

interface ConfigState {
  /** Every saved server; the active one is picked by `activeId`. */
  servers: ServerConfig[]
  activeId: string | null
  /**
   * The active server with `baseUrl` swapped to whichever address is reachable
   * right now (see resolveEffectiveServer). Runtime-only, never persisted; null
   * while unresolved — consumers fall back to the active server as stored.
   */
  effective: ServerConfig | null
  /** Add or update by id, and make it the active one. */
  saveServer: (server: ServerConfig) => void
  selectServer: (id: string) => void
  removeServer: (id: string) => void
  setEffective: (server: ServerConfig | null) => void
}

/** Ids only have to be unique on this device, and must survive a rename. */
export function newServerId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function activeOf(state: Pick<ConfigState, 'servers' | 'activeId'>): ServerConfig | null {
  return state.servers.find((s) => s.id === state.activeId) ?? null
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      servers: [],
      activeId: null,
      effective: null,

      saveServer: (server) =>
        set((s) => ({
          servers: s.servers.some((x) => x.id === server.id)
            ? s.servers.map((x) => (x.id === server.id ? server : x))
            : [...s.servers, server],
          activeId: server.id,
          // The address has to be resolved afresh for whatever we just pointed at.
          effective: null,
        })),

      selectServer: (id) =>
        set((s) => {
          // Re-selecting the server we are already on must change nothing.
          // Clearing `effective` here would drop the resolved LAN address, and
          // the subscription below would not fire to resolve it again — the
          // address silently falls back to the public one.
          if (s.activeId === id || !s.servers.some((x) => x.id === id)) return {}
          return { activeId: id, effective: null }
        }),

      removeServer: (id) =>
        set((s) => {
          const servers = s.servers.filter((x) => x.id !== id)
          if (s.activeId !== id) return { servers }
          return { servers, activeId: servers[0]?.id ?? null, effective: null }
        }),

      setEffective: (effective) => set({ effective }),
    }),
    {
      name: 'subster.server',
      version: 1,
      // Only the configs persist; `effective` is resolved per session.
      partialize: (s) => ({ servers: s.servers, activeId: s.activeId }) as ConfigState,
      // v0 held a single `server` with no id.
      migrate: (persisted, version) => {
        if (version >= 1) return persisted as ConfigState
        const old = persisted as { server?: Omit<ServerConfig, 'id'> | null } | null
        if (!old?.server) return { servers: [], activeId: null } as unknown as ConfigState
        const only: ServerConfig = { ...old.server, id: newServerId() }
        return { servers: [only], activeId: only.id } as unknown as ConfigState
      },
    },
  ),
)

/** The saved active server, before address resolution (hook form). */
export function useActiveServer(): ServerConfig | null {
  return useConfigStore(activeOf)
}

/** The address-resolved server to use for API/stream calls (hook form). */
export function useEffectiveServer(): ServerConfig | null {
  return useConfigStore((s) => s.effective ?? activeOf(s))
}

/** The address-resolved server to use for API/stream calls (non-hook form). */
export function getEffectiveServer(): ServerConfig | null {
  const s = useConfigStore.getState()
  return s.effective ?? activeOf(s)
}

// Resolve local-vs-remote once on app start and whenever the config changes.
// Cheap: a no-op unless a localBaseUrl is configured.
async function refreshEffective(server: ServerConfig | null) {
  if (!server?.localBaseUrl) return
  const effective = await resolveEffectiveServer(server)
  // The active server may have changed while we were pinging — only apply if
  // we are still pointed at the one we resolved.
  if (activeOf(useConfigStore.getState()) === server) {
    useConfigStore.getState().setEffective(effective)
  }
}
void refreshEffective(activeOf(useConfigStore.getState()))
useConfigStore.subscribe((state, prev) => {
  const current = activeOf(state)
  if (current !== activeOf(prev)) void refreshEffective(current)
})
