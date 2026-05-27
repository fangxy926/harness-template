# Project Collaboration Rules

## Document Structure

- `docs/PRD.md` — requirement index (what & why), linked to downstream via requirement titles
- `docs/superpowers/specs/` — Superpowers-generated technical specs (how to implement), **read-only**
- `docs/superpowers/plans/` — Superpowers-generated implementation plans, **read-only**
- `docs/CHANGELOG.md` — code change log, linked to requirement titles
- Traceability chain: PRD (why) → Spec (what) → Plan (how) → CHANGELOG (done)

## Requirement Title Format

- Pattern: `YYYY-MM-DD-<brief description>` (e.g. `2026-05-27-login-page`)
- Deprecated requirements are marked `[Deprecated]` and moved to the `## Deprecated` section — never deleted

## File Ownership

### Protected (do not modify)
- All files under `docs/superpowers/specs/`
- All files under `docs/superpowers/plans/`

### Project-owned (writable)
- `docs/PRD.md`
- `docs/CHANGELOG.md`

## TDD and CHANGELOG

- Red phase (only test files changed) — do **not** write CHANGELOG
- Green / refactor phase after code-reviewer approval — mark work unit as complete

## Automated Hook Maintenance

`docs/PRD.md` and `docs/CHANGELOG.md` are maintained automatically by two **PostToolUse** hooks registered in `.claude/settings.json`. Both hooks fire **immediately after every `Edit` / `Write` / `NotebookEdit` tool call** — not at the end of a conversation turn.

### sync-prd.js — PRD maintenance

**Triggers when**: the file path contains `docs/superpowers/specs/` or `docs/superpowers/plans/`.  
Exits immediately for all other files (no-op).

| File written | Action |
|--------------|--------|
| New `specs/*.md` | Appends a new requirement entry to `## Current Requirements` in PRD.md. Heading: `YYYY-MM-DD-<first # title from spec>` |
| New `plans/*.md` | Finds the matching REQ entry by spec filename reference; inserts the Plan path |
| Plan with no matching spec | Appends to `## To Triage` section for manual follow-up |

### sync-changelog.js — CHANGELOG maintenance

**Triggers when**: the file is **not** any of the following (exits immediately otherwise):
- `docs/superpowers/specs/` or `docs/superpowers/plans/` (handled by sync-prd.js)
- `docs/PRD.md` or `docs/CHANGELOG.md` (prevents infinite loop)
- Anything under `.claude/` (internal hook files, config, state)
- Test files matching `*.test.*`, `*_test.*`, `tests/`, `__tests__/`, `spec/`

When triggered:

| Tool used | CHANGELOG section |
|-----------|------------------|
| `Write` (new file) | `### Added` |
| `Edit` (modified file) | `### Changed` |

**Entry format:**

```
- YYYY-MM-DD verb `filename`：description (requirement title)
```

- **Description** — auto-extracted from tool input:
  - Single line change → `old value → new value`
  - Single line added → `+added content`
  - Multi-line → `+N lines -M lines`
  - New HTML file → content of `<title>` tag
  - New other file → first meaningful comment line
- **Requirement title** — read from the first "待实施" or "实施中" entry in PRD.md; omitted (no parentheses) if no active requirement found
- **PRD status promotion** — on first production file write, automatically changes the matching PRD entry from `待实施` → `实施中`

**Session deduplication:**  
Within the same Claude Code session, the same file + same verb (new/modified) is recorded only once, preventing duplicate entries from batch edits. A new session (e.g. bug fix the next day) resets the dedup state automatically. State is stored in `.claude/hook-state.json` (gitignored).
