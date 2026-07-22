#!/usr/bin/env bash
# Cut a release: scripts/release.sh 0.2.0
#
# Writes versionCode/versionName into android/app/build.gradle (they must live
# in the repo so F-Droid can build from the tag), ensures fastlane changelogs
# exist for the new versionCode, commits, and tags vX.Y.Z. Push with:
#   git push && git push origin vX.Y.Z
set -euo pipefail

VERSION="${1:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "usage: scripts/release.sh <major.minor.patch>" >&2
  exit 1
}

cd "$(dirname "$0")/.."
IFS=. read -r MAJOR MINOR PATCH <<<"$VERSION"
CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))
GRADLE=android/app/build.gradle

git diff --quiet && git diff --cached --quiet || {
  echo "working tree not clean — commit or stash first" >&2
  exit 1
}

# Changelogs first: a release without release notes is a bug.
MISSING=0
for locale in en-US de-DE; do
  f="fastlane/metadata/android/$locale/changelogs/$CODE.txt"
  if [[ ! -s "$f" ]]; then
    echo "missing changelog: $f" >&2
    MISSING=1
  fi
done
[[ $MISSING -eq 0 ]] || exit 1

sed -i -E "s/^(\s*)versionCode [0-9]+/\1versionCode $CODE/" "$GRADLE"
sed -i -E "s/^(\s*)versionName \"[^\"]*\"/\1versionName \"$VERSION\"/" "$GRADLE"
grep -q "versionCode $CODE" "$GRADLE" && grep -q "versionName \"$VERSION\"" "$GRADLE" || {
  echo "failed to update $GRADLE" >&2
  exit 1
}

git add "$GRADLE" fastlane
git commit -m "Release v$VERSION"
git tag "v$VERSION"
echo "tagged v$VERSION (versionCode $CODE) — push with: git push && git push origin v$VERSION"
