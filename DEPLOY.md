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

## Fresh server (reset from scratch)

As **root** on the newly reset VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/Mhdfx/qualilab/master/scripts/provision-vps.sh -o provision.sh
bash provision.sh
```

It installs Docker, nginx, certbot, the firewall (SSH + web only) and
fail2ban on sshd, creates the `qualilab` deploy user, and prints a **deploy
key** to add to GitHub (repo → Settings → Deploy keys, read-only). Everything
after runs as `qualilab`, never root. Once your own key login works, close
password logins with `scripts/harden-ssh.sh` (« SSH — key login only » below).

## Git as the pipeline

The VPS pulls from GitHub — the repository is public today, so the current
server clones anonymously over HTTPS (no credentials on the server at all);
the read-only deploy key printed by `provision-vps.sh` is what to add the
day the repository goes private. Either way every deployment is exactly a
commit:

```
push to master ──▶ ssh vps ──▶ git pull ──▶ docker compose up -d --build
```

Deploying IS pulling; rolling back IS checking out the previous commit. The
two commands live in "Deploying an update" below.

## First deployment on the VPS

```bash
# 1. As the deploy user (su - qualilab):
git clone git@github.com:Mhdfx/qualilab.git /opt/qualilab && cd /opt/qualilab

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

# 5. Seed ONLY a fresh installation (wipes existing data). Runs from the
#    build stage image — the pruned runtime image lacks the seed's imports:
bash scripts/seed-docker.sh
```

> **Fast path for the current server:** `scripts/vps-first-deploy.sh` does
> everything above in one run (retire the PM2 prototype, Docker, deploy user,
> clone, secrets, build, seed, backup cron) and is idempotent:
> `curl -fsSL https://raw.githubusercontent.com/Mhdfx/qualilab/master/scripts/vps-first-deploy.sh | bash`

## Deploying an update

```bash
cd /opt/qualilab && git pull
bash scripts/deploy.sh           # docker compose up -d --build, health, then disk clean-up
```

`scripts/deploy.sh` (Docker mode, picked from `.env`) rebuilds and restarts
(migrations run on boot), waits for `/api/health`, and **only once healthy**
reclaims the disk: `docker builder prune -f --filter until=168h` (build cache
older than 7 days — 42.7 GB had piled up by 08/10/2026) and
`docker image prune -f` (dangling images). It never runs
`docker system prune --volumes`, and nobody should: the MySQL data is a
Docker volume. The two manual commands still work
(`docker compose up -d --build` then `curl -s localhost:3000/api/health`);
they just leave the cache to grow.

Rollback: `git checkout <previous-tag>` and the same command. Migrations
are additive by policy (see CODE_QUALITY), so going back one version is safe.

**Check once, read-only, at the next deploy — the client's real address.**
Better Auth reads the client IP from `X-Real-IP` first (`advanced.ipAddress`
in `src/lib/auth-server.ts`). The live nginx site must set it from the
connection, otherwise a client can send its own header and dodge the sign-in
rate limit:

```bash
grep -n "X-Real-IP" /etc/nginx/sites-enabled/*   # expect: proxy_set_header X-Real-IP $remote_addr;
```

If the line is missing, add it inside the `location /` block (as in
`deploy/nginx.conf.example`), then `nginx -t && systemctl reload nginx`.

## The criteria workbook (chantier 2)

The interpretation criteria are **data**, not code: the deploy ships the
screens, the laboratory's workbook fills them. After a deploy that brings
chantier 2 for the first time:

1. sign in as an administrator on http://185.217.126.53/admin/import;
2. « Choisir le classeur .xlsx » → **Analyser**: read the counts (types,
   normes, critères) and the refused rows before anything is written;
3. leave « Créer les germes inconnus comme paramètres » ticked unless the
   laboratory wants to name them itself first;
4. **Importer**. Running the same file again writes nothing new — the import
   matches on the type's name, the germ (name or alias) and the norm version.

Nothing else is needed: `/admin/types-produits` then edits a criterion
without a deployment.

## Backups — non-negotiable

```bash
# /etc/cron.d/qualilab-backup — installed by vps-first-deploy.sh. cron.d
# lines carry the USER field; the job sources .env for DB_PASSWORD and logs
# into the backup directory (writable by the deploy user):
0 2 * * * qualilab bash -c 'cd /opt/qualilab && set -a && . ./.env && set +a && bash scripts/backup-db.sh' >> /var/backups/qualilab/backup.log 2>&1
```

