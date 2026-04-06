"""Drinks price table -> content/<category>/ (one Hugo section per category)."""
from __future__ import annotations

import re
import shutil
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"

_FORMAT_LABELS = {
    "BOTTLE": "Bottle",
    "HALF": "Half",
    "DRINK": "Drink",
    "SHOT": "Shot",
    "GLASS": "Glass",
}

# folder -> section title, homepage weight, icon, blurb
CATEGORIES: dict[str, tuple[str, int, str, str]] = {
    "beer": (
        "Beer & bottled",
        10,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Beer, cider, and bottled specials.",
    ),
    "non-alcoholic": (
        "Non-alcoholic",
        11,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Soft drinks, juices, water, and mixers.",
    ),
    "rum": (
        "Rum",
        12,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Rum and rum-based bottles by the glass or bottle.",
    ),
    "whisky": (
        "Whisky & Scotch",
        13,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Scotch, Irish, bourbon, and blended whisky.",
    ),
    "tequila": (
        "Tequila",
        14,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Tequila bottles and shots.",
    ),
    "vodka": (
        "Vodka",
        15,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Vodka bottles, halves, and drinks.",
    ),
    "gin": (
        "Gin",
        16,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Gin by the bottle or glass.",
    ),
    "wine": (
        "Wine",
        17,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Wine by the bottle or glass.",
    ),
    "prosecco": (
        "Prosecco",
        18,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Prosecco by the bottle or glass.",
    ),
    "champagne": (
        "Champagne",
        19,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Champagne and sparkling.",
    ),
    "liqueur": (
        "Liqueur",
        20,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Liqueurs and cordials.",
    ),
    "cognac": (
        "Cognac & brandy",
        21,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Cognac and premium brandy.",
    ),
    "cocktails": (
        "Cocktails",
        22,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Mixed drinks and mocktails.",
    ),
    "cocktail-specials": (
        "Cocktail specials",
        23,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Limited cocktail promotions.",
    ),
    "shots": (
        "Shots",
        24,
        "https://ct.ttmenus.com/icons/food/icon-coffee.webp",
        "Shots and shooters.",
    ),
}


def slugify(title: str) -> str:
    s = unicodedata.normalize("NFKD", title)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "item"


def write_item(
    category: str,
    stem: str,
    title: str,
    prices: list[tuple[str, str, float]],
    weight: int,
    body: str = "",
) -> None:
    out = CONTENT / category
    lines = [
        "---",
        f'title: "{title.replace(chr(34), chr(39))}"',
        "prices:",
    ]
    for variable1, variable2, price in prices:
        lines.append(f'  - variable1: "{variable1}"')
        lines.append(f'    variable2: "{variable2}"')
        lines.append(f"    price: {int(price) if price == int(price) else price}")
    lines.extend(
        [
            "tags:",
            "  - Drink",
            "types:",
            "  - Drink",
            f"weight: {weight}",
            "---",
            "",
        ]
    )
    if body:
        lines.append(body)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{stem}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def single(category: str, title: str, price: float, w: int, body: str = "") -> None:
    write_item(category, slugify(title), title, [("-", "-", price)], w, body)


def multi(
    category: str, title: str, rows: list[tuple[str, float]], w: int, body: str = ""
) -> None:
    prices = [(_FORMAT_LABELS.get(r[0], r[0]), "-", r[1]) for r in rows]
    write_item(category, slugify(title), title, prices, w, body)


def write_section_indexes() -> None:
    for folder, (title, weight, icon, blurb) in CATEGORIES.items():
        path = CONTENT / folder / "_index.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        safe_title = title.replace('"', "'")
        path.write_text(
            f"""---
title: "{safe_title}"
weight: {weight}
icon: {icon}
---

{blurb} Confirm prices with staff.
""",
            encoding="utf-8",
        )


def remove_legacy_trees() -> None:
    legacy = CONTENT / "drinks"
    if legacy.is_dir():
        shutil.rmtree(legacy)
    for p in sorted(CONTENT.iterdir()):
        if p.is_dir() and p.name.startswith("drinks-"):
            shutil.rmtree(p)


