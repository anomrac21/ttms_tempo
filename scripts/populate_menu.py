#!/usr/bin/env python3
"""
Script to populate Tempo menu content from YAML data.
Creates category directories and markdown files for each menu item.
"""

import os
import re
from datetime import datetime
from pathlib import Path

# Menu data from PDFs
MENU_DATA = {
    "beers": [
        {"name": "Carib", "price": 23.00},
        {"name": "Pilsner", "price": 23.00},
        {"name": "Stag", "price": 23.00},
        {"name": "Heineken", "price": 30.00},
        {"name": "Heineken Light", "price": 30.00},
        {"name": "Rude Boy", "price": 25.00},
        {"name": "Caribe", "price": 25.00},
        {"name": "Carona", "price": 30.00},
        {"name": "Coors Light", "price": 25.00},
        {"name": "Guinness", "price": 30.00},
        {"name": "Mackeson", "price": 30.00},
        {"name": "Smirnoff", "price": 25.00},
        {"name": "Malta", "price": 20.00},
        {"name": "Shandy Carib", "price": 20.00},
    ],
    "scotch": [
        {"name": "Johnnie Walker Black", "drink": 45.00, "bottle": 840.00},
        {"name": "Johnnie Walker Double Black", "drink": 60.00, "bottle": 840.00},
        {"name": "Johnnie Walker 18 Years", "drink": 120.00, "bottle": 1800.00},
        {"name": "Old Par 12 Years", "drink": 55.00, "bottle": 820.00},
        {"name": "Jameson", "drink": 55.00, "bottle": 700.00},
        {"name": "Glenlivet 12 Years", "drink": 65.00, "bottle": 850.00},
        {"name": "Glenlivet 15 Years", "drink": 90.00, "bottle": 1100.00},
        {"name": "Crown Royale", "drink": 60.00, "bottle": 550.00},
    ],
    "champagne": [
        {"name": "Ace of Spades Gold", "price": 3800.00},
        {"name": "Ace of Spades Rose", "price": 4800.00},
        {"name": "Moet IMP Brut", "price": 1300.00},
        {"name": "Moet IMP ICE", "price": 1300.00},
        {"name": "Moet IMP ICE Rose", "price": 1400.00},
        {"name": "Moet Nectar IMP ROSE", "price": 1300.00},
    ],
    "cognac": [
        {"name": "Hennessy VS", "drink": 60.00, "bottle": 800.00},
        {"name": "Hennessy VSOP", "drink": 80.00, "bottle": 1100.00},
    ],
    "cocktails": [
        {"name": "Pole Dancer Layered", "ingredients": "Vodka · Cream · Berry", "price": 70.00},
        {"name": "Tempo Royale Layered", "ingredients": "Vodka · Coffee · Cream", "price": 120.00},
        {"name": "Tropical Detour", "ingredients": "Rum · Tropical · Citrus", "price": 60.00},
        {"name": "Sex In the Jungle", "ingredients": "Vodka · Peach · Tropical", "price": 55.00},
        {"name": "Salted Caramel Pretzel", "ingredients": "Vodka · Caramel · Salt", "price": 60.00},
        {"name": "Porn Star Martini", "ingredients": "Vodka · Passionfruit · Vanilla", "price": 80.00},
        {"name": "Whiskey Sour", "ingredients": "Whiskey · Citrus · Sweet", "price": 65.00},
        {"name": "White Gummy Bear", "ingredients": "Vodka · Berry · Sweet", "price": 65.00},
        {"name": "Dirty Martini", "ingredients": "Vodka · Olive · Brine", "price": 60.00},
        {"name": "Beach Rum", "ingredients": "Rum · Coconut · Pineapple", "price": 60.00},
        {"name": "Bloody Mary", "ingredients": "Vodka · Tomato · Spice", "price": 70.00},
        {"name": "Apple Martini", "ingredients": "Vodka · Green Apple", "price": 65.00},
        {"name": "Car Crash Layered", "ingredients": "Vodka · Citrus · Berry", "price": 60.00},
        {"name": "Cosmopolitan", "ingredients": "Vodka · Cranberry · Citrus", "price": 60.00},
        {"name": "Daiquiri Frozen", "ingredients": "Rum · Lime · Sweet", "price": 65.00},
        {"name": "Electric Lotus", "ingredients": "Vodka · Blue Citrus", "price": 65.00},
        {"name": "French Kiss", "ingredients": "Vodka · Berry · Citrus", "price": 60.00},
        {"name": "Godfather", "ingredients": "Whiskey · Amaretto · Almond", "price": 75.00},
        {"name": "Liquid Marijuana", "ingredients": "Rum · Coconut · Pineapple", "price": 65.00},
        {"name": "Pineapple Smash", "ingredients": "Rum · Pineapple · Citrus", "price": 80.00},
        {"name": "Mudslide Frozen", "ingredients": "Vodka · Coffee · Cream", "price": 80.00},
        {"name": "Between the Sheet", "ingredients": "Rum · Brandy · Citrus", "price": 65.00},
        {"name": "Dirty Shirly", "ingredients": "Vodka · Cherry · Soda", "price": 40.00},
        {"name": "Expresso Lux", "ingredients": "Vodka · Coffee · Cream", "price": 55.00},
        {"name": "Galaxy Martini", "ingredients": "Vodka · Berry · Citrus", "price": 60.00},
        {"name": "Long Island Iced Tea", "ingredients": "Mixed Spirits · Citrus", "price": 80.00},
        {"name": "Paradise Pulse", "ingredients": "Rum · Tropical · Citrus", "price": 75.00},
    ],
    "rum": [
        {"name": "White Oak", "drink": 30.00, "bottle": 400.00},
        {"name": "Puncheon", "drink": 35.00, "bottle": 500.00},
        {"name": "Angostura 1919", "drink": 45.00, "bottle": 650.00},
        {"name": "Angostura 1824", "drink": 60.00, "bottle": 750.00},
        {"name": "Bacardi", "drink": 50.00, "bottle": 700.00},
        {"name": "Black Label", "drink": 30.00, "bottle": 400.00},
        {"name": "Bumbu", "drink": 65.00, "bottle": 950.00},
        {"name": "Diamond Reserve", "drink": 30.00, "bottle": 350.00},
    ],
    "tequila": [
        {"name": "Don Julio Blanco", "drink": 70.00, "bottle": 850.00},
        {"name": "Don Julio Anejo", "drink": 70.00, "bottle": 850.00},
        {"name": "Jose Cuervo", "drink": 40.00, "bottle": 400.00},
        {"name": "Patrón Silver", "drink": 70.00, "bottle": 900.00},
        {"name": "Patrón Café", "drink": 70.00, "bottle": 900.00},
        {"name": "1800 Reposado", "drink": 40.00, "bottle": 420.00},
    ],
    "vodka": [
        {"name": "Absolut", "drink": 45.00, "bottle": 600.00},
        {"name": "Cîroc", "drink": 60.00, "bottle": 870.00},
        {"name": "Grey Goose", "drink": 60.00, "bottle": 800.00},
        {"name": "Ketel One", "drink": 60.00, "bottle": 800.00},
        {"name": "Smirnoff", "drink": 40.00, "bottle": 495.00},
        {"name": "Tito's", "drink": 50.00, "bottle": 650.00},
        {"name": "Belvedere", "drink": 60.00, "bottle": 800.00},
    ],
    "shots": [
        {"name": "B-52 Shot Baileys, Mokatika", "price": 35.00},
        {"name": "Beach Sex Shot Vodka", "price": 35.00},
        {"name": "Birthday Cake Shot Vanilla Vodka", "price": 40.00},
        {"name": "Blow Job Shot Baileys, Mokatika", "price": 35.00},
        {"name": "Brain Hemorrhage Shot Malibu", "price": 35.00},
        {"name": "Flaming B-52 Shot Mokatika, Baileys, Puncheon", "price": 45.00},
    ],
    "appetizers": [
        {"name": "Roast Pork", "price": 90.00},
        {"name": "Golden / Pepper Fried Calamari", "price": 80.00},
        {"name": "Shrimp Kebabs (Cajun / Jerk / Chilli Garlic)", "price": 135.00},
        {"name": "Hong Kong Shrimp", "price": 115.00},
        {"name": "Chinese Style Chicken", "price": 80.00},
        {"name": "Grilled Pepper Chicken", "price": 85.00},
        {"name": "Open Face Wontons (Chicken / Shrimp - 6 Servings)", "price": 85.00},
        {"name": "Batter Fried Mushrooms", "price": 85.00},
        {"name": "Shrimp Tempura", "price": 85.00},
        {"name": "Scampi with Crostini (Shrimp & Scallops)", "price": 120.00},
        {"name": "Beef Quesadillas", "price": 90.00},
        {"name": "Chicken Quesadillas", "price": 90.00},
        {"name": "Korean BBQ Chicken Bites", "price": 105.00},
        {"name": "Ceviche Shots", "price": 115.00},
        {"name": "Pepper Cut Lamb", "price": 115.00},
        {"name": "Wings (10 pcs)", "price": 110.00},
        {"name": "Truffle Parmesan Fries", "price": 104.00},
        {"name": "Bruschetta Trio (Shrimp / Chicken / Vege)", "price": 115.00},
        {"name": "Gyoza Dumplings", "price": 55.00},
        {"name": "Vietnamese Spring Rolls", "price": 50.00},
        {"name": "Butter Fried Shrimp", "price": 75.00},
        {"name": "Butter Fried Chicken", "price": 75.00},
        {"name": "Lamb Lollipops", "price": 180.00},
    ],
    "burgers_and_sandwiches": [
        {"name": "Beef Burger + Fries", "price": 90.00},
        {"name": "Chicken Sandwich + Fries", "price": 90.00},
        {"name": "Fish Sandwich + Fries", "price": 90.00},
        {"name": "Tempo Burger + Fries", "price": 120.00},
    ],
    "ribs_and_grill": [
        {"name": "BBQ Pork Ribs - Full Rack + 2 Sides", "price": 365.00},
        {"name": "BBQ Pork Ribs - 1/2 Rack + 1 Side", "price": 185.00},
        {"name": "Chimichurri Steak (Rib-eye)", "price": 370.00},
    ],
    "pasta": [
        {"name": "Aglio Chicken", "price": 135.00},
        {"name": "Aglio Shrimp", "price": 140.00},
        {"name": "Alfredo Chicken", "price": 135.00},
        {"name": "Alfredo Shrimp", "price": 140.00},
    ],
    "sliders_and_tacos": [
        {"name": "Beef Sliders (Minced Beef)", "price": 105.00},
        {"name": "Pulled Pork Sliders", "price": 110.00},
        {"name": "Fish / Chicken Tacos", "price": 95.00},
    ],
    "sides": [
        {"name": "Fries", "price": 35.00},
        {"name": "Onion Rings", "price": 40.00},
        {"name": "Mashed Potatoes", "price": 35.00},
        {"name": "Parsley Rice", "price": 45.00},
        {"name": "House Salad", "price": 65.00},
        {"name": "Loaded Fries", "price": 55.00},
    ],
}


