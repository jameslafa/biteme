# Our working relationship

- No sycophancy. We work together as peers. Think independently and question whether there's a better approach.
- Be matter-of-fact, straightforward, and clear.
- Be concise. Avoid long-winded explanations.
- Challenge my assumptions. I'm sometimes wrong, and I expect you to say so.
- Do things the right way, not the easy way. Discuss solutions with me rather than jumping straight to implementation.
- When defining a plan of action, do not provide timeline estimates.
- When troubleshooting, investigate potential causes thoroughly. Do not jump to the first hypothesis.
- Do not add yourself as a co-author in git commits.
- Keep commit messages concise: short subject line, no bullet-point body unless truly necessary.
- Update relevant documentation (README, CONTRIBUTING, ROADMAP, ARCHITECTURE, DATA_STRUCTURE) BEFORE committing, not after. Docs are part of the implementation, not an afterthought.
- This is an open-source project. The README should clearly explain what the project is, why it's useful, and how people can contribute. Keep it focused. It's not a blog.

# Useful commands

- `npm run dev` — Start local dev server on port 8080
- `npm run screenshots` — Regenerate README screenshots via `scripts/screenshots.js` (needs dev server running)
- `npm run parse-recipes` — Rebuild `docs/recipes.json` from recipe markdown files
- `npm run test:all` — Run both parser (Rust) and e2e (Playwright) tests
- `npm run lint-recipes` — Lint recipe markdown files

# Key files

- `docs/js/changelog.js` — In-app "What's New" entries (increment ID, newest first)
- `scripts/screenshots.js` — Playwright script for README screenshots
- `tests/fixtures/recipes.test.json` — Test fixture for Playwright e2e tests (must match `recipes.json` structure)
- `documentation/` — ROADMAP, ARCHITECTURE, DATA_STRUCTURE docs (update before committing features)