import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../Layout'
import { Button } from '../../ui/Button'
import { SongActions } from '../../ui/SongActions'
import { SongCard } from '../../ui/SongCard'
import { Timeline } from '../../ui/Timeline'
import { TokenBar } from '../../ui/TokenBar'
import { useGameStore } from '../../store/gameStore'
import { activePlayer } from '../../game/selectors'
import { MAX_TOKENS } from '../../game/rules'
import { audioPlayer } from '../../audio/player'
import { allowScreenSleep, keepScreenOn } from '../../platform/screen'
import { useT } from '../../i18n'

export function Game() {
  const navigate = useNavigate()
  const t = useT()
  const { game, status, dealt, error, countdown, placeCountdown, clipEnded, quitHint, place, skip, openChallenges, challenge, unchallenge, reveal, awardNaming, nextTurn, toggleAudio, quit } =
    useGameStore()

  // Which challenger is currently armed to place/adjust a bet.
  const [betting, setBetting] = useState<number | null>(null)
  // Naming bonus is toggled during reveal and committed on "Next" (avoids misclicks).
  const [named, setNamed] = useState(false)
  // Mirror the audio element's play/pause state for the mystery card.
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (status === 'idle') navigate('/setup')
    // Only navigate on a *live* game's end — not while a rematch is rebuilding
    // (status 'building'), when the previous game's gameover state still lingers.
    if (status === 'ready' && game.phase === 'gameover' && game.winnerId) navigate('/winner')
  }, [status, game.phase, game.winnerId, navigate])

  useEffect(() => {
    void keepScreenOn()
    return () => {
      void allowScreenSleep()
    }
  }, [])

  useEffect(() => {
    setBetting(null)
    setNamed(false)
  }, [game.turn.song?.id, game.turn.activePlayerIndex])

  useEffect(() => {
    setPlaying(audioPlayer.playing)
    const id = setInterval(() => setPlaying(audioPlayer.playing), 500)
    return () => clearInterval(id)
  }, [game.turn.song?.id])

  if (status === 'building') {
    return (
      <Layout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="h-16 w-16 animate-[spin_1.2s_linear_infinite] rounded-full border-4 border-slate-700 border-t-brand-500" />
          <div>
            <p className="font-semibold">{t.game.dealing}</p>
            <p className="text-sm text-slate-500">
              {dealt > 0 ? t.game.ready(dealt) : t.game.startingUp} — {t.game.loadMore}
            </p>
          </div>
        </div>
      </Layout>
    )
  }

  if (status === 'error') {
    return (
      <Layout>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-red-300">{error}</p>
          <Button variant="secondary" onClick={() => navigate('/setup')}>
            {t.game.backToSetup}
          </Button>
        </div>
      </Layout>
    )
  }

  if (status !== 'ready' || !game.turn.song) return <Layout>{null}</Layout>

  const player = activePlayer(game)
  const activeIdx = game.turn.activePlayerIndex
  const revealed = game.phase === 'revealed'
  const { pendingSlot, challenges, lastResult, stealerId } = game.turn

  const someoneCanChallenge =
    game.players.length > 1 && game.players.some((p, i) => i !== activeIdx && p.tokens > 0)

  // A player can be armed to bet if they hold a token or already have a bet (to adjust it).
  const hasBet = (i: number) => challenges.some((c) => c.playerIndex === i)
  const armable = game.players
    .map((_, i) => i)
    .filter((i) => i !== activeIdx && ((game.players[i]?.tokens ?? 0) > 0 || hasBet(i)))
  const armed = betting ?? (armable.length === 1 ? armable[0]! : null)

  // Timeline markers/disabled during challenging. The armed player's own bet
  // slot stays tappable (to move/remove); everything else is locked.
  const challengeMarkers: Record<number, { label: string; tone: 'active' | 'bet' }> = {}
  const disabled: number[] = []
  if (game.phase === 'challenging') {
    if (pendingSlot != null) {
      challengeMarkers[pendingSlot] = { label: String(activeIdx + 1), tone: 'active' }
      disabled.push(pendingSlot)
    }
    for (const c of challenges) {
      challengeMarkers[c.slot] = { label: String(c.playerIndex + 1), tone: 'bet' }
      if (c.playerIndex !== armed) disabled.push(c.slot)
    }
  }

  function onBetSlot(slot: number) {
    if (armed == null) return
    const myBet = challenges.find((c) => c.playerIndex === armed)
    if (myBet?.slot === slot) {
      unchallenge(armed) // tap own slot again → remove
    } else {
      if (myBet) unchallenge(armed) // tap a different slot → move
      challenge(armed, slot)
    }
  }

  const stealer = stealerId ? game.players.find((p) => p.id === stealerId) : null

  return (
    <Layout>
      {quitHint && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-800/95 px-4 py-2 text-sm text-slate-200 shadow-lg ring-1 ring-slate-600">
          {t.game.backToQuit}
        </div>
      )}
      <header className="flex items-start justify-between py-2">
        <div>
          <div className="text-lg font-bold">{player.name}</div>
          <div className="mt-0.5 flex items-center gap-1">
            {player.tokens > 0 ? (
              <>
                {Array.from({ length: player.tokens }).map((_, i) => (
                  <span key={i} className="inline-block h-4 w-4 rounded-full bg-amber-400 shadow-sm shadow-amber-400/40" />
                ))}
                <span className="ml-1 text-xs text-slate-400">{t.game.tokens(player.tokens)}</span>
              </>
            ) : (
              <span className="text-xs text-slate-600">{t.game.noTokens}</span>
            )}
          </div>
        </div>
        <button className="text-sm text-slate-500" onClick={() => { quit(); navigate('/') }}>
          {t.game.quit}
        </button>
      </header>

      <div className="pb-1">
        <TokenBar players={game.players} activeIndex={activeIdx} winTarget={game.settings.winTarget} />
      </div>

      <div className="flex flex-col items-center py-2">
        <SongCard
          song={game.turn.song}
          revealed={revealed}
          result={lastResult === 'skipped' || lastResult === 'broken' ? null : lastResult}
          playing={playing}
          countdown={countdown}
          placeCountdown={placeCountdown}
          disabled={clipEnded}
          onToggle={toggleAudio}
          actions={
            revealed && lastResult !== 'broken' ? <SongActions song={game.turn.song} /> : undefined
          }
        />
      </div>

      {/* PLACING */}
      {game.phase === 'placing' && (
        <>
          <p className="px-1 pb-1 text-sm font-medium text-slate-400">{t.game.placePrompt}</p>
          <Timeline timeline={player.timeline} mode="placing" pendingSlot={pendingSlot} onPick={place} />
          <div className="mt-auto flex flex-col gap-2 py-3">
            {player.tokens > 0 && (
              <Button variant="ghost" onClick={skip}>
                {t.game.skip}
              </Button>
            )}
            {someoneCanChallenge ? (
              <Button disabled={pendingSlot == null} onClick={openChallenges}>
                {t.game.lockIn}
              </Button>
            ) : (
              <Button disabled={pendingSlot == null} onClick={reveal}>
                {t.game.reveal}
              </Button>
            )}
          </div>
        </>
      )}

      {/* CHALLENGING */}
      {game.phase === 'challenging' && (
        <>
          <p className="px-1 pb-1 text-sm font-medium text-slate-400">
            {game.players.length > 2 ? t.game.challengePrompt : t.game.challengePromptSolo}{' '}
            <span className="text-brand-300">{t.game.guessTag(player.name)}</span>
          </p>
          <Timeline
            timeline={player.timeline}
            mode="placing"
            markers={challengeMarkers}
            disabledSlots={disabled}
            onPick={onBetSlot}
          />
          {/* Only show the player picker when there's more than one possible bettor. */}
          {game.players.length > 2 && (
            <div className="mt-2 flex flex-wrap gap-2 px-1">
              {game.players.map((p, i) => {
                if (i === activeIdx) return null
                if (!armable.includes(i)) {
                  return (
                    <span key={i} className="rounded-full px-3 py-1.5 text-sm text-slate-600">
                      {t.game.noTokensChip(p.name)}
                    </span>
                  )
                }
                return (
                  <button
                    key={i}
                    onClick={() => setBetting(betting === i ? null : i)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      armed === i
                        ? 'bg-amber-500 text-slate-900'
                        : hasBet(i)
                          ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500'
                          : 'bg-slate-800 text-slate-200 ring-1 ring-slate-600'
                    }`}
                  >
                    {p.name} #{i + 1}
                    {hasBet(i) ? ' ·●' : ''}
                  </button>
                )
              })}
            </div>
          )}
          <div className="mt-auto py-3">
            <Button className="w-full" onClick={reveal}>
              {t.game.reveal}
            </Button>
          </div>
        </>
      )}

      {/* REVEALED */}
      {revealed && (
        <>
          <p className="px-1 pb-1 text-base font-semibold">
            {lastResult === 'skipped'
              ? t.game.skipped
              : lastResult === 'broken'
                ? t.game.broken
                : lastResult === 'correct'
                  ? t.game.correct
                  : stealer
                    ? t.game.stole(stealer.name)
                    : t.game.discarded}
          </p>
          {lastResult === 'broken' && (
            <p className="mb-1 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200 ring-1 ring-amber-500/30">
              {t.game.brokenHint}
            </p>
          )}
          {game.turn.reveal.length > 0 && (
            <div className="mb-1 flex flex-col gap-1 rounded-xl bg-slate-800/60 p-3">
              {game.turn.reveal.map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-base">
                  {(() => {
                    const good =
                      line.kind === 'active-correct' ||
                      line.kind === 'challenge-steal' ||
                      line.kind === 'challenge-valid'
                    return (
                      <span className={good ? 'text-emerald-400' : 'text-red-400'}>{good ? '✓' : '✗'}</span>
                    )
                  })()}
                  <span className="text-slate-200">{t.game.revealLine(line.kind, line.name)}</span>
                </div>
              ))}
            </div>
          )}
          <Timeline timeline={player.timeline} mode="view" />
          <div className="mt-auto flex flex-col gap-2 py-3">
            {!game.winnerId && lastResult !== 'skipped' && lastResult !== 'broken' && player.tokens < MAX_TOKENS && (
              <Button
                variant="secondary"
                className={named ? 'bg-emerald-600/30 text-emerald-100 ring-2 ring-emerald-500' : ''}
                onClick={() => setNamed((v) => !v)}
              >
                {named ? t.game.namedOn : t.game.namedOff(player.name)}
              </Button>
            )}
            <Button
              onClick={() => {
                if (named) awardNaming()
                nextTurn()
              }}
            >
              {game.winnerId
                ? t.game.seeResult
                : lastResult === 'skipped' || lastResult === 'broken' || game.players.length === 1
                  ? t.game.nextSong
                  : t.game.nextPlayer}
            </Button>
          </div>
        </>
      )}
    </Layout>
  )
}

