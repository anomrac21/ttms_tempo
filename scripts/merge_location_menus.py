#!/usr/bin/env python3
"""Merge content/_shared (+ optional location overrides) into content/.generated for Hugo mounts.

Reads params.menu.multiLocationMenus from hugo.toml and location slugs from data/locations.yaml.

  multiLocationMenus = false  → flat tree: .generated/{section}/...
  multiLocationMenus = true   → .generated/{slug}/{section}/... with overrides from content/locations/{slug}/

Stamps each generated markdown file with:
  ttms_authoring: shared | location
  ttms_location: <slug>   (location authoring only)

Also writes static/menu-authoring.json for the rearrange UI.

Run automatically before local `hugo` / `hugo server` (via bin/hugo shim) and
before cluster/CMS builds. You do not need to invoke this by hand.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    yaml = None

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
SHARED = CONTENT / "_shared"
OVERRIDES = CONTENT / "locations"
GENERATED = CONTENT / ".generated"
GENERATED_NEXT = CONTENT / ".generated.next"
GENERATED_PREV = CONTENT / ".generated.prev"
HUGO_TOML = ROOT / "hugo.toml"
LOCATIONS_YAML = ROOT / "data" / "locations.yaml"
AUTHORING_JSON = ROOT / "static" / "menu-authoring.json"

SKIP_DIR_NAMES = {".generated", "_shared", "locations"}
FM_OPEN = re.compile(r"\A---\r?\n", re.MULTILINE)
FM_CLOSE = re.compile(r"\r?\n---\r?\n", re.MULTILINE)
SECTION_ALIASES = {
    "beverages": "beverage",
    "welcome": "starter",
}
LOG_PREFIX = "[menu-merge]"


def log(msg: str, *, err: bool = False) -> None:
    stream = sys.stderr if err else sys.stdout
    line = f"{LOG_PREFIX} {msg}"
    try:
        print(line, file=stream, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"), file=stream, flush=True)


def read_multi_location_flag() -> bool:
    text = HUGO_TOML.read_text(encoding="utf-8")
    m = re.search(
        r"\[params\.menu\][^\[]*?multiLocationMenus\s*=\s*(true|false)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return False
    return m.group(1).lower() == "true"


def read_location_slugs() -> list[dict]:
    if not LOCATIONS_YAML.exists():
        return []
    text = LOCATIONS_YAML.read_text(encoding="utf-8")
    if yaml is not None:
        data = yaml.safe_load(text) or {}
        locs = data.get("locations") or []
        return [loc for loc in locs if isinstance(loc, dict) and loc.get("slug")]
    slugs: list[dict] = []
    current: dict = {}
    for line in text.splitlines():
        if re.match(r"^\s*-\s+slug:\s*", line):
            if current.get("slug"):
                slugs.append(current)
            current = {"slug": re.sub(r"^\s*-\s+slug:\s*", "", line).strip().strip("\"'")}
        elif current and re.match(r"^\s+city:\s*", line):
            current["city"] = re.sub(r"^\s+city:\s*", "", line).strip().strip("\"'")
        elif current and re.match(r"^\s+address:\s*", line):
            current["address"] = re.sub(r"^\s+address:\s*", "", line).strip().strip("\"'")
        elif re.match(r"^\s*-\s+\w", line) and "slug:" not in line:
            if current.get("slug"):
                slugs.append(current)
            current = {}
    if current.get("slug"):
        slugs.append(current)
    return slugs


def shared_section_names() -> set[str]:
    if not SHARED.exists():
        return set()
    return {p.name for p in SHARED.iterdir() if p.is_dir()}


def override_section_map() -> dict[str, str]:
    shared = shared_section_names()
    mapping: dict[str, str] = {}
    for alias, target in SECTION_ALIASES.items():
        if alias not in shared and target in shared:
            mapping[alias] = target
    return mapping


def inspect_generated_mode(root: Path = GENERATED) -> str:
    if not root.exists():
        return "empty"
    slugs = {loc["slug"] for loc in read_location_slugs()}
    kids = [p.name for p in root.iterdir() if p.is_dir()]
    if any(name in slugs for name in kids):
        return "multi"
    if kids:
        return "flat"
    return "empty"


def count_md(root: Path) -> int:
    if not root.exists():
        return 0
    return sum(1 for path in root.rglob("*.md") if path.is_file())


def stamp_front_matter(path: Path, authoring: str, location_slug: str = "") -> None:
    """Inject ttms_authoring (+ optional ttms_location) into markdown front matter."""
    if path.suffix.lower() != ".md":
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    if not FM_OPEN.match(text):
        return
    close = FM_CLOSE.search(text)
    if not close:
        return
    fm = text[FM_OPEN.match(text).end() : close.start()]
    body = text[close.end() :]
    lines = []
    for line in fm.splitlines():
        if re.match(r"^\s*ttms_authoring\s*:", line):
            continue
        if re.match(r"^\s*ttms_location\s*:", line):
            continue
        lines.append(line)
    lines.append(f"ttms_authoring: {authoring}")
    if authoring == "location" and location_slug:
        lines.append(f"ttms_location: {location_slug}")
    new_fm = "\n".join(lines).rstrip() + "\n"
    path.write_text(f"---\n{new_fm}---\n{body}", encoding="utf-8")


def copytree_merge(
    src: Path,
    dst: Path,
    authoring: str = "",
    location_slug: str = "",
    section_map: Optional[dict[str, str]] = None,
) -> int:
    if not src.exists():
        return 0
    copied = 0
    for path in src.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(src)
        if section_map:
            parts = list(rel.parts)
            if parts and parts[0] in section_map:
                mapped = section_map[parts[0]]
                if mapped != parts[0]:
                    log(f"    remap {rel.as_posix()} -> {mapped}/{'/'.join(parts[1:])}")
                    parts[0] = mapped
                    rel = Path(*parts)
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        if authoring and target.suffix.lower() == ".md":
            stamp_front_matter(target, authoring, location_slug)
        copied += 1
    return copied


def write_location_index(dest: Path, loc: dict) -> None:
    slug = loc["slug"]
    title = loc.get("city") or slug.replace("-", " ").title()
    address = loc.get("address") or ""
    intro = f"Menu for **{title}**\n\n{address}." if address else f"Menu for **{title}**."
    body = f"""---
