#!/usr/bin/env bash
set -euo pipefail

# Sync submodule URLs from .gitmodules to ensure HTTPS URLs are used
git submodule sync --recursive

# Initialize submodules (cluster/CI builds use the submodule SHA pinned in this repo)
git submodule update --init --recursive

# Refresh theme from remote only on local/dev builds. CI/cluster must use the pinned submodule SHA
if [ -z "${CI:-}" ]; then
  echo "Updating theme submodule to latest master..."
  (
    cd themes/_menus_ttms
    git fetch origin master
    git checkout master
    git pull origin master
  )
fi

# Multi-location / shared authoring: Hugo mounts content/.generated (gitignored).
# Cluster chart may already have merged; skip a second wipe in that case.
if [ -z "${TTMS_MENUS_MERGED:-}" ] && [ -f scripts/merge_location_menus.py ] && [ -d content/_shared ]; then
  echo "Merging location menus into content/.generated..."
  # Prefer Python when available (local); bash fallback for hugomods/hugo cluster image.
  # Prefer sh merge in CI/cluster (hugomods/hugo has no Python). Python locally for richer stamps/JSON.
  if [ -n "${CI:-}" ] && [ -f scripts/merge_location_menus.sh ]; then
    sh scripts/merge_location_menus.sh
  elif command -v python3 >/dev/null 2>&1; then
    python3 scripts/merge_location_menus.py
  elif command -v python >/dev/null 2>&1; then
    python scripts/merge_location_menus.py
  elif [ -f scripts/merge_location_menus.sh ]; then
    sh scripts/merge_location_menus.sh
  else
    echo "ERROR: need python3 or scripts/merge_location_menus.sh to build content/.generated"
    exit 1
  fi
fi

echo "Running Hugo build with minification..."
hugo --gc --minify

if [ ! -f public/index.html ]; then
 echo "ERROR: Hugo did not produce public/index.html: home page will be broken on deploy."
  exit 1
fi

echo "Build OK: public/index.html ($(wc -c < public/index.html | tr -d ' ') bytes)"
