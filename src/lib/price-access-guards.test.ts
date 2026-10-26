import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { navFor } from "@/components/layout/nav-for-role";
import { ADVANCE_ROLES, BILLING_ROLES, seesBilling } from "./price-access";
import { LAB_ROLES, roleAllowed, type Role } from "./roles";

/**
 * « Les prix des analyses et les factures : la comptabilité, l'administrateur,
 * la direction et le commercial ; la réception garde l'avance du comptoir ;
 * personne d'autre » — the owner's rule of 24–25/10 (`price-access.ts`).
 *
 * There is no proxy: every page and route carries its own guard, so this
 * test reads them all — the technique of direction-guards.test.ts — and
 * fails as soon as one of them lets a role outside `BILLING_ROLES` reach an
 * invoice, a price or an amount:
 *
 * - every page and route of the billing spaces admits billing roles only;
 * - every page and route that reads a price, an amount or an invoice
 *   either admits billing roles only, or is named below with the call that
 *   strips the figures for the other roles — a new one fails until it is
 *   classified;
 * - every component that renders an amount is reached from such pages
 *   only (or from a page named below, with the reason);
 * - no menu of another role leads to a billing space.
 *
 * A guard with no role at all admits every laboratory role (`roleAllowed`):
 * it is read as admitting them all; a handler with no guard this test
 * recognises is read as open too (`opensToOthers`). A page, route or
 * component that reaches a figure through a helper of src/lib counts as
 * reading it (`moneyHelpers`).
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const APP = join(SRC, "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const posix = (path: string) => path.split(sep).join("/");

const files = walk(APP)
  .filter((path) => /(^|[\\/])(route\.ts|page\.tsx|layout\.tsx)$/.test(path))
  .map((path) => ({ rel: posix(relative(APP, path)), source: readFileSync(path, "utf8") }));

const HANDLER = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|generateMetadata)\b|export\s+default\s+(?:async\s+)?function\b/g;

/** The roles of a guard's arguments: string literals, or a `...LIST` declared in the same file. */
function rolesOf(args: string, source: string): string[] {
  const spread = args.match(/^\s*\.\.\.([A-Z_]+)\s*$/);
  if (spread) {
    const list = source.match(new RegExp(`const\\s+${spread[1]}\\s*=\\s*\\[([^\\]]*)\\]`));
    expect(list, `list ${spread[1]}`).not.toBeNull();
    return rolesOf(list![1], source);
  }
  return [...args.matchAll(/["']([A-Z_]+)["']/g)].map((match) => match[1]);
}

type Handler = { at: string; rel: string; name: string; guards: string[][] };

const handlers: Handler[] = files.flatMap((file) => {
  const starts = [...file.source.matchAll(HANDLER)].map((match) => ({
    index: match.index,
    name: match[1] === "generateMetadata" ? "metadata" : (match[1] ?? (file.rel.endsWith("layout.tsx") ? "layout" : "page")),
  }));
  return starts.map((start, i) => {
    const body = file.source.slice(start.index, starts[i + 1]?.index ?? file.source.length);
    const guards = [
      ...[...body.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((match) => rolesOf(match[1], file.source)),
      ...[...body.matchAll(/roleAllowed\(session\.role,\s*\[([^\]]*)\]\)/g)].map((match) => rolesOf(match[1], file.source)),
    ];
    return { at: `${file.rel} ${start.name}`, rel: file.rel, name: start.name, guards };
  });
});

/** The laboratory roles a guard admits, read as `requireRole` decides (an empty list = every laboratory role). */
const admitted = (roles: string[]): Role[] => LAB_ROLES.filter((role) => roleAllowed(role, roles as Role[]));
/** The roles outside the billing that one of a handler's guards admits. */
const outsiders = (handler: Handler): Role[] => [...new Set(handler.guards.flatMap(admitted))].filter((role) => !seesBilling(role));
const handlersOf = (rel: string) => handlers.filter((handler) => handler.rel === rel);
/**
 * Whether a handler lets a role outside the billing in: one of its guards
 * admits one — or it carries no guard this test recognises (it then relies
 * on its layout, or on another helper, and counts as open, never as
 * « admits nobody »). The metadata and the portal's own handlers (CLIENT,
 * its own invoices) aside.
 */
const opensToOthers = (handler: Handler): boolean =>
  handler.name !== "metadata" &&
  !/^(api\/)?portail\//.test(handler.rel) &&
  (handler.guards.length === 0 || outsiders(handler).length > 0);
const sourceOf = (rel: string) => {
  const file = files.find((candidate) => candidate.rel === rel);
  expect(file, rel).toBeDefined();
  return file!.source;
};

/**
 * The billing spaces: the invoices (the comptabilité's and the
 * administrator's screens, their API, the client's billable samples), the
 * catalogue prices, and the commercial's client base with its invoices.
 */
const BILLING_SPACES = [
  "comptabilite/",
  "admin/factures/",
  "admin/catalogue/",
  "commercial/",
  "api/invoices/",
  "api/lab-services/",
  "api/clients/[id]/billable/",
  "api/clients/[id]/billed-for/",
];

/** What reads a price, an amount, an invoice or a payment. */
const MONEY =
  /\bunitPrice\b|\badvanceAmount\b|formatCurrency\(|heldInvoices\(|billingFigures\(|loadProgrammeReferential\(|\b(?:prisma|tx)\.(?:invoice|invoiceItem|payment|labService|purchaseInvoice)\b|invoices:\s*\{|\binvoiceItems\s*:|_count:\s*\{\s*select:\s*\{[^}]*\binvoices\b|INVOICE_STATUS_LABELS/;

/**
 * A page or route that reads money: in its own code (`MONEY`), or through a
 * helper of src/lib that does (`moneyHelpers`, further down).
 */
function isReader(rel: string): boolean {
  return MONEY.test(sourceOf(rel)) || libMoneyImports(`app/${rel}`).length > 0;
}

/**
 * The pages and routes that admit a role outside the billing and read such
 * a fact, each with the calls that strip it for that role — copied from the
 * file, so a change of the redaction shows here. None of them may still
 * hand out a raw invoice number or a notice naming it.
 */
const REDACTED_PER_ROLE: Record<string, string[]> = {
  // The responsable des paramètres: no catalogue price in his referential, no invoice number.
  "programmation/[id]/page.tsx": [
    "loadProgrammeReferential(row, { withPrices: seesBilling(session.role) })",
    "const invoiced = heldInvoice ? heldInvoiceFor(heldInvoice, session.role) : null;",
  ],
  "api/samples/[id]/programme/route.ts": ["withPrices: seesBilling(session.role),", "...(held ? { billing: billingAnswer(held, session.role) } : {}),"],
  // « Corriger la fiche / les analyses »: the réception, the validation desks, the responsable des paramètres.
  "api/samples/[id]/intake/route.ts": ["...(held ? { billing: billingAnswer(held, session.role) } : {}),"],
  // The validateur's « Annuler »: « Déjà facturé : la comptabilité établira un avoir. »
  "validation/[id]/page.tsx": ["invoiced: heldInvoice ? heldInvoiceFor(heldInvoice, session.role) : null,"],
  // The réception's « Annuler »: the invoice is read for the administrator's verbs only, then told through `heldInvoiceFor`.
  "reception/series/[id]/page.tsx": ["heldInvoices(invoiceReadIds(serie.samples, session.role))", "withVerbFacts(serie.samples, held, session.role)"],
  // A new série: the counter's advance is written on a deposit only (`createSerie`), which the préleveur never makes —
  // his série is always a visit; the answer's select (`serieSelectFor`) carries no advance.
  "api/series/route.ts": [
    'session.role === "PRELEVEUR" ? "VISITE" : requested === "DEPOT" ? "DEPOT" : "VISITE";',
    "select: serieSelectFor(session.role),",
  ],
  // The bon de réception: « Avance » for the réception and the billing roles (`ADVANCE_ROLES`), empty for the validateur.
  "api/series/[id]/document/route.ts": [
    "advanceAmount: seesAdvance(session.role) && serie.advanceAmount !== null ? Number(serie.advanceAmount) : null,",
    "advanceMode: seesAdvance(session.role) ? serie.advanceMode : null,",
  ],
};

/**
 * Pages and routes that read the invoice for the journal only: the line of
 * « Annuler » names it (`billedOn`, read by the administrator's journal and
 * the invoice sheet), the answer does not.
 */
const JOURNAL_ONLY: Record<string, string> = {
  "api/samples/[id]/cancel/route.ts":
    "billedOn: heldInvoice ? { invoiceId: heldInvoice.invoiceId, number: heldInvoiceLabel(heldInvoice) } : undefined,",
};

/**
 * The stock module's supplier invoices (Achat & Stock, deployed hidden on
 * 27/08). The rule's words name the MAGASINIER, yet these are purchases,
 * not the client billing: whether they move to the comptabilité is the
 * owner's answer, to get before the deploy (HANDOFF §3, « Prices and
 * invoices »). Pinned to their roles of today so a widening — or the move —
 * shows here.
 */
const STOCK_MODULE = ["magasin/", "api/purchase-invoices/", "api/suppliers/"];

describe("prices and invoices (the owner's rule of 24–25/10) — read from every page and route", () => {
  it("finds the application's handlers and their guards", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(handlers.filter((handler) => handler.guards.length > 0).length).toBeGreaterThan(150);
  });

  it("counts a handler with no guard it recognises as open — never as « admits nobody »", () => {
    const bare: Handler = { at: "x/page.tsx page", rel: "x/page.tsx", name: "page", guards: [] };
    expect(opensToOthers(bare)).toBe(true);
    expect(opensToOthers({ ...bare, guards: [[]] })).toBe(true); // a guard naming no role admits every laboratory role
    expect(opensToOthers({ ...bare, guards: [["COMPTABLE", "PRELEVEUR"]] })).toBe(true);
    expect(opensToOthers({ ...bare, guards: [["COMPTABLE", "ADMIN", "DIRECTION", "GESTIONNAIRE"]] })).toBe(false);
    // The portal reads the client's own invoices behind its own guard; the metadata reads no figure.
    expect(opensToOthers({ ...bare, rel: "portail/factures/page.tsx" })).toBe(false);
    expect(opensToOthers({ ...bare, rel: "api/portail/factures/route.ts" })).toBe(false);
    expect(opensToOthers({ ...bare, name: "metadata" })).toBe(false);
  });

  it("admits billing roles only in the billing spaces — every handler guarded", () => {
    const inSpaces = handlers.filter((handler) => BILLING_SPACES.some((space) => handler.rel.startsWith(space)));
    expect(inSpaces.length).toBeGreaterThan(30);
    for (const space of BILLING_SPACES) {
      expect(inSpaces.some((handler) => handler.rel.startsWith(space)), space).toBe(true);
    }
    for (const handler of inSpaces.filter((h) => h.name !== "metadata")) {
      expect(handler.guards.length, handler.at).toBeGreaterThan(0);
      expect(outsiders(handler), handler.at).toEqual([]);
    }
  });

  it("lets a page or route that reads a price, an amount or an invoice admit another role only where it strips them", () => {
    const readers = files.filter((file) => isReader(file.rel)).map((file) => file.rel);
    expect(readers.length).toBeGreaterThan(30);
    const unclassified = readers.filter((rel) => {
      if (STOCK_MODULE.some((space) => rel.startsWith(space))) return false;
      if (rel in REDACTED_PER_ROLE || rel in JOURNAL_ONLY) return false;
      return handlersOf(rel).some(opensToOthers);
    });
    expect(unclassified).toEqual([]);
  });

  it("strips the figures in each page and route named, with the calls written there", () => {
    for (const [rel, calls] of Object.entries(REDACTED_PER_ROLE)) {
      const source = sourceOf(rel);
      // Still a page or route a role outside the billing opens — else it belongs to the billing spaces.
      expect(handlersOf(rel).some(opensToOthers), rel).toBe(true);
      for (const call of calls) expect(source, `${rel}: ${call}`).toContain(call);
      // Never a raw number, nor the notice built from one.
      expect(source, rel).not.toMatch(/number:\s*held(?:Invoice)?\.number/);
      expect(source, rel).not.toContain("billedAnalysesNotice(");
      // The invoice's label only in the journal's `billedOn`.
      for (const line of source.split("\n").filter((l) => l.includes("heldInvoiceLabel("))) {
        expect(line.trim(), rel).toMatch(/^billedOn: /);
      }
    }
  });

  it("names the invoice in the journal only, never in the answer, where it reads it for the journal", () => {
    for (const [rel, line] of Object.entries(JOURNAL_ONLY)) {
      const source = sourceOf(rel);
      expect(source, rel).toContain(line);
      const uses = source.split("\n").filter((l) => /\bheldInvoice\b/.test(l)).map((l) => l.trim());
      expect(uses, rel).toEqual(["const heldInvoice = held.get(id) ?? null;", line]);
    }
  });

  it("keeps the stock module's supplier invoices to the magasinier and the administrator, pending the owner's decision", () => {
    const stock = handlers.filter((handler) => STOCK_MODULE.some((space) => handler.rel.startsWith(space)) && handler.name !== "metadata");
    expect(stock.length).toBeGreaterThan(5);
    for (const handler of stock) {
      expect(handler.guards.length, handler.at).toBeGreaterThan(0);
      for (const roles of handler.guards) expect([...roles].sort(), handler.at).toEqual(["ADMIN", "MAGASINIER"]);
    }
  });

  it("keeps the counter's advance to the réception: the deposit form and the bon, nothing else", () => {
    // Who types it: the deposit (the counter) — admitted roles all see the advance.
    for (const handler of handlersOf("reception/nouveau-depot/page.tsx")) {
      for (const roles of handler.guards) for (const role of admitted(roles)) expect(ADVANCE_ROLES as readonly string[], role).toContain(role);
    }
    // Nowhere else is `Serie.advanceAmount` read but by the bon's route, which strips it per role.
    expect(files.filter((file) => /\badvanceAmount\b/.test(file.source)).map((file) => file.rel)).toEqual(["api/series/[id]/document/route.ts"]);
  });

  it("tells who pays for a client or a site (« client facturé de », « Facturé à ») to the billing roles only", () => {
    const routing = files.filter((file) => /\b(?:billedFor|billingClient):\s*(?:\{|LINK)/.test(file.source)).map((file) => file.rel);
    expect(routing).toEqual(
      expect.arrayContaining(["api/clients/route.ts", "api/clients/[id]/sites/route.ts", "api/clients/[id]/route.ts"])
    );
    for (const rel of routing) {
      const open = handlersOf(rel).filter(opensToOthers);
      if (open.length === 0) continue;
      const source = sourceOf(rel);
      expect(source, rel).toMatch(/(?:clientForRole|siteForRole)\(/);
    }
    const clients = sourceOf("api/clients/route.ts");
    expect(clients).toContain("clients.map((client) => clientForRole(client, session.role))");
    expect(clients).toMatch(/clientSearchRows\([^)]*\)\.map\(\(row\) =>\s*clientForRole\(row, session\.role\)/);
    expect(clients).toContain("clientForRole({ ...client, sites: sites.map(({ id, name }) => ({ id, name })) }, session.role)");
    const sites = sourceOf("api/clients/[id]/sites/route.ts");
    expect(sites).toContain("sites.map((site) => siteForRole(site, session.role))");
    expect(sites).toContain("NextResponse.json(siteForRole(site, session.role), { status: 201 })");
  });
});

/* ------------------------------------------------------------------------ *
 * The components that render an amount, and the pages that reach them.
 * ------------------------------------------------------------------------ */

const COMPONENT_FILES = [...walk(APP), ...walk(join(SRC, "components")), ...walk(join(SRC, "lib"))].filter(
  (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.ts$/.test(path)
);
const sources = new Map(COMPONENT_FILES.map((path) => [posix(relative(SRC, path)), readFileSync(path, "utf8")]));

/** The project file an import names, relative to src, or null (a package). */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = posix(relative(SRC, resolve(join(SRC, dirname(from)), spec)));
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (sources.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Generic pieces a money module also exports, taken alone by other screens:
 * code, never a figure (the admin's and the families' dialogs borrow the
 * invoice dialogs' frame; the dashboards' views — `lib/management-views.ts`,
 * whose EIL views the qualité reads — build the invoice list's link, a URL).
 */
const NEUTRAL_EXPORTS: Record<string, string[]> = {
  "components/invoices/InvoiceDialogs.tsx": ["Dialog", "sendJson"],
  "components/invoices/invoice-view.ts": ["invoiceListHref"],
};

/** The runtime names an import clause takes; empty for a type-only import (no code travels). */
function runtimeNames(clause: string): string[] {
  if (/^type\s/.test(clause)) return [];
  const named = clause.match(/\{([^}]*)\}/);
  const names = named
    ? named[1]
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("type "))
        .map((part) => part.split(/\s+as\s+/)[0])
    : [];
  // A default or namespace import takes the whole module.
  const rest = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
  return rest ? [...names, "*"] : names;
}

/** Who imports each file (one hop), at runtime. */
const importers = new Map<string, Set<string>>();
for (const [file, source] of sources) {
  const edges = [
    ...[...source.matchAll(/import\s+([^'";]*?)\s+from\s+["']([^"']+)["']/g)].map((m) => ({ spec: m[2], names: runtimeNames(m[1]) })),
    ...[...source.matchAll(/export\s+([^'";]*?)\s+from\s+["']([^"']+)["']/g)].map((m) => ({ spec: m[2], names: runtimeNames(m[1]) })),
    ...[...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ spec: m[1], names: ["*"] })),
  ];
  for (const { spec, names } of edges) {
    const target = resolveImport(file, spec);
    if (!target || names.length === 0) continue;
    const neutral = NEUTRAL_EXPORTS[target];
    if (neutral && names.every((name) => neutral.includes(name))) continue;
    if (!importers.has(target)) importers.set(target, new Set());
    importers.get(target)!.add(file);
  }
}

/** The pages, layouts and routes that end up rendering or running a file. */
function entriesOf(file: string): string[] {
  const seen = new Set<string>([file]);
  const queue = [file];
  const entries = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (/^app\/.*(?:page\.tsx|layout\.tsx|route\.ts)$/.test(current)) entries.add(current.slice("app/".length));
    for (const next of importers.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...entries].sort();
}

/* ------------------------------------------------------------------------ *
 * The helpers of src/lib that read money, and who calls them.
 * ------------------------------------------------------------------------ */

/** The named runtime imports of a file, resolved: [target file, name]. */
function namedImports(file: string): [string, string][] {
  const source = sources.get(file) ?? "";
  return [...source.matchAll(/import\s+([^'";]*?)\s+from\s+["']([^"']+)["']/g)].flatMap((m) => {
    const target = resolveImport(file, m[2]);
    return target ? runtimeNames(m[1]).map((name): [string, string] => [target, name]) : [];
  });
}

/** Code without its comments: a doc comment naming `advanceAmount` reads nothing. */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/**
 * The rule's own helpers (`price-access.ts`): they strip the figures, they
 * read none — calling `clientForRole` is the redaction, not a read.
 */
const RULE_HELPERS = "lib/price-access.ts";

/**
 * The helpers of src/lib that read or compute a price, an amount or an
 * invoice: per file, the top-level declarations whose code matches `MONEY`,
 * or uses such a declaration of the same file or such a helper of another
 * (to a fixed point); the exported ones. A page or route calling one reads
 * money as surely as one writing `prisma.invoice` itself — the
 * « readers » test above counts it.
 */
const moneyHelpers = (() => {
  const blocks = new Map<string, { name: string; exported: boolean; body: string }[]>();
  for (const [file, source] of sources) {
    if (!file.startsWith("lib/") || file === RULE_HELPERS) continue;
    // Every top-level declaration starts a block — a type too, so a type's fields never lengthen the function before it.
    const starts = [
      ...source.matchAll(/^(export\s+)?(?:declare\s+)?(?:async\s+)?(function\*?\s+|const\s+|let\s+|class\s+|enum\s+|type\s+|interface\s+)([A-Za-z_$][\w$]*)/gm),
    ];
    blocks.set(
      file,
      starts
        .map((m, i) => ({
          name: m[3],
          exported: Boolean(m[1]),
          // A type carries no code: it reads nothing.
          code: !/^(type|interface)\s/.test(m[2]),
          body: withoutComments(source.slice(m.index, starts[i + 1]?.index ?? source.length)),
        }))
        .filter((block) => block.code)
    );
  }
  const money = new Map<string, Set<string>>();
  const isMoney = (file: string, name: string) => money.get(file)?.has(name) ?? false;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [file, list] of blocks) {
      const imported = namedImports(file).filter(([target, name]) => isMoney(target, name)).map(([, name]) => name);
      const local = list.filter((block) => isMoney(file, block.name)).map((block) => block.name);
      const used = [...imported, ...local];
      for (const block of list) {
        if (isMoney(file, block.name)) continue;
        const reads = MONEY.test(block.body) || used.some((name) => name !== block.name && new RegExp(`\\b${name}\\b`).test(block.body));
        if (!reads) continue;
        if (!money.has(file)) money.set(file, new Set());
        money.get(file)!.add(block.name);
        changed = true;
      }
    }
  }
  // Only what leaves the file.
  const exported = new Map<string, Set<string>>();
  for (const [file, names] of money) {
    const out = (blocks.get(file) ?? []).filter((block) => block.exported && names.has(block.name)).map((block) => block.name);
    if (out.length > 0) exported.set(file, new Set(out));
  }
  return exported;
})();

/** The money helpers of src/lib a file (relative to src) imports, as « file:name ». */
const libMoneyImports = (file: string): string[] =>
  namedImports(file)
    .filter(([target, name]) => moneyHelpers.get(target)?.has(name))
    .map(([target, name]) => `${target}:${name}`);

describe("the helpers of src/lib that read money — their callers count as readers", () => {
  it("finds them, comments aside", () => {
    const found = (file: string) => [...(moneyHelpers.get(file) ?? [])];
    expect(found("lib/billing-hold.ts")).toContain("heldInvoices");
    expect(found("lib/programme-referential.ts")).toContain("loadProgrammeReferential");
    expect(found("lib/invoice-math.ts")).toContain("computeInvoiceTotals");
    expect(found("lib/labels.ts")).toEqual(expect.arrayContaining(["formatCurrency", "INVOICE_STATUS_LABELS"]));
    expect(found("lib/serie-create.ts")).toContain("createSerie");
    // A label table that merely sits next to them is no reader.
    expect(found("lib/labels.ts")).not.toContain("SAMPLE_STATUS_LABELS");
    expect(moneyHelpers.has(RULE_HELPERS)).toBe(false);
  });

  it("a page or route reaching an amount only through a lib helper is a reader", () => {
    // POST /api/series writes the counter's advance through `createSerie`, never naming it.
    expect(MONEY.test(sourceOf("api/series/route.ts"))).toBe(false);
    expect(libMoneyImports("app/api/series/route.ts")).toContain("lib/serie-create.ts:createSerie");
    expect(isReader("api/series/route.ts")).toBe(true);
  });
});


/** What renders an amount on a screen. */
const RENDERS_MONEY = /formatCurrency\(|\bunitPrice\b|\badvanceAmount\b|_count\.invoices|billingFigures\(/;

/**
 * The components that render an amount yet are reached from a page another
 * role opens, with why each is safe there.
 */
const ALLOWED_REACH: Record<string, { pages: string[]; why: string }> = {
  // Section 7 behind `seesBilling(role)`; his referential carries no price (programme-sheet-logic.test.ts pins the gate).
  "components/programmation/ProgrammeSheet.tsx": { pages: ["programmation/[id]/page.tsx"], why: "section 7 gated" },
  "components/programmation/programme-sheet-logic.ts": { pages: ["programmation/[id]/page.tsx"], why: "billingLines, called behind the gate" },
  // The counter's advance, typed at the deposit (ADVANCE_ROLES, checked above).
  "components/reception/DepositForm.tsx": { pages: ["reception/nouveau-depot/page.tsx"], why: "the counter's advance" },
};

describe("the components that render an amount — reached from billing pages only", () => {
  // Rendering an amount itself, or through a helper of src/lib that reads or formats one (`moneyHelpers`).
  const money = [...sources]
    .filter(([file, source]) => file.startsWith("components/") && (RENDERS_MONEY.test(source) || libMoneyImports(file).length > 0))
    .map(([file]) => file);

  it("finds them, and the pages that reach them", () => {
    expect(money.length).toBeGreaterThan(10);
    expect(entriesOf("components/FacturesList.tsx")).toContain("comptabilite/factures/page.tsx");
  });

  it("are reached by no page or route another role opens, but the ones named with their reason", () => {
    const leaks: string[] = [];
    for (const component of money) {
      const allowed = ALLOWED_REACH[component]?.pages ?? [];
      for (const entry of entriesOf(component)) {
        if (STOCK_MODULE.some((space) => entry.startsWith(space)) || allowed.includes(entry)) continue;
        if (handlersOf(entry).some(opensToOthers)) leaks.push(`${component} ← ${entry}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("keeps each named reach to its page — a new page reaching it must be named on purpose", () => {
    for (const [component, { pages }] of Object.entries(ALLOWED_REACH)) {
      expect(money, component).toContain(component);
      const open = entriesOf(component).filter((entry) => handlersOf(entry).some(opensToOthers));
      expect(open, component).toEqual(pages);
    }
  });
});

describe("navigation: no menu of another role leads to an invoice or a price", () => {
  const BILLING_PATHS = /^\/(comptabilite|commercial|admin\/factures|admin\/catalogue|api\/invoices)(\/|$|\?|#)/;

  it("the billing roles keep their screens", () => {
    const hrefs = (role: Role) => navFor(role).flatMap((section) => section.items.flatMap((item) => (item.href ? [item.href] : [])));
    expect(hrefs("COMPTABLE")).toContain("/comptabilite/factures");
    expect(hrefs("GESTIONNAIRE")).toContain("/commercial");
  });

  it("every other staff role: no entry towards the comptabilité, the commercial, the invoices or the catalogue", () => {
    for (const role of LAB_ROLES.filter((r) => !(BILLING_ROLES as readonly string[]).includes(r))) {
      const hrefs = navFor(role).flatMap((section) => section.items.flatMap((item) => (item.href ? [item.href] : [])));
      expect(hrefs.length, role).toBeGreaterThan(0);
      expect(hrefs.filter((href) => BILLING_PATHS.test(href)), role).toEqual([]);
      // The stock module's supplier invoices: the magasinier's own menu, pending the owner's decision.
      const invoices = hrefs.filter((href) => /factur/i.test(href));
      expect(invoices, role).toEqual(role === "MAGASINIER" ? ["/magasin/factures"] : []);
    }
  });
});
