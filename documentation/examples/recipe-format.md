# Recipe Format Specification

This document defines the markdown format for recipe files.

## File Structure

- **Location:** `recipes/{recipe-id}.md`
- **Format:** Markdown with YAML frontmatter

## Frontmatter (Required)

```yaml
id: recipe-slug           # Unique identifier (lowercase-with-dashes)
name: Recipe Name         # Display name
description: Short desc   # 1-2 sentence description
servings: 4              # Number of servings
time: 35                 # Total time in minutes
difficulty: easy         # One of: easy, medium, hard
tags: [vegan, dinner]    # Array of tags for filtering
```

## Content Sections

### Required Sections

#### `# Ingredients`
Ingredients grouped by category (H2 headings). Categories must match the predefined list:
- Fresh
- Fridge
- Spices
- Pantry

Format: Simple bullet points with plain text

#### `# Instructions`
Numbered steps for preparing the recipe. Use `{ingredient name}` to reference ingredients (fuzzy matching supported).

### Optional Sections

#### `# Notes`
Pre-cooking tips, important information, things to watch out for.

#### `# Serving Suggestions`
Post-cooking ideas, variations, side dishes, garnishes.

## Complete Example

```markdown
---
id: simple-lentil-curry
name: Simple Lentil Curry
description: Quick and flavorful vegan curry perfect for weeknight dinners
servings: 4
time: 35
difficulty: easy
tags: [vegan, dinner, quick, curry, indian]
---

# Notes

Make sure to rinse the lentils thoroughly to remove any debris. Red lentils cook faster than other varieties and will break down into a creamy texture. If you prefer more heat, add fresh chili peppers with the garlic.

# Ingredients

## Fresh
- 1 onion, diced
- 2 cloves garlic, minced
- Fresh cilantro for garnish

## Spices
- Salt to taste

## Pantry
- 1 can (400ml) coconut milk
- 1 cup red lentils, rinsed
- 2 cups vegetable broth
- 2 tbsp curry paste
- 1 tbsp oil

# Instructions

1. Heat {oil} in a large pot over medium heat. Add {onion} and cook until soft, about 5 minutes.
2. Add {garlic} and {curry paste}. Cook for 1 minute, stirring constantly until fragrant.
3. Add {lentils}, {coconut milk}, and {vegetable broth}. Stir to combine.
4. Bring to a boil, then reduce heat and simmer for 20-25 minutes until lentils are soft and tender.
5. Season with {salt} to taste. Garnish with {cilantro} and serve hot with rice or naan.

# Serving Suggestions

Serve over basmati rice or with warm naan bread. Add a dollop of coconut yogurt on top. Great with a side of mango chutney or lime pickle.
```

## Parser Behavior

The Rust parser will:
1. Validate all required frontmatter fields
2. Check that ingredient categories match the predefined enum
3. Auto-assign sequential IDs to ingredients (1, 2, 3...)
4. Parse `{ingredient}` references in steps for fuzzy matching
5. Generate `recipes.json` with this structure:

```json
{
  "id": "simple-lentil-curry",
  "name": "Simple Lentil Curry",
  "description": "Quick and flavorful vegan curry perfect for weeknight dinners",
  "servings": 4,
  "time": 35,
  "difficulty": "easy",
  "tags": ["vegan", "dinner", "quick", "curry", "indian"],
  "notes": "Make sure to rinse the lentils...",
  "ingredients": {
    "Fresh": [
      {"id": 1, "text": "1 onion, diced"},
      {"id": 2, "text": "2 cloves garlic, minced"},
      {"id": 3, "text": "Fresh cilantro for garnish"}
    ],
    "Spices": [
      {"id": 4, "text": "Salt to taste"}
    ],
    "Pantry": [
      {"id": 5, "text": "1 can (400ml) coconut milk"},
      {"id": 6, "text": "1 cup red lentils, rinsed"},
      {"id": 7, "text": "2 cups vegetable broth"},
      {"id": 8, "text": "2 tbsp curry paste"},
      {"id": 9, "text": "1 tbsp oil"}
    ]
  },
  "steps": [
    "Heat {oil} in a large pot over medium heat. Add {onion} and cook until soft, about 5 minutes.",
    "Add {garlic} and {curry paste}. Cook for 1 minute, stirring constantly until fragrant.",
    "Add {lentils}, {coconut milk}, and {vegetable broth}. Stir to combine.",
    "Bring to a boil, then reduce heat and simmer for 20-25 minutes until lentils are soft and tender.",
    "Season with {salt} to taste. Garnish with {cilantro} and serve hot with rice or naan."
  ],
  "serving_suggestions": "Serve over basmati rice or with warm naan bread..."
}
```

## Validation Rules

The parser/linter will enforce:
- All required frontmatter fields present
- `difficulty` must be one of: easy, medium, hard
- `servings` and `time` must be positive integers
- `id` must be unique across all recipes
- `id` must be lowercase with dashes only
- Ingredient categories must match predefined enum
- At least one ingredient category present
- At least one instruction step present
- `# Ingredients` and `# Instructions` sections required