def generate_filename(title):
    """Convert title to URL-safe filename."""
    # Convert to lowercase
    filename = title.lower()
    # Replace spaces and special characters with hyphens
    filename = re.sub(r'[^\w\s-]', '', filename)
    filename = re.sub(r'[-\s]+', '-', filename)
    # Remove leading/trailing hyphens
    filename = filename.strip('-')
    return filename


def parse_cocktail_ingredients(ingredients_str):
    """Parse cocktail ingredients from string format (e.g., 'Vodka · Cream · Berry')."""
    if not ingredients_str:
        return []
    # Split by middle dot or bullet point
    ingredients = [ing.strip() for ing in re.split(r'[·•]', ingredients_str)]
    return [ing for ing in ingredients if ing]


def parse_shot_ingredients(name):
    """Extract ingredients from shot name."""
    name_lower = name.lower()
    ingredients = []
    
    if "b-52" in name_lower or "flaming b-52" in name_lower:
        if "baileys" in name_lower or "mokatika" in name_lower:
            ingredients.append("Baileys")
        if "mokatika" in name_lower:
            ingredients.append("Kahlua")
        if "puncheon" in name_lower:
            ingredients.append("Puncheon")
    elif "beach sex" in name_lower:
        ingredients.append("Vodka")
    elif "birthday cake" in name_lower:
        ingredients.append("Vanilla Vodka")
    elif "blow job" in name_lower:
        if "baileys" in name_lower or "mokatika" in name_lower:
            ingredients.append("Baileys")
            ingredients.append("Kahlua")
    elif "brain hemorrhage" in name_lower:
        if "malibu" in name_lower:
            ingredients.append("Malibu")
        ingredients.append("Peach Schnapps")
        ingredients.append("Grenadine")
    
    return ingredients


