#!/bin/sh
# POSIX sh merge for content/.generated (cluster Hugo image has no Python).
# Merges content/_shared (+ content/locations/{slug}) for Hugo module mounts.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
CONTENT="$ROOT/content"
SHARED="$CONTENT/_shared"
OVERRIDES="$CONTENT/locations"
GENERATED="$CONTENT/.generated"
HUGO_TOML="$ROOT/hugo.toml"
LOCATIONS_YAML="$ROOT/data/locations.yaml"

if [ ! -d "$SHARED" ]; then
  echo "ERROR: missing shared menu at content/_shared" >&2
  exit 1
fi

multi=false
if grep -Eqi '^[[:space:]]*multiLocationMenus[[:space:]]*=[[:space:]]*true\b' "$HUGO_TOML" 2>/dev/null; then
  multi=true
fi

LOC_LIST="$(mktemp)"
trap 'rm -f "$LOC_LIST"' EXIT

awk '
  BEGIN { slug=""; city=""; addr="" }
  /^[[:space:]]*-[[:space:]]+slug:[[:space:]]*/ {
    if (slug != "") print slug "|" city "|" addr
    slug=$0; sub(/^[[:space:]]*-[[:space:]]+slug:[[:space:]]*/, "", slug)
    gsub(/["\047]/, "", slug); city=""; addr=""
    next
  }
  slug != "" && /^[[:space:]]+city:[[:space:]]*/ {
    city=$0; sub(/^[[:space:]]+city:[[:space:]]*/, "", city); gsub(/["\047]/, "", city)
    next
  }
  slug != "" && /^[[:space:]]+address:[[:space:]]*/ {
    addr=$0; sub(/^[[:space:]]+address:[[:space:]]*/, "", addr); gsub(/["\047]/, "", addr)
    next
  }
  END { if (slug != "") print slug "|" city "|" addr }
' "$LOCATIONS_YAML" >"$LOC_LIST" 2>/dev/null || true

rm -rf "$GENERATED"
mkdir -p "$GENERATED"
: >"$GENERATED/.gitkeep"

echo "[menu-merge] multiLocationMenus = $multi"

copy_tree() {
  src="$1"
  dst="$2"
  [ -d "$src" ] || return 0
  mkdir -p "$dst"
  if cp -a "$src"/. "$dst"/ 2>/dev/null; then
    return 0
  fi
  (cd "$src" && tar cf - .) | (cd "$dst" && tar xf -)
}

write_location_index() {
  dest="$1"
  slug="$2"
  city="$3"
  address="$4"
  title="$city"
  [ -n "$title" ] || title="$slug"
  mkdir -p "$dest"
  {
    echo "---"
    echo "title: ${title}"
    echo "layout: location-home"
    echo "location_slug: ${slug}"
    echo "ttms_authoring: shared"
    echo "---"
    echo ""
    echo "Menu for **${title}**"
    if [ -n "$address" ]; then
      echo ""
      echo "${address}."
    fi
  } >"$dest/_index.md"
}

if [ "$multi" = true ]; then
  if [ ! -s "$LOC_LIST" ]; then
    echo "ERROR: multiLocationMenus=true but no location slugs in data/locations.yaml" >&2
    exit 1
  fi
  while IFS='|' read -r slug city address; do
    [ -n "$slug" ] || continue
    dest="$GENERATED/$slug"
    write_location_index "$dest" "$slug" "$city" "$address"
    copy_tree "$SHARED" "$dest"
    if [ -d "$OVERRIDES/$slug" ]; then
      copy_tree "$OVERRIDES/$slug" "$dest"
      echo "[menu-merge]   + overrides from locations/$slug"
    fi
    echo "[menu-merge] location $slug -> content/.generated/$slug  /$slug/"
  done <"$LOC_LIST"
else
  copy_tree "$SHARED" "$GENERATED"
  echo "[menu-merge] flat menu -> content/.generated"
fi

echo "[menu-merge] done. Run hugo / hugo server next."