- 30 days retention (`RETENTION_DAYS`), gzip-verified, refuses suspiciously
  small dumps. Only the dated dumps `qualilab_AAAA-MM-JJ_HHMM.sql.gz` rotate:
  a dump named by hand (`qualilab_avant-phase-9.sql.gz`) is never pruned.
  ⚠️ The script deployed before the gaps build pruned `qualilab_*.sql.gz`,
  which matches that restore point (taken 13/09/2026): it is deleted by the
  02:00 run once it is 31 days old (≈ 15/10/2026) unless the new script is
  deployed first — or the file is copied off the server / renamed out of the
  pattern (e.g. `restore-point_avant-phase-9.sql.gz`, then update the
  « Point de retour » section).
- **Copy the dumps off the machine**: a dead disk must not take the database
  and its backups together. The script does it when `BACKUP_REMOTE` is set in
  `.env` (otherwise the log says `offsite skipped (BACKUP_REMOTE not set)`),
  checks the remote size, prunes remote dumps older than `RETENTION_DAYS`,
  and logs `offsite ok: <name>` — or `offsite FAILED: …` with exit code 1 (the
  local dump is kept either way). Look for those lines in
  `/var/backups/qualilab/backup.log`.

  | Variable | Meaning |
  |---|---|
  | `BACKUP_REMOTE` | an rclone `remote:path` — **recommended: an rclone *crypt* remote** wrapping the storage (S3, B2, SFTP…), so names and content leave encrypted — or `user@host:/absolute/path` for rsync over SSH |
  | `BACKUP_SSH_KEY` | rsync form only: a key dedicated to backups (default `~/.ssh/qualilab_backup`) |
  | `BACKUP_GPG_RECIPIENT` | optional: encrypt each dump with gpg for this recipient before upload (`.sql.gz.gpg`); import the public key for the `qualilab` user, keep the private key off the VPS |
  | `RETENTION_DAYS` | days kept, here and off-site (default 30) |

  One-time setup, as the `qualilab` user (the cron user): either
  `rclone config` (storage remote, then a *crypt* remote on top of it), then
  `rclone lsd qualilab-crypt:` must answer; or `ssh-keygen -t ed25519 -f
  ~/.ssh/qualilab_backup -N ''`, install the public key on the backup host,
  create the remote directory and run `ssh -i ~/.ssh/qualilab_backup
  user@host true` once to accept the host key (cron runs with `BatchMode`).
  Then run the cron line by hand once and read `offsite ok`.
- **Restore from the off-site copy** (dead disk): fetch the dump, decrypt it
  if gpg was used (on the machine that holds the private key), then restore:

  ```bash
  rclone copy qualilab-crypt:dumps/qualilab_2026-10-12_0200.sql.gz /var/backups/qualilab/
  #   or: rsync -t -e "ssh -i ~/.ssh/qualilab_backup" user@host:/path/qualilab_2026-10-12_0200.sql.gz /var/backups/qualilab/
  #   gpg: gpg --output qualilab_2026-10-12_0200.sql.gz --decrypt qualilab_2026-10-12_0200.sql.gz.gpg
  DB_PASSWORD=... bash scripts/restore-db.sh /var/backups/qualilab/qualilab_2026-10-12_0200.sql.gz
  ```
- **Test the restore once after setup** and note the date in this file:
  `./scripts/restore-db.sh /var/backups/qualilab/<dump>.sql.gz`
  — Last tested restore: **2026-08-26** (backup → restore → app healthy,
  7 users intact — done during the first deployment)

## Go-live — closing the demonstration posture

Until the recette the server deliberately runs in demo mode: the login page
lists the demo accounts and they all share the password `password`. Hiding
the panel (`NEXT_PUBLIC_DEMO_MODE=false`) is **cosmetic** — it does not
disable the accounts. The day real users start, in this order:

```bash
# 1. The lab's admin creates the REAL accounts in /admin/utilisateurs
#    (at least one real ADMIN — the next step refuses to run without it).
# 2. Ban every demo account and revoke their sessions:
bash scripts/disable-demo-accounts.sh
# 3. Hide the panel and rebuild:
sed -i 's/^NEXT_PUBLIC_DEMO_MODE=.*/NEXT_PUBLIC_DEMO_MODE=false/' .env
docker compose up -d --build
```

