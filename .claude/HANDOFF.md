# HANDOFF — Skriptey/Userscripts

**Last updated:** 2026-09-23 (≈20:15 UTC)
**Read this first in any new session.** Then read `.claude/STANDING-RULES.md`
and `.claude/CONTEXT.md`.

---

## Where we are right now (state of play)

| Item                                        | State                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Working branch                              | `claude/blissful-keller-ld4vo6` (branched from `main` at `ab992e4`)                                                 |
| Target branch for the eventual single PR    | `alpha` — **does not exist yet in this repo** (see open question 1)                                                 |
| Work done on the branch                     | Only these handoff / rules / context files (`.claude/`, `.OpenAI/`)                                                 |
| Code changes in progress                    | **None** — no half-finished code anywhere                                                                           |
| Open GitHub issues                          | None                                                                                                                |
| Open PRs                                    | #3 (Dependabot: brace-expansion 5.0.7 → 5.0.8) — now **out of date**: `main` already has 5.0.9, so it can be closed |
| Scheduled items                             | Codex review at **00:08** (owner-scheduled; not a routine in this repo's session)                                   |
| Scheduled routines/triggers in this session | None                                                                                                                |

### What this repo is

- `Skriptey/Userscripts` is the **public, published copy** of the userscripts
  collection (install page: https://skriptey.github.io/Userscripts/).
- Almost every commit is an automatic "Publish Skriptey Userscripts (date)"
  sync from the **development repo `Skriptey/Userscripts-dev`**. The publish
  step removes private scripts and, it appears, the `.claude/` folder (the
  README and `docs/README.md` mention `.claude/` but it wasn't here until now).
- A separate session is updating the handoff in `Userscripts-dev` at the same
  time (branch `claude/branch-merge-gtin-fix-8m2zw2`). **That repo is where the
  real ongoing work lives** — check its `.claude/HANDOFF.md` too.

### Scripts in the collection

BunkrDL, ITAMenhancer, deezer, discogs-enhancer, mb-iswc-seeder, metaincdl,
qobuz, spotify-enhancer, tidal (each in `scripts/<name>/`, wiki pages in
`docs/wiki/`).

---

## Open questions for the owner (need a decision)

1. **Where should work happen?** Because this repo is overwritten by
   automatic publishes from `Userscripts-dev`, anything we commit here could be
   wiped out by the next publish. Should future work (and these handoff files)
   live only in `Userscripts-dev`, with this repo left as the published copy?
2. **`alpha` branch:** it doesn't exist here. Create it from `main`, or should
   the one eventual PR target `main`?
3. **Dependabot PR #3** is out of date (newer version already on `main`).
   OK to close it?
4. **Device-wide fallback rule:** a cloud session can't change your computer.
   Copy the block in `.claude/DEVICE-LEVEL-RULES.md` into `~/.claude/CLAUDE.md`
   and `~/.codex/AGENTS.md` next time you're at your machine (or ask a local
   session to do it).

---

## Task queue

| #   | Task                                                                     | Status                                                                 |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | Update handoff with current position                                     | ✅ Done (this file)                                                    |
| 2   | Revise standing tasks & rules (incl. plain-English + LLM fallback rules) | ✅ Done — `.claude/STANDING-RULES.md`                                  |
| 3   | Codex context/memory copy                                                | ✅ Done — `.OpenAI/`                                                   |
| 4   | Device-wide LLM fallback rule                                            | ⏳ Text ready; owner to copy to their machine (question 4)             |
| 5   | Thorough documentation sweep (all `.md`, wiki, in-script help)           | ⏸ Queued — waiting on question 1 (should be done in `Userscripts-dev`) |
| 6   | OpenAPI/Swagger docs + Swagger UI                                        | ➖ Not applicable — no API in this project                             |
| 7   | Codex review of this branch                                              | ⏳ Due at 00:08 (docs-only changes so far)                             |
| 8   | Update GitHub issues per task                                            | ➖ No open issues relate to this work                                  |

---

## How to resume in a fresh session

1. Check out branch `claude/blissful-keller-ld4vo6` and `git pull`.
2. Read `.claude/HANDOFF.md` (this), `.claude/STANDING-RULES.md`,
   `.claude/CONTEXT.md`.
3. Get the owner's answers to the open questions above (if not already given),
   then carry on with the task queue.
4. Also read `.claude/HANDOFF.md` in `Skriptey/Userscripts-dev`, where active
   development happens.
