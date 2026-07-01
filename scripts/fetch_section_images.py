#!/usr/bin/env python3
"""Download section images (Pexels) and update content/*/_index.md."""
from __future__ import annotations

import re
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
IMAGES_DIR = ROOT / "static" / "images"

PEX = "https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg?auto=compress&cs=tinysrgb&w=900"

PEXELS: dict[str, tuple[str, str]] = {
    "hero.webp": (PEX.format(id="274192"), "Pexels #274192"),
    "promotions.webp": (PEX.format(id="2233348"), "Pexels #2233348"),
    "lunch-menu.webp": (PEX.format(id="2092900"), "Pexels #2092900"),
    "appetizers.webp": (PEX.format(id="248444"), "Pexels #248444"),
    "steaks-main-dishes.webp": (PEX.format(id="618785"), "Pexels #618785"),
    "pastas-salads.webp": (PEX.format(id="4518843"), "Pexels #4518843"),
    "burgers-sandwiches.webp": (PEX.format(id="1639565"), "Pexels #1639565"),
    "chinese.webp": (PEX.format(id="8840986"), "Pexels #8840986"),
    "platters.webp": (PEX.format(id="2233348"), "Pexels #2233348"),
    "sides.webp": (PEX.format(id="410648"), "Pexels #410648"),
    "desserts.webp": (PEX.format(id="291528"), "Pexels #291528"),
    "beer.webp": (PEX.format(id="1304540"), "Pexels #1304540"),
    "non-alcoholic.webp": (PEX.format(id="1199957"), "Pexels #1199957"),
    "rum.webp": (PEX.format(id="1304540"), "Pexels #1304540"),
    "whisky.webp": (PEX.format(id="1283219"), "Pexels #1283219"),
    "tequila.webp": (PEX.format(id="696218"), "Pexels #696218"),
    "gin.webp": (PEX.format(id="274192"), "Pexels #274192"),
    "vodka.webp": (PEX.format(id="1283219"), "Pexels #1283219"),
    "wine.webp": (PEX.format(id="274192"), "Pexels #274192"),
    "prosecco.webp": (PEX.format(id="1267325"), "Pexels #1267325"),
    "champagne.webp": (PEX.format(id="1267325"), "Pexels #1267325"),
    "liqueur.webp": (PEX.format(id="274192"), "Pexels #274192"),
    "cognac.webp": (PEX.format(id="696218"), "Pexels #696218"),
    "cocktails.webp": (PEX.format(id="274192"), "Pexels #274192"),
    "cocktail-specials.webp": (PEX.format(id="1267325"), "Pexels #1267325"),
    "shots.webp": (PEX.format(id="1126728"), "Pexels #1126728"),
    "slideshow-cocktails.webp": (PEX.format(id="274192"), "Pexels #274192"),
    "slideshow-food.webp": (PEX.format(id="618785"), "Pexels #618785"),
    "slideshow-nightlife.webp": (PEX.format(id="1267325"), "Pexels #1267325"),
}

SECTIONS: dict[str, str] = {
    "promotions": "promotions.webp",
    "lunch-menu": "lunch-menu.webp",
    "appetizers": "appetizers.webp",
    "steaks-main-dishes": "steaks-main-dishes.webp",
    "pastas-salads": "pastas-salads.webp",
    "burgers-sandwiches": "burgers-sandwiches.webp",
    "chinese": "chinese.webp",
    "platters": "platters.webp",
    "sides": "sides.webp",
    "desserts": "desserts.webp",
    "beer": "beer.webp",
    "non-alcoholic": "non-alcoholic.webp",
    "rum": "rum.webp",
    "whisky": "whisky.webp",
    "tequila": "tequila.webp",
    "gin": "gin.webp",
    "vodka": "vodka.webp",
    "wine": "wine.webp",
    "prosecco": "prosecco.webp",
    "champagne": "champagne.webp",
    "liqueur": "liqueur.webp",
    "cognac": "cognac.webp",
    "cocktails": "cocktails.webp",
    "cocktail-specials": "cocktail-specials.webp",
    "shots": "shots.webp",
}

