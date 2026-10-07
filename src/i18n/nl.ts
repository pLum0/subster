import type { Dict } from './en'

/** Dutch translation. Must match the `Dict` shape (compile-checked). */
export const nl: Dict = {
  home: {
    tagline1: 'Raad het jaar. Bouw je tijdlijn.',
    tagline2: 'Aangedreven door je eigen Subsonic-bibliotheek.',
    newGame: 'Nieuw spel',
    connectServer: 'Server verbinden',
    serverLabel: (name: string) => `Server: ${name}`,
    serverSettings: 'Serverinstellingen',
    footer: 'Muzikale tijdreis · geen backend · geen kaartjes',
    language: 'Taal',
    canonTip: 'Tip: zoek één keer de bekende nummers op je server, voor meer afwisseling →',
  },
  server: {
    title: 'Subsonic server verbinden',
    name: 'Servernaam (optioneel)',
    namePlaceholder: 'Navidrome-Thuis',
    url: 'Server-URL',
    localUrl: 'Lokaal adres (optioneel)',
    localUrlHint:
      'Een LAN-adres (vb: http://192.168.1.20:4533) wordt automatisch gebruikt als deze benaderbaar is — thuis sneller, onderweg wordt de Server-URL gebruikt.',
    username: 'Gebruikersnaam',
    password: 'Wachtwoord',
    testing: 'Verbinding testen…',
    save: 'Testen & opslaan',
    disconnect: 'Verbreken',
    insecureUrl:
      'Onversleutelde verbinding (http) — jouw inloggegevens en muziek zijn zichtbaar voor iedereen op hetzelfde netwerk. Gebruik https als je kunt.',
    networkError:
      'Kon de server niet bereiken. In een browser is dit doorgaans CORS: de pagina (dit adresveld) en je muziekserver hebben verschillende adressen, waardoor de browser de reacties blokkeert, tenzij de server dat toestaat — zie de README.',
    networkErrorNative: 'Kon de server niet bereiken — controleer het adres en je netwerk.',
    privacy:
      'Alleen dit apparaat bewaart de aanmeldgegevens, doorgaans als een token met salt in plaats van het wachtwoord zelf. Als de server op een ander domein staat en de test faalt, is het vrijwel altijd een CORS-probleem (zie de README).',
    legacyAuth:
      'Deze server accepteert alleen verouderde verificatie — het wachtwoord wordt ongewijzigd verzonden, in plaats van via een token — dus het wachtwoord zelf moet op dit apparaat worden opgeslagen. Een appwachtwoord in plaats van je accountwachtwoord is hier een goed idee.',
    legacyAuthSaved: 'Opgeslagen — maar let op hoe deze server je aanmeldt:',
    continueAnyway: 'Begrepen, doorgaan',
    done: 'Klaar',
    saved: 'Opgeslagen servers',
    activeServer: 'in gebruik',
    addServer: '+ Nog een server toevoegen',
    clearCaches: 'Metadata-cache legen',
    cachesCleared: (n: number) => `✓ ${n} cache-items gewist`,
    clearCachesHint:
      'Gecachte opzoekingen bij Deezer, MusicBrainz en Wikidata verlopen nooit. Wis ze wanneer een verkeerd jaar of een verkeerde ranking bij de bron is gecorrigeerd — bij de volgende deck-opbouw wordt alles opnieuw opgehaald. De serververbinding en je instellingen blijven bewaard.',
    canonTitle: 'Bekende nummers',
    canonRecommended: 'Aanbevolen: zoek de bekende nummers op deze server',
    findCanon: 'Bekende nummers op deze server zoeken',
    findingCanon: (done: number, total: number) => `Zoeken… ${done} / ${total}`,
    canonFound: (n: number, of: number, byArtists: number) =>
      `✓ ${n} van de ${of} meegeleverde bekende nummers gevonden (${byArtists} van artiesten in je bibliotheek)`,
    canonFailed: 'Kon de bibliotheken niet lezen. Is de server bereikbaar?',
    findCanonHint:
      'Elke kaartenstapel mengt bekende nummers uit een meegeleverde lijst erdoor. Normaal vindt de app zo per spel een paar dozijn tegelijk in je bibliotheek, dus de eerste spellen herhalen zich vaker. Hier alles zoeken geeft meteen volledige afwisseling; doe het opnieuw nadat je muziek hebt toegevoegd. Alleen je eigen server wordt benaderd; via mobiele data kan het een paar minuten duren.',
  },
  setup: {
    title: 'Nieuw spel',
    players: 'Spelers',
    addPlayer: '+ Speler toevoegen',
    playerN: (n: number) => `Speler ${n}`,
    removePlayer: 'Speler verwijderen',
    deck: 'Kaartenstapel',
    source: 'Bron',
    libraries: 'Bibliotheken',
    playlists: 'Afspeellijsten',
    playlistSongs: (n: number) => `${n} liedjes`,
    onlineMeta: 'Online metadata',
    metaFull: 'Volledig',
    metaFullHint:
      'Populariteit wordt gerangschikt via Deezer en jaartallen worden gecorrigeerd via MusicBrainz/Wikidata.',
    metaNoRanking: 'Geen Deezer',
    metaNoRankingHint:
      'Slaat Deezer over, de enige propriëtaire dienst. Jaartallen worden nog steeds gecorrigeerd via MusicBrainz/Wikidata; de meegeleverde standaardlijst kiest de bekende nummers.',
    metaOffline: 'Offline',
    metaOfflineHint: 'Alleen jouw server wordt benaderd — de jaartallen uit de bestanden worden ongewijzigd gebruikt.',
    cardsToWin: 'Kaarten tot winst',
    cardsFewer: 'Minder kaarten',
    cardsMore: 'Meer kaarten',
    difficulty: 'Moeilijkheidsgraad',
    diffHits: 'Hits',
    diffHitsHint: 'Alleen erg bekend',
    diffBalanced: 'Gebalanceerd',
    diffBalancedHint: 'Grotendeels bekend',
    diffDeep: 'Verborgen parels',
    diffDeepHint: 'Meer obscure nummers',
    popularityNote: 'Populariteit komt van Deezer — de buitenwereld, niet je eigen afspeeltellingen.',
    hitLists: 'Hitlijsten',
    hitListIntl: 'Internationaal',
    hitListsHint:
      'Welke meegeleverde lijsten als bekende nummers tellen: de internationale (Billboard-jaarlijsten, lijsten van beste nummers) en de nummer-1-hits per land.',
    yearRange: 'Jaarbereik',
    anyYear: 'Alle',
    genre: 'Genre',
    anyGenre: 'Alle genres',
    challengeGrace: 'Coulance bij weddenschap',
    challengeGraceHint: 'Een geldige weddenschap behoudt zijn muntje, zelfs wanneer de plaatsing ook juist was (uit = oorspronkelijke regel).',
    playbackTitle: 'Afspelen',
    startTrigger: 'Start',
    triggerCountdown: 'Aftellen',
    triggerInstant: 'Meteen',
    clipLabel: 'Lengte',
    clipFull: 'Helemaal',
    clip30: '30 sec.',
    clip60: '60 sec.',
    randomStart: 'Willekeurige start',
    randomStartHint: 'Start ergens in het nummer in plaats van op 0:00.',
    lockOnEnd: 'Vergrendeling bij einde weergave',
    lockOnEndHint: 'Na het afspelen heb je 5 sec. om een plek te kiezen. (niet gekozen = een misser).',
    exclusions: 'Uitsluitingen',
    exclusionsCount: (n: number) => (n ? `${n} uitgesloten` : 'geen'),
    start: 'Start spel',
  },
  game: {
    mysterySong: 'Geheim nummer',
    quit: 'Stoppen',
    backToQuit: 'Veeg nog een keer terug om het spel te verlaten.',
    tokens: (n: number) => `${n} munt${n === 1 ? '' : 'en'}`,
    noTokens: 'geen munten',
    dealing: 'De eerste kaarten worden gedeeld…',
    ready: (n: number) => `${n} klaar`,
    startingUp: 'Wordt gestart',
    loadMore: 'meer wordt geladen tijdens het spel',
    backToSetup: 'Terug naar instellingen',
    noServer: 'Geen server ingesteld.',
    deckNetworkError: 'Kon de server niet bereiken — controleer het adres en je netwerk.',
    notEnoughSongs: (n: number) => `Slechts ${n} bruikbare nummers gevonden. Probeer meer of andere bibliotheken.`,
    notEnoughRanked: (n: number, noDeezer: string, offline: string) =>
      `Slechts ${n} nummers kwamen door het populariteitsfilter. Probeer voor een kleine of minder bekende bibliotheek “${noDeezer}” of “${offline}”, of een makkelijkere moeilijkheidsgraad.`,
    placePrompt: 'Waar hoort het op je tijdlijn?',
    skip: 'Sla dit nummer over (1 munt)',
    lockIn: 'Plaatsing bevestigen',
    reveal: 'Jaar onthullen',
    challengePrompt: 'Denk je dat het ergens anders hoort? Kies een speler en tik dan op een tussenruimte om een munt in te zetten — of onthul het gewoon.',
    challengePromptSolo: 'Denk je dat het ergens anders hoort? Tik op een tussenruimte om een munt in te zetten — of onthul het gewoon.',
    guessTag: (name: string) => `■ ${name}'s gok`,
    noTokensChip: (name: string) => `${name} (geen munten)`,
    correct: '✓ Juist!',
    stole: (name: string) => `✗ Fout — ${name} heeft de kaart gestolen!`,
    discarded: '✗ Niet helemaal — kaart weggegooid',
    skipped: '⏭ Overgeslagen — hier is het',
    broken: '⚠ Dit nummer kon niet worden afgespeeld',
    brokenHint: {
      missing:
        'De server kent dit nummer niet meer — het is waarschijnlijk verplaatst, opnieuw getagd of verwijderd sinds het deck is opgebouwd. Er is geen munt verbruikt; het volgende nummer is van het huis.',
      unreachable:
        'De server kon niet worden bereikt of weigerde het verzoek. Er is geen munt verbruikt; het volgende nummer is van het huis.',
      undecodable:
        'Het audiobestand lijkt beschadigd of in een formaat dat dit apparaat niet kan afspelen — overweeg het te repareren of te vervangen in je bibliotheek. Er is geen munt verbruikt; het volgende nummer is van het huis.',
    },
    like: 'Aan favorieten toevoegen',
    unlike: 'Uit favorieten verwijderen',
    addToPlaylist: 'Aan afspeellijst toevoegen',
    addedToPlaylist: '✓ toegevoegd',
    alreadyInPlaylist: 'is al aanwezig',
    removedFromPlaylist: 'verwijderd',
    addFailed: 'niet toegestaan',
    noPlaylists: 'Er zijn nog geen afspeellijsten op de server.',
    exclude: 'Voortaan uitsluiten',
    excludeSong: 'Dit nummer',
    excludeArtist: (name: string) => `Alles van ${name}`,
    namedOn: '✓ Titel + artiest goed (+1 munt)',
    namedOff: (name: string) => `🎤 Heeft ${name} de titel + artiest genoemd?`,
    nextPlayer: 'Volgende speler →',
    nextSong: 'Volgend nummer →',
    waitingForCards: 'Meer nummers laden…',
    seeResult: 'Uitslag bekijken →',
    revealLine: (kind, name) => {
      switch (kind) {
        case 'active-correct':
          return `${name} zat goed — behoudt de kaart`
        case 'active-wrong':
          return `${name} zat fout — geen kaart`
        case 'challenge-held':
          return `${name} heeft uitgedaagd, maar de plaatsing klopte — munt verloren`
        case 'challenge-steal':
          return `${name} trof in de roos — grist de kaart mee; munt terug`
        case 'challenge-valid':
          return `${name} zette in op een geldige plek — behoudt de munt`
        case 'challenge-wrong':
          return `${name} twijfelde ten onrechte — munt verloren`
      }
    },
  },
  exclusions: {
    title: 'Uitsluitingen',
    intro:
      'Nummers die overeenkomen op iets uit deze lijst, komen nooit in een spel voor. De lijst wordt op dit apparaat bewaard en geldt op elke server.',
    search: 'Zoek artiesten, albums, nummers, afspeellijsten',
    artists: 'Artiesten',
    albums: 'Albums',
    songs: 'Nummers',
    playlists: 'Afspeellijsten',
    exclude: 'Uitsluiten',
    excluded: '✓ Uitgesloten',
    remove: 'Verwijder van uitsluitingen',
    empty: 'Niets uitgesloten. Zoek hierboven om iets toe te voegen.',
    noResults: 'Niets gevonden.',
    searchFailed: 'Zoeken mislukt. Is de server benaderbaar?',
    playlistSongs: (n: number) => `${n} nummer${n === 1 ? '' : 's'}`,
  },
  winner: {
    winner: 'Winnaar',
    cards: (n: number) => `${n} kaarten`,
    rematch: 'Revanche',
    playAgain: 'Nog een potje',
    home: 'Start',
    deckRanOut: 'De kaartstapel raakte op voordat iemand het doel bereikte.',
    deckRanOutRanked: (noDeezer: string, offline: string) =>
      `Maar een paar nummers kwamen door het populariteitsfilter. Probeer voor een kleine of minder bekende bibliotheek “${noDeezer}” of “${offline}” in de spelinstellingen.`,
    deckRanOutSmall: 'Er zijn geen nummers meer in je selectie. Kies meer bibliotheken of minder kaarten om te winnen.',
  },
  a11y: {
    back: 'Terug',
    play: 'Afspelen',
    pause: 'Pauze',
    position: (n: number) => `Positie ${n}`,
  },
}