def get_ingredients_cookingmethods_types(name, title, category):
    """Determine ingredients, cookingmethods, and types based on item name and category."""
    name_lower = name.lower()
    title_lower = title.lower()
    ingredients = []
    cookingmethods = []
    types = []
    tags = [title]
    
    # Capitalize category name
    category_cap = category.capitalize()
    
    # Beer
    if category == "beers":
        types.append("Beer")
        ingredients.append("Barley")
    
    # Scotch
    elif category == "scotch":
        types.append("Scotch")
        if "johnnie walker" in name_lower:
            ingredients.append("Blended Scotch Whiskey")
        elif "glenlivet" in name_lower:
            ingredients.append("Single Malt Scotch")
        elif "jameson" in name_lower:
            ingredients.append("Irish Whiskey")
        elif "crown" in name_lower:
            ingredients.append("Canadian Whiskey")
        elif "old par" in name_lower:
            ingredients.append("Blended Scotch Whiskey")
    
    # Champagne
    elif category == "champagne":
        types.append("Champagne")
        ingredients.append("Grapes")
    
    # Cognac
    elif category == "cognac":
        types.append("Cognac")
        if "hennessy" in name_lower:
            ingredients.append("Cognac")
    
    # Cocktails - ingredients are provided in the data
    elif category == "cocktails":
        types.append("Cocktail")
        # Ingredients will be populated from the data
    
    # Rum
    elif category == "rum":
        types.append("Rum")
        if "white oak" in name_lower or "black label" in name_lower or "diamond reserve" in name_lower:
            ingredients.append("White Rum")
        elif "puncheon" in name_lower:
            ingredients.append("Puncheon Rum")
        elif "angostura" in name_lower:
            ingredients.append("Aged Rum")
        elif "bacardi" in name_lower:
            ingredients.append("White Rum")
        elif "bumbu" in name_lower:
            ingredients.append("Spiced Rum")
    
    # Tequila
    elif category == "tequila":
        types.append("Tequila")
        if "don julio" in name_lower:
            ingredients.append("Premium Tequila")
        elif "patron" in name_lower:
            ingredients.append("Premium Tequila")
        elif "jose cuervo" in name_lower:
            ingredients.append("Tequila")
        elif "1800" in name_lower:
            ingredients.append("Reposado Tequila")
    
    # Vodka
    elif category == "vodka":
        types.append("Vodka")
        ingredients.append("Vodka")
    
    # Shots
    elif category == "shots":
        types.append("Shot")
        # Ingredients will be parsed from name
    
    # Food categories
    elif category == "appetizers":
        types.append("Food")
        types.append("Appetizer")
        # Analyze item name for ingredients and cooking methods
        if "pork" in name_lower:
            ingredients.append("Pork")
            tags.append("Pork")
            if "roast" in name_lower:
                cookingmethods.append("Roasted")
            elif "fried" in name_lower:
                cookingmethods.append("Fried")
        elif "chicken" in name_lower:
            ingredients.append("Chicken")
            tags.append("Chicken")
            if "grilled" in name_lower:
                cookingmethods.append("Grilled")
            elif "fried" in name_lower:
                cookingmethods.append("Fried")
            elif "bbq" in name_lower:
                cookingmethods.append("Grilled")
                ingredients.append("BBQ Sauce")
        elif "shrimp" in name_lower or "scampi" in name_lower:
            ingredients.append("Shrimp")
            tags.append("Shrimp")
            if "tempura" in name_lower:
                cookingmethods.append("Fried")
            elif "fried" in name_lower:
                cookingmethods.append("Fried")
        elif "lamb" in name_lower:
            ingredients.append("Lamb")
            tags.append("Lamb")
            if "cut" in name_lower:
                cookingmethods.append("Grilled")
        elif "beef" in name_lower:
            ingredients.append("Beef")
            tags.append("Beef")
        elif "calamari" in name_lower:
            ingredients.append("Squid")
            tags.append("Calamari")
            cookingmethods.append("Fried")
        elif "wontons" in name_lower:
            ingredients.append("Wonton Wrappers")
            tags.append("Wontons")
            cookingmethods.append("Fried")
        elif "mushrooms" in name_lower:
            ingredients.append("Mushrooms")
            tags.append("Mushrooms")
            cookingmethods.append("Fried")
        elif "fries" in name_lower:
            ingredients.append("Potatoes")
            tags.append("Fries")
            cookingmethods.append("Fried")
            if "truffle" in name_lower:
                ingredients.append("Truffle")
                ingredients.append("Parmesan")
        elif "bruschetta" in name_lower:
            ingredients.append("Bread")
            tags.append("Bruschetta")
            cookingmethods.append("Toasted")
        elif "gyoza" in name_lower or "dumplings" in name_lower:
            ingredients.append("Dumpling Wrappers")
            tags.append("Dumplings")
            cookingmethods.append("Steamed")
        elif "spring rolls" in name_lower:
            ingredients.append("Rice Paper")
            tags.append("Spring Rolls")
            cookingmethods.append("Fresh")
        elif "ceviche" in name_lower:
            ingredients.append("Fish")
            tags.append("Ceviche")
            cookingmethods.append("Raw")
        elif "wings" in name_lower:
            ingredients.append("Chicken")
            tags.append("Chicken")
            tags.append("Wings")
            cookingmethods.append("Fried")
    
    elif category == "burgers_and_sandwiches":
        types.append("Food")
        types.append("Main")
        if "burger" in name_lower:
            types.append("Burger")
            tags.append("Burger")
            if "beef" in name_lower:
                ingredients.append("Beef")
                tags.append("Beef")
            elif "chicken" in name_lower:
                ingredients.append("Chicken")
                tags.append("Chicken")
            ingredients.append("Bun")
            ingredients.append("Lettuce")
            ingredients.append("Tomato")
        elif "sandwich" in name_lower:
            types.append("Sandwich")
            tags.append("Sandwich")
            if "chicken" in name_lower:
                ingredients.append("Chicken")
                tags.append("Chicken")
            elif "fish" in name_lower:
                ingredients.append("Fish")
                tags.append("Fish")
            ingredients.append("Bread")
        if "fries" in name_lower:
            ingredients.append("Potatoes")
            tags.append("Fries")
            cookingmethods.append("Fried")
    
    elif category == "ribs_and_grill":
        types.append("Food")
        types.append("Main")
        if "ribs" in name_lower:
            ingredients.append("Pork")
            tags.append("Ribs")
            tags.append("Pork")
            cookingmethods.append("Grilled")
            ingredients.append("BBQ Sauce")
        elif "steak" in name_lower:
            ingredients.append("Beef")
            tags.append("Steak")
            tags.append("Beef")
            cookingmethods.append("Grilled")
            if "chimichurri" in name_lower:
                ingredients.append("Chimichurri Sauce")
    
    elif category == "pasta":
        types.append("Food")
        types.append("Main")
        ingredients.append("Pasta")
        tags.append("Pasta")
        if "chicken" in name_lower:
            ingredients.append("Chicken")
            tags.append("Chicken")
        elif "shrimp" in name_lower:
            ingredients.append("Shrimp")
            tags.append("Shrimp")
        if "aglio" in name_lower:
            ingredients.append("Garlic")
            ingredients.append("Olive Oil")
        elif "alfredo" in name_lower:
            ingredients.append("Cream")
            ingredients.append("Parmesan")
    
    elif category == "sliders_and_tacos":
        types.append("Food")
        types.append("Appetizer")
        if "sliders" in name_lower:
            tags.append("Sliders")
            if "beef" in name_lower:
                ingredients.append("Beef")
                tags.append("Beef")
            elif "pork" in name_lower:
                ingredients.append("Pork")
                tags.append("Pork")
            ingredients.append("Mini Bun")
        elif "tacos" in name_lower:
            tags.append("Tacos")
            ingredients.append("Tortilla")
            if "fish" in name_lower:
                ingredients.append("Fish")
                tags.append("Fish")
            elif "chicken" in name_lower:
                ingredients.append("Chicken")
                tags.append("Chicken")
    
    elif category == "sides":
        types.append("Food")
        types.append("Side")
        if "fries" in name_lower:
            ingredients.append("Potatoes")
            tags.append("Fries")
            cookingmethods.append("Fried")
            if "loaded" in name_lower:
                ingredients.append("Cheese")
                ingredients.append("Bacon")
        elif "onion rings" in name_lower:
            ingredients.append("Onions")
            tags.append("Onion Rings")
            cookingmethods.append("Fried")
        elif "mashed potatoes" in name_lower:
            ingredients.append("Potatoes")
            tags.append("Mashed Potatoes")
            cookingmethods.append("Mashed")
            ingredients.append("Butter")
            ingredients.append("Cream")
        elif "rice" in name_lower:
            ingredients.append("Rice")
            tags.append("Rice")
            if "parsley" in name_lower:
                ingredients.append("Parsley")
        elif "salad" in name_lower:
            ingredients.append("Lettuce")
            ingredients.append("Vegetables")
            tags.append("Salad")
    
    # Format arrays as YAML strings
    def format_yaml_array(arr):
        if not arr:
            return "[]"
        return "[" + ", ".join([f'"{item}"' for item in arr]) + "]"
    
    return format_yaml_array(tags), format_yaml_array(ingredients), format_yaml_array(cookingmethods), format_yaml_array(types)


