Add a recipe to the BiteMe project.

Before writing anything, read `documentation/RECIPE_FORMAT.md` — it is the authoritative spec for recipe markdown files. Follow it exactly.

Key rules to check before writing:
- Space between number and unit: `400 g`, not `400g`
- Text fractions: `1/2`, not `½`
- Tin format: `1 tin (400 g) item` or `2 tins (400 g) item`
- US "tomato puree" = European passata — translate accordingly
- Convert all US/imperial measurements to metric
- Ingredient categories: Fresh, Fridge, Spices, Pantry only
- Every ingredient must be referenced with `{short name}` in instructions
- `diet` field: only `vegan`, `vegetarian`, `gluten-free`
- `tested: false` for any recipe not personally tested

After writing the file, run `npm run lint-recipes` and fix any errors before finishing.
