// S12 (first pass) — the accreditation of the analysis parameters (RETOUR-LABO-04-11.md §2 Q13:
// « en microbiologie et histamine, ça dépend des cas »; the list itself is asked by C-4).
// Writes THROUGH THE APP'S OWN ADMIN ROUTE (PATCH /api/parameters/accreditation, journalled
// PARAMETER_ACCREDITATION_UPDATED with before / after), signed in as the demo admin.
// The rule is src/lib/accreditation-seed.ts (tested) — hypothèse, à confirmer par C-4:
//   - a mark of the old software in the name decides (« * », « (SA) », « (SN) »);
//   - otherwise every microbiology parameter and every histamine → « Accrédité »;
//   - everything else stays « à préciser »; a status already recorded is never rewritten.
// Undo: /admin/parametres « Accréditation des paramètres » (or the same route), row by row.
//
// Run (from the repo root):
//   npx tsx scripts/s12-accreditation.mts [options]
// Options:
//   --base <url>            the application (default http://localhost:3210 — LOCAL)
//   --dry-run               read and print the plan, change nothing
//   --login panel|password  panel = click « admin » in « Comptes de démonstration » on /login
//                           (headless Chrome, no password typed — the rule for PRODUCTION);
//                           password = the demo password of the seed (local only).
//                           Default: password on localhost, panel elsewhere.
//   --out <file.json>       the report (default .ui-tests/s12-accreditation.<host>.json, git-ignored)
// PRODUCTION: the owner's operator runs it with --base <prod url> (panel login), --dry-run first.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCREDITATION_BATCH_MAX, ACCREDITATION_LABELS } from "../src/lib/accreditation";
import { accreditationSeedPlan, type AccreditationSeedRow } from "../src/lib/accreditation-seed";

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
const out = opt("out") ?? join(REPO, ".ui-tests", `s12-accreditation.${host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
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

const cookie = await signIn();
const read = await api(cookie, "GET", "/api/parameters");
if (read.status !== 200 || !Array.isArray(read.data)) throw new Error(`GET /api/parameters: HTTP ${read.status}`);
const rows = (read.data as AccreditationSeedRow[]).map((p) => ({ id: p.id, name: p.name, family: p.family ?? null, accreditation: p.accreditation ?? null }));
const plan = accreditationSeedPlan(rows);

console.log(`Base ${BASE} · login ${loginMode} · ${dryRun ? "DRY RUN" : "APPLY"}`);
console.log(`Catalogue: ${rows.length} parameters — already recorded (left as they are): ${plan.kept} · to set: ${plan.set.length} · left « à préciser »: ${plan.leftUnknown}`);
const byWhy = new Map<string, number>();
for (const entry of plan.set) byWhy.set(`${entry.why} → ${ACCREDITATION_LABELS[entry.accreditation!]}`, (byWhy.get(`${entry.why} → ${ACCREDITATION_LABELS[entry.accreditation!]}`) ?? 0) + 1);
for (const [why, count] of byWhy) console.log(`  ${why}: ${count}`);
for (const entry of plan.set) console.log(`  - ${entry.name} → ${ACCREDITATION_LABELS[entry.accreditation!]} (${entry.why})`);

let updated = 0;
if (!dryRun && plan.set.length > 0) {
  for (let i = 0; i < plan.set.length; i += ACCREDITATION_BATCH_MAX) {
    const batch = plan.set.slice(i, i + ACCREDITATION_BATCH_MAX).map(({ id, accreditation }) => ({ id, accreditation }));
    const r = await api(cookie, "PATCH", "/api/parameters/accreditation", { updates: batch });
    if (r.status !== 200) throw new Error(`PATCH /api/parameters/accreditation: HTTP ${r.status} ${JSON.stringify(r.data)}`);
    updated += Number(r.data?.updated ?? 0);
  }
  const again = await api(cookie, "GET", "/api/parameters");
  const left = accreditationSeedPlan((again.data as AccreditationSeedRow[]).map((p) => ({ id: p.id, name: p.name, family: p.family ?? null, accreditation: p.accreditation ?? null })));
  console.log(`Written: ${updated} · read back: ${left.set.length} left to set (expected 0)`);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ base: BASE, at: new Date().toISOString(), dryRun, kept: plan.kept, leftUnknown: plan.leftUnknown, updated, set: plan.set }, null, 2));
console.log(`Report: ${out}`);
