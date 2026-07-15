import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../Layout'
import { Button } from '../../ui/Button'
import { useConfigStore } from '../../store/configStore'
import { useGameStore } from '../../store/gameStore'
import { useSetupStore } from '../../store/setupStore'
import { getGenres, getMusicFolders, type Genre, type MusicFolder } from '../../subsonic/client'
import { useT } from '../../i18n'

export function GameSetup() {
  const navigate = useNavigate()
  const server = useConfigStore((s) => s.server)
  const startGame = useGameStore((s) => s.startGame)
  const savePrefs = useSetupStore((s) => s.savePrefs)
  const t = useT()

  // Seed from the last-used setup (persisted), falling back to localized defaults.
  const saved = useSetupStore.getState().prefs
  const [names, setNames] = useState<string[]>(() =>
    saved.names.length ? saved.names : [t.setup.playerN(1), t.setup.playerN(2)],
  )
  const [winTarget, setWinTarget] = useState(saved.winTarget)
  const [difficulty, setDifficulty] = useState<'hits' | 'balanced' | 'deep'>(saved.difficulty)
  const [challengeGrace, setChallengeGrace] = useState(saved.challengeGrace)
  const [trigger, setTrigger] = useState<'countdown' | 'instant'>(saved.trigger)
  const [clip, setClip] = useState<'full' | '30s' | '60s'>(saved.clip)
  const [randomStart, setRandomStart] = useState(saved.randomStart)
  const [lockOnEnd, setLockOnEnd] = useState(saved.lockOnEnd)
  const [yearFrom, setYearFrom] = useState(saved.yearFrom)
  const [yearTo, setYearTo] = useState(saved.yearTo)
  const [genre, setGenre] = useState(saved.genre)
  const [genres, setGenres] = useState<Genre[]>([])
  const [folders, setFolders] = useState<MusicFolder[]>([])
  const [musicFolderId, setMusicFolderId] = useState<string>(saved.musicFolderId)

  useEffect(() => {
    if (!server) {
      navigate('/server')
      return
    }
    getGenres(server)
      .then((g) => setGenres(g.filter((x) => x.name).sort((a, b) => b.songCount - a.songCount)))
      .catch(() => setGenres([]))
    getMusicFolders(server)
      .then((fs) => {
        setFolders(fs)
        // Keep a saved (still-valid) folder; otherwise auto-pick a sensible one.
        setMusicFolderId((cur) => {
          if (cur && fs.some((f) => f.id === cur)) return cur
          const preferred =
            fs.find((f) => /music/i.test(f.name) && !/audiobook|kids/i.test(f.name)) ??
            fs.find((f) => !/audiobook/i.test(f.name)) ??
            fs[0]
          return preferred?.id ?? ''
        })
      })
      .catch(() => setFolders([]))
  }, [server, navigate])

  function setName(i: number, value: string) {
    setNames((prev) => prev.map((n, j) => (j === i ? value : n)))
  }

  // Smallest "Player N" not already used, so removing a middle player and
  // adding again never produces a duplicate default name.
  function nextPlayerName(current: string[]): string {
    let k = 1
    while (current.includes(t.setup.playerN(k))) k++
    return t.setup.playerN(k)
  }

  function start() {
    // Remember these choices for next time.
    savePrefs({
      names,
      winTarget,
      difficulty,
      challengeGrace,
      trigger,
      clip,
      randomStart,
      lockOnEnd,
      yearFrom,
      yearTo,
      genre,
      musicFolderId,
    })
    startGame({
      playerNames: names,
      settings: { winTarget, startTokens: 2, challengeGrace },
      deck: {
        musicFolderId: musicFolderId || undefined,
        difficulty,
        yearFrom: yearFrom ? Number(yearFrom) : undefined,
        yearTo: yearTo ? Number(yearTo) : undefined,
        genre: genre || undefined,
      },
      playback: { trigger, clip, randomStart, lockOnEnd },
    })
    navigate('/game')
  }

  const difficultyOptions = [
    ['hits', t.setup.diffHits, t.setup.diffHitsHint],
    ['balanced', t.setup.diffBalanced, t.setup.diffBalancedHint],
    ['deep', t.setup.diffDeep, t.setup.diffDeepHint],
  ] as const

  const seg = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
      active ? 'bg-brand-500/20 text-brand-100 ring-brand-500' : 'bg-slate-800 text-slate-300 ring-slate-700'
    }`

  return (
    <Layout>
      <header className="flex items-center gap-3 py-4">
        <button className="text-slate-400" onClick={() => navigate('/')} aria-label={t.a11y.back}>
          ←
        </button>
        <h1 className="text-xl font-bold">{t.setup.title}</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto pb-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-400">{t.setup.players}</h2>
          <div className="flex flex-col gap-2">
            {names.map((name, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 outline-none focus:border-brand-500"
                  value={name}
                  onChange={(e) => setName(i, e.target.value)}
                />
                {names.length > 1 && (
                  <button
                    className="px-3 text-slate-500"
                    onClick={() => setNames((p) => p.filter((_, j) => j !== i))}
                    aria-label={t.setup.removePlayer}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {names.length < 8 && (
            <button
              className="mt-2 text-sm font-medium text-brand-400"
              onClick={() => setNames((p) => [...p, nextPlayerName(p)])}
            >
              {t.setup.addPlayer}
            </button>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-400">{t.setup.deck}</h2>

          {folders.length > 1 && (
            <label className="flex items-center justify-between gap-3">
              <span>{t.setup.library}</span>
              <select
                className="w-44 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-brand-500"
                value={musicFolderId}
                onChange={(e) => setMusicFolderId(e.target.value)}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center justify-between gap-4">
            <span>{t.setup.cardsToWin}</span>
            <input
              type="number"
              min={3}
              max={20}
              className="w-20 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-center outline-none focus:border-brand-500"
              value={winTarget}
              onChange={(e) => setWinTarget(Math.max(3, Math.min(20, Number(e.target.value) || 10)))}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span>{t.setup.difficulty}</span>
            <div className="grid grid-cols-3 gap-2">
              {difficultyOptions.map(([value, label, hint]) => (
                <button
                  key={value}
                  onClick={() => setDifficulty(value)}
                  className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-center ${
                    difficulty === value
                      ? 'border-brand-500 bg-brand-500/15'
                      : 'border-slate-700 bg-slate-800'
                  }`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="text-[10px] text-slate-500">{hint}</span>
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">{t.setup.popularityNote}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span>{t.setup.yearRange}</span>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                placeholder={t.setup.anyYear}
                className="w-20 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-center outline-none focus:border-brand-500"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, ''))}
              />
              <span className="text-slate-500">–</span>
              <input
                inputMode="numeric"
                placeholder={t.setup.anyYear}
                className="w-20 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-center outline-none focus:border-brand-500"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          {genres.length > 0 && (
            <label className="flex items-center justify-between gap-3">
              <span>{t.setup.genre}</span>
              <select
                className="w-44 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-brand-500"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                <option value="">{t.setup.anyGenre}</option>
                {genres.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="flex-1 text-left" onClick={() => setChallengeGrace((v) => !v)}>
              {t.setup.challengeGrace}
              <span className="mt-0.5 block text-xs text-slate-500">{t.setup.challengeGraceHint}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={challengeGrace}
              onClick={() => setChallengeGrace((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                challengeGrace ? 'bg-brand-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  challengeGrace ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-400">{t.setup.playbackTitle}</h2>

          <div className="flex items-center justify-between gap-3">
            <span>{t.setup.startTrigger}</span>
            <div className="flex gap-2">
              {(
                [
                  ['countdown', t.setup.triggerCountdown],
                  ['instant', t.setup.triggerInstant],
                ] as const
              ).map(([v, label]) => (
                <button key={v} onClick={() => setTrigger(v)} className={seg(trigger === v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span>{t.setup.clipLabel}</span>
            <div className="flex gap-2">
              {(
                [
                  ['full', t.setup.clipFull],
                  ['30s', t.setup.clip30],
                  ['60s', t.setup.clip60],
                ] as const
              ).map(([v, label]) => (
                <button key={v} onClick={() => setClip(v)} className={seg(clip === v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="flex-1 text-left" onClick={() => setRandomStart((v) => !v)}>
              {t.setup.randomStart}
              <span className="mt-0.5 block text-xs text-slate-500">{t.setup.randomStartHint}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={randomStart}
              onClick={() => setRandomStart((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                randomStart ? 'bg-brand-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  randomStart ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="flex-1 text-left" onClick={() => setLockOnEnd((v) => !v)}>
              {t.setup.lockOnEnd}
              <span className="mt-0.5 block text-xs text-slate-500">{t.setup.lockOnEndHint}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={lockOnEnd}
              onClick={() => setLockOnEnd((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                lockOnEnd ? 'bg-brand-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  lockOnEnd ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>
      </div>

      <div className="py-4">
        <Button className="w-full" onClick={start}>
          {t.setup.start}
        </Button>
      </div>
    </Layout>
  )
}
