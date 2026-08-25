# DEPLOY.md — putting Qualilab LIMS in production

> The operational runbook: how the system runs on a server, how it is
> deployed, backed up, restored, and what to check afterwards. Written for
> whoever operates the VPS, not only for the person who built the code.

## The shape of production

```
Internet ──HTTPS──▶ nginx (certbot) ──▶ app container :3000 ──▶ mysql container
                                           │
                                           └─ Chromium (in-image, renders the PDFs)
```

- **Docker Compose** runs the app and its MySQL on a private network; only
  `127.0.0.1:3000` is published, nginx in front terminates HTTPS.
- Migrations run automatically when the app container starts.
- The image bundles Chromium for the report/invoice/bench-sheet PDFs.
- **PM2 remains an alternative** (`ecosystem.config.cjs`, `scripts/*.sh` from
  the prototype) for a bare-metal run — Docker is the recommended path because
  the same stack runs identically on any machine.

## First deployment on the VPS

```bash
# 1. Requirements: Docker + the compose plugin, nginx, certbot.
git clone <repo> /opt/qualilab && cd /opt/qualilab

# 2. Secrets — never committed.
cp .env.production.example .env
#    Set: DB_PASSWORD, DB_ROOT_PASSWORD, AUTH_SECRET (openssl rand -base64 32),
#    BETTER_AUTH_URL, BETTER_AUTH_TRUSTED_ORIGINS,
#    RESEND_API_KEY + EMAIL_FROM (when DNS is ready), NEXT_PUBLIC_DEMO_MODE=false

# 3. Build and start. Migrations apply on boot.
docker compose up -d --build
curl -s localhost:3000/api/health   # → ok

# 4. nginx + HTTPS
#    server { server_name app.qualilab.ma; location / { proxy_pass http://127.0.0.1:3000; ... } }
certbot --nginx -d app.qualilab.ma

# 5. Seed ONLY a fresh installation (wipes existing data):
docker compose exec app sh -c "node node_modules/tsx/dist/cli.mjs prisma/seed.ts"
```

## Deploying an update

```bash
cd /opt/qualilab && git pull
docker compose up -d --build     # rebuild, migrate, restart
curl -s localhost:3000/api/health
```

Rollback: `git checkout <previous-tag>` and the same two commands. Migrations
are additive by policy (see CODE_QUALITY), so going back one version is safe.

## Backups — non-negotiable

```bash
# /etc/cron.d/qualilab — daily at 02:00, as the deploy user:
0 2 * * *  cd /opt/qualilab && DB_PASSWORD=... ./scripts/backup-db.sh
```

- 30 days retention, gzip-verified, refuses suspiciously small dumps.
- **Copy the dumps off the machine** (rsync/rclone to another host or bucket):
  a dead disk must not take the database and its backups together.
- **Test the restore once after setup** and note the date in this file:
  `./scripts/restore-db.sh /var/backups/qualilab/<dump>.sql.gz`
  — Last tested restore: _(fill in on the VPS)_

## After every deploy — 5-minute check

1. `/api/health` answers `ok`.
2. Log in, walk one sample: réception → saisie → validation → approbation.
3. Open the report PDF (proves Chromium works in the container).
4. `docker compose logs app --since 10m` — no errors.
5. The demo-accounts panel is **absent** from the login page
   (`NEXT_PUBLIC_DEMO_MODE=false`).

## Environment reference

See `.env.production.example` — every variable is documented there and in
`HANDOFF.md` §6. The two that gate real email delivery are `RESEND_API_KEY`
and `EMAIL_FROM`; without them, sends are journalised as `SIMULE` and the UI
says so.
