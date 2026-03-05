---
description: Checking every ready before commit
scope: project
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git show:*), Bash(git log:*), Bash(head *), Bash(npm run test:all), Bash(npm run lint-recipes), Read, Edit, Write, Grep, Glob
argument-hint: [optional commit message override]
---

# Are we ready?

Before committing, ensure everything is ready:
- tests added and passing
- code review
- documentation updated

## Tests

1. Review the changes and think about what use cases need to be tested.
2. Add any missing tests.
3. Run all tests with `npm run test:all` and make sure they pass.
   - If recipes were changed, also run `npm run lint-recipes`.

## Code review

Check all the changes and verify that:
- everything is used (no dead code)
- code is as simple and easy to maintain as possible
- no useless comments
- follows best practices
- does not include any secrets or anything that should never be public

## Update documentation

1. Update the `documentation/` folder as needed. This documentation is used to get context at the start of each session — keep it accurate and complete:
   - `ARCHITECTURE.md` — if the architecture changed
   - `DATA_STRUCTURE.md` — if data structures changed
   - `RECIPE_FORMAT.md` — if the recipe format changed
   - `ROADMAP.md` — to reflect progress
2. If the changes are customer-facing and worth informing users about (if unsure, ask):
   - `docs/js/changelog.js` — increment ID, newest first
   - `docs/how-it-works.html` — if the user-facing flow changed

## Report

When done, give a summary covering:
- what tests were added or updated, and whether they pass
- what code issues were found and fixed
- which documentation files were updated
- whether the changes are ready to commit, and any remaining concerns
