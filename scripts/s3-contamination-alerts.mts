// S3 / #35 — the analyses that raise the contamination alert (RETOUR-LABO-28-10.md,
// re-ask 2.21: « Salmonella et Listeria et E. coli dans les aliments, Eaux et surfaces »).
// Sets `alertOnExceed` THROUGH THE APP'S OWN ADMIN ROUTE (PATCH /api/parameters/[id],
// journalled PARAMETER_UPDATED with before / after), signed in as the demo admin.
// The list itself is decided by src/lib/contamination-alert-analyses.ts (tested).
//
// WHAT IT WRITES — the owner approves it before a production run (DEPLOY.md « Lot 3 »):
//   - `alertOnExceed: true` on each parameter the answer names;
//   - AND `limitValue: 0` (« Absence ») on a DETECTION (unit « /25 g », « /5 L »,
//     « /cm² », no UFC) that has no limit yet — the admin route refuses a sensitive
//     parameter without one. That limit is also what the bench's suggested
//     conformity reads (bench-reading.ts `valueAgainstLimit`), not only the alert.
//   - An ENUMERATION without a limit is never flagged (listed « needs a limit »).
//
// Run (from the repo root):
//   npx tsx scripts/s3-contamination-alerts.mts [options]
// Options:
//   --base <url>            the application (default http://localhost:3210 — LOCAL)
//   --dry-run               read and print the plan, change nothing
//   --login panel|password  panel = click « admin » in « Comptes de démonstration » on /login
//                           (headless Chrome, no password typed — the rule for PRODUCTION);
//                           password = the demo password of the seed (local only).
//                           Default: password on localhost, panel elsewhere.
//   --listeria none|all|monocytogenes   default none: Listeria waits for R-14
//                           (§7 S3 « Listeria après R-14 ») — listed « deferred »,
//                           never set nor cleared; all = the genus as written,
//                           monocytogenes = L. monocytogenes only.
//   --unset-others          also clear the flag on the parameters the answer does not name
//                           (default: only listed — clearing a flag silences alerts;
//                           a deferred Listeria is never cleared)
//   --out <file.json>       the report (default .ui-tests/s3-contamination-alerts.<host>.json,
//                           git-ignored)
// PRODUCTION: the owner's operator runs it with --base <prod url> (panel login), --dry-run first.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALERT_GERM_LABELS, contaminationAlertPlan } from "../src/lib/contamination-alert-analyses";

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
const listeriaOption = (opt("listeria") ?? "none").toUpperCase();
if (!["NONE", "ALL", "MONOCYTOGENES"].includes(listeriaOption)) throw new Error("--listeria none|all|monocytogenes");
const listeria = listeriaOption as "NONE" | "ALL" | "MONOCYTOGENES";
const dryRun = flag("dry-run");
const unsetOthers = flag("unset-others");
const out = opt("out") ?? join(REPO, ".ui-tests", `s3-contamination-alerts.${host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
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

type Row = { id: string; name: string; category: string; germ: string | null };
const cookie = await signIn();
const read = await api(cookie, "GET", "/api/parameters");
if (read.status !== 200 || !Array.isArray(read.data)) throw new Error(`GET /api/parameters: HTTP ${read.status}`);
const plan = contaminationAlertPlan(read.data, listeria);

const label = (r: Row) => `${r.name} [${r.category}]${r.germ ? ` — ${ALERT_GERM_LABELS[r.germ as keyof typeof ALERT_GERM_LABELS]}` : ""}`;
console.log(`Base ${BASE} · login ${loginMode} · Listeria ${listeria} · ${dryRun ? "DRY RUN" : "APPLY"}${unsetOthers ? " · unset others" : ""}`);
console.log(`Catalogue: ${read.data.length} parameters`);
console.log(`\nTo set (${plan.toSet.length}):`);
for (const r of plan.toSet) console.log(`  + ${label(r)}${r.patch.limitValue === 0 ? " (détection : limite 0 = Absence, posée avec le drapeau)" : ""}`);
console.log(`Enumeration without a limit — the laboratory's limit or criterion first, NOT flagged (${plan.needsLimit.length}):`);
for (const r of plan.needsLimit) console.log(`  ! ${label(r)} (${r.unit ?? "sans unité"})`);
console.log(`Already set (${plan.alreadySet.length}):`);
for (const r of plan.alreadySet) console.log(`  = ${label(r)}`);
console.log(`Flagged, not named by the answer (${plan.othersFlagged.length})${unsetOthers ? " — will be cleared" : " — left as they are"}:`);
for (const r of plan.othersFlagged) console.log(`  ? ${label(r)}`);
console.log(`Listeria outside the scope « ${listeria} » — waiting for R-14, never set nor cleared (${plan.deferred.length}):`);
for (const r of plan.deferred) console.log(`  … ${label(r)}`);

const changes: { id: string; name: string; category: string; germ: string | null; alertOnExceed: boolean; body: unknown; status: number; error?: string }[] = [];
if (!dryRun) {
  const writes = [
    ...plan.toSet.map((r: Row & { patch: Record<string, unknown> }) => ({ row: r, value: true, body: r.patch })),
    ...(unsetOthers ? plan.othersFlagged.map((r: Row) => ({ row: r, value: false, body: { alertOnExceed: false } })) : []),
  ];
  for (const { row, value, body } of writes) {
    // A field or two without `version`: the route's « script » path (no whole form).
    const res = await api(cookie, "PATCH", `/api/parameters/${row.id}`, body);
    changes.push({ ...row, alertOnExceed: value, body, status: res.status, ...(res.status === 200 ? {} : { error: res.data?.error ?? "" }) });
    console.log(`${res.status === 200 ? "OK  " : "FAIL"} ${value ? "set  " : "clear"} ${label(row)}${res.status === 200 ? "" : ` — HTTP ${res.status} ${res.data?.error ?? ""}`}`);
  }
  // Read back: the plan must now have nothing left to set.
  const after = await api(cookie, "GET", "/api/parameters");
  const again = contaminationAlertPlan(after.data, listeria);
  console.log(`\nRead back: ${again.toSet.length} left to set, ${again.alreadySet.length} set, ${again.needsLimit.length} waiting for a limit, ${again.othersFlagged.length} other flagged.`);
  if (again.toSet.length > 0) process.exitCode = 1;
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ at: new Date().toISOString(), base: BASE, login: loginMode, listeria, dryRun, unsetOthers, plan, changes }, null, 2)
);
console.log(`\nReport: ${out}`);
if (changes.some((c) => c.status !== 200)) process.exitCode = 1;
