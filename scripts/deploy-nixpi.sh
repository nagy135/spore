#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
git diff --quiet
git diff --cached --quiet
git pull --ff-only origin master
npm ci
npm test
npm run build

revision=$(git rev-parse HEAD)
site_root=/var/www/spore
release="$site_root/releases/$revision"
if [[ ! -d "$release" ]]; then
  staging=$(mktemp -d "$site_root/releases/.staging.XXXXXX")
  trap 'rm -rf "$staging"' EXIT
  cp -R dist/. "$staging/"
  chmod -R a+rX "$staging"
  mv "$staging" "$release"
  trap - EXIT
fi
link="$site_root/.current-$$"
ln -s "releases/$revision" "$link"
mv -Tf "$link" "$site_root/current"
printf 'Published %s at https://spore.infiniter.tech\n' "$revision"
