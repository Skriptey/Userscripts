# Device-level rules (for every project on this computer)

Cloud sessions can't write to your own computer, so this file holds the text to
copy once into your **personal** (all-projects) rules file:

- Claude Code: add to `~/.claude/CLAUDE.md`
- Codex: add to `~/.codex/AGENTS.md`
- Any other AI tool: paste into its equivalent global instructions file.

Easiest way: open this file, copy everything between the two marker lines
below (`BEGIN DEVICE RULES` / `END DEVICE RULES`), and paste it at the end of
each of those files.

<!-- BEGIN DEVICE RULES -->

## LLM fallback (all projects)

- If an AI service (Claude Code, Codex, or any other) or its agents becomes
  unavailable or runs out of tokens/credits, hand off to another suitable one,
  as long as it can pick up without losing context or progress.
- Switch back to the project's main AI service as soon as it's available
  again, and run a full review of any work done in the meantime.
- Cross-AI reviews help catch differences in approach between services.
- Keep each project's handoff document up to the minute so any tool can pick
  up where the last one left off.

<!-- END DEVICE RULES -->
