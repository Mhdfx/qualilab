@AGENTS.md

---

# Claude-specific notes

`AGENTS.md` (imported above) is the universal entry point — its rules apply.
The notes below are extra pointers only Claude Code needs.

## Design skills — MANDATORY for any UI work

This project's UI bar is **top-tier**. Before writing or changing any UI
(pages, components, layout, palette, typography, motion, a11y), use the
installed design skills instead of guessing at Tailwind:

- **`ui-ux-pro-max`** — patterns, palettes, font pairings, a11y/contrast checks,
  Next.js stack guidance. Run its scripts before building a new screen.
- **`impeccable`** — design QA (`polish`, `audit`, `critique`). A PostToolUse
  hook may run its detector after edits to UI files.
- **`design-motion-principles`** — any animation / transition / hover / micro-
  interaction, build or audit mode.
- **taste bundle** (`high-end-visual-design`, `minimalist-ui`,
  `design-taste-frontend`, `redesign-existing-projects`, etc.) — reach for the
  one matching the screen at hand.

Apply recommendations *through* the Qualilab brand (see `src/lib/company.ts` and
existing components), not over it — this is a professional lab tool: clean,
legible, trustworthy, mobile-first for the préleveur.

## graphify

If `graphify-out/graph.json` exists, prefer `graphify query "<question>"` and
`graphify path "<A>" "<B>"` over blind grepping, and run `graphify update .`
after modifying code. If it does not exist yet, consider running
`graphify init` / `graphify .` early so navigation stays cheap across sessions.

## Memory

Project context is saved under Claude's auto-memory. Keep it in sync when the
project's high-level state changes (phase completed, stack decision, deploy).
