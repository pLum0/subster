import { FormEvent, ReactNode, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../Layout'
import { Button } from '../../ui/Button'
import { useConfigStore } from '../../store/configStore'
import { deriveAuth, ping } from '../../subsonic/client'
import { useT } from '../../i18n'

export function ServerSetup() {
  const navigate = useNavigate()
  const { server, setServer, clearServer } = useConfigStore()
  const t = useT()

  const [name, setName] = useState(server?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(server?.baseUrl ?? '')
  const [username, setUsername] = useState(server?.username ?? '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'testing' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('testing')
    setError('')

    const { salt, token } = deriveAuth(password)
    const candidate = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      username: username.trim(),
      salt,
      token,
    }

    const result = await ping(candidate)
    if (result.ok) {
      setServer(candidate)
      navigate('/setup')
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

  const canSubmit = baseUrl.trim() && username.trim() && password && status !== 'testing'
  const insecureUrl = /^http:\/\//i.test(baseUrl.trim())

  return (
    <Layout>
      <header className="flex items-center gap-3 py-4">
        <button className="text-slate-400" onClick={() => navigate('/')} aria-label={t.a11y.back}>
          ←
        </button>
        <h1 className="text-xl font-bold">{t.server.title}</h1>
      </header>

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

        <p className="text-xs text-slate-500">{t.server.privacy}</p>

        <div className="mt-auto flex flex-col gap-3 py-4">
          <Button type="submit" disabled={!canSubmit}>
            {status === 'testing' ? t.server.testing : t.server.save}
          </Button>
          {server && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                clearServer()
                navigate('/')
              }}
            >
              {t.server.disconnect}
            </Button>
          )}
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
