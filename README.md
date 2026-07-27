# Qualilab International — LIMS

Fullstack web app for a Moroccan analysis laboratory (agri-food, water,
workplace hygiene). It digitizes the full sample lifecycle — field collection →
lab reception → analysis → quality validation → official PDF report → automatic
email to client → invoicing — with 7 role-based user profiles.

**Status:** client-approved prototype live (field intake + invoicing); building
the full production LIMS.

## Working on this repo? Read the docs first.

Any developer or AI assistant (Claude, Codex, Cursor) must read, in order:

1. **[AGENTS.md](AGENTS.md)** — how to work here, golden rules, session protocol
2. **[HANDOFF.md](HANDOFF.md)** — current state, architecture, "where do I change X"
3. **[PROGRESS.md](PROGRESS.md)** — live tracker: done / in progress / next
4. **[PLAN.md](PLAN.md)** — phased production roadmap + target data model
5. **[CODE_QUALITY.md](CODE_QUALITY.md)** — the non-negotiable quality bar
6. `finalversion.xlsx` / `finalversion.md` — authoritative client scope

## Stack

Next.js 16 (App Router, TS strict) · MySQL/MariaDB + Prisma · **Better Auth**
(7-role authorization via a `requireRole` guard) · Tailwind v4 · server-side PDF
(Playwright) · Resend email · VPS + PM2.

## Quick start

```bash
cp .env.example .env      # set DATABASE_URL + AUTH_SECRET
npm install
npm run db:setup          # migrate + seed
npm run dev               # http://localhost:3000
```

Demo logins after seed: `admin` / `password`, `pre1` / `password`.
See [AGENTS.md §6](AGENTS.md) for the full command list.
