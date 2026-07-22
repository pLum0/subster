import type { RevealKind } from '../game/types'

/**
 * English strings — the source of truth for all UI copy. Every other language
 * must implement this exact shape (`Dict`), so a missing translation is a
 * compile error. Values that need interpolation/plurals are functions.
 */
export const en = {
  home: {
    tagline1: 'Guess the year. Build your timeline.',
    tagline2: 'Powered by your own Subsonic library.',
    newGame: 'New game',
    connectServer: 'Connect your server',
    serverLabel: (name: string) => `Server: ${name}`,
    serverSettings: 'Server settings',
    footer: 'Musical time-travel · no backend · no cards',
    language: 'Language',
  },
  server: {
    title: 'Connect your Subsonic server',
    name: 'Server name (optional)',
    namePlaceholder: 'Home Navidrome',
    url: 'Server URL',
    localUrl: 'Local address (optional)',
    localUrlHint:
      'A LAN address (e.g. http://192.168.1.20:4533) used automatically whenever it is reachable — faster at home, falls back to the server URL when away.',
    username: 'Username',
    password: 'Password',
    testing: 'Testing connection…',
    save: 'Test & save',
    disconnect: 'Disconnect',
    insecureUrl:
      'Unencrypted connection (http) — your credentials and music are visible to anyone on the same network. Use https if you can.',
    // Browser builds: cross-origin JSON reads are blocked unless the server
    // sends CORS headers — by far the most common cause there.
    networkError:
      'Could not reach the server. In a browser this is usually CORS: the page (this address bar) and your music server have different addresses, so the browser blocks the responses unless the server allows it — see the README.',
    // Native app: CORS never applies; it is a plain connectivity problem.
    networkErrorNative: 'Could not reach the server — check the address and your network.',
    privacy:
      'Only this device stores the credentials, and only as a salted token — never the raw password. If the server is on another domain and the test fails, it is almost always CORS (see the README).',
  },
  setup: {
    title: 'New game',
    players: 'Players',
    addPlayer: '+ Add player',
    playerN: (n: number) => `Player ${n}`,
    removePlayer: 'Remove player',
    deck: 'Deck',
    library: 'Library',
    source: 'Source',
    libraries: 'Libraries',
    allLibraries: 'All libraries',
    playlists: 'Playlists',
    playlistSongs: (n: number) => `${n} songs`,
    onlineMeta: 'Online metadata',
    onlineMetaOnHint:
      'Popularity is ranked via Deezer and years are corrected via MusicBrainz/Wikidata.',
    onlineMetaOffHint: 'Only your server is contacted — file years are used as-is.',
    cardsToWin: 'Cards to win',
    difficulty: 'Difficulty',
    diffHits: 'Hits',
    diffHitsHint: 'Only very famous',
    diffBalanced: 'Balanced',
    diffBalancedHint: 'Mostly known',
    diffDeep: 'Deep cuts',
    diffDeepHint: 'More obscure',
    popularityNote: 'Popularity comes from Deezer — the wider world, not your own plays.',
    yearRange: 'Year range',
    anyYear: 'any',
    genre: 'Genre',
    anyGenre: 'Any genre',
    challengeGrace: 'Challenge grace',
    challengeGraceHint: 'A valid bet keeps its token even if the placement was also right (off = original rule).',
    playbackTitle: 'Playback',
    startTrigger: 'Start',
    triggerCountdown: 'Countdown',
    triggerInstant: 'Instant',
    clipLabel: 'Length',
    clipFull: 'Full',
    clip30: '30s',
    clip60: '60s',
    randomStart: 'Random start',
    randomStartHint: 'Begin somewhere in the song instead of at 0:00.',
    lockOnEnd: 'Lock on playback end',
    lockOnEndHint: 'A 5s countdown to place; when playback ends the placement locks (no placement = a miss).',
    start: 'Start game',
  },
  game: {
    quit: 'Quit',
    backToQuit: 'Swipe back again to quit the game',
    tokens: (n: number) => `${n} token${n === 1 ? '' : 's'}`,
    noTokens: 'no tokens',
    dealing: 'Dealing the first cards…',
    ready: (n: number) => `${n} ready`,
    startingUp: 'Starting up',
    loadMore: 'more load as you play',
    backToSetup: 'Back to setup',
    placePrompt: 'Where does it go on your timeline?',
    skip: 'Skip this song (1 token)',
    lockIn: 'Lock in placement',
    reveal: 'Reveal year',
    challengePrompt: 'Think it belongs elsewhere? Pick a player, then tap a gap to bet a token — or just reveal.',
    challengePromptSolo: 'Think it belongs elsewhere? Tap a gap to bet a token — or just reveal.',
    guessTag: (name: string) => `■ ${name}'s guess`,
    noTokensChip: (name: string) => `${name} (no tokens)`,
    correct: '✓ Correct!',
    stole: (name: string) => `✗ Wrong — ${name} stole the card!`,
    discarded: '✗ Not quite — card discarded',
    skipped: '⏭ Skipped — here it is',
    broken: '⚠ This song could not be played',
    brokenHint:
      'The audio file appears to be broken — consider fixing or replacing it in your library. No token was spent; the next song is on the house.',
    namedOn: '✓ Named title + artist (+1 token)',
    namedOff: (name: string) => `🎤 ${name} named title + artist?`,
    nextPlayer: 'Next player →',
    nextSong: 'Next song →',
    seeResult: 'See result →',
    revealLine: (kind: RevealKind, name: string): string => {
      switch (kind) {
        case 'active-correct':
          return `${name} placed it correctly — keeps the card`
        case 'active-wrong':
          return `${name} placed it wrong — no card`
        case 'challenge-held':
          return `${name} challenged, but the placement held — lost a token`
        case 'challenge-steal':
          return `${name} nailed the spot — steals the card, token back`
        case 'challenge-valid':
          return `${name} bet a valid spot — keeps the token`
        case 'challenge-wrong':
          return `${name} challenged wrong — lost a token`
      }
    },
  },
  winner: {
    winner: 'Winner',
    cards: (n: number) => `${n} cards`,
    rematch: 'Rematch',
    playAgain: 'Play again',
    home: 'Home',
  },
  /** Screen-reader-only labels (aria-label etc.). */
  a11y: {
    back: 'Back',
    play: 'Play',
    pause: 'Pause',
    position: (n: number) => `Position ${n}`,
  },
}

export type Dict = typeof en
