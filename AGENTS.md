# AGENTS.md — universal entry point for any AI assistant

> **Read this file first, every session, on every platform (Claude Code, Codex,
> Cursor, …).** It is the single source of truth for *how to work on this repo*.
> `CLAUDE.md` simply imports this file, so Claude and Codex read the same rules.

---

## 1. What this project is (30-second version)

**Qualilab International — LIMS.** A fullstack web app for a Moroccan analysis
laboratory (agri-food 🥘, water 💧, workplace hygiene 🧫). It digitizes the full
sample lifecycle: field collection → lab reception → analysis → quality
validation → official PDF report → automatic email to client → invoicing.

- **Scale:** 1–10 concurrent users. Priorities: **reliability, traceability,
  simplicity** — not scale.
- **Status:** a client-**approved prototype** (préleveur module + invoicing) is
  live. We are now building the **production version** — the full 7-role LIMS.
- **Authoritative client scope:** `finalversion.xlsx` / `finalversion.md`
  (identical content). Do not invent scope beyond these.

## 2. Reading order — do this before writing any code

| Order | File | Read it for |
|---|---|---|
| 1 | **AGENTS.md** (this file) | How to work, golden rules, session protocol |
| 2 | **HANDOFF.md** | Current state, architecture map, "where do I change X" |
| 3 | **PROGRESS.md** | What's done / in progress / next — the live tracker |
| 4 | **PLAN.md** | The full phased roadmap + target data model |
| 5 | **CODE_QUALITY.md** | The non-negotiable quality bar (front + back + all) |
| 6 | **TESTPLAN.md** | The full browser test path, every phase. Tick what you verified; extend the phase section when you finish it |
| 7 | `finalversion.md` | The exhaustive client-facing scope (reference) |

If the graph exists (`graphify-out/`), use it to navigate structure instead of
blind grepping.

## 3. Golden rules (non-negotiable)

1. **Top-tier quality, always.** This project's standard is professional,
   production-grade code on **every layer — frontend, backend, database,
   security, a11y, docs**. No shortcuts, no placeholders, no "TODO later" left
   in shipped code. See `CODE_QUALITY.md`. If you cannot meet the bar, stop and
   say so rather than lowering it.
2. **Scope = `finalversion.xlsx`.** Build what the client approved. Flag
   anything outside it before doing it.
3. **Authorization is server-side, always.** Every route/page/mutation checks
   the session role on the server via the shared guard (see HANDOFF §Auth).
   Never rely on hiding a button in the UI.
4. **Sensitive data.** Health results + client data. Never log secrets, never
   weaken auth, never expose another role's data. Audit every mutation.
5. **One source of truth per fact.** Business identity lives in
   `src/lib/company.ts`. Never hardcode company/legal facts in components.
6. **Migrations, never manual schema edits.** Change `prisma/schema.prisma` →
   create a migration → regenerate the client. Never hand-edit the DB.
7. **Keep the docs alive.** Follow the session protocol below so the next AI —
   on any platform — continues without friction.
8. **Verify before "done".** Build + run + exercise the flow. Report failures
   honestly with output. "Done" means demonstrated, not assumed. Tick the
   matching items in `TESTPLAN.md` — only for what you actually saw working.
9. **Build continuously; pause at the point of need.** Don't stall waiting for
   information that isn't required yet. When a task genuinely needs missing
   input from the lab (norm limits, calculation formulas, legacy data files,
   equipment list), stop there, mark it `[!]` in PROGRESS with exactly what is
   needed, finish everything else in the phase, and tell the user.

## 4. Framework warning — this is NOT the Next.js you know

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

**Pinned:** Next.js **16.2.9** (App Router). We intentionally stay on the
installed version to avoid breaking working code — **do not upgrade or downgrade
Next without an explicit decision logged in HANDOFF**. Before writing any
Next-specific code (routing, `cookies()`, server actions, `params`, caching),
open `node_modules/next/dist/docs/` and confirm the current API.

## 5. Locked stack (do not change without logging a decision in HANDOFF)

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.9 App Router + TypeScript (strict) |
| DB / ORM | **MySQL / MariaDB** + Prisma (adapter `@prisma/adapter-mariadb`) |
| Auth | **Better Auth** 1.6.25 (username + admin plugins) on Prisma/MySQL — ✅ in place. **7-role authorization** is ours via `requireRole()` / `requireApiRole()` in `src/lib/auth.ts`. |
| PDF (reports) | **Server-side HTML→PDF via headless Chromium (Playwright)** — see PLAN. Keep client jsPDF only for the existing invoice demo |
| Email | **Resend** (transactional) |
| Styling | Tailwind CSS v4 + project design skills (top-tier per screen) |
| Deploy | VPS + PM2 (`ecosystem.config.cjs`), `/api/health`, watchdog scripts |

