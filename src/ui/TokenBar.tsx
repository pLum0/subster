import type { Player } from '../game/types'
import { useT } from '../i18n'

/** Compact per-player status: name, cards collected, and tokens. */
export function TokenBar({
  players,
  activeIndex,
  winTarget,
}: {
  players: Player[]
  activeIndex: number
  winTarget: number
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap gap-1.5">
      {players.map((p, i) => (
        <div
          key={p.id}
          className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
            i === activeIndex ? 'bg-brand-600/25 ring-1 ring-brand-500' : 'bg-slate-800'
          }`}
        >
          <span className="max-w-[6rem] truncate font-medium">{p.name}</span>
          <span className="text-slate-400">
            {p.timeline.length}/{winTarget}
          </span>
          {p.tokens > 0 && <span className="text-amber-400" aria-label={t.game.tokens(p.tokens)}>{'●'.repeat(p.tokens)}</span>}
        </div>
      ))}
    </div>
  )
}
