import type { TimelineCard } from '../game/types'
import { useT } from '../i18n'

/**
 * A player's timeline: placed cards left→right by year, with tappable gaps
 * ("slots") shown while placing. Slot index i means "insert before card i";
 * the trailing slot (index length) means "after the last card". The chosen
 * slot is highlighted. Also used read-only (mode="view") on the reveal screen.
 */
export function Timeline({
  timeline,
  mode,
  pendingSlot,
  onPick,
  markers,
  disabledSlots,
}: {
  timeline: TimelineCard[]
  mode: 'placing' | 'view'
  pendingSlot?: number | null
  onPick?: (slot: number) => void
  /** Slot index → badge: a short label with a tone ('active' placement vs a 'bet'). */
  markers?: Record<number, { label: string; tone: 'active' | 'bet' }>
  /** Slots that can't be picked (already taken / the active player's own slot). */
  disabledSlots?: number[]
}) {
  const disabled = new Set(disabledSlots ?? [])
  const slot = (index: number) => (
    <Slot
      index={index}
      active={pendingSlot === index}
      badge={markers?.[index]}
      disabled={disabled.has(index)}
      onPick={onPick}
    />
  )
  // Wrap onto multiple rows (reading order left→right, top→bottom) instead of a
  // single horizontally-scrolling strip — every position stays visible and
  // there's no scroll position to lose when the view re-renders on each bet.
  return (
    <div className="flex flex-wrap items-stretch gap-1 px-1 py-2">
      {timeline.map((card, i) => (
        <div key={card.song.id} className="flex items-stretch gap-1">
          {/* Skip the slot between two same-year cards — it's redundant. */}
          {mode === 'placing' && timeline[i - 1]?.year !== card.year && slot(i)}
          <Card card={card} />
        </div>
      ))}
      {mode === 'placing' && slot(timeline.length)}
    </div>
  )
}

function Card({ card }: { card: TimelineCard }) {
  return (
    <div className="flex min-h-24 w-28 shrink-0 flex-col justify-between rounded-xl bg-slate-800 p-2 text-center">
      <div className="text-2xl font-black text-brand-400">{card.year}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-tight text-slate-300">
        {card.song.title}
      </div>
      <div className="truncate text-[11px] text-slate-500">{card.song.artist}</div>
    </div>
  )
}

function Slot({
  index,
  active,
  badge,
  disabled,
  onPick,
}: {
  index: number
  active: boolean
  badge?: { label: string; tone: 'active' | 'bet' }
  disabled?: boolean
  onPick?: (slot: number) => void
}) {
  const tone = active
    ? 'border-brand-500 bg-brand-500/20 text-brand-200'
    : badge?.tone === 'active'
      ? 'border-brand-500 bg-brand-500/25 text-brand-200'
      : badge?.tone === 'bet'
        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
        : disabled
          ? 'border-slate-700 bg-slate-800/20 text-slate-500'
          : 'border-slate-600 bg-slate-800/40 text-slate-300 hover:border-slate-400'
  const t = useT()
  return (
    <button
      onClick={() => !disabled && onPick?.(index)}
      disabled={disabled}
      aria-label={t.a11y.position(index + 1)}
      className={`min-h-24 w-11 shrink-0 rounded-xl border-2 border-dashed transition-colors ${tone}`}
    >
      <span className="text-xs font-bold">{badge?.label ?? (active ? '●' : '+')}</span>
    </button>
  )
}
