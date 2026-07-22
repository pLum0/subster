# Submitting Subster to F-Droid

Status: **submitted 2026-07-22** —
<https://gitlab.com/fdroid/fdroiddata/-/merge_requests/43590> (fork:
`gitlab.com/pLum0/f-droid-data`, branch `app.subster`; fork CI fully green
incl. `fdroid build` before submission). Awaiting review. The maintained
recipe draft is [`app.subster.yml`](app.subster.yml) in this directory.

## Prerequisites (already in place)

- MIT license, public GitHub repo, fastlane metadata (en-US/de-DE) in-repo —
  F-Droid pulls summary/description/screenshots/changelogs from there.
- All dependencies are FOSS (npm: MIT/0BSD; `@jofr/capacitor-media-session` is
  GPL-3.0-or-later, which is fine for F-Droid).
- `versionCode`/`versionName` live in `android/app/build.gradle` (bumped by
  `scripts/release.sh`), so F-Droid can build any `vX.Y.Z` tag as-is and
  auto-detect new releases (`AutoUpdateMode: Version`, `UpdateCheckMode: Tags`).
- Release builds are unsigned without keystore env vars — exactly what the
  F-Droid buildserver needs (it signs with the F-Droid key).

## Submission steps (maintainer)

1. Create/log into a GitLab account and fork
   <https://gitlab.com/fdroid/fdroiddata>.
2. Branch `app.subster`, copy `docs/fdroid/app.subster.yml` from this repo to
   `metadata/app.subster.yml` in the fork (drop the draft header comment).
3. Push — the fork's GitLab CI lints the metadata and runs a full test build.
   Fix what it flags.
4. Open a merge request against `fdroid/fdroiddata` titled **"New app: Subster"**
   and fill in their MR checklist.
5. Expect review latency of weeks up to a few months; answer reviewer questions
   on the MR. Be transparent if development tooling (AI assistance) comes up —
   main F-Droid has no policy against it (unlike IzzyOnDroid).

## Known review wrinkles

- **Prebuilt build-tool binaries in node_modules** (esbuild 0.21.x, rollup 4
  native modules): `scandelete: node_modules` covers the scanner, and several
  merged Capacitor apps (e.g. `io.perfice.app`) use exactly this simple recipe.
  If a reviewer asks for build-from-source tooling instead, mirror
  `us.materialio.app`: add `srclibs: [esbuild@v0.21.5]`, `make esbuild`, and
  copy the binary over `node_modules/@esbuild/linux-x64/bin/esbuild` in a
  `build:` block.
- **Signature**: the F-Droid APK is signed by F-Droid, not with our release
  key. Switching an existing install between GitHub-release/Obtainium and
  F-Droid requires a one-time uninstall/reinstall. Add a README note once the
  app is published.

## After the MR is merged

- The app appears on f-droid.org after the next build/publish cycle (days).
- Future releases need nothing extra: tag with `scripts/release.sh` as usual;
  F-Droid's checkupdates picks up the tag and builds automatically.
- Add the F-Droid badge + signature note to the README.
