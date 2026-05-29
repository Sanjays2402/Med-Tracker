#!/usr/bin/env bash
set -euo pipefail
VER=${1:?usage: release.sh <version>}
npm version "$VER" --no-git-tag-version
git add package.json
git commit -m "chore(release): v$VER"
git tag "v$VER"
