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
| 6 | **TESTPLAN.md** | The browser test path — append a section per checkpoint |
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
   honestly with output. "Done" means demonstrated, not assumed.

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
3. **Append a checkpoint section to TESTPLAN.md** listing what to click through
   in the browser — and mark what you actually verified.
4. Ensure `npm run build` **and** `npm run lint` pass (or note explicitly in
   PROGRESS why they don't).
5. Commit with a clear message. Never leave the repo in a half-broken state
   without a written note in PROGRESS.

> If you only remember one thing: **leave the repo so the next assistant, on a
> different platform, can pick up from PROGRESS.md's top line with zero
> archaeology.**
