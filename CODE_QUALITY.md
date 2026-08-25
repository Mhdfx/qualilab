# CODE_QUALITY.md — the non-negotiable bar

> This project ships **top-tier code quality on every layer — frontend, backend,
> database, security, accessibility, and documentation.** No exceptions, no
> "temporary" shortcuts, no placeholders in shipped code. If you cannot meet a
> rule, stop and raise it — do not silently lower the bar.

It handles sensitive health results and client data for a real laboratory. The
standard is *production software a lab depends on daily*, not a demo.

---

## 0. Definition of "top-tier" here
Correct · secure · legible · consistent · accessible · reliable · documented.
A change is done only when it would pass review by a senior engineer who cares
about all six.

## 1. Universal
- **TypeScript strict.** No `any` (use `unknown` + narrowing), no non-null `!`
  to silence the compiler, no `@ts-ignore` without a one-line justification.
- **No dead code / no placeholders.** No commented-out blocks, no `TODO` left in
  shipped code (track it in PROGRESS instead), no stub returns.
- **Names say intent.** Domain vocabulary in French where the domain is French
  (`echantillon`, `preleveur`, `validateur`); code identifiers consistent with
  the surrounding file.
- **Small, single-responsibility units.** Extract shared logic to `lib/`; never
  copy-paste business rules (codes, VAT, thresholds).
- **One source of truth.** Company/legal facts → `lib/company.ts`. Formats →
  their `lib/*` helper. Never inline a business fact in a component.
- **Match the codebase.** Follow existing patterns, file layout, import style,
  and comment density. Consistency beats personal preference.
- **`npm run lint` and `npm run build` must pass** before "done".

## 2. Backend / API
- **Authorization on the server, on every request.** Route everything through
  the central `requireRole()` guard. Never trust the client; never rely on a
  hidden UI control. Re-check role even if a layout already did.
- **Validate every input** at the boundary before use (presence, type, allowed
  enum values, ownership). Return precise status codes (400/401/403/404/409/500)
  and safe French error messages — never leak stack traces or internals.
- **Prisma discipline.** Use transactions for multi-write operations; `select`
  only needed fields (never over-fetch, never return password hashes); avoid N+1
  with `include`. Money/threshold math in dedicated helpers, not inline.
- **Every mutation is audited** via `logAudit()` (who/what/when).
- **Sample status only changes through the state-machine helper** — illegal
  transitions rejected server-side.
- **Idempotency & concurrency:** unique codes/numbers generated safely; guard
  against double-submit where it matters (validation, invoicing).

## 3. Frontend / UI
- **Use the design skills** (`ui-ux-pro-max`, `impeccable`, motion, taste
  bundle) — do not guess Tailwind. Top-tier per screen, brand-consistent.
- **Mobile-first** for préleveur (one-handed on a phone); responsive everywhere.
- **Accessibility (WCAG AA):** semantic HTML, labels tied to inputs, keyboard
  operable, visible focus, ≥4.5:1 text contrast, meaningful `alt`, ARIA only
  when semantics can't. Forms announce errors.
- **Every state designed:** loading, empty, error, success — not just the happy
  path. Disable + spinner on submit; never leave the user guessing.
- **No layout shift, no jank.** Motion is purposeful (see design-motion
  principles), never decorative slop.
- **Server Components by default;** `"use client"` only where interaction needs
  it. Keep data fetching on the server; don't ship secrets to the client.

## 4. Database / Prisma
- **Schema changes only via migration** (`schema.prisma` → `db:migrate`); never
  hand-edit the DB or the generated client.
- **Model it right:** correct relations, `onDelete` rules, unique constraints,
  indexes on lookup columns, non-null where the domain requires it, enums for
  fixed sets.
- **Seed stays runnable:** a fresh DB + `db:seed` must demo the full flow.

## 4b. Performance — the system must feel instant

**A laboratory tool is used all day, on the bench, between two samples. Slow is
a defect.** Speed is a requirement here, not a nice-to-have: every screen should
answer immediately, and no action should leave the user waiting without a
reason. Treat a sluggish page like a bug and fix it before shipping.

**Targets** (on the VPS, over the real domain):
- First view of any screen: **under 1 second**.
- Any click that changes something (save, receive, submit): **under 500 ms**
  before the interface responds — with a busy state if it cannot be.
- Nothing on screen may "jump" while loading.

**Rules that keep it there:**
- **Server Components by default.** `"use client"` only where interaction needs
  it. Data is fetched on the server, never in a client waterfall.
- **Run independent queries in parallel** (`Promise.all`), never in sequence.
- **Never query in a loop.** No N+1: shape the data with one `select`/`include`.
- **Select only the fields the screen uses** — see `lib/sample-select.ts`.
- **Index every column used in a `where`, `orderBy` or join.** Adding a filter
  means checking the index exists in `schema.prisma`.
- **Paginate every list that grows with time** (samples, invoices, audit log)
  with the **cursor** helper in `lib/pagination.ts` — never page numbers, whose
  cost grows with depth. A screen must never load "all rows ever".
- **The system must stay fast as the database fills**, not merely start fast.
  Before shipping a query, ask what it does at 50 000 samples: if the answer is
  "scans the table", add the index or the page.
- **Keep the client bundle small**: no heavy library for something small, and
  import icons/components individually.
- **Production is a production build** (`next build`), never a dev server.

**Before calling a screen done:** open it with realistic data, not three demo
rows. If it hesitates, it is not finished.

## 5. Security & privacy (sensitive data)
- **Never log secrets, tokens, passwords, or full personal records.**
- **Never expose another role's or another préleveur's data** — scope every
  query by the session.
- Passwords bcrypt-hashed; sessions signed; cookies `httpOnly` + `secure` in
  prod. `AUTH_SECRET` ≥32 chars, never committed.
- No secrets in code or client bundles — only env vars (documented in HANDOFF +
  `.env.example`).
- Escape/parametrize everything (Prisma does this — don't hand-build SQL).

## 6. Errors & reliability
- Handle the failure path explicitly; fail closed on auth. User-facing messages
  in French, actionable, never a raw error. Log enough server-side to diagnose
  without leaking data.

## 7. Documentation & handoff
- Update **HANDOFF.md** when architecture/decisions/env change; **PROGRESS.md**
  every session; **PLAN.md** when scope/model changes.
- Comment the *why*, not the *what*, and only where non-obvious.
- New env var → document in HANDOFF §6 **and** both `.env.example` files.

## 8. Verification before "done"
1. `npm run lint` clean · `npm run build` passes.
2. Authorization verified server-side for every new/changed surface.
3. The affected flow exercised end-to-end (real click-through or request).
4. Loading/empty/error states checked.
5. The screen responds instantly with realistic data (see §4b).
6. PROGRESS.md (and HANDOFF/PLAN if needed) updated; committed.

> "Done" = demonstrated to meet all of the above. Not "should work." If a step
> was skipped, say so plainly in PROGRESS.
