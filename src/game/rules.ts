import type { Player, TimelineCard } from './types'

/**
 * Lower/upper year bounds of a timeline slot. `slot` is an insertion index in
 * [0, timeline.length]: 0 = before the first card, length = after the last.
 * Open ends are ±Infinity.
 */
export function slotBounds(
  timeline: TimelineCard[],
  slot: number,
): { lower: number; upper: number } {
  const lower = timeline[slot - 1]?.year ?? -Infinity
  const upper = timeline[slot]?.year ?? Infinity
  return { lower, upper }
}

/**
 * Is placing a song of `year` at `slot` correct? Bounds are inclusive on both
 * sides, so a year equal to a neighbouring card counts as correct when placed
 * directly before or after it (the equal-year rule).
 */
export function isPlacementCorrect(
  timeline: TimelineCard[],
  slot: number,
  year: number,
): boolean {
  const { lower, upper } = slotBounds(timeline, slot)
  return year >= lower && year <= upper
}

/** Insert a card and keep the timeline sorted ascending by year (stable). */
export function insertSorted(timeline: TimelineCard[], card: TimelineCard): TimelineCard[] {
  const next = [...timeline]
  let i = next.length
  while (i > 0 && (next[i - 1]?.year ?? -Infinity) > card.year) i--
  next.splice(i, 0, card)
  return next
}

/** A player has won once their timeline reaches the target size. */
export function hasWon(player: Player, winTarget: number): boolean {
  return player.timeline.length >= winTarget
}

/** Maximum tokens a player may hold. */
export const MAX_TOKENS = 5

/** Add tokens without exceeding the cap. */
export function addTokens(current: number, delta: number): number {
  return Math.max(0, Math.min(MAX_TOKENS, current + delta))
}