def generate_markdown(item_data, category):
    """Generate markdown content for a menu item."""
    name = item_data["name"]
    
    # Get ingredients, cookingmethods, types
    tags_str, base_ingredients_str, cookingmethods_str, types_str = get_ingredients_cookingmethods_types(name, name, category)
    
    # Parse prices
    prices_yaml = []
    if "price" in item_data:
        # Single price
        price = item_data["price"]
        prices_yaml.append(f'  - size: "-"\n    price: {int(price) if price == int(price) else price}\n    flavour: "-"')
    elif "drink" in item_data and "bottle" in item_data:
        # Drink and bottle prices
        drink_price = item_data["drink"]
        bottle_price = item_data["bottle"]
        prices_yaml.append(f'  - size: "Drink"\n    price: {int(drink_price) if drink_price == int(drink_price) else drink_price}\n    flavour: "-"')
        prices_yaml.append(f'  - size: "Bottle"\n    price: {int(bottle_price) if bottle_price == int(bottle_price) else bottle_price}\n    flavour: "-"')
    
    prices_str = "\n".join(prices_yaml)
    
    # Handle ingredients for cocktails and shots
    ingredients_list = []
    if category == "cocktails" and "ingredients" in item_data:
        # Parse cocktail ingredients
        ingredients_list = parse_cocktail_ingredients(item_data["ingredients"])
    elif category == "shots":
        # Parse shot ingredients from name
        ingredients_list = parse_shot_ingredients(name)
    
    # Combine base ingredients with parsed ingredients
    if ingredients_list:
        # Parse base ingredients string and combine
        import ast
        try:
            base_ingredients = ast.literal_eval(base_ingredients_str) if base_ingredients_str != "[]" else []
            all_ingredients = list(set(base_ingredients + ingredients_list))
            ingredients_str = "[" + ", ".join([f'"{item}"' for item in all_ingredients]) + "]"
        except:
            ingredients_str = "[" + ", ".join([f'"{item}"' for item in ingredients_list]) + "]"
    else:
        ingredients_str = base_ingredients_str
    
    # Generate frontmatter
    frontmatter = f"""---
title: {name}
weight: 10
date: {datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}Z
prices:
{prices_str}
tags: {tags_str}
ingredients: {ingredients_str}
cookingmethods: {cookingmethods_str}
types: {types_str}
events: []
---

"""
    
    return frontmatter


