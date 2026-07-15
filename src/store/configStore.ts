import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Subsonic server credentials. We store the derived salt+token (not the raw
 * password) so a compromised localStorage doesn't leak the plaintext password.
 * The salt+token pair is still credential-equivalent for API access, so this
 * only ever lives on the host device that connects to Subsonic.
 */
export interface ServerConfig {
  name: string
  baseUrl: string
  username: string
  salt: string
  token: string
}

interface ConfigState {
  server: ServerConfig | null
  setServer: (server: ServerConfig) => void
  clearServer: () => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      server: null,
      setServer: (server) => set({ server }),
      clearServer: () => set({ server: null }),
    }),
    { name: 'subster.server' },
  ),
)