def main() -> None:
    remove_legacy_trees()

    w: dict[str, int] = {k: 0 for k in CATEGORIES}

    def nxt(cat: str) -> int:
        w[cat] += 1
        return w[cat]

    b, na, rum, wh, teq, vod, gin, wine, pr, ch, liq, cog, ck, cks, sh = (
        "beer",
        "non-alcoholic",
        "rum",
        "whisky",
        "tequila",
        "vodka",
        "gin",
        "wine",
        "prosecco",
        "champagne",
        "liqueur",
        "cognac",
        "cocktails",
        "cocktail-specials",
        "shots",
    )

    for t, p in [
        ("Stag", 17),
        ("Carib", 17),
        ("Carib Pilsner", 17),
        ("Carib Blue", 25),
        ("Budlight", 30),
        ("Caribe Brut", 25),
        ("Caribe Mimosa", 25),
        ("Caribe Pearsecco", 25),
        ("Caribe Rose", 25),
        ("Caribe Royale", 25),
        ("Coors Light", 25),
        ("Corona", 30),
        ("Coronarita", 22),
        ("Ginseng Lime", 17),
        ("Ginseng Original", 17),
        ("Guinness", 26),
        ("Heineken", 25),
        ("Heineken Light", 24),
        ("Heineken Zero", 25),
        ("Mackeson", 25),
        ("Malta", 18),
        ("Michelob Ultra", 30),
        ("Modelo Especial", 28),
        ("Modelo Negra", 28),
        ("Rude Boy Passion", 25),
        ("Shandy Ginger", 17),
        ("Shandy Lime", 17),
        ("Shandy Sorrel", 17),
        ("Smirnoff Apple", 23),
        ("Smirnoff Black", 23),
        ("Rude Boy Original", 25),
        ("Rude Boy Stout", 25),
        ("Rude Boy Extreme", 30),
    ]:
        single(b, t, p, nxt(b))

    for t, p in [
        ("Carib Special 6 for $100", 100),
        ("Stag Special 6 for $100", 100),
        ("Carib Pilsner Special 6 for $100", 100),
        ("Heineken Special 5 for $100", 115),
        ("Heineken Light Special 5 for $100", 115),
    ]:
        single(b, t, p, nxt(b))

    for t, p in [
        ("Bottle Water", 8),
        ("20 Oz. Coca Cola", 13),
        ("20 Oz. Coca Cola Zero", 13),
        ("20 Oz. Sprite", 13),
        ("20 Oz. Club Soda", 13),
        ("20 Oz. Ginger Ale", 13),
        ("Tonic Water", 10),
        ("Lemon Lime and Bitters (LLB)", 10),
        ("Perrier", 20),
        ("Coconut Water", 20),
        ("Orange Juice", 20),
        ("Pineapple Juice", 20),
        ("Fruit Punch", 20),
        ("Cranberry Juice", 25),
        ("Redbull", 20),
        ("Bently", 20),
    ]:
        single(na, t, p, nxt(na))

    multi(rum, "White Oak", [("BOTTLE", 400), ("HALF", 225), ("DRINK", 30)], nxt(rum))
    multi(
        rum,
        "White Oak Flavoured",
        [("BOTTLE", 400), ("HALF", 225), ("DRINK", 30)],
        nxt(rum),
    )
    multi(
        rum,
        "1787 Angostura",
        [("BOTTLE", 850), ("HALF", 400), ("DRINK", 55)],
        nxt(rum),
    )
    multi(
        rum,
        "1824 Angostura",
        [("BOTTLE", 750), ("HALF", 400), ("DRINK", 60)],
        nxt(rum),
    )
    multi(
        rum,
        "Angostura 1919",
        [("BOTTLE", 650), ("HALF", 350), ("DRINK", 45)],
        nxt(rum),
    )
    multi(rum, "Angostura 7 Year", [("BOTTLE", 585), ("DRINK", 35)], nxt(rum))
    multi(rum, "Appleton 12 Year", [("BOTTLE", 700), ("DRINK", 50)], nxt(rum))
    multi(rum, "Bacardi", [("BOTTLE", 700), ("DRINK", 50)], nxt(rum))
    multi(
        rum,
        "Black Label",
        [("BOTTLE", 400), ("HALF", 225), ("DRINK", 30)],
        nxt(rum),
    )
    multi(rum, "Bumbu Original", [("BOTTLE", 950), ("DRINK", 65)], nxt(rum))
    multi(rum, "Diamond Reserve", [("BOTTLE", 350), ("DRINK", 30)], nxt(rum))
    multi(rum, "Diplomatico", [("BOTTLE", 1000), ("DRINK", 65)], nxt(rum))
    multi(rum, "El Dorado 12 Year", [("BOTTLE", 700), ("DRINK", 45)], nxt(rum))
    multi(rum, "El Dorado 15 Year", [("BOTTLE", 800), ("DRINK", 55)], nxt(rum))
    multi(rum, "El Dorado 21 Year", [("BOTTLE", 1050), ("DRINK", 70)], nxt(rum))
    multi(rum, "Malibu", [("BOTTLE", 485), ("DRINK", 30)], nxt(rum))
    multi(
        rum,
        "Plantation Pineapple",
        [("BOTTLE", 530), ("DRINK", 40)],
        nxt(rum),
    )
    multi(
        rum,
        "Puncheon",
        [("BOTTLE", 500), ("HALF", 280), ("DRINK", 35)],
        nxt(rum),
    )
    multi(
        rum,
        "Ron Zacapa 23 Year",
        [("BOTTLE", 1100), ("DRINK", 85)],
        nxt(rum),
    )
    multi(rum, "Royal Oak", [("BOTTLE", 350), ("DRINK", 35)], nxt(rum))
    multi(rum, "Single Barrel", [("BOTTLE", 450), ("DRINK", 35)], nxt(rum))
    single(rum, "Tamboo DRINK", 45, nxt(rum))
    single(rum, "Campari", 50, nxt(rum))

    multi(wh, "Black and White", [("BOTTLE", 550), ("DRINK", 40)], nxt(wh))
    multi(
        wh,
        "JW Black",
        [("BOTTLE", 765), ("HALF", 410), ("DRINK", 45)],
        nxt(wh),
    )
    multi(wh, "JW Double Black", [("BOTTLE", 840), ("DRINK", 60)], nxt(wh))
    multi(wh, "JW Gold", [("BOTTLE", 1000), ("DRINK", 70)], nxt(wh))
    multi(wh, "JW 18 Year", [("BOTTLE", 1800), ("DRINK", 120)], nxt(wh))
    multi(wh, "JW Green", [("BOTTLE", 1400), ("DRINK", 100)], nxt(wh))
    multi(wh, "Crown Royal", [("BOTTLE", 550), ("DRINK", 60)], nxt(wh))
    multi(
        wh,
        "Old Parr 12 Year",
        [("BOTTLE", 820), ("HALF", 435), ("DRINK", 55)],
        nxt(wh),
    )
    multi(wh, "Buchanan 12 Year", [("BOTTLE", 850), ("DRINK", 65)], nxt(wh))
    multi(wh, "Jameson", [("BOTTLE", 700), ("DRINK", 55)], nxt(wh))
    multi(wh, "Chivas Regal", [("BOTTLE", 850), ("DRINK", 50)], nxt(wh))
    multi(wh, "Glenlivet 12 Year", [("BOTTLE", 850), ("DRINK", 65)], nxt(wh))
    multi(wh, "Glenlivet 15 Year", [("BOTTLE", 1100), ("DRINK", 90)], nxt(wh))
    multi(wh, "Glenlivet 21 Year", [("BOTTLE", 3000), ("DRINK", 1100)], nxt(wh))
    multi(wh, "Dewars 12 Year", [("BOTTLE", 725), ("DRINK", 35)], nxt(wh))
    multi(wh, "Dewars 15 Year", [("BOTTLE", 850), ("DRINK", 60)], nxt(wh))
    multi(wh, "Jack Daniels", [("BOTTLE", 650), ("DRINK", 55)], nxt(wh))
    multi(wh, "Jack Daniels Apple", [("BOTTLE", 650), ("DRINK", 55)], nxt(wh))
    multi(
        wh,
        "Jack Daniels Honey",
        [("BOTTLE", 650), ("HALF", 380), ("DRINK", 55)],
        nxt(wh),
    )
    multi(wh, "Jack Daniels Fire", [("BOTTLE", 650), ("DRINK", 55)], nxt(wh))
    multi(wh, "Fireball Whiskey", [("BOTTLE", 380), ("DRINK", 35)], nxt(wh))
    multi(
        wh,
        "Glenfiddich 12 Years",
        [("BOTTLE", 900), ("HALF", 460), ("DRINK", 50)],
        nxt(wh),
    )
    multi(
        wh,
        "Glenfiddich 18 Years",
        [("BOTTLE", 1300), ("HALF", 520), ("DRINK", 60)],
        nxt(wh),
    )

    multi(teq, "Don Julio Blanco", [("BOTTLE", 850), ("SHOT", 70)], nxt(teq))
    multi(teq, "Don Julio Anejo", [("BOTTLE", 850), ("SHOT", 70)], nxt(teq))
    multi(teq, "Don Julio Reposado", [("BOTTLE", 850), ("SHOT", 70)], nxt(teq))
    multi(teq, "Casamigos Blanco", [("BOTTLE", 825), ("SHOT", 70)], nxt(teq))
    multi(teq, "Jose Cuervo Gold", [("BOTTLE", 400), ("SHOT", 40)], nxt(teq))
    multi(teq, "Jose Cuervo Silver", [("BOTTLE", 400), ("SHOT", 40)], nxt(teq))
    multi(teq, "1800 Reposado", [("BOTTLE", 420), ("SHOT", 40)], nxt(teq))
    multi(teq, "1800 Silver", [("BOTTLE", 400), ("SHOT", 40)], nxt(teq))
    multi(teq, "Juarez Silver", [("BOTTLE", 280), ("SHOT", 45)], nxt(teq))
    multi(teq, "Patron Silver", [("BOTTLE", 900), ("SHOT", 70)], nxt(teq))
    multi(teq, "Patron Cafe", [("BOTTLE", 900), ("SHOT", 70)], nxt(teq))
    single(teq, "Montelobos", 50, nxt(teq))
    multi(teq, "Tequila Rose", [("BOTTLE", 650), ("DRINK", 55)], nxt(teq))

    multi(
        vod,
        "Absolut",
        [("BOTTLE", 600), ("HALF", 325), ("DRINK", 45)],
        nxt(vod),
    )
    multi(
        vod,
        "Absolut Citron",
        [("BOTTLE", 600), ("HALF", 325), ("DRINK", 45)],
        nxt(vod),
    )
    multi(
        vod,
        "Absolut Raspberry",
        [("BOTTLE", 600), ("HALF", 325), ("DRINK", 45)],
        nxt(vod),
    )
    multi(
        vod,
        "Absolut Vanilla",
        [("BOTTLE", 600), ("HALF", 325), ("DRINK", 45)],
        nxt(vod),
    )
    multi(vod, "Absolut Watermelon", [("BOTTLE", 600), ("DRINK", 45)], nxt(vod))
    multi(vod, "Absolut Mango", [("BOTTLE", 600), ("DRINK", 45)], nxt(vod))
    multi(vod, "Belvedere", [("BOTTLE", 800), ("DRINK", 60)], nxt(vod))
    multi(
        vod,
        "Ciroc",
        [("BOTTLE", 870), ("HALF", 460), ("DRINK", 60)],
        nxt(vod),
    )
    multi(
        vod,
        "Grey Goose",
        [("BOTTLE", 800), ("HALF", 425), ("DRINK", 60)],
        nxt(vod),
    )
    multi(
        vod,
        "Ketel One",
        [("BOTTLE", 750), ("HALF", 400), ("DRINK", 45)],
        nxt(vod),
    )
    multi(
        vod,
        "Smirnoff",
        [("BOTTLE", 495), ("HALF", 225), ("DRINK", 40)],
        nxt(vod),
    )
    multi(
        vod,
        "Titos",
        [("BOTTLE", 650), ("HALF", 350), ("DRINK", 50)],
        nxt(vod),
    )
    single(
        vod,
        "Votini Drink",
        40,
        nxt(vod),
        "Bottle price — ask staff.",
    )
    single(vod, "Absolut 2 For 1", 50, nxt(vod))

    for t, p in [
        ("Apple Martini", 65),
        ("Beach Bum", 60),
        ("Between The Sheets", 85),
        ("Bloody Mary Shaken", 70),
        ("Car Crash Layered", 65),
        ("Classic Martini", 65),
        ("Cosmopolitan", 60),
        ("Daiquiri Frozen", 66),
        ("Dirty Martini", 65),
        ("Dirty Shirley", 40),
        ("Electric Lotus", 65),
        ("Expresso Luxe", 55),
        ("Long Island Iced Tea", 90),
        ("Mai Tai", 65),
        ("Margarita", 60),
        ("Mojito Lime Layered", 60),
        ("French Kiss", 60),
        ("Galaxy Martini", 60),
        ("Moscow Mule Layered", 65),
        ("Mudslide", 85),
        ("Godfather", 75),
        ("Neon Samurai", 60),
        ("New Style Lychee Shaken", 85),
        ("Paradise Pulse", 100),
        ("Lavender Diamond Sour", 65),
        ("Pina Colada Frozen", 55),
        ("Pineapple Smash", 80),
        ("Pole Dancer Layered", 70),
        ("Liquid Marijuana", 65),
        ("Porn Star Martini", 80),
        ("Salted Caramel Pretzel", 60),
        ("Sex in the Jungle", 55),
        ("Tempo Royale", 120),
        ("Tempo Sunset", 65),
        ("Tequila Sunrise", 55),
        ("Tropical Detour", 60),
        ("Whiskey Sour", 65),
        ("White Gummy Bear", 65),
        ("Amaretto Sour", 50),
        ("Black Russian", 55),
        ("White Russian", 55),
        ("Aperol Spritz", 90),
        ("Virgin Colada", 40),
        ("Virgin Mojito", 40),
        ("Shirly Temple", 20),
        ("Virgin Daiquiri", 40),
        ("Virgin Bloody Mary", 40),
        ("Milkshake Vanilla", 45),
        ("Milkshake Chocolate", 45),
    ]:
        single(ck, t, p, nxt(ck))

    for t, p in [
        ("2 FOR 1 Daiquiri Frozen", 99),
        ("2 FOR 1 Margarita", 99),
        ("2 FOR 1 White Oak Special", 30),
    ]:
        single(cks, t, p, nxt(cks))

    for t, p in [
        ("B-52 Shot", 35),
        ("Beach Sex Shot", 35),
        ("Birthday Cake Shot", 40),
        ("Blow Job Shot", 35),
        ("Brain Haemorrhage Shot", 35),
        ("Double Trouble Shot", 40),
        ("Flamin B-52 Shot", 35),
        ("Flaming Sunset Shot", 35),
        ("Glowing Ember Shot", 40),
        ("Green Tea Shot", 60),
        ("Helium Shot", 80),
        ("Lemon Drops Shot", 35),
        ("Oreo Cookie Shot", 40),
        ("Pink Starburst Shot", 35),
        ("Purple Rain Shot", 35),
        ("Rainbow Shot Line", 60),
        ("Rose Petal Shot", 35),
        ("Scooby Doo Shot", 35),
        ("Screaming Orgasm Shot", 35),
        ("Tropical Eruption Shot", 40),
        ("Tropical Skittle Shot", 40),
        ("Wet Pussy Shot", 35),
        ("Venomous Vibe", 40),
        ("Liquid Cocaine", 50),
    ]:
        single(sh, t, p, nxt(sh))

    single(
        sh,
        "Mexican Candy Shot",
        35,
        nxt(sh),
        "Also listed at **$40** on the printed menu.",
    )
    single(
        sh,
        "Melon Ball Shot",
        35,
        nxt(sh),
        "Confirm price with staff if not shown on your bill.",
    )

    multi(gin, "Beefeater Pink", [("BOTTLE", 550), ("DRINK", 50)], nxt(gin))
    multi(
        gin,
        "Bombay Sapphire",
        [("BOTTLE", 650), ("HALF", 350), ("DRINK", 55)],
        nxt(gin),
    )
    multi(
        gin,
        "Gordon's",
        [("BOTTLE", 600), ("HALF", 325), ("DRINK", 45)],
        nxt(gin),
    )
    multi(
        gin,
        "Tanqueray",
        [("BOTTLE", 680), ("HALF", 370), ("DRINK", 45)],
        nxt(gin),
    )
    multi(gin, "Hendricks Gin", [("BOTTLE", 800), ("DRINK", 55)], nxt(gin))

    for t, p in [
        ("19 Crimes Cab Sav BOTTLE", 350),
        ("19 Crimes Cab Sav GLASS", 80),
        ("19 Crimes Pinot Noir BOTTLE", 350),
        ("19 Crimes Pinot Noir GLASS", 80),
        ("19 Crimes Uprising BOTTLE", 350),
        ("19 Crimes Uprising GLASS", 80),
        ("Casillero Diablo Cab Sav BOTTLE", 350),
        ("Casillero Diablo Cab Sav GLASS", 80),
        ("Casillero Diablo Merlot BOTTLE", 350),
        ("Casillero Diablo Merlot GLASS", 80),
        ("Robert Mondavi Cab Sav BOTTLE", 700),
        ("Robert Mondavi Cab Sav GLASS", 150),
        ("Robert Mondavi Merlot BOTTLE", 550),
        ("Robert Mondavi Merlot GLASS", 120),
        ("Robert Mondavi P Grigio BOTTLE", 350),
        ("Robert Mondavi P Grigio GLASS", 80),
        ("Woodbridge Moscato BOTTLE", 350),
        ("Woodbridge Moscato GLASS", 80),
        ("Woodbridge Merlot BOTTLE", 350),
        ("Woodbridge Merlot GLASS", 80),
        ("Woodbridge Pinot Noir BOTTLE", 350),
        ("Woodbridge Pinot Noir GLASS", 80),
        ("Woodbridge Pinot Grigio BOTTLE", 350),
        ("Woodbridge Pinot Grigio GLASS", 80),
        ("Asti Riccadonna BOTTLE", 750),
    ]:
        single(wine, t, p, nxt(wine))

    for t, p in [
        ("Da Luca BOTTLE", 550),
        ("Da Luca GLASS", 120),
        ("Blu Giovello BOTTLE", 550),
        ("Blu Giovello GLASS", 125),
        ("Cavichiolli BOTTLE", 360),
        ("Cavichiolli GLASS", 75),
    ]:
        single(pr, t, p, nxt(pr))

    for t, p in [
        ("Moet Imperial Rose BOTTLE", 1300),
        ("Moet Nectar Imperial Rose BOTTLE", 1300),
        ("Moet Imperial Ice BOTTLE", 1300),
        ("Moet Imperial Brut BOTTLE", 1300),
        ("Moet Imperial Ice Rose BOTTLE", 1400),
        ("Ace of Spades Rose", 4800),
        ("Ace of Spades Gold", 3800),
    ]:
        single(ch, t, p, nxt(ch))

    single(
        liq,
        "Bailey's DRINK",
        90,
        nxt(liq),
        "Bottle — ask staff for availability and price.",
    )
    multi(liq, "Jagermeister", [("BOTTLE", 1100), ("DRINK", 50)], nxt(liq))
    single(liq, "Goldschlager DRINK", 55, nxt(liq))

    multi(
        cog,
        "Hennessy VS",
        [("BOTTLE", 800), ("HALF", 425), ("DRINK", 60)],
        nxt(cog),
    )
    multi(
        cog,
        "Hennessy VSOP",
        [("BOTTLE", 1100), ("HALF", 600), ("DRINK", 80)],
        nxt(cog),
    )
    multi(
        cog,
        "Hennessy Pure White",
        [("BOTTLE", 1100), ("HALF", 600), ("DRINK", 70)],
        nxt(cog),
    )
    multi(
        cog,
        "Hennessy XO",
        [("BOTTLE", 2200), ("HALF", 1200), ("DRINK", 160)],
        nxt(cog),
    )
    multi(cog, "Martell", [("BOTTLE", 885), ("DRINK", 60)], nxt(cog))
    multi(
        cog,
        "Martell Blue Swift",
        [("BOTTLE", 1300), ("DRINK", 85)],
        nxt(cog),
    )
    multi(
        cog,
        "Courvoisier",
        [("BOTTLE", 800), ("HALF", 425), ("DRINK", 50)],
        nxt(cog),
    )
    single(cog, "Remy Martin BOTTLE", 550, nxt(cog))

    write_section_indexes()

    total = sum(w.values())
    print(f"Wrote {total} items across {len(CATEGORIES)} sections under {CONTENT}")


if __name__ == "__main__":
    main()
