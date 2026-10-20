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
are additive by policy (see CODE_QUALITY): an added column or table is
harmless to the previous code, so going back one version is safe **as long
as no row holds a value the previous code does not know**. An enum value
appended by a migration is the exception: once the new code has stored it,
the previous version's Prisma client refuses to read that row (« Value '…'
not found in enum '…' ») — check the « Point de retour » section of the
deploy for its rollback rule (lot 2 du 16/10: `ASEPTISEES`, `NON_RECU`;
lot 2C appends none).

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

**Since lot 2C (H1, Q81 — once deployed):** every account the administrator
creates in step 1, the real ADMIN included, carries « mot de passe à
changer »: the administrator hands over a temporary password, and at the
first sign-in the person lands on « Mon compte » and must choose their own
before anything else opens (every API answers 403 meanwhile). A reset by the
administrator sets it again and closes the person's sessions. Accounts that
existed before the deploy are not flagged (no UPDATE). Disable the demo
accounts — never reset them to « hand them over ».

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

## Point de retour — avant la prise en charge libre (2026-10-13)

The laboratory decided on 13/10 that nobody assigns technicians any more
(« prise en charge libre », `PROGRAMME.md` §10). The version before that
change is kept so the laboratory can go back to the assignment on the
programme sheet if the shared bench does not suit them:

- **Code:** annotated git tag `v1.2-avant-sans-affectation` = commit
  `4b9c557` (master of 13/10), **pushed to origin**. Its message says how to
  go back.
- **Database:** `/var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz`
  on the VPS, **taken just before the deploy** of the change. Its name is
  outside the rotation pattern `qualilab_????-??-??_????.sql.gz`, so
  `backup-db.sh` never prunes it — do not delete it. ⏳ Not taken yet on
  13/10: it is the first step of that deploy. As root, on the VPS:

  ```bash
  cd /opt/qualilab
  set -a && . ./.env && set +a
  docker compose exec -T db mysqldump --single-transaction --routines --triggers --no-tablespaces \
    -u qualilab -p"$DB_PASSWORD" qualilab | gzip > /var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz
  gzip -t /var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz \
    && zcat /var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz | tail -n 1   # « -- Dump completed … »
  chown qualilab: /var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz
  ```

To roll back (as root, on the VPS):

```bash
cd /opt/qualilab
sudo -u qualilab git fetch --tags
sudo -u qualilab git checkout v1.2-avant-sans-affectation
sudo -u qualilab docker compose up -d --build          # rebuilds the old image
```

**No migration is involved**, so the database restore is optional. The old
code reads a sample taken under the new rule as assigned to its holder (same
`Sample.technicianId` / `assignedAt` columns); a PROGRAMME sample still
« à prendre » (no technician) would need a technician picked on its
programme sheet, under the old rule, before its bench work. Restore the dump
(`DB_PASSWORD=... bash scripts/restore-db.sh
/var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz`) only to undo
the data written since the deploy — it loses every result, report and
invoice entered after it. To resume the shared bench later:
`git checkout master` and redeploy.

## Point de retour — avant le lot 2 du 16/10 (2026-10-19)

