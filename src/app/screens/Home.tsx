import { useNavigate } from 'react-router-dom'
import { Layout } from '../Layout'
import { Button } from '../../ui/Button'
import { useConfigStore } from '../../store/configStore'
import { useT, useLocaleStore, LANGUAGES } from '../../i18n'

export function Home() {
  const navigate = useNavigate()
  const server = useConfigStore((s) => s.server)
  const effective = useConfigStore((s) => s.effective)
  // The reachability check picked the LAN address — show it, so the local-
  // address feature is verifiable at a glance.
  const viaLan =
    !!server?.localBaseUrl && !!effective && effective.baseUrl === server.localBaseUrl
  const t = useT()
  const { locale, setLocale } = useLocaleStore()

  return (
    <Layout>
      <div className="flex justify-end py-2">
        <select
          aria-label={t.home.language}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-300 outline-none"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div>
          <h1 className="text-5xl font-black tracking-tight">
            Sub<span className="text-brand-500">ster</span>
          </h1>
          <p className="mt-2 text-slate-400">
            {t.home.tagline1}
            <br />
            {t.home.tagline2}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button onClick={() => navigate(server ? '/setup' : '/server')}>
            {server ? t.home.newGame : t.home.connectServer}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/server')}>
            {server
              ? t.home.serverLabel(server.name || server.baseUrl) + (viaLan ? ' · LAN' : '')
              : t.home.serverSettings}
          </Button>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-slate-600">{t.home.footer}</footer>
    </Layout>
  )
}