def get_category_icon(category_name):
    """Get icon URL for a category."""
    icons = {
        "beers": "https://cdn.ttmenus.com/icons/food/icon-beer.webp",
        "scotch": "https://cdn.ttmenus.com/icons/food/icon-scotch.webp",
        "champagne": "https://cdn.ttmenus.com/icons/food/icon-wine.webp",
        "cognac": "https://ct.ttmenus.com/icons/food/icon-rum.webp",
        "cocktails": "https://cdn.ttmenus.com/icons/food/icon-sigcocktails.webp",
        "rum": "https://ct.ttmenus.com/icons/food/icon-rum.webp",
        "tequila": "https://cdn.ttmenus.com/icons/food/icon-shots.webp",
        "vodka": "https://cdn.ttmenus.com/icons/white/icon-glass.webp",
        "shots": "https://cdn.ttmenus.com/icons/food/icon-shots.webp",
        "appetizers": "https://ct.ttmenus.com/icons/food/icon-appetizers.webp",
        "burgers_and_sandwiches": "https://cdn.ttmenus.com/icons/food/icon-burgers.webp",
        "ribs_and_grill": "https://ct.ttmenus.com/icons/food/icon-meat.webp",
        "pasta": "https://ct.ttmenus.com/icons/food/icon-pasta.webp",
        "sliders_and_tacos": "https://ct.ttmenus.com/icons/food/icon-tacos.webp",
        "sides": "https://ct.ttmenus.com/icons/food/icon-fries.webp",
    }
    return icons.get(category_name, "")