Lot 2 (`RETOUR-LABO-16-10.md`, four waves, and lot 2C,
`RETOUR-LABO-19-10.md`) is the first deploy with migrations since 13/10:
six, additive — `20261019100000_retour_labo_16_10_terrain`
(`HandsState` + `ASEPTISEES`, `Sample.surfaceAreaNote`, `Sample.airExposureMin`),
`20261019110000_retour_labo_16_10_non_recu` (`EmailType` + `NON_RECU`),
`20261019120000_retour_labo_16_10_denomination` (`User.documentName`),
`20261019130000_retour_labo_16_10_client_a_completer` (`Client.toComplete`),
`20261019140000_retour_labo_16_10_famille_type_analyse` (`ProductType.natureId`),
and lot 2C's `20261020100000_retour_labo_19_10_comptes_clients`
(`User.mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
`Client.fiscalId` / `Client.tradeRegister` VARCHAR(191) NULL — no enum
value, no UPDATE). The first five were rehearsed on 19/10 on a local copy
at the production schema (no row changed, the Docker `migrate` command
included); the sixth was applied to the local development copy on 20/10
(re-run the rehearsal with all six before the window — « Lot 2 du 16/10 »
step 0). ⏳ Not deployed: the tag
and the dump below are the first steps of that deploy — the whole order,
its gates and checks, and the reprise F3 that follows are in « Lot 2 du
16/10 » below.

- **Code:** annotated git tag `v1.4-avant-lot2-16-10` = commit `a1ad186`
  (what production runs: `52e0d27` plus documents), **pushed to origin**.
- **Database:** `/var/backups/qualilab/qualilab_avant-lot2-16-10.sql.gz`,
  taken with the app stopped (`docker compose stop app`), just before
  `scripts/deploy.sh` — same commands as the 13/10 dump above, with this
  name; outside the rotation pattern, do not delete it.

**Expected in `docker compose logs migrate`:** six « Applying migration »
lines (five `20261019…`, then `20261020100000_retour_labo_19_10_comptes_clients`),
then « All migrations have been successfully applied. »
and exit 0. Two lines « prisma:warn Prisma failed to detect the
libssl/openssl version… Please manually install OpenSSL » come before them:
**harmless** — the build stage (`node:22-slim`) has no `openssl` binary
for Prisma to read its version from, and the migrations apply all the same
(rehearsed 19/10 with this exact command). The same warning shows during
`next build`. (Silencing it means `apt-get install -y openssl`
in the build stage — an image change, not part of this deploy.)

**Rollback — code only, or with the dump.** The new columns are harmless
to the old code (it rendered all 92 local reports identically on the
migrated schema), but two migrations **append enum values**, and the old
Prisma client refuses to read a row holding one: `Sample.handsState =
'ASEPTISEES'` (written by the first hands line entered with that state —
the state is required since this lot) and `EmailLog.type = 'NON_RECU'`
(written by the first « Non reçu au laboratoire » cancellation, even when
the send is only simulated). Either one breaks `/admin/envois` (the whole
EmailLog list) or every screen and document that reads that sample
(reception, protocole, correction) on the old code. So, as root, on the VPS:

```bash
cd /opt/qualilab
set -a && . ./.env && set +a
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
  "SELECT COUNT(*) FROM Sample WHERE handsState='ASEPTISEES'; SELECT COUNT(*) FROM EmailLog WHERE type='NON_RECU'"
```

- **Both 0 — code-only rollback is allowed:**
  `sudo -u qualilab git fetch --tags && sudo -u qualilab git checkout v1.4-avant-lot2-16-10 && sudo -u qualilab bash scripts/deploy.sh`.
  The six migrations stay applied; the old code ignores the new columns.
  Lot 2C's three columns change nothing for it: an IF / RC frozen in
  `Invoice.clientSnapshot` is an extra JSON key the old reader skips, and
  an account still flagged « mot de passe à changer » simply signs in as
  before (the flag is back in force if lot 2C is redeployed).
- **Either one above 0 — restore the dump:** check the tag out **first**
  (so the restore does not replay the new migrations), then
  `DB_PASSWORD=... bash scripts/restore-db.sh /var/backups/qualilab/qualilab_avant-lot2-16-10.sql.gz`
  and `sudo -u qualilab bash scripts/deploy.sh`. **This loses everything
  entered since the deploy** (samples, results, reports, invoices): say so
  to the laboratory before doing it.

To resume lot 2 later: `git checkout master` and redeploy.

## Lot 2 du 16/10 — deploy order, checks, reprise F3 (rehearsed 19/10, not deployed)

Branch `lot2-retour-16-10` (`RETOUR-LABO-16-10.md` §4 « État au 19/10 »):
the four waves (`9770bb0`, `d7b8750`, `124af3a`, `b898586`), the final
verification's fixes (`d9dcd2d`), and since 20/10 **lot 2C**
(`RETOUR-LABO-19-10.md`: migration `c5db24e`, H1 `7b1b540`, H2 / H3
`f057892`, H4 `a83ec7e`, D-15–D-18 `5666f3b`, D-19 `1cb4a4f`) — six
additive migrations (listed in the section above). **One deploy carries
the four waves and lot 2C**, so it carries the preconditions of waves 2 and
3 and lot 2C's go-live steps (H1, D-19). Rehearsed on 19/10 (the first five
migrations) on a local copy at the
production schema (34 migrations): `npx prisma migrate deploy`, then the
compose `migrate` command run from an image built out of `git archive HEAD`
— no row changed in any of the 44 tables (every row hashed before / after),
the appended enum values keep the stored positions, the 92 local reports
render byte-identical to `master`'s, 84 pages and PDFs answer 200 on a
standalone production build. No change to `package*.json`, `Dockerfile`,
`docker-compose.yml`, `.env.production.example` or `scripts/*.sh`: **no new
environment variable**.

### 0. Before the window — the gates (owner)

- **Committed** (19/10 `d9dcd2d`; lot 2C 20/10, commits above). Gates again
  on the branch's head: `npx tsc --noEmit -p .`, `npx eslint src`,
  `npx vitest run`, `npm run build` (green on 20/10: 0 / 0 / 123 files,
  2 479 tests / 94 pages). **Rehearse again with the six migrations** on a
  local copy at the production schema (the 19/10 procedure:
  `npx prisma migrate deploy`, then the compose `migrate` command from an
  image built out of `git archive HEAD`; every row hashed before / after).
  The sixth only adds three columns, but the rehearsal is what the restore
  point relies on.
- **Wave 2 (A1, B1).** The laboratory answered the re-ask 2.1 (hands'
  states) and 2.6 (« Heure de prélèvement inconnue du client »), **or** the
  owner decided in writing to ship the proposals — recorded in HANDOFF §9
  and PROGRESS. Each is a one-line switch (`HANDS_STATE_CHOICES` in
  `labels.ts`, `SAMPLING_TIME_UNKNOWN.allowed` in `serie-input.ts`).
- **D1 — reopen and cancel open to the validateur and the Direction.** Named
  accounts exist for the people who sign, with at least one real ADMIN;
  `bash scripts/disable-demo-accounts.sh` has run (« Go-live » above);
  `NEXT_PUBLIC_DEMO_MODE=false` is in `.env` **before** the build of step 2
  (the build bakes it in). Hiding the panel alone leaves the demo accounts
  open.
- **E4 — merges open to the gestionnaire commercial.** The owner's decision
  on `Invoice.clientSnapshot` for the invoices issued before 10/10 (HANDOFF
  §9 « Billing »), written there.
- **Q131, Q132, Q133** (`NEEDEDINFO.md` §1b): the defaults built ship unless
  the owner says otherwise.
- **Read-only, on production — the largest criteria grid.** « Familles &
  critères » saves a family's whole grid, active rows and inactive ones,
  capped at 1000 rows (`CRITERIA_GRID_MAX_ROWS`). Locally the largest is 346
  after the reprise. As root, in `/opt/qualilab`:

  ```bash
  set -a && . ./.env && set +a
  docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
    'SELECT pt.name, COUNT(*) AS n FROM `Criterion` c JOIN `ProductType` pt ON pt.id = c.productTypeId GROUP BY pt.id, pt.name ORDER BY n DESC LIMIT 5'
  ```

  Every count at most 1000, and at most 500 for a hands, surface, water or
  air family (the reprise F3 keeps each copied criterion's deactivated
  original in the same family, so such a grid can double). Otherwise stop:
  the cap is raised first. Not checked yet (no production access on 19/10).
- **Tell the laboratory, in writing, before the deploy:**
  - the T° ambiante is required on every visit sample, air included (A5);
  - at the counter « Prélevé le » **and** « Arrivé le » are required (B1),
    with the box « Heure de prélèvement inconnue du client » if 2.6 ships;
  - the hands' state is required (A1); the packaging question is gone (B3);
  - « Valider » no longer sends the report: « Valider et envoyer », or
    « Envoyer au client » later from « Validés — à envoyer » (D2);
  - reopening a report and cancelling a sample in analysis: validateur,
    Direction, admin (D1); merging a duplicate: the gestionnaire commercial
    too (E4); the réception and the préleveur create a client (E1);
  - changing a family on the programme removes its analyses (F6); after the
    programme only the responsable des paramètres changes analyses (F8);
  - reprinted protocoles and bons change wording (« Technicien de QUALILAB
    'X.NOM' », « mains en cours de travail », « Boîte exposée 30 min », no
    « analysé avec l'accord de »);
  - every page or phone opened before the deploy must be reloaded, and a
    visit in progress on a phone is submitted **before** the deploy (the old
    page sends no ambient temperature and is refused afterwards);
  - lot 2C: each new account, and each account whose password the
    administrator resets, chooses its own password at its first sign-in
    (H1); the client fiche has « IF » and « RC » next to the ICE, exported
    with the invoices (H2), and each address « Tout le client » or one site
    (H3); invoices and credit notes have a second button « PDF par
    paramètre » (H4); « Analyse sensorielle » removes the family's analyses
    on the programme sheet and says so (D-16).
- Outside the laboratory's hours.

### 1. Restore point (development machine)

```bash
git tag -a v1.4-avant-lot2-16-10 a1ad186 -m "Version stable avant le lot 2 du 16/10 et le lot 2C (6 migrations additives) — retour : DEPLOY.md « Point de retour — avant le lot 2 du 16/10 »"
git push origin v1.4-avant-lot2-16-10
git checkout master && git merge --ff-only lot2-retour-16-10 && git push origin master
```

`a1ad186` is what production runs: `52e0d27` plus documents
(`52e0d27..a1ad186` touches only `.md` files, checked 19/10).

### 2. On the VPS, as root

```bash
cd /opt/qualilab
sudo -u qualilab git rev-parse --short HEAD                     # → a1ad186 (52e0d27 if the documents were never pulled: same code)
set -a && . ./.env && set +a
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1; SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL"
# → 20261013100000_retour_labo_1210 (finished) and 0 — anything else: stop
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
  'SELECT (SELECT COUNT(*) FROM `Sample`) s, (SELECT COUNT(*) FROM `Serie`) se, (SELECT COUNT(*) FROM `Report`) r, (SELECT COUNT(*) FROM `Client`) c, (SELECT COUNT(*) FROM `User`) u, (SELECT COUNT(*) FROM `EmailLog`) e, (SELECT COUNT(*) FROM `ProductType`) pt, (SELECT COUNT(*) FROM `Criterion`) cr'
# → write the eight counts down
sudo -u qualilab git pull --ff-only
sudo -u qualilab docker compose build                           # the old app keeps serving meanwhile
docker compose stop app                                         # freeze writes
docker compose exec -T db mysqldump --single-transaction --routines --triggers --no-tablespaces \
  -u qualilab -p"$DB_PASSWORD" qualilab | gzip > /var/backups/qualilab/qualilab_avant-lot2-16-10.sql.gz
gzip -t /var/backups/qualilab/qualilab_avant-lot2-16-10.sql.gz \
  && zcat /var/backups/qualilab/qualilab_avant-lot2-16-10.sql.gz | tail -n 1   # « -- Dump completed … »
chown qualilab: /var/backups/qualilab/qualilab_avant-lot2-16-10.sql.gz
sudo -u qualilab bash scripts/deploy.sh   # up -d --build (cached) → migrate → app → health → prune
```

The dump's name is outside the rotation pattern; copy it off the machine
too when `BACKUP_REMOTE` is set (« Backups » above).

### 3. Checks right after

```bash
docker compose ps -a migrate                       # Exited (0)
docker compose logs migrate | tail -25             # six « Applying migration » (five `20261019…`, one `20261020100000…`), then « All migrations have been successfully applied. »
curl -s localhost:3000/api/health                  # {"status":"ok","database":"connected"}
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
  "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name LIKE '20261019%' OR migration_name LIKE '20261020%'"
# → 6 rows (five 20261019…, 20261020100000_retour_labo_19_10_comptes_clients), finished_at set, rolled_back_at NULL
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
  "SHOW COLUMNS FROM User LIKE 'mustChangePassword'; SHOW COLUMNS FROM Client LIKE 'fiscalId'; SHOW COLUMNS FROM Client LIKE 'tradeRegister'; SELECT COUNT(*) FROM User WHERE mustChangePassword = 1"
# → tinyint(1) NOT NULL default 0 · varchar(191) NULL · varchar(191) NULL · 0 (no account flagged by the migration)
docker compose exec -T db mysql -u qualilab -p"$DB_PASSWORD" qualilab -e \
  "SHOW COLUMNS FROM Sample LIKE 'handsState'; SHOW COLUMNS FROM EmailLog LIKE 'type'"
# → enum('LAVEES','NON_LAVEES','ASEPTISEES') · enum('RAPPORT','ALERTE_CONTAMINATION','DESTRUCTION','NON_RECU')
docker compose logs app --since 10m                # no error
```

- The eight counts of step 2 again: equal.
- The two « prisma:warn … openssl » lines before the migrations are
  expected (section above).
- The image was rebuilt: run the tzdata check of « Time zone ».

### 4. Five-minute check — the owner, with their own accounts

- The demo panel is absent from the login page and a demo account cannot
  sign in.
- Each role's dashboard opens.
- An **old report** downloads with the 13/10 layout (« Lieu du
  prélèvement », « Dates Prod / Dates Exp », « … à HHhMM », the préleveur's
  full name) — and so does its duplicata.
- An old protocole and an old bon reprint with the new wording (the
  denomination, « mains en cours de travail », « Boîte exposée 30 min »).
- Then the production lines of `TESTPLAN.md` V16 and V17, on « TEST UI
  2026-10-06 Traiteur », « TEST UI V16 … » and « TEST UI V17 … » data only
  (V17-H1: a test account created after the deploy chooses its password
  first).

### 5. Reprise F3 — « Catalogue de l'ancien logiciel » (operator, after the deploy)

The criteria of the hands, surface, water and air families **start to
apply the moment they are imported**, samples already at the bench
included. Run it outside the laboratory's hours, once the bench confirms
that no MAINS, SURFACE, EAU or AIR sample is in progress. The production
path was replayed once on 19/10 on a local schema rebuilt to production's
01/10 state (`HANDOFF.md` §8, wave 4).

1. **Restore point.** The code does not change: tag the deployed commit
   (proposed name `git tag -a v1.5-lot2-16-10 <commit> -m "Lot 2 du 16/10 en
   production, avant la reprise F3"`, then `git push origin
   v1.5-lot2-16-10`). On the VPS: `docker compose stop app`, a second
   labelled dump with the commands of step 2 and the name
   `qualilab_avant-reprise-F3.sql.gz` (`gzip -t`, « -- Dump completed »,
   `chown`), then `docker compose start app`.
2. **Files.** The three CSV of `legacy-export/` on the development machine
   (outside the repo, written by `scripts/legacy/extract-legacy.py`):
   `regulations.csv`, `types.csv` (its `echantillon` column is the type
   d'analyse), `criteria.csv`. As an ADMIN: `/admin/import` → « Catalogue de
   l'ancien logiciel » → the three files; leave « Créer les paramètres
   inconnus du catalogue… » ticked.
3. **Analyser.** Nothing is written. Read « Reprise du 16/10 »: types
   d'analyse, « Critères rattachés » (copies, old rows to deactivate,
   collisions), « Familles remplies », « Familles encore vides », the
   tolerances c without meaning to clear, « Paramètres à créer » (alert,
   « sans prix », look-alikes), « Familles modifiées à la main — non
   reprises », the food parameters left without criteria, and the samples in
   progress whose verdict changes.
4. **Aliases for the look-alikes.** For each « Ressemble à « X » » under
   « Paramètres à créer »: if it is the same germ, add the name to the
   existing parameter's « Autres libellés » in `/admin/parametres`, then
   **Analyser** again — it is no longer created. Distinct germs are confirmed
   at step 6.
5. **Samples in progress.** When the analysis counts samples whose verdict
   changes (« commencent à être jugés » / « perdent leurs critères », by
   status), check each one with the bench first. Best: zero.
6. **Importer…** The confirmation repeats the samples in progress (« J'ai
   vérifié ces échantillons avec la paillasse : importer quand même. ») and
   the look-alikes left (« Ce sont des germes distincts : les créer. »);
   **Importer** writes the analysed plan in one transaction, journalled
   `LEGACY_CATALOGUE_REPRISE` per family. A 409 « relancez l'analyse » means
   the catalogue changed since the analysis (another tab, another admin):
   nothing was written — analyse again, then import.
7. **Analyser once more: it must plan nothing** (no family, criterion, copy,
   link, parameter nor c to clear) — the reprise is idempotent.
8. **Afterwards.** In `/admin/utilisateurs`, check each préleveur's
   « Dénomination sur les documents » (left empty, it is computed from the
   name: « Technicien de QUALILAB 'I.NOM' »). Send the laboratory the list
   « Familles actives encore sans critère » — outside the repo (some families
   carry a client's name).

To undo the reprise only: restore `qualilab_avant-reprise-F3.sql.gz` with
`scripts/restore-db.sh` (the code stays; everything entered since is lost).

### 6. D-19 — chemistry parameters filed as microbiology (operator, after the deploy, before go-live)

Lot 2C's screen « Reclasser plusieurs paramètres » (/admin/parametres,
ADMIN) moves a ticked set of parameters to another domain in one
transaction, one `PARAMETER_UPDATED` per parameter (`RETOUR-LABO-19-10.md`
D-19). The local copy was reclassified with it on 20/10 (293 food
parameters MICRO → CHIMIE, 62 left in MICRO). Production very likely holds
the same rows. **Never by an UPDATE**: only the screen writes.

1. **The owner's review first:** `backups/D-19-parametres-a-reclasser-2026-10-20.md`
   (outside the repo: the list, the names not to tick, the procedure in
   French) — 59 names to leave in microbiology in production (53 germs and
   6 to confirm with the laboratory; the file's 3 other rows are local test
   germs). Nothing is run before that review.
2. **Read-only list, then an offline check.** On the VPS:
   `docker compose exec -T db mysql -B -N -u qualilab -p"$DB_PASSWORD" qualilab -e "SELECT name FROM AnalysisParameter WHERE category='ALIMENTAIRE' AND family='MICRO' ORDER BY name" > d19-prod-noms.txt`;
   on the development machine `node .ui-tests/d19-compare-names.mjs d19-prod-noms.txt`
   prints N (the list), the names to untick and X (to move), and **stops on
   any name unknown to the 20/10 list** — such a parameter is judged (germ
   or chemistry) before anything is ticked. Same catalogue as the local
   copy: N = 352, 59 to untick, X = 293.
3. **Restore point:** tag the deployed commit and take a labelled dump with
   the commands of step 2 (proposed name `qualilab_avant-D19.sql.gz`;
   `gzip -t`, « -- Dump completed », `chown`). Outside the laboratory's
   hours.
4. **The screen** (ADMIN, /admin/parametres): « Reclasser plusieurs
   paramètres », Catégorie « Alimentaire » + Domaine « Microbiologie »,
   **empty search**, « Tout cocher (N) » — N as the script said; untick the
   listed names one box at a time (a search may find a row, but never « Tout
   cocher » / « Tout décocher » while a search is active, and never tick
   through a short search such as « pH », « Cu », « As », « PCR »); empty
   the search, « Passer en Physico-chimie (X) »; the dialog says X, none
   refused, no listed name in it; « Confirmer (X) ». A refusal (409) writes
   nothing. Any gap: « Annuler », start again.
5. **Afterwards:** Alimentaire + Microbiologie lists N − X rows (59 if the
   catalogue is the same); /admin/journal shows X « Paramètre modifié » of
   the same minute. To undo: the same screen the other way, or the dump (it
   loses everything entered since).

### 7. Rollback of the deploy

« Point de retour — avant le lot 2 du 16/10 » above: first the two counts
(`ASEPTISEES`, `NON_RECU`); both 0 → code only; otherwise check the tag out
**then** restore the dump — it loses everything entered since the deploy.

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

