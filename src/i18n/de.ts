import type { Dict } from './en'

/** German translation. Must match the `Dict` shape (compile-checked). */
export const de: Dict = {
  home: {
    tagline1: 'Rate das Jahr. Bau deine Zeitleiste.',
    tagline2: 'Mit deiner eigenen Subsonic-Bibliothek.',
    newGame: 'Neues Spiel',
    connectServer: 'Server verbinden',
    serverLabel: (name: string) => `Server: ${name}`,
    serverSettings: 'Server-Einstellungen',
    footer: 'Musikalische Zeitreise · kein Backend · keine Karten',
    language: 'Sprache',
  },
  server: {
    title: 'Subsonic-Server verbinden',
    name: 'Servername (optional)',
    namePlaceholder: 'Heim-Navidrome',
    url: 'Server-URL',
    localUrl: 'Lokale Adresse (optional)',
    localUrlHint:
      'Eine LAN-Adresse (z. B. http://192.168.1.20:4533), die automatisch genutzt wird, wenn sie erreichbar ist — schneller zu Hause, unterwegs gilt die Server-URL.',
    username: 'Benutzername',
    password: 'Passwort',
    testing: 'Verbindung wird getestet…',
    save: 'Testen & speichern',
    disconnect: 'Trennen',
    insecureUrl:
      'Unverschlüsselte Verbindung (http) — Zugangsdaten und Musik sind für alle im selben Netzwerk sichtbar. Nutze wenn möglich https.',
    networkError:
      'Der Server ist nicht erreichbar. Im Browser ist das meist CORS: Die Seite (diese Adresszeile) und dein Musikserver haben verschiedene Adressen, deshalb blockiert der Browser die Antworten, sofern der Server es nicht erlaubt — siehe README.',
    networkErrorNative: 'Der Server ist nicht erreichbar — prüfe Adresse und Netzwerk.',
    privacy:
      'Nur dieses Gerät speichert die Zugangsdaten, und nur als gesalzenen Token — nie das Klartext-Passwort. Wenn der Server auf einer anderen Domain liegt und der Test fehlschlägt, ist es fast immer CORS (siehe README).',
    clearCaches: 'Metadaten-Cache leeren',
    cachesCleared: (n: number) => `✓ ${n} Einträge gelöscht`,
    clearCachesHint:
      'Gespeicherte Deezer/MusicBrainz/Wikidata-Abfragen verfallen nie. Leere sie, wenn ein falsches Jahr oder Ranking an der Quelle korrigiert wurde — das nächste Deck holt alles frisch. Serververbindung und Einstellungen bleiben erhalten.',
  },
  setup: {
    title: 'Neues Spiel',
    players: 'Spieler',
    addPlayer: '+ Spieler hinzufügen',
    playerN: (n: number) => `Spieler ${n}`,
    removePlayer: 'Spieler entfernen',
    deck: 'Kartenstapel',
    library: 'Bibliothek',
    source: 'Quelle',
    libraries: 'Bibliotheken',
    allLibraries: 'Alle Bibliotheken',
    playlists: 'Playlists',
    playlistSongs: (n: number) => `${n} Songs`,
    onlineMeta: 'Online-Metadaten',
    onlineMetaOnHint:
      'Bekanntheit kommt von Deezer, Jahre werden über MusicBrainz/Wikidata korrigiert.',
    onlineMetaOffHint: 'Nur dein Server wird kontaktiert — die Datei-Jahre werden direkt verwendet.',
    cardsToWin: 'Karten zum Sieg',
    difficulty: 'Schwierigkeit',
    diffHits: 'Hits',
    diffHitsHint: 'Nur sehr bekannt',
    diffBalanced: 'Ausgewogen',
    diffBalancedHint: 'Meist bekannt',
    diffDeep: 'Raritäten',
    diffDeepHint: 'Eher unbekannt',
    popularityNote: 'Die Bekanntheit kommt von Deezer — die weite Welt, nicht deine eigenen Plays.',
    yearRange: 'Jahresbereich',
    anyYear: 'egal',
    genre: 'Genre',
    anyGenre: 'Alle Genres',
    challengeGrace: 'Kulanz bei Wetten',
    challengeGraceHint: 'Eine gültige Wette behält ihren Token, auch wenn die Platzierung ebenfalls stimmte (aus = Originalregel).',
    playbackTitle: 'Wiedergabe',
    startTrigger: 'Start',
    triggerCountdown: 'Countdown',
    triggerInstant: 'Sofort',
    clipLabel: 'Länge',
    clipFull: 'Ganz',
    clip30: '30 Sek.',
    clip60: '60 Sek.',
    randomStart: 'Zufälliger Start',
    randomStartHint: 'Irgendwo im Song beginnen statt bei 0:00.',
    lockOnEnd: 'Sperren bei Wiedergabe-Ende',
    lockOnEndHint: '5-Sek.-Countdown zum Platzieren; endet die Wiedergabe, wird die Platzierung gesperrt (keine Platzierung = Pech gehabt).',
    start: 'Spiel starten',
  },
  game: {
    quit: 'Beenden',
    backToQuit: 'Nochmal zurück wischen, um das Spiel zu beenden',
    tokens: (n: number) => `${n} Token`,
    noTokens: 'keine Token',
    dealing: 'Erste Karten werden ausgeteilt…',
    ready: (n: number) => `${n} bereit`,
    startingUp: 'Wird gestartet',
    loadMore: 'mehr laden während du spielst',
    backToSetup: 'Zurück zur Einrichtung',
    placePrompt: 'Wohin gehört der Song auf deiner Zeitleiste?',
    skip: 'Song überspringen (1 Token)',
    lockIn: 'Platzierung bestätigen',
    reveal: 'Jahr aufdecken',
    challengePrompt: 'Glaubst du, er gehört woanders hin? Wähle einen Spieler, dann tippe auf eine Lücke, um einen Token zu setzen — oder decke einfach auf.',
    challengePromptSolo: 'Glaubst du, er gehört woanders hin? Tippe auf eine Lücke, um einen Token zu setzen — oder decke einfach auf.',
    guessTag: (name: string) => `■ Tipp von ${name}`,
    noTokensChip: (name: string) => `${name} (keine Token)`,
    correct: '✓ Richtig!',
    stole: (name: string) => `✗ Falsch — ${name} schnappt sich die Karte!`,
    discarded: '✗ Knapp daneben — Karte verworfen',
    skipped: '⏭ Übersprungen — das war es',
    broken: '⚠ Dieser Song konnte nicht abgespielt werden',
    brokenHint:
      'Die Audiodatei scheint defekt zu sein — am besten in der Bibliothek reparieren oder ersetzen. Kein Token verbraucht; der nächste Song geht aufs Haus.',
    like: 'Zu Favoriten hinzufügen',
    unlike: 'Aus Favoriten entfernen',
    addToPlaylist: 'Zu Playlist hinzufügen',
    addedToPlaylist: '✓ hinzugefügt',
    alreadyInPlaylist: 'schon enthalten',
    removedFromPlaylist: 'entfernt',
    addFailed: 'nicht erlaubt',
    noPlaylists: 'Noch keine Playlists auf dem Server.',
    namedOn: '✓ Titel + Interpret genannt (+1 Token)',
    namedOff: (name: string) => `🎤 Hat ${name} Titel + Interpret genannt?`,
    nextPlayer: 'Nächster Spieler →',
    nextSong: 'Nächster Song →',
    seeResult: 'Ergebnis ansehen →',
    revealLine: (kind, name) => {
      switch (kind) {
        case 'active-correct':
          return `${name} lag richtig — behält die Karte`
        case 'active-wrong':
          return `${name} lag falsch — keine Karte`
        case 'challenge-held':
          return `${name} hat angezweifelt, aber die Platzierung stimmte — Token verloren`
        case 'challenge-steal':
          return `${name} traf ins Schwarze — schnappt sich die Karte, Token zurück`
        case 'challenge-valid':
          return `${name} setzte auf einen gültigen Platz — behält den Token`
        case 'challenge-wrong':
          return `${name} lag mit dem Zweifel daneben — Token verloren`
      }
    },
  },
  winner: {
    winner: 'Sieger',
    cards: (n: number) => `${n} Karten`,
    rematch: 'Revanche',
    playAgain: 'Nochmal spielen',
    home: 'Start',
  },
  a11y: {
    back: 'Zurück',
    play: 'Abspielen',
    pause: 'Pause',
    position: (n: number) => `Position ${n}`,
  },
}