def generate_category_index(category_name):
    """Generate _index.md for a category."""
    icon = get_category_icon(category_name)
    # Convert category name to title (handle underscores)
    category_title = category_name.replace("_", " ").title()
    if icon:
        content = f"""---
title: {category_title}
weight: 10
icon: {icon}
---
"""
    else:
        content = f"""---
title: {category_title}
weight: 10
---
"""
    return content


def main():
    """Main function to populate menu content."""
    # Get script directory and content directory
    script_dir = Path(__file__).parent
    content_dir = script_dir.parent / "content"
    
    # Ensure content directory exists
    content_dir.mkdir(parents=True, exist_ok=True)
    
    total_items = 0
    
    # Create category directories and files
    for category, items in MENU_DATA.items():
        category_dir = content_dir / category
        category_dir.mkdir(exist_ok=True)
        
        # Create/Update _index.md for category
        index_file = category_dir / "_index.md"
        index_content = generate_category_index(category)
        index_file.write_text(index_content)
        print(f"Updated category index: {index_file}")
        
        # Create markdown files for each item
        for item in items:
            filename = generate_filename(item["name"])
            file_path = category_dir / f"{filename}.md"
            
            markdown = generate_markdown(item, category)
            file_path.write_text(markdown)
            print(f"Updated menu item: {file_path}")
            total_items += 1
    
    print(f"\nSuccessfully populated {total_items} menu items across {len(MENU_DATA)} categories!")


if __name__ == "__main__":
    main()
