import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../Layout'
import { Button } from '../../ui/Button'
import { useGameStore } from '../../store/gameStore'
import { leaderboard, winner } from '../../game/selectors'
import { useT } from '../../i18n'

export function Winner() {
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)
  const restart = useGameStore((s) => s.restart)
  const quit = useGameStore((s) => s.quit)
  const t = useT()
  const champ = winner(game)

  useEffect(() => {
    if (!champ) navigate('/')
  }, [champ, navigate])

  if (!champ) return <Layout>{null}</Layout>

  return (
    <Layout>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="text-6xl">🏆</div>
        <div>
          <div className="text-sm uppercase tracking-widest text-slate-500">{t.winner.winner}</div>
          <div className="text-4xl font-black text-brand-400">{champ.name}</div>
        </div>

        <ol className="w-full max-w-xs">
          {leaderboard(game).map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between border-b border-slate-800 py-2"
            >
              <span className="text-slate-300">
                {i + 1}. {p.name}
              </span>
              <span className="font-semibold">{t.winner.cards(p.timeline.length)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3 py-4">
        <Button
          onClick={() => {
            void restart()
            navigate('/game')
          }}
        >
          {t.winner.rematch}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            quit()
            navigate('/')
          }}
        >
          {t.winner.home}
        </Button>
      </div>
    </Layout>
  )
}
