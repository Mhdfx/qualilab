// Lot 5A — the owner's steps S13, S14 and S15 (RETOUR-LABO-20-11.md §5 « gestes du propriétaire »).
// Writes THROUGH THE APP'S OWN ADMIN ROUTES, each journalled by its route with before / after,
// signed in as the demo admin. The plans are src/lib/lot5a-owner-steps.ts (tested):
//   S13 (C-3)   PUT /api/stock/settings — retenue à la source: base TVA, 75 % with a valid attestation,
//               100 % without, scope « fournisseurs soumis ». The suppliers are case by case: tick
//               « soumis à la retenue » on each supplier's fiche when the laboratory names them (this
//               script ticks none; it counts those already ticked). The attestation's validity stays as
//               it is until D-3 answers (4 or 6 months). A warning, never a block.
//   S14 (C-8 d) PATCH /api/parameters/[id] — « Escherichia coli » an alias of the water's « E. coli »,
//               « Coliformes à 36 °C » an alias of the water's « Coliformes totaux »; then
//               POST /api/admin/import/prix-clients — the analysis, then (not in --dry-run) the import of
//               the same file: idempotent, only the new prices are written, a price removed by hand never
//               comes back. The other analyses still not found stay out (not confirmed).
//   S15 (Q133)  PUT /api/product-types/[id]/criteria — n = 1 on the active criteria of the sensory family
//               « PRODUIT ALIMENTAIRE » (type d'analyse « Analyse sensorielle »); the whole grid is sent
//               back, only n changes (« Détermination de l'odeur », already n = 1, unchanged).
// Undo: the same screens (/magasin « Réglages », /admin/parametres, the criteria grid), journal in hand.
//
// Run (from the repo root):
//   npx tsx scripts/lot5a-owner-steps.mts [options]
// Options:
//   --base <url>            the application (default http://localhost:3210 — LOCAL)
//   --step s13|s14|s15|all  default all
//   --dry-run               read and print the plans (S14: the import's analysis too), change nothing
//   --csv <file>            S14's price file (default backups/prix-clients-ancienne-base.csv — git-ignored,
//                           it holds client names: never in the repository)
//   --login panel|password  panel = click « admin » in « Comptes de démonstration » on /login
//                           (headless Chrome, no password typed — the rule for PRODUCTION);
//                           password = the demo password of the seed (local only).
//                           Default: password on localhost, panel elsewhere.
//   --out <file.json>       the report (default .ui-tests/lot5a-owner-steps.<host>.json, git-ignored)
// PRODUCTION: the owner's operator runs it with --base <prod url> (panel login), --dry-run first.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  achatSettingsView,
  isSensoryNature,
  s13Plan,
  s14AliasPlan,
  s15Family,
  s15GridPlan,
  type AchatSettingsRead,
  type CriterionView,
  type ParameterView,
} from "../src/lib/lot5a-owner-steps";

