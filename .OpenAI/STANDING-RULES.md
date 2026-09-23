# Standing Tasks & Rules — Skriptey/Userscripts

Last revised: 2026-09-23. These apply to every session (Claude, Codex, or any
other AI tool) working on this repo. The same file is mirrored for Codex at
`.OpenAI/STANDING-RULES.md` — keep both in step.

---

## 1. Language use (plain English)

When reporting back or explaining anything, avoid technical jargon. Write in
simple, everyday English that anyone can follow — even experienced developers
find jargon confusing at times. If a technical term can't be avoided, explain
it in a few plain words straight after.

## 2. Keep the handoff document updated

As work progresses, keep `.claude/HANDOFF.md` up to date **as you go** (not just
at the end), so any new session can pick up exactly where we left off if we are
interrupted for any reason.

## 3. Processing & analysis

- Think hard about the work needed ("ultrathink") and use workflows to help
  plan and do the work.
- **Deep analysis and deep planning:** use Opus agents, run **one after
  another (sequentially), not in parallel**. (Reason: the latest Opus is
  cheaper and at least as good as the latest Fable at time of writing.)
- **Implementation:** use Sonnet or Haiku, whichever suits the job. If the
  implementation is complex, use Opus.
- Philosophy: use tokens/usage credits efficiently while still producing
  top-quality, correct code. **GIRFT — Get It Right First Time.**

## 4. Use plugins to help

- Use the **dev-team-plugin** tools freely for any of the above work, and for
  suggesting fixes, tweaks, enhancements and new features.
- Use it to bring in a _different_ AI system to check work: plan and build with
  Claude Code, then check/review with Codex (and vice versa).

## 5. Steps after each task

After each piece of work is finished:

1. Commit and push to our working branch (the one that will later be merged
   into `alpha`), and update the related GitHub issue(s) — one update per task.
2. Update Claude memory/context in `.claude/`.
3. Update OpenAI/Codex memory/context in `.OpenAI/`.
4. Update the handoff document (`.claude/HANDOFF.md`).

## 6. Thorough documentation update (standing)

- Keep all `.md` documentation files up to date (README, CONTRIBUTING,
  SECURITY, per-script READMEs, `docs/`, `docs/wiki/`).
- Keep in-app help, guides, etc. up to date (for userscripts: in-script
  menus/tooltips/help text and each script's README).
- Keep Claude memory, context and everything else in `.claude/` up to date.
- **If** the project offers an API, keep OpenAPI/Swagger docs up to date; if it
  has web-based parts and no Swagger UI, add a browsable Swagger UI that also
  works on plain shared hosting (no Docker). _This repo currently has no API,
  so this part does not apply today._

## 7. Efficient/smart processing

Feel free to re-order or bundle the tasks above to get them done efficiently.

## 8. Autonomy

- Work through everything on your own. Only stop when you need an **explicit**
  decision or approval from the owner — and then say clearly, in simple words,
  what you need and why.
- Raise questions **up front**, all together, rather than one at a time as they
  come up.
- After pausing for an answer, carry on with **all** queued tasks.

## 9. Progress updates

Give frequent updates showing the queued tasks in a table with the status of
each.

## 10. Code review

All code goes through review by Codex. Any issues found are fixed
automatically, then Codex reviews again — repeat until no issues are found.

## 11. No PR stacking

Don't create multiple pull requests (PRs). Commit everything to the single
working branch that will later target `alpha` via **one** PR created later.
This avoids clashes when merging several PRs.

## 12. LLM fallback

- If one AI service (e.g. Claude Code, Codex — or any other) or its agents
  becomes unavailable or runs out of tokens/credits, hand off to another
  suitable one, as long as it can pick up without losing context or progress.
- Switch back to the main AI service for this project as soon as it's
  available again, and then run a **full** review of what was done meanwhile.
- Cross-AI reviews (rule 10) help catch any differences in approach between
  services.
- This makes keeping the handoff document up to the minute **crucial**.
- This rule is tool-agnostic — it doesn't depend on which AI tools are used.
- This rule also applies device-wide — see `.claude/DEVICE-LEVEL-RULES.md`.

---

## Repo-specific rules (kept from existing practice)

- **Scripts ship exactly as written** — no bundling or minifying. Bump
  `@version` on every change to a script.
- Run `npm run check` (lint + formatting + metadata check) before pushing.
- `.privatescript` marks a script folder as private — it must never appear in
  the public collection.
- This repo (`Skriptey/Userscripts`) is the **public published copy**. Most
  commits here are automatic "Publish Skriptey Userscripts" syncs from the
  development repo `Skriptey/Userscripts-dev`. Real development normally
  happens in the dev repo — see HANDOFF.md "Open questions".
