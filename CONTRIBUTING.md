# Contributing

Thanks for helping improve the collection! This repo is **plain JavaScript** —
no build step, no bundler. The `*.user.js` file you edit is exactly what users
install, so keep scripts readable and self-contained.

## Add a new script

1. **Create the folder.** Add `scripts/<slug>/<slug>.user.js`. The **folder
   name, the slug, and the `.user.js` filename must all match** (e.g.
   `scripts/reddit-old-redirect/reddit-old-redirect.user.js`). Use a short,
   lowercase, hyphenated slug. The quickest start is to copy the metadata block
   from an existing script — [`scripts/discogs-enhancer/`](scripts/discogs-enhancer/)
   is a compact one — and replace its contents.

2. **Fill in the metadata block.** Required keys (CI enforces these via
   `tools/validate-metadata.mjs`):

   | Key                    | Notes                                                          |
   | ---------------------- | -------------------------------------------------------------- |
   | `@name`                | Human-readable title                                           |
   | `@namespace`           | `https://github.com/Skriptey/Userscripts`                      |
   | `@version`             | Semver-ish, e.g. `1.0.0` — **bump on every change**            |
   | `@description`         | One sentence                                                   |
   | `@author`              | `Skriptey` or your name                                        |
   | `@license`             | `GPL-3.0-or-later`                                             |
   | `@match` or `@include` | The target site(s)                                             |
   | `@grant`               | `none`, or the `GM_*` APIs you use                             |
   | `@downloadURL`         | `https://skriptey.github.io/Userscripts/<slug>/<slug>.user.js` |
   | `@updateURL`           | same as `@downloadURL`                                         |

   Recommended extras: `@run-at`, `@icon`, `@homepageURL`
   (`…/tree/main/scripts/<slug>`), `@supportURL`
   (`https://github.com/Skriptey/Userscripts/issues`).

   Also add an SPDX line under the block: `// SPDX-License-Identifier: GPL-3.0-or-later`.

3. **Write the code** inside an IIFE with `'use strict';`. Prefer no `@grant`
   (run in page scope) unless you need `GM_*` APIs. Don't fetch remote code at
   runtime; if you must use a library, pin it with `@require <versioned-URL>`
   and note it in the script's README.

4. **Add `scripts/<slug>/README.md`** describing what the script does and an
   install link.

5. **Check locally:**

   ```bash
   npm install           # one-time: installs ESLint + Prettier (dev only)
   npm run check         # ESLint + Prettier check + metadata validation
   npm run format        # auto-format your changes
   npm run build:index   # optional: regenerate site/ to preview the index
   ```

6. **Open a pull request.** The PR template checklist must pass; every check
   in [CI checks](#ci-checks) below runs automatically.

## CI checks

Every pull request runs the checks below (see
[`.github/workflows/`](.github/workflows/)). All of them are read-only against
your PR — none of them can modify or publish anything.

| Workflow                                                                            | What it checks                                                                                                                                                                                                                         | Run it locally                                                                                                                      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`validate.yml`](.github/workflows/validate.yml) — Lint & validate                  | ESLint, Prettier formatting, complete userscript metadata (`tools/validate-metadata.mjs`), and that `tools/build-index.mjs` builds the install index without error.                                                                    | `npm run check` (ESLint + Prettier check + metadata); `npm run build:index` for the index build                                     |
| [`codeql.yml`](.github/workflows/codeql.yml) — CodeQL                               | Static analysis (security-extended query suite) over the JavaScript, including `*.user.js` (mapped to the JS extractor via `LGTM_INDEX_FILETYPES`).                                                                                    | No practical local equivalent; fix flagged issues per the Security tab / PR annotation.                                             |
| [`dependency-audit.yml`](.github/workflows/dependency-audit.yml) — Dependency audit | `npm audit --audit-level=moderate` on the dev-tooling dependency tree; runs on manifest changes and weekly (Mondays).                                                                                                                  | `npm audit`                                                                                                                         |
| [`secret-scan.yml`](.github/workflows/secret-scan.yml) — Secret scan                | Scans the full commit history with the `gitleaks` CLI for leaked secrets/tokens.                                                                                                                                                       | `gitleaks git --redact` (from a full clone; install the CLI per [gitleaks releases](https://github.com/gitleaks/gitleaks/releases)) |
| [`lint.yml`](.github/workflows/lint.yml) — Lint Workflows                           | Lints `.github/workflows/**` with `actionlint` (undefined `needs:`, malformed `${{ }}` expressions, invalid `runs-on`, and real shell errors in `run:` blocks at `shellcheck --severity=error`). Only runs when workflow files change. | Install [`actionlint`](https://github.com/rhysd/actionlint) and run `actionlint -color` from the repo root                          |
| [`pages.yml`](.github/workflows/pages.yml) — Deploy Pages                           | (Runs on push to `main`, not on PRs.) Validates metadata and rebuilds the install index, then deploys it to GitHub Pages.                                                                                                              | `npm run check` + `npm run build:index` cover the same validation/build steps                                                       |

`publish.yml` (mirrors this repo to the public `Skriptey/Userscripts` repo) also
only runs on push to `main`, never on a PR, so it never gates your change.

## Updating an existing script

Bump `@version` (managers only offer updates when the version increases) and
describe the change in the PR. Keep `@downloadURL`/`@updateURL` pointing at the
script's slug.

## Private (unlisted) scripts

Drop an empty file named **`.privatescript`** into a `scripts/<slug>/` folder to
keep that script out of the published collection. Such a folder is **excluded
from the install index** and is **not shipped to the public site at all** — it
stays only in the development repository. Use this for work-in-progress or
personal scripts you don't want publicly listed or downloadable. (A private
script still needs valid metadata; point its `@downloadURL`/`@updateURL` at
wherever you actually distribute it, if anywhere.)

## Style

- Plain JavaScript wrapped in an IIFE; no transpilation.
- **ESLint + Prettier** enforce quality and formatting — run `npm run check`, and
  `npm run format` to auto-fix. Prettier owns formatting; don't hand-fight it.
- 2-space indent, semicolons, single quotes (`.editorconfig` / `.prettierrc.json`).
- The lint/format tooling is **dev-only** — the `.user.js` files still ship verbatim.
- No minification — readability is a feature for a public collection.
- Never commit secrets, tokens, or personal data.

## Reporting bugs / requesting scripts

Use the [issue templates](https://github.com/Skriptey/Userscripts/issues/new/choose).
For security problems, **don't** open a public issue — see [SECURITY.md](SECURITY.md).