const REPO = fileURLToPath(new URL("..", import.meta.url));

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const BASE = (opt("base") ?? "http://localhost:3210").replace(/\/+$/, "");
const host = new URL(BASE).hostname;
const local = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
const loginMode = opt("login") ?? (local ? "password" : "panel");
const dryRun = flag("dry-run");
const step = (opt("step") ?? "all").toLowerCase();
if (!["s13", "s14", "s15", "all"].includes(step)) throw new Error("--step s13|s14|s15|all");
const runs = (name: string) => step === "all" || step === name;
const csvPath = resolve(REPO, opt("csv") ?? join("backups", "prix-clients-ancienne-base.csv"));
const out = opt("out") ?? join(REPO, ".ui-tests", `lot5a-owner-steps.${host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
if (loginMode === "password" && !local) throw new Error("--login password is for the local application only: use the demo panel elsewhere.");

/** A dev server compiling on demand may not answer in time: three tries. */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= 3) throw error;
      console.log(`(no answer from ${url}, try ${attempt + 1}/3)`);
    }
  }
}

/** The admin's session cookie. */
async function signIn(): Promise<string> {
  if (loginMode === "password") {
    const res = await fetchRetry(`${BASE}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ username: "admin", password: "password" }),
    });
    if (res.status !== 200) throw new Error(`sign-in admin: HTTP ${res.status}`);
    return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
    headless: true,
    // Chrome 157+ upgrades http:// to https and blocks the production IP (ERR_BLOCKED_BY_CLIENT) until there is a domain + TLS.
    args: ["--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests"],
  });
  try {
    const context = await browser.newContext({ locale: "fr-FR", timezoneId: "Africa/Casablanca" });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const account = page.locator("button").filter({ has: page.locator("span.font-mono", { hasText: /^admin$/ }) });
    if (!(await account.isVisible().catch(() => false))) await page.getByRole("button", { name: /Comptes de démonstration/i }).click();
    await account.click();
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetchRetry(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (res.headers.get("content-type") ?? "").includes("json") ? await res.json() : null;
  return { status: res.status, data };
}

function must(result: { status: number; data: unknown }, what: string) {
  if (result.status !== 200) throw new Error(`${what}: HTTP ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

const report: Record<string, unknown> = { base: BASE, at: new Date().toISOString(), dryRun, step };
let failed = false;
const cookie = await signIn();
console.log(`Base ${BASE} · login ${loginMode} · ${dryRun ? "DRY RUN" : "APPLY"} · step ${step}`);

// ─── S13 ─────────────────────────────────────────────────────────────────────
if (runs("s13")) {
  const current = achatSettingsView(must(await api(cookie, "GET", "/api/stock/settings"), "GET /api/stock/settings") as AchatSettingsRead);
  const plan = s13Plan(current);
  const suppliers = must(await api(cookie, "GET", "/api/suppliers"), "GET /api/suppliers") as { withholdingSubject?: boolean }[];
  const subject = suppliers.filter((s) => s.withholdingSubject === true).length;
  console.log(`\nS13 — retenue à la source: ${plan.changes.length === 0 ? "already set" : `${plan.changes.length} field(s) to change`}`);
  for (const change of plan.changes) console.log(`  ${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`);
  console.log(`  attestation validity kept: ${plan.body.taxCertificateValidityMonths} month(s) (D-3 open: 4 or 6)`);
  console.log(`  suppliers « soumis à la retenue »: ${subject} of ${suppliers.length} — ticked case by case on their fiche, never here`);
  let written = false;
  if (!dryRun && plan.changes.length > 0) {
    const put = await api(cookie, "PUT", "/api/stock/settings", plan.body);
    if (put.status !== 200) {
      failed = true;
      console.log(`  FAIL PUT /api/stock/settings — HTTP ${put.status} ${JSON.stringify(put.data)}`);
    } else {
      written = true;
      const again = s13Plan(achatSettingsView(must(await api(cookie, "GET", "/api/stock/settings"), "GET /api/stock/settings") as AchatSettingsRead));
      console.log(`  written · read back: ${again.changes.length} left to change (expected 0)`);
      if (again.changes.length > 0) failed = true;
    }
  }
  report.s13 = { changes: plan.changes, body: plan.body, suppliers: suppliers.length, subject, written };
}

// ─── S14 ─────────────────────────────────────────────────────────────────────
if (runs("s14")) {
  const parameters = must(await api(cookie, "GET", "/api/parameters"), "GET /api/parameters") as ParameterView[];
  const plan = s14AliasPlan(parameters);
  console.log(`\nS14 — aliases of the water (C-8 (d))`);
  const aliasWrites: { id: string; alias: string; status: number; error?: string }[] = [];
  for (const entry of plan) {
    if (entry.kind === "missing") {
      failed = true;
      console.log(`  ! ${entry.category} « ${entry.name} »: ${entry.found} parameter(s) of that name — nothing written, look first`);
      continue;
    }
    if (entry.kind === "present") {
      console.log(`  = ${entry.category} « ${entry.name} » already has « ${entry.alias} »`);
      continue;
    }
    console.log(`  + ${entry.category} « ${entry.name} » ← « ${entry.alias} »`);
    if (!dryRun) {
      // One field without `version`: the route's « script » path (no whole form).
      const res = await api(cookie, "PATCH", `/api/parameters/${entry.id}`, { aliases: entry.aliases });
      aliasWrites.push({ id: entry.id, alias: entry.alias, status: res.status, ...(res.status === 200 ? {} : { error: String((res.data as { error?: string })?.error ?? "") }) });
      console.log(`    ${res.status === 200 ? "OK" : `FAIL HTTP ${res.status} ${(res.data as { error?: string })?.error ?? ""}`}`);
      if (res.status !== 200) failed = true;
    }
  }

  let importAnalysis: unknown = null;
  let importCommit: unknown = null;
  if (!existsSync(csvPath)) {
    failed = true;
    console.log(`  ! price file not found: ${csvPath} — the import is not run (--csv <file>)`);
  } else {
    const csv = readFileSync(csvPath, "utf8");
    const summary = (data: Record<string, unknown>) => {
      const counts = (data.counts ?? {}) as Record<string, number>;
      const missing = (data.missingAnalyses ?? []) as { label: string; prices: number }[];
      const ours = missing.filter((m) => /^(escherichia coli|coliformes à 36 °c)$/i.test(m.label.trim()));
      return { counts, missing: missing.length, stillMissingOfS14: ours };
    };
    const analysis = await api(cookie, "POST", "/api/admin/import/prix-clients", { csv, mode: "analyse" });
    if (analysis.status !== 200) {
      failed = true;
      console.log(`  FAIL import analysis — HTTP ${analysis.status} ${JSON.stringify(analysis.data)}`);
    } else {
      const s = summary(analysis.data as Record<string, unknown>);
      importAnalysis = s;
      console.log(`  price import, analysis: ${JSON.stringify(s.counts)} · analyses not found: ${s.missing}`);
      if (s.stillMissingOfS14.length > 0) {
        console.log(
          `    still not found among S14's labels: ${s.stillMissingOfS14.map((m) => `${m.label} (${m.prices})`).join(", ")}${dryRun ? " — expected in a dry run (the aliases are not written yet)" : ""}`
        );
      }
      if (!dryRun) {
        const commit = await api(cookie, "POST", "/api/admin/import/prix-clients", { csv, mode: "commit" });
        if (commit.status !== 200) {
          failed = true;
          console.log(`  FAIL import commit — HTTP ${commit.status} ${JSON.stringify(commit.data)}`);
        } else {
          importCommit = { ...summary(commit.data as Record<string, unknown>), written: (commit.data as { written?: unknown }).written };
          console.log(`  price import, written: ${JSON.stringify((commit.data as { written?: unknown }).written)}`);
        }
      }
    }
  }
  report.s14 = { plan, aliasWrites, csv: csvPath, importAnalysis, importCommit };
}