`disable-demo-accounts.sh` is idempotent and refuses to lock the lab out:
it exits with a clear message while no non-demo ADMIN exists.

## Time zone — Morocco's return to GMT (20/09/2026)

The container runs with `TZ=Africa/Casablanca` on a Node image whose ICU
data (tzdata 2026c) knows the return to permanent UTC; the application
formats and parses the laboratory's wall time independently of the device
(`src/lib/lab-time.ts`). What the application cannot fix: a PC or phone
whose operating system has not received the Morocco update shows a clock
one hour ahead of the legal time, and its users type that wrong hour.
**Before go-live, every PC and phone of the laboratory must have the
Windows / Android / iOS update that moves Morocco to GMT**, and Chrome must
be current. Check: the clock in the taskbar must match the time printed on
the reception queue.

**Check the server's own zone data after every image rebuild** (read-only,
HANDOFF §9 « Day cuts and stale tz data »). The day cuts of the dashboards
(`setHours(0, 0, 0, 0)`) follow the ICU data inside the Node image:

```bash
docker compose exec app node -e 'console.log(process.versions.tz)'
# → 2026c or later. 2026a / 2026b predate Morocco's return to GMT.
docker compose exec app node -e 'const d = new Date(); console.log(d.toISOString(), "|", d.toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" }))'
# → both sides show the SAME hour (Morocco = UTC since 20/09/2026).
docker compose exec app node -e 'const d = new Date(); d.setHours(0, 0, 0, 0); console.log(d.toISOString())'
# → …T00:00:00.000Z — « aujourd'hui » starts at midnight UTC, not 23:00 the day before.
```

If any line is wrong, rebuild on a fresh base image (`docker compose build
--pull app`, then `bash scripts/deploy.sh`) and check again.

## Reboot — maintenance window

The VPS needs a reboot now and then (kernel updates: `/var/run/reboot-required`
exists). Do it outside the laboratory's hours, announced, in this order:

1. **Freeze writes, then back up.** `cd /opt/qualilab && docker compose stop app`,
   then run the backup by hand and read its last lines:
   `sudo -u qualilab bash -c 'cd /opt/qualilab && set -a && . ./.env && set +a && bash scripts/backup-db.sh'`
   → `backup ok: …` (and `offsite ok: …` when `BACKUP_REMOTE` is set). No
   « ok », no reboot.
2. **Reboot.** `sudo reboot`. The database comes back by itself
   (`restart: unless-stopped`); the app does **not**, because step 1 stopped
   it by hand.
3. **Start and check.** `cd /opt/qualilab && docker compose up -d`, then
   `curl -s localhost:3000/api/health` → `ok`, `docker compose ps` (db
   healthy, app up), `systemctl status fail2ban --no-pager`, and the
   tzdata check above. Sign in once and open a report PDF.
4. **Next morning: the 02:00 backup ran.** `tail -n 5 /var/backups/qualilab/backup.log`
   shows that night's `backup ok` (and `offsite ok`), and
   `ls -lt /var/backups/qualilab | head -3` lists the new dump.

## SSH — key login only, fail2ban

Password logins were open (~21 000 failed attempts a day on 08/10/2026).
`scripts/harden-ssh.sh` closes them, as root, from a session opened with a
key. It refuses to run while the operator's `~/.ssh/authorized_keys` holds no
key, and until the operator confirms a key login was tested in another
terminal (« yes », or `--i-tested-key-login`):

```bash
# From your PC, once: ssh-copy-id <user>@<server>; then open a NEW session
# with the key, keep it open, and on the server:
sudo bash /opt/qualilab/scripts/harden-ssh.sh            # --user <name> to check another account's keys
```

It writes `/etc/ssh/sshd_config.d/10-qualilab.conf` (`PasswordAuthentication
no`, `KbdInteractiveAuthentication no`, `PermitRootLogin prohibit-password`),
validates with `sshd -t` (and restores the previous file on failure), reloads
ssh (open sessions stay up), then installs fail2ban with an sshd jail (5
failures in 10 min → banned 1 h; `fail2ban-client status sshd`). Undo from
the provider's console if ever locked out:
`rm /etc/ssh/sshd_config.d/10-qualilab.conf && systemctl reload ssh`.
New servers get the same fail2ban jail from `provision-vps.sh`.