## 6. Commands

```bash
npm run dev              # local dev server (localhost:3000)
npm run build            # prisma generate && next build
npm run start            # production start (0.0.0.0:3000)
npm run lint             # eslint
npm run db:migrate       # prisma migrate dev  (create/apply migration, local)
npm run db:migrate:deploy# prisma migrate deploy (apply on VPS)
npm run db:seed          # seed demo data
npm run db:setup         # migrate deploy + seed
npm run db:check         # scripts/check-db.ts — connectivity smoke test
npm run db:studio        # prisma studio
```

Demo logins after seed (all password `password`): `pre1`, `recep1`, `tech1`,
`valid1`, `commercial1`, `compta1`, `admin`.

## 7. Session protocol — how continuity survives across platforms

**At the START of a session (any AI):**
1. Read this file → HANDOFF.md → PROGRESS.md.
2. Check `git log --oneline -5` and `git status` to see what changed since last time.
3. Confirm the "▶ NEXT ACTION" line at the top of PROGRESS.md is still valid.

**While working:**
- Keep changes scoped to the current PROGRESS task. Don't wander.
- Update PLAN/HANDOFF the moment a decision or a fact changes (new model, new
  route, new env var, a locked choice).

**At the END of a session (any AI) — required:**
1. Update **PROGRESS.md**: tick completed items, move the "▶ NEXT ACTION" line,
   add a dated line to the Session Log.
2. Update **HANDOFF.md** if state changed (new routes, models, env, decisions).
3. Update **TESTPLAN.md**: tick what you verified in the browser.
4. Ensure `npm run build` **and** `npm run lint` pass (or note explicitly in
   PROGRESS why they don't).
5. Commit with a clear message. Never leave the repo in a half-broken state
   without a written note in PROGRESS.

## 8. END OF PHASE checklist — every file to touch

Run through this list when a phase is finished. **A / B / C** = always /
if-changed / code-level source of truth.

**A. Always update (all three, every phase — no exceptions):**

| File | What to change |
|---|---|
| **PROGRESS.md** | tick the phase's items, mark the phase ✅ COMPLETE + date, move "▶ NEXT ACTION" to the next task, add a Session Log entry, list anything `[!]` blocked and what is needed to unblock it |
| **TESTPLAN.md** | flesh out that phase's checkpoint with the real screens built, tick only what you saw working in a browser, fill the **Sign-off log** row (phase, who, date, result) |
| **HANDOFF.md** | §1 state table, §2 architecture map (new routes/files), §4 data model (new tables/fields), §5 "where do I change X", §6 env vars, §8 decision log (append-only), §9 debt/watch-outs, and bump the "Last updated" date |

**B. Update only if that thing changed:**

| File | Update when |
|---|---|
| **PLAN.md** | scope, target data model or phase content changed (new client request, a design decision that alters the plan) |
| **AGENTS.md** | the stack, golden rules, commands, or this protocol changed |
| **README.md** | the stack summary, quick-start steps or demo accounts changed |
| **CODE_QUALITY.md** | a new standing quality rule was agreed |
| **CLAUDE.md** | Claude-specific tooling notes changed (design skills, graphify) |
| **.env.example** + **.env.production.example** | **any** new environment variable — document it in HANDOFF §6 in the same commit |
| **package.json** | new script/command → also mirror it in AGENTS §6 and README |

**C. Code-level single sources of truth — keep in sync, never fork the fact:**

| File | Holds |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/` | every schema change goes through a migration, never a manual DB edit |
| `prisma/seed.ts` | a fresh DB + `npm run db:seed` must still demo the whole flow end to end |
| `src/lib/roles.ts` | the role list, labels and landing pages — keep in sync with the Prisma `Role` enum |
| `src/lib/company.ts` | company / legal identity (never hardcode these in a component) |
| `src/lib/sample-status.ts` | who may move a sample to which status |
| `src/lib/labels.ts` | user-facing French labels and formatting |

**Client-facing documents (not dev files — update when scope changes, and tell
the user before sending anything):** `finalversion.xlsx` / `finalversion.md`,
plus the generated client PDFs at the repo root.

> If you only remember one thing: **leave the repo so the next assistant, on a
> different platform, can pick up from PROGRESS.md's top line with zero
> archaeology.**
