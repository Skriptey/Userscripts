# Project context — Skriptey/Userscripts

- **What:** a collection of browser userscripts (for Tampermonkey /
  Violentmonkey). Plain JavaScript; each `scripts/<slug>/<slug>.user.js` is
  shipped exactly as written — no bundling or minifying.
- **Published site:** https://skriptey.github.io/Userscripts/ — built by
  `.github/workflows/pages.yml` using `tools/build-index.mjs` on every push to
  `main`.
- **Checks:** `npm run check` = ESLint + Prettier check + metadata check
  (`tools/validate-metadata.mjs`). CI also runs CodeQL, secret scan, and
  actionlint.
- **Private scripts:** a `.privatescript` file in a script folder keeps it out
  of the public site and out of this repo.
- **Two repos:** development happens in `Skriptey/Userscripts-dev`; this repo
  (`Skriptey/Userscripts`) receives automatic "Publish" commits from it.
- **Docs:** `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, per-script READMEs,
  `docs/README.md`, wiki source in `docs/wiki/` (pushed to the GitHub wiki by
  hand).
- **No API** — so no OpenAPI/Swagger docs are needed.
- **Files for AI tools:** `.claude/` (Claude) and `.OpenAI/` (Codex). Keep
  both in step. Start with `.claude/HANDOFF.md`.
