# Contributing to BiteMe

Thank you for your interest in contributing! This guide will help you add recipes to the project.

## Adding a New Recipe

1. **Create a new markdown file** in the `recipes/` folder
2. **Choose a unique ID** (lowercase-with-dashes format)
3. **Add frontmatter** with required fields
4. **Write your recipe** following the format below
5. **Submit a pull request**

## Recipe Format

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

## Ingredients

### Fresh
- 2 bell peppers, sliced
- 1 onion, diced

### Spices
- 2 tbsp green curry paste
- 1 tsp salt

## Instructions

1. Heat {oil} in a large pan over medium heat
2. Add {curry paste} and cook for 1 minute
3. Add {bell peppers} and {onion}, cook until tender
4. Serve hot with rice

## Notes

Any tips or important notes for the cook (optional).

## Serving Suggestions

How to serve the dish, garnishes, side dishes (optional).
```

## Recipe ID Guidelines

**Good IDs:**
- ✅ `thai-green-curry`
- ✅ `vegan-chocolate-cake`
- ✅ `quick-tomato-soup`

**Avoid:**
- ❌ `recipe1` (not descriptive)
- ❌ `Thai_Green_Curry` (use lowercase-with-dashes)
- ❌ `the-best-curry-ever` (keep it simple)

**Important:** The ID must be unique. The automated linter will check for duplicates when you submit your PR.

## Required Fields

- `id` - Unique identifier (lowercase-with-dashes)
- `name` - Display name for the recipe
- `description` - Short description shown on recipe cards
- `servings` - Number of servings
- `time` - Total time in minutes
- `difficulty` - easy, medium, or hard
- `tags` - Array of tags for filtering

## Optional Sections

- **Notes** - Tips, variations, or important info (shown on first cooking step)
- **Serving Suggestions** - How to serve, garnishes, sides (shown on last cooking step)

## Ingredient Linking

Link ingredients in your instructions using `{ingredient name}` syntax. This highlights ingredients in cooking mode so users can see exactly what they need for each step.

```markdown
1. Heat {oil} in a large pan
2. Add {onion} and {garlic}, cook until soft
3. Stir in {curry paste} and {coconut milk}
```

The linter will warn you if any ingredients aren't referenced in the instructions.

## Ingredient Categories

Group ingredients by kitchen location for better organization:

- Fresh
- Fridge
- Spices
- Pantry

## Automated Validation

When you open a PR, GitHub Actions will automatically:
- ✅ Validate recipe format
- ✅ Check for duplicate IDs
- ✅ Verify required fields
- ✅ Ensure proper markdown structure

If validation fails, the error message will tell you exactly what to fix.

## Questions?

Open an issue if you need help or have questions about the format!