## Programme d'analyse (2026-10-06)

The deploy applies migration `20261006100000_programme` (additive: status
value PROGRAMME, columns on Sample and SampleParameter, indexes). Existing
lines keep working; a line received before the deploy sits in RECU and must
be programmed before the bench can start it. Create the account of the new
role once on production (demo during the recette: `param1` / Rachid Alaoui,
role PROGRAMMATEUR, via `/admin/utilisateurs` or `POST /api/admin/users`);
on go-live day create the real account like the others.

## Restoring a dump

`scripts/restore-db.sh <dump.sql.gz>` stops the app, **drops and recreates**
the database, loads the dump, then replays the pending migrations and starts
the app again. The recreation matters: a dump taken before a module existed
would otherwise leave that module's tables behind with no migration record,
and the next `docker compose up` would stop on « table already exists ».

## Point de retour — avant la phase 9 (2026-09-13)

Phase 9 changes the core model (série, natures, numbering). Before it
started, the version in production was frozen so the laboratory can go back
if the new circuit is not what they want:

- **Code:** git tag `v1.0-avant-phase-9` = branch `stable/v1.0-avant-phase-9`
  (commit `271b7a3`, deployed code identical to `0e2d493` plus docs).
- **Database:** `/var/backups/qualilab/qualilab_avant-phase-9.sql.gz` on the
  VPS (taken 2026-09-13 18:51, outside the 30-day rotation — do not delete).

To roll back (as root, on the VPS):

```bash
cd /opt/qualilab
sudo -u qualilab git fetch --tags
sudo -u qualilab git checkout v1.0-avant-phase-9
sudo -u qualilab docker compose up -d --build          # rebuilds the old image
DB_PASSWORD=... bash scripts/restore-db.sh /var/backups/qualilab/qualilab_avant-phase-9.sql.gz
```

The restore recreates the database from the dump, so the Phase 9 tables
disappear with it; `migrate deploy` then finds nothing pending on the old
code. To resume Phase 9 later: `git checkout master` and redeploy.

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

## Go-live data (RETOUR-LABO-30-09.md §10)

The old software's catalogue (regulations, product types, criteria), its
clients and the client memory were imported in production on 2026-10-01
from `legacy-export/` (kept **outside the repo** on the development
machine, produced by `scripts/legacy/extract-legacy.py` from the restored
Firebird base, Docker container `qlabo-fb`). To redo it on a fresh base:
`/admin/import` → **Clients (export CSV)** with `clients.csv` (≤ 2 000 rows
per file), then **Mémoire des clients** with `memory.csv`, then
**Catalogue de l'ancien logiciel** with the three catalogue files — every
import is idempotent.

1. Real user accounts, then `scripts/disable-demo-accounts.sh` and
   `NEXT_PUBLIC_DEMO_MODE=false`; `RESEND_API_KEY` + `EMAIL_FROM` once the
   DNS is delegated.
2. *(done 2026-10-01 — production holds no test data)* Remove the
   demonstration clients and everything attached (séries, samples, reports,
   invoices, e-mail logs, memory) with the go-live tool,
   ADMIN only, dry run first (no screen on purpose):
   `POST /api/admin/maintenance/purge-clients`
   `{ "mode": "analyse", "clientIds": [...] }` lists what would go, then
   `{ "mode": "commit", "clientIds": [...], "confirm": "SUPPRIMER" }` removes
   it and brings the yearly counters back to the highest number still in
   use. One journal entry (`DEMO_DATA_PURGED`); the journal is never erased.
3. On switch-over day, `/admin/reglages` → **Compteurs de numérotation**:
   type the last N° de série and N° de contrôle issued by the old software,
   so the new system continues the year's sequences — and, if the laboratory
   continues its invoice numbering, the last invoice and credit-note numbers
   (« Factures (FAC-AAAA-NNNN) », « Avoirs (AV-AAAA-NNNN) ») **before the
   first real invoice**: a jump made later leaves a hole in the sequence of
   issued invoices. A counter never goes below a number already used.