title: {title}
layout: location-home
location_slug: {slug}
ttms_authoring: shared
---

{intro}
"""
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "_index.md").write_text(body, encoding="utf-8")


def rewrite_promo_links(root: Path, slug: str) -> None:
    """Prefix absolute menu links with /{slug} so promos stay in-tree."""
    promo_dir = root / "promotions"
    if not promo_dir.is_dir():
        return
    prefix = f"/{slug}"
    link_re = re.compile(r"^(link:\s*)(/[^\s#]+)", re.MULTILINE)
    for path in promo_dir.glob("*.md"):
        text = path.read_text(encoding="utf-8")

        def repl(m: re.Match) -> str:
            href = m.group(2)
            if href.startswith(prefix + "/") or href == prefix + "/":
                return m.group(0)
            if href.startswith("/locations"):
                return m.group(0)
            return f"{m.group(1)}{prefix}{href}"

        new_text = link_re.sub(repl, text)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")


def collect_authoring_index(multi: bool, locations: list[dict]) -> dict:
    """Map section/file → authoring paths for rearrange (does not depend on CMS)."""
    shared_items: list[dict] = []
    location_items: list[dict] = []
    section_map = override_section_map()

    def walk_menu_md(root: Path, cb) -> None:
        if not root.exists():
            return
        for path in root.rglob("*.md"):
            if path.name == "_index.md":
                continue
            rel = path.relative_to(root).as_posix()
            parts = rel.split("/")
            if len(parts) < 2:
                continue
            section_slug = section_map.get(parts[0], parts[0])
            file_slug = path.stem
            cb(section_slug, file_slug, path)

    def on_shared(section_slug: str, file_slug: str, path: Path) -> None:
        shared_items.append(
            {
                "section": section_slug,
                "file": file_slug,
                "authoring": "shared",
                "content_path": f"content/_shared/{section_slug}/{file_slug}.md",
            }
        )

    def make_loc_cb(loc_slug: str):
        def on_loc(section_slug: str, file_slug: str, path: Path) -> None:
            location_items.append(
                {
                    "section": section_slug,
                    "file": file_slug,
                    "authoring": "location",
                    "location_slug": loc_slug,
                    "content_path": f"content/locations/{loc_slug}/{section_slug}/{file_slug}.md",
                }
            )

        return on_loc

    walk_menu_md(SHARED, on_shared)
    for loc in locations:
        slug = loc["slug"]
        walk_menu_md(OVERRIDES / slug, make_loc_cb(slug))

    return {
        "multi_location_menus": multi,
        "shared": shared_items,
        "location": location_items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def write_authoring_index(multi: bool, locations: list[dict]) -> None:
    data = collect_authoring_index(multi, locations)
    AUTHORING_JSON.parent.mkdir(parents=True, exist_ok=True)
    AUTHORING_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    log(
        f"wrote {AUTHORING_JSON.relative_to(ROOT)} "
        f"({len(data['shared'])} shared, {len(data['location'])} location)"
    )


def merge_flat(dest: Path) -> None:
    if not SHARED.exists():
        log(f"ERROR: missing shared menu at {SHARED}", err=True)
        sys.exit(1)
    n = copytree_merge(SHARED, dest, authoring="shared")
    sections = sorted(p.name for p in dest.iterdir() if p.is_dir())
    log(f"flat menu -> {dest.relative_to(ROOT)} ({n} files)")
    log(f"sections: {', '.join(sections) or '(none)'}")
    log("public URLs: /  " + "  ".join(f"/{name}/" for name in sections))


def merge_multi(locations: list[dict], dest: Path) -> None:
    if not SHARED.exists():
        log(f"ERROR: missing shared menu at {SHARED}", err=True)
        sys.exit(1)
    if not locations:
        log("ERROR: multiLocationMenus=true but no location slugs in data/locations.yaml", err=True)
        sys.exit(1)
    section_map = override_section_map()
    slugs = [loc["slug"] for loc in locations]
    log(f"location slugs: {', '.join(slugs)}")
    log(f"public URLs: /  " + "  ".join(f"/{slug}/" for slug in slugs))
    for loc in locations:
        slug = loc["slug"]
        loc_dest = dest / slug
        write_location_index(loc_dest, loc)
        shared_n = copytree_merge(SHARED, loc_dest, authoring="shared")
        override = OVERRIDES / slug
        override_n = 0
        if override.exists():
            override_n = copytree_merge(
                override,
                loc_dest,
                authoring="location",
                location_slug=slug,
                section_map=section_map,
            )
            log(f"  + {override_n} override file(s) from locations/{slug}")
        rewrite_promo_links(loc_dest, slug)
        md_n = count_md(loc_dest)
        log(
            f"location {slug} -> {loc_dest.relative_to(ROOT)} "
            f"(shared {shared_n}, overrides {override_n}, {md_n} markdown)  /{slug}/"
        )


def prepare_dest(dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / ".gitkeep").write_text("", encoding="utf-8")


def swap_generated() -> None:
    """Replace .generated with .generated.next without leaving Hugo on an empty tree."""
    if GENERATED_PREV.exists():
        shutil.rmtree(GENERATED_PREV, ignore_errors=True)
    try:
        if GENERATED.exists():
            GENERATED.rename(GENERATED_PREV)
        GENERATED_NEXT.rename(GENERATED)
    except OSError as exc:
        log(f"atomic swap failed ({exc}); copying into place")
        if GENERATED.exists():
            shutil.rmtree(GENERATED, ignore_errors=True)
        shutil.copytree(GENERATED_NEXT, GENERATED)
    finally:
        shutil.rmtree(GENERATED_PREV, ignore_errors=True)
        shutil.rmtree(GENERATED_NEXT, ignore_errors=True)


def run_merge() -> str:
    multi = read_multi_location_flag()
    locations = read_location_slugs()
    previous = inspect_generated_mode()
    wanted = "multi" if multi else "flat"
    log(f"multiLocationMenus = {str(multi).lower()}  (content/.generated was {previous}, writing {wanted})")
    if previous not in {"empty", wanted}:
        log(f"stale tree: {previous} content cannot serve {wanted} URLs - remaking")
    prepare_dest(GENERATED_NEXT)
    if multi:
        merge_multi(locations, GENERATED_NEXT)
    else:
        merge_flat(GENERATED_NEXT)
    swap_generated()
    write_authoring_index(multi, locations)
    log(f"done -> content/.generated is {inspect_generated_mode()} ({count_md(GENERATED)} markdown)")
    return wanted


def source_signature() -> tuple:
    entries: list[tuple[str, int, int]] = []
    roots = [HUGO_TOML, LOCATIONS_YAML, SHARED, OVERRIDES]
    for root in roots:
        if root.is_file():
            st = root.stat()
            entries.append((str(root.relative_to(ROOT)), st.st_mtime_ns, st.st_size))
        elif root.is_dir():
            for path in root.rglob("*"):
                if path.is_file():
                    st = path.stat()
                    entries.append((str(path.relative_to(ROOT)), st.st_mtime_ns, st.st_size))
    return tuple(sorted(entries))


def find_real_hugo() -> str:
    pinned = (os.environ.get("TTMS_REAL_HUGO") or "").strip()
    if pinned and Path(pinned).is_file():
        return pinned
    skip = {"hugo.cmd", "hugo.ps1", "hugo.bat"}
    for name in ("hugo.exe", "hugo"):
        found = shutil.which(name)
        if not found:
            continue
        if Path(found).name.lower() in skip:
            continue
        return found
    log("ERROR: hugo.exe is not on PATH", err=True)
    sys.exit(1)


def hugo_server_cmd(hugo: str, hugo_args: list[str]) -> list[str]:
    args = list(hugo_args)
    if args and args[0] == "server":
        rest = args[1:]
        if "--disableFastRender" not in rest:
            rest = ["--disableFastRender", *rest]
        return [hugo, "server", *rest]
    return [hugo, "server", "--disableFastRender", *args]


def watch_and_maybe_serve(serve: bool, hugo_args: list[str]) -> int:
    last_flag = read_multi_location_flag()
    last_sig = source_signature()
    run_merge()
    hugo_proc: Optional[subprocess.Popen] = None
    if serve:
        hugo = find_real_hugo()
        cmd = hugo_server_cmd(hugo, hugo_args)
        log("watching hugo.toml, data/locations.yaml, content/_shared, content/locations")
        log("toggle [params.menu] multiLocationMenus to remake the tree; logs stay in this window")
        log("starting: " + " ".join(cmd))
        env = os.environ.copy()
        env["TTMS_HUGO_WRAPPED"] = "1"
        env["TTMS_REAL_HUGO"] = hugo
        hugo_proc = subprocess.Popen(cmd, cwd=str(ROOT), env=env)
    else:
        log("watching hugo.toml, data/locations.yaml, content/_shared, content/locations")
        log("toggle [params.menu] multiLocationMenus to remake the tree")
    try:
        while True:
            if hugo_proc is not None and hugo_proc.poll() is not None:
                return hugo_proc.returncode or 0
            time.sleep(0.8)
            flag = read_multi_location_flag()
            sig = source_signature()
            if sig == last_sig and flag == last_flag:
                continue
            if flag != last_flag:
                log(
                    f"flag changed {str(last_flag).lower()} -> {str(flag).lower()} "
                    f"- remaking {'/' + ', /'.join(loc['slug'] for loc in read_location_slugs()) + '/' if flag else 'flat /starter/ /main/ ...'}"
                )
            else:
                log("menu sources changed - remaking content/.generated")
            run_merge()
            last_flag = flag
            last_sig = source_signature()
    except KeyboardInterrupt:
        log("stopped")
        if hugo_proc is not None and hugo_proc.poll() is None:
            hugo_proc.terminate()
            try:
                hugo_proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                hugo_proc.kill()
        return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge shared/location menus into content/.generated")
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Remake .generated when hugo.toml or menu sources change",
    )
    parser.add_argument(
        "--serve",
        action="store_true",
        help="After merge, start hugo server in this window (implies --watch)",
    )
    parser.add_argument(
        "hugo_args",
        nargs="*",
        help="Extra args after -- are passed to hugo server",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.serve or args.watch:
        return watch_and_maybe_serve(serve=args.serve, hugo_args=args.hugo_args)
    run_merge()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
