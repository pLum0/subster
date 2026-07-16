<p align="center">
  <img src="fastlane/metadata/android/en-US/images/featureGraphic.png" alt="Subster — guess the year, build your timeline" width="720">
</p>

# <img src="public/icon.svg" alt="Subster icon" width="42" align="top"> Subster

A backend-free, smartphone-only **music timeline party game** that plays **your own music** from a
[Subsonic](https://www.subsonic.org/)-compatible server (Navidrome, Airsonic, Gonic, …). A random
song plays blind; you place it on your timeline by guessing whether it's older or newer than the
songs already there. Guess right, keep the card. First to 10 cards wins.

No physical cards, no accounts, **no backend** — just your phone and your own music library.

## Screenshots

<p align="center">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/1_home.png" alt="Home screen" width="23%">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/2_newgame.png" alt="New game setup" width="23%">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/3_placing.png" alt="Placing a song on the timeline" width="23%">
  <img src="fastlane/metadata/android/en-US/images/phoneScreenshots/4_reveal.png" alt="Song reveal" width="23%">
</p>

## Status

**A fully playable pass-and-play game on one phone** (milestones 1–3 plus most of the ruleset):

- ✅ Subsonic connection (token auth) + connection test
- ✅ **Library picker** — draw from a chosen music folder (e.g. skip your Audiobooks library)
- ✅ **Original release year** via [MusicBrainz](https://musicbrainz.org/): a song's file year is often
  a remaster/compilation year, so we look the recording up (by its MusicBrainz ID → ISRC → Deezer ISRC →
  fuzzy text, in that order) and take the earliest release-group date. Falls back to the file's year if
  nothing resolves. (e.g. "The Boxer" tagged 1991 on a Greatest-Hits album → corrected to 1969.)
- ✅ **Deck builder**: a **75/25 known-vs-rest mix** where "known" is chosen by *oversampling* — a large
  pool is ranked by [Deezer](https://www.deezer.com/)'s track `rank` and the genuinely top-ranked songs
  become the known pool (the obscure long tail is discarded), so the deck actually feels recognizable.
  Live/unplugged versions are filtered out; a √-weighted decade spread is applied per chunk.
- ✅ **Curated canon**: a bundled, offline list of widely-famous songs (Billboard Year-End Hot 100
  1959–2024, German/Austrian/Swiss #1 singles, "greatest songs" critic lists — factual chart data,
  region-grouped in `src/metadata/curated.json`). Canon songs found in your library are boosted into
  the deck regardless of Deezer play counts, which under-rate older or regional hits.
- ✅ **Incremental deck**: the pool is ranked cheaply, then original years are resolved chunk by chunk —
  the first chunk lets play start; the rest fill in the background (Deezer/MusicBrainz calls are cached).
- ✅ Core game: blind playback, timeline placement, reveal, win target (configurable)
- ✅ **Tokens & rules**: skip (1 token), **challenges** — other players bet a token on a different gap
  and steal the card if they're right (optional grace rule), **naming bonus** (+1 token for naming
  title + artist), equal-year placements count as correct
- ✅ **Playback options**: countdown or instant start, full song / 30s / 60s clips, random start
  position, lock-on-end mode with a big flashing placement countdown
- ✅ **Difficulty presets** (Hits / Balanced / Deep cuts) + year-range and genre filters
- ✅ Installable as a **PWA** (offline app shell) and as an **Android APK**; on Android the song keeps
  playing with the screen off via a native media session (lock-screen controls)
- ✅ English + German UI
- ⏳ Later: PRO/EXPERT/Teamwork modes, multi-device real-time play (Trystero P2P)

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (game engine, deck builder, metadata, Subsonic client)
npm run typecheck
npm run build      # production build → dist/
```

## How it connects to Subsonic

On first launch you enter your server URL, username, and password. The password is **never stored**
— only a salted token (`token = md5(password + salt)`) is kept in this device's `localStorage`, and
only on the device that acts as host/DJ.

Prefer an **https** server URL: with plain `http`, the token (which grants API access) and your
audio travel unencrypted through your network. The app shows a warning when you enter an `http://`
URL but still allows it, since LAN-only setups are common.

- **Audio** streams via `stream.view` into an `<audio>` element, and **cover art** via
  `getCoverArt.view` into `<img>`. Neither is affected by CORS.
- **The JSON API calls** (`ping`, `getRandomSongs`, `getGenres`, …) are `fetch` requests, which
  browsers gate with CORS. See below.

### CORS (browser only)

CORS is a browser rule about *reading* cross-origin responses — nothing is ever written to your
server. It only affects the JSON API calls. Two ways to satisfy it:

1. **Same-origin (simplest):** serve Subster's static `dist/` behind the same reverse proxy as your
   Subsonic server (e.g. both under `https://music.example.com`). Then there's no cross-origin
   request and no CORS at all.
2. **Enable CORS** on your server / reverse proxy so it returns `Access-Control-Allow-Origin`.

The **Android app avoids CORS completely** — it uses Capacitor's native HTTP layer, so API calls
don't go through the browser's CORS gate. Any reachable Subsonic server works without extra config.
This also matters for **Deezer** (popularity), which sends no CORS headers: popularity works in the
APK but not in a plain desktop-browser build (where songs just fall back to "unknown"). MusicBrainz
sends `Access-Control-Allow-Origin: *`, so original-year resolution works everywhere.

## Privacy

Subster has no backend, no accounts, and no analytics. To build the deck it sends the **artist,
title, and ISRC** of candidate songs from your library to two public APIs:

- **Deezer** — to rank how recognizable a track is (its public play-count rank), and
- **MusicBrainz** — to find a song's original release year.

Nothing else leaves your device: no user identity, no server address, no listening history. Both
APIs are contacted over https, and all lookups are cached locally so repeat games re-send nothing.
If that tradeoff isn't for you, the deck still works without them — songs fall back to the file's
tagged year and "unknown" popularity.

### First run is slower

Resolving a song hits Deezer (popularity) and MusicBrainz (original year, rate-limited to ~1 req/s).
The deck builds incrementally — a small first batch lets the game start quickly, then it tops up in the
background. All lookups are cached in `localStorage`, so later games with the same library are fast.

## Android (install on a device via adb)

Subster wraps the web build in a [Capacitor](https://capacitorjs.com/) WebView so it installs as a
normal APK (app id `app.subster`).

Requirements: Android SDK (platform 34/35) and a **full JDK 17** — Gradle/AGP 8.2 need JDK 17
specifically (not 21), and it must include `jlink`/`jmods` (some distro JRE packages don't;
[Temurin](https://adoptium.net/) 17 works).

```bash
export ANDROID_HOME=~/Android/Sdk
export JAVA_HOME=/path/to/jdk-17     # full JDK 17 with jlink
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Releases

Pushing a git tag `vX.Y.Z` triggers the [release workflow](.github/workflows/release.yml): it runs
the tests, builds the web bundle and a **signed APK** (version name/code derived from the tag), and
attaches both to a GitHub Release.

One-time setup — create a release keystore and add it to the repo's Actions secrets:

```bash
keytool -genkeypair -v -keystore release.keystore -alias subster \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 release.keystore   # → secret ANDROID_KEYSTORE_BASE64
# also set: ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
```

Keep `release.keystore` somewhere safe and **out of the repo** (`*.keystore` is gitignored) — all
future APKs must be signed with it for in-place updates to work.

## License

[MIT](LICENSE)