WEIGHTS: dict[str, str] = {
    "promotions": "1",
    "lunch-menu": "2",
    "appetizers": "3",
    "steaks-main-dishes": "4",
    "pastas-salads": "5",
    "burgers-sandwiches": "6",
    "chinese": "7",
    "platters": "8",
    "sides": "9",
    "desserts": "10",
    "beer": "11",
    "non-alcoholic": "12",
    "rum": "13",
    "whisky": "14",
    "tequila": "15",
    "gin": "16",
    "vodka": "17",
    "wine": "18",
    "prosecco": "19",
    "champagne": "20",
    "liqueur": "21",
    "cognac": "22",
    "cocktails": "23",
    "cocktail-specials": "24",
    "shots": "25",
}


def img(name: str) -> str:
    return f"images/{name}"


def download_pexels(filename: str, url: str) -> bool:
    from PIL import Image

    webp = IMAGES_DIR / filename
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
    except urllib.error.HTTPError as e:
        print(f"SKIP {filename}: HTTP {e.code}")
        return webp.exists()
    Image.open(BytesIO(data)).save(webp, "WEBP", quality=85)
    print(f"OK {filename}")
    return True


def body_after_frontmatter(raw: str) -> str:
    if raw.count("---") < 2:
        return raw.strip()
    return raw.split("---", 2)[2].strip()


def update_section_index(section: str, image_file: str) -> None:
    path = CONTENT / section / "_index.md"
    if not path.exists():
        return
    raw = path.read_text(encoding="utf-8")
    title_m = re.search(r"^title:\s*(.+)$", raw, re.M)
    title = title_m.group(1).strip().strip('"') if title_m else section.replace("-", " ").title()
    weight = WEIGHTS.get(section, "1")
    body = body_after_frontmatter(raw)

    lines = [
        "---",
        f"title: {title}",
        f"weight: {weight}",
        f"icon: {img(image_file)}",
        "images:",
        f"    primary: {img(image_file)}",
        "---",
    ]
    if body:
        lines.extend(["", body])
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def update_home_index() -> None:
    path = CONTENT / "_index.md"
    body = body_after_frontmatter(path.read_text(encoding="utf-8"))
    if not body.strip():
        body = (
            "<p><strong>Tempo Nightclub</strong> — food and drinks (San Fernando). "
            "Browse sections below or ask staff for the latest prices and specials.</p>"
        )
    text = (
        "---\n"
        'title: "Tempo Nightclub"\n'
        f"image: {img('hero.webp')}\n"
        "images:\n"
        f"    - image: {img('hero.webp')}\n"
        f"    - image: {img('cocktails.webp')}\n"
        f"    - image: {img('appetizers.webp')}\n"
        f"    - image: {img('steaks-main-dishes.webp')}\n"
        "slideshow:\n"
        f"    - image: {img('hero.webp')}\n"
        f"    - image: {img('slideshow-cocktails.webp')}\n"
        f"    - image: {img('slideshow-food.webp')}\n"
        f"    - image: {img('slideshow-nightlife.webp')}\n"
        f"    - image: {img('promotions.webp')}\n"
        "---"
    )
    text += f"\n\n{body}\n"
    path.write_text(text, encoding="utf-8")


def main() -> None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    credits: list[str] = []

    for filename, (url, credit) in PEXELS.items():
        if download_pexels(filename, url):
            credits.append(f"- {filename} — {credit}")

    missing = [s for s, f in SECTIONS.items() if not (IMAGES_DIR / f).exists()]
    if missing:
        print("Missing:", ", ".join(missing))
        return

    for section, image_file in SECTIONS.items():
        update_section_index(section, image_file)

    if (IMAGES_DIR / "hero.webp").exists():
        update_home_index()

    (IMAGES_DIR / "IMAGE_CREDITS.txt").write_text(
        "Section photos (Pexels License — free to use):\n"
        + "\n".join(dict.fromkeys(credits))
        + "\n",
        encoding="utf-8",
    )
    print("Section headers updated.")


if __name__ == "__main__":
    main()