// ─── S15 ─────────────────────────────────────────────────────────────────────
if (runs("s15")) {
  const natures = must(await api(cookie, "GET", "/api/natures"), "GET /api/natures") as { id: string; label: string }[];
  const sensory = new Set(natures.filter((n) => isSensoryNature(n.label)).map((n) => n.id));
  // One list per sensory type d'analyse: the route caps a list at 400 families, and the
  // catalogue holds more (the family was missed on the local copy before this filter).
  const families: { id: string; name: string; natureId: string | null }[] = [];
  for (const natureId of sensory) {
    const rows = must(
      await api(cookie, "GET", `/api/product-types?all=1&natureId=${encodeURIComponent(natureId)}`),
      "GET /api/product-types"
    ) as { id: string; name: string; natureId: string | null }[];
    families.push(...rows);
  }
  const family = s15Family(families, sensory);
  console.log(`\nS15 — sensory analysis, n = 1 (Q133)`);
  if (!family) {
    failed = true;
    console.log(`  ! the family « PRODUIT ALIMENTAIRE » under « Analyse sensorielle » was not found once (${sensory.size} sensory type(s) d'analyse) — nothing written`);
    report.s15 = { found: false };
  } else {
    const detail = must(await api(cookie, "GET", `/api/product-types/${family.id}`), "GET /api/product-types/[id]") as { criteria: CriterionView[] };
    const plan = s15GridPlan(detail.criteria);
    console.log(`  family ${family.id}: ${detail.criteria.length} criteria · to set n = 1: ${plan.changed.length}`);
    for (const row of plan.changed) console.log(`  - ${row.name}: n ${row.before} → 1`);
    let written = false;
    if (!dryRun && plan.changed.length > 0) {
      const put = await api(cookie, "PUT", `/api/product-types/${family.id}/criteria`, { criteria: plan.rows });
      if (put.status !== 200) {
        failed = true;
        console.log(`  FAIL PUT criteria — HTTP ${put.status} ${JSON.stringify(put.data)}`);
      } else {
        written = true;
        const again = must(await api(cookie, "GET", `/api/product-types/${family.id}`), "GET /api/product-types/[id]") as { criteria: CriterionView[] };
        const left = s15GridPlan(again.criteria).changed.length;
        console.log(`  written · read back: ${left} left to set (expected 0) · rows ${again.criteria.length} (before ${detail.criteria.length})`);
        if (left > 0 || again.criteria.length !== detail.criteria.length) failed = true;
      }
    }
    report.s15 = { found: true, familyId: family.id, criteria: detail.criteria.length, changed: plan.changed, written };
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nReport: ${out}`);
if (failed) process.exitCode = 1;
