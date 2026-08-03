import { FormEvent, ReactNode, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../Layout'
import { Button } from '../../ui/Button'
import {
  newServerId,
  useActiveServer,
  useConfigStore,
  type ServerConfig,
} from '../../store/configStore'
import { connect, ping } from '../../subsonic/client'
import { JsonCache } from '../../lib/cache'
import { useT } from '../../i18n'

/** Re-check a server we already hold credentials for, shaped like connect(). */
async function reTest(config: ServerConfig) {
  const result = await ping(config)
  return result.ok ? ({ ok: true as const, config }) : result
}

export function ServerSetup() {
  const navigate = useNavigate()
  const { servers, activeId, saveServer, selectServer, removeServer } = useConfigStore()
  const active = useActiveServer()
  const t = useT()

  // Which saved server the form is editing; null means "a new one".
  const [editingId, setEditingId] = useState<string | null>(active?.id ?? null)
  const [name, setName] = useState(active?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(active?.baseUrl ?? '')
  const [localBaseUrl, setLocalBaseUrl] = useState(active?.localBaseUrl ?? '')
  const [username, setUsername] = useState(active?.username ?? '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'testing' | 'error'>('idle')
  const [error, setError] = useState('')
  const [cachesCleared, setCachesCleared] = useState<number | null>(null)
  // Set after saving a server that needs the legacy scheme, so the warning is
  // seen at the moment it becomes true rather than only on a later visit.
  const [savedWithPassword, setSavedWithPassword] = useState(false)

  const editing = servers.find((s) => s.id === editingId) ?? null

  /** Point the form at a saved server (and switch to it), or at a blank one. */
  function editServer(target: ServerConfig | null) {
    setEditingId(target?.id ?? null)
    setName(target?.name ?? '')
    setBaseUrl(target?.baseUrl ?? '')
    setLocalBaseUrl(target?.localBaseUrl ?? '')
    setUsername(target?.username ?? '')
    setPassword('') // never prefilled: only a derived token is kept for most servers
    setStatus('idle')
    setError('')
    setSavedWithPassword(false)
    if (target) selectServer(target.id)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('testing')
    setError('')

    const base = {
      id: editingId ?? newServerId(),
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      localBaseUrl: localBaseUrl.trim() || undefined,
      username: username.trim(),
    }

    // The primary URL must answer; the local one is best-effort at runtime
    // (unreachable simply means "not at home right now").
    //
    // With a password typed, connect() settles which auth scheme this server
    // accepts. Without one — you switched to a saved server, or edited its
    // name or address — re-test using the credentials already held, so the
    // button still does something instead of sitting disabled. (If the
    // username was changed too, the held token no longer matches it and the
    // server says so; typing the password fixes that.)
    const result = password
      ? await connect(base, password)
      : await reTest({ ...base, salt: editing!.salt, token: editing!.token, password: editing!.password })

    if (result.ok) {
      saveServer(result.config)
      setEditingId(result.config.id)
      setStatus('idle')
      // Storing the password itself is a real change in what lives on the
      // device — say so here, where it happened, instead of navigating away.
      if (result.config.password) {
        setSavedWithPassword(true)
        return
      }
      // Back to the start screen rather than straight into a new game: saving
      // a server is often just switching between them, not the first step of
      // setting up a round.
      navigate('/')
    } else {
      setStatus('error')
      setError(
        result.kind === 'network'
          ? Capacitor.isNativePlatform()
            ? t.server.networkErrorNative
            : t.server.networkError
          : result.error,
      )
    }
  }

  // A saved server can be re-tested without retyping its password.
  const canSubmit =
    baseUrl.trim() && username.trim() && (password || editing) && status !== 'testing'
  const insecureUrl = /^http:\/\//i.test(baseUrl.trim()) || /^http:\/\//i.test(localBaseUrl.trim())

  return (
    <Layout>
      <header className="flex items-center gap-3 py-4">
        <button className="text-slate-400" onClick={() => navigate('/')} aria-label={t.a11y.back}>
          ←
        </button>
        <h1 className="text-xl font-bold">{t.server.title}</h1>
      </header>

      {servers.length > 0 && (
        <div className="flex flex-col gap-1.5 pb-2">
          <span className="text-sm text-slate-400">{t.server.saved}</span>
          {servers.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => editServer(s)}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${
                s.id === activeId
                  ? 'border-brand-500 bg-brand-500/15'
                  : 'border-slate-700 bg-slate-800'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{s.name || s.baseUrl}</span>
                <span className="block truncate text-xs text-slate-500">
                  {s.username} · {s.baseUrl}
                </span>
              </span>
              {s.id === activeId && (
                <span className="shrink-0 text-xs text-brand-300">{t.server.activeServer}</span>
              )}
            </button>
          ))}
          {editingId !== null && (
            <button
              type="button"
              onClick={() => editServer(null)}
              className="rounded-xl border border-dashed border-slate-700 px-3 py-2 text-sm text-slate-400"
            >
              {t.server.addServer}
            </button>
          )}
        </div>
      )}

      <form className="flex flex-1 flex-col gap-4" onSubmit={handleSubmit}>
        <Field label={t.server.name}>
          <input
            className={inputClass}
            placeholder={t.server.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t.server.url}>
          <input
            className={inputClass}
            placeholder="https://music.example.com"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </Field>
        <Field label={t.server.localUrl}>
          <input
            className={inputClass}
            placeholder="http://192.168.1.20:4533"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            value={localBaseUrl}
            onChange={(e) => setLocalBaseUrl(e.target.value)}
          />
          <span className="text-xs text-slate-500">{t.server.localUrlHint}</span>
        </Field>
        {insecureUrl && (
          <p className="rounded-lg bg-amber-950/60 p-3 text-sm text-amber-300">
            {t.server.insecureUrl}
          </p>
        )}
        <Field label={t.server.username}>
          <input
            className={inputClass}
            autoCapitalize="off"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={t.server.password}>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {status === 'error' && (
          <p className="rounded-lg bg-red-950/60 p-3 text-sm text-red-300">{error}</p>
        )}

        {(savedWithPassword || editing?.password) && (
          <p className="rounded-lg bg-amber-950/50 p-3 text-xs text-amber-200">
            {savedWithPassword && <strong className="block pb-1">{t.server.legacyAuthSaved}</strong>}
            {t.server.legacyAuth}
          </p>
        )}

        <p className="text-xs text-slate-500">{t.server.privacy}</p>

        <div className="mt-auto flex flex-col gap-3 py-4">
          {savedWithPassword ? (
            <Button type="button" onClick={() => navigate('/')}>
              {t.server.continueAnyway}
            </Button>
          ) : (
            <Button type="submit" disabled={!canSubmit}>
              {status === 'testing' ? t.server.testing : t.server.save}
            </Button>
          )}
          {editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                removeServer(editing.id)
                editServer(null)
              }}
            >
              {t.server.disconnect}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setCachesCleared(JsonCache.clearAll())}>
            {cachesCleared != null ? t.server.cachesCleared(cachesCleared) : t.server.clearCaches}
          </Button>
          <span className="text-xs text-slate-500">{t.server.clearCachesHint}</span>
        </div>
      </form>
    </Layout>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base text-slate-100 outline-none focus:border-brand-500'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-400">{label}</span>
      {children}
    </label>
  )
}
