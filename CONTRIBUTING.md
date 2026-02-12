# Contributing to BiteMe

Thank you for your interest in contributing! Whether you're a developer or just someone with a great recipe, there's a way for you to help.

## Adding a Recipe (No Coding Required)

You don't need to be a programmer to contribute a recipe. Here's how:

### Step 1: Format your recipe with a chatbot

Download the [recipe format guide](documentation/RECIPE_FORMAT.md) and give it to any AI chatbot (ChatGPT, Claude, Gemini, etc.) along with your recipe. Use a prompt like:

> Here is a recipe format specification. Please convert my recipe into this exact format. My recipe is: [paste your recipe, or describe it, or attach a photo]

The chatbot will give you a properly formatted `.md` file ready to go.

### Step 2: Add it to GitHub

1. Go to the [`recipes/`](https://github.com/jameslafa/biteme/tree/main/recipes) folder on GitHub
2. Click **Add file** → **Create new file**
3. Name the file `your-recipe-id.md` (using the `id` from the formatted recipe)
4. Paste the formatted recipe
5. Click **Propose new file** and follow the prompts to open a pull request

That's it! We'll review it and get it added.

---

## Developer Guide

### Adding a Recipe Manually

1. **Create a new markdown file** in the `recipes/` folder
2. **Choose a unique ID** (lowercase-with-dashes format)
3. **Add frontmatter** with required fields
4. **Write your recipe** following the format below
5. **Submit a pull request**

### Recipe Format

Create a file like `recipes/your-recipe-name.md`:

```markdown
---
id: thai-green-curry
name: Thai Green Curry
description: A fragrant and creamy Thai curry loaded with vegetables
servings: 4
time: 45
difficulty: medium
tags: [thai, curry, dinner]
---

# Notes

Any tips or important notes for the cook (optional).

# Ingredients

## Fresh
- 2 bell peppers, sliced
- 1 onion, diced

## Spices
- 2 tbsp green curry paste
- 1 tsp salt

# Instructions

1. Heat {oil} in a large pan over medium heat
2. Add {curry paste} and cook for 1 minute
3. Add {bell peppers} and {onion}, cook until tender
4. Serve hot with rice

# Serving Suggestions

How to serve the dish, garnishes, side dishes (optional).
```

### Recipe ID Guidelines

**Good IDs:**
- `thai-green-curry`
- `vegan-chocolate-cake`
- `quick-tomato-soup`

**Avoid:**
- `recipe1` (not descriptive)
- `Thai_Green_Curry` (use lowercase-with-dashes)
- `the-best-curry-ever` (keep it simple)

**Important:** The ID must be unique across all recipes.

### Required Fields

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | string | Lowercase letters and dashes only. No leading/trailing/consecutive dashes. Max 100 characters. |
| `name` | string | 3–200 characters. |
| `description` | string | 10–500 characters. |
| `servings` | integer | 1–100. |
| `time` | integer | 1–1440 minutes. |
| `difficulty` | string | `easy`, `medium`, or `hard`. |
| `tags` | array | At least 1. Lowercase, no spaces, no duplicates. |

### Sections

Sections use `#` (H1) headings. Ingredient categories use `##` (H2) headings.

**Section order:** Notes (optional) → Ingredients → Instructions → Serving Suggestions (optional)

### Optional Sections

- **Notes** — Tips, variations, or important info (shown before cooking starts)
- **Serving Suggestions** — How to serve, garnishes, sides (shown on last cooking step)

### Ingredient Categories

Group ingredients under `##` headings. Valid categories:

- `## Fresh` — produce, herbs
- `## Fridge` — dairy, cream, fridge items
- `## Spices` — dried spices and seasonings
- `## Pantry` — oils, stock, canned/dried goods

### Ingredient Linking

Link ingredients in your instructions using `{ingredient name}` syntax. Use a short, recognizable name — not the full ingredient line. This highlights ingredients in cooking mode so users can see what they need for each step.

```markdown
1. Heat {oil} in a large pan
2. Add {onion} and {garlic}, cook until soft
3. Stir in {curry paste} and {coconut milk}
```

The linter will warn you if any ingredients aren't referenced in the instructions.

## Questions?

Open an issue if you need help or have questions about the format!
