import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LAB_ROLES, ROLE_HOME, roleAllowed } from "./roles";
import { FICHE_CORRECTION_ROLES, verbsFor } from "./sample-verbs";
import { CORRECTABLE_STATUSES } from "./sample-status";
import { PROTOCOL_PHOTO_ROLES, canSeeProtocolPhoto } from "./protocol-photo-access";
import { canEditConclusion, canReadReports, canResendReport } from "./report-actions";
import { canReopen, reopenRefusal } from "./report-amendment";
import { releaseRefusal } from "./release-rules";
import { IDLE_TIMEOUT_MS, idleTimeoutFor } from "./idle-policy";
import type { SampleStatus } from "@/generated/prisma/enums";

/**
 * The Direction role (answer of 12/10: « Validation administrative :
 * Directeur et son suppléant »). It holds every right of the validateur —
 * technical validation, send-back, reports, /recherche, the quality system —
 * plus the administrative validation, and none of the administrator's
 * system powers. There is no proxy: every page and route carries its own
 * guard, so this test reads them all (like portal-guards.test.ts) and fails
 * as soon as the Direction is let in, or left out, where it should not be.
 */

const APP = fileURLToPath(new URL("../app", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(APP)
  .filter((path) => /(^|[\\/])(route\.ts|page\.tsx|layout\.tsx)$/.test(path))
  .map((path) => ({ rel: relative(APP, path).split(sep).join("/"), source: readFileSync(path, "utf8") }));

type Guard = {
  /** « api/samples/[id]/validation/route.ts POST », « validation/page.tsx page ». */
  at: string;
  roles: string[];
};

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

/** Every guard of the application, with the handler (or page part) it sits in. */
const guards: Guard[] = files.flatMap((file) => {
  const starts = [...file.source.matchAll(HANDLER)].map((match) => ({
    index: match.index,
    name: match[1] === "generateMetadata" ? "metadata" : (match[1] ?? (file.rel.endsWith("layout.tsx") ? "layout" : "page")),
  }));
  const where = (index: number) => [...starts].reverse().find((start) => start.index <= index)?.name ?? "module";
  const calls = [
    ...file.source.matchAll(/require(?:Api)?Role\(([^)]*)\)/g),
    // A page's metadata decides with the same list as its guard.
    ...file.source.matchAll(/roleAllowed\(session\.role,\s*\[([^\]]*)\]\)/g),
  ];
  return calls.map((match) => ({ at: `${file.rel} ${where(match.index)}`, roles: rolesOf(match[1], file.source) }));
});

const admits = (role: string) => guards.filter((guard) => guard.roles.includes(role)).map((guard) => guard.at);

/**
 * Every place the Direction is admitted — the validateur's own places. The
 * list is written out so that a change of the Direction's reach shows in a
 * review: the laboratory's answer of 12/10 is what it encodes.
 */
const DIRECTION_ADMITTED = [
  // Its space: the two steps of the validation, and the search.
  "validation/layout.tsx layout",
  "validation/page.tsx page",
  "validation/[id]/page.tsx metadata",
  "validation/[id]/page.tsx page",
  "api/samples/[id]/validation/route.ts POST",
  "recherche/layout.tsx layout",
  "recherche/page.tsx page",
  "api/samples/route.ts GET",
  "api/samples/stats/route.ts GET",
  "api/samples/export/route.ts GET",
  // The report: read, duplicata, versions, (re)send.
  "api/samples/[id]/report/route.ts GET",
  "api/samples/[id]/report/versions/route.ts GET",
  "api/samples/[id]/report/send/route.ts POST",
  // « Corriger la fiche » on the validation page, and what its dialog reads.
  "api/samples/[id]/intake/route.ts PATCH",
  "api/clients/route.ts GET",
  "api/natures/route.ts GET",
  "api/parameters/route.ts GET",
  "api/product-types/route.ts GET",
  "api/product-types/[id]/route.ts GET",
  "api/profiles/route.ts GET",
  "api/norms/route.ts GET",
  "api/regulations/route.ts GET",
  // The série behind a sample: its header, protocol / bon, labels, signed protocol, bench sheet.
  "api/series/route.ts GET",
  "api/series/[id]/route.ts GET",
  "api/series/[id]/document/route.ts GET",
  "api/series/[id]/labels/route.ts GET",
  "api/series/[id]/protocol-photo/route.ts GET",
  "api/bench-sheet/route.ts GET",
  // The quality system, the validateur's domain.
  "qualite/layout.tsx layout",
  "qualite/page.tsx page",
  "qualite/metrologie/page.tsx page",
  "qualite/temperatures/page.tsx page",
  "qualite/eil/page.tsx page",
  "api/equipments/route.ts GET",
  "api/equipments/route.ts POST",
  "api/equipments/[id]/route.ts PATCH",
  "api/equipments/[id]/calibrations/route.ts GET",
  "api/equipments/[id]/calibrations/route.ts POST",
  "api/eil/route.ts GET",
  "api/eil/route.ts POST",
  "api/eil/[id]/route.ts PATCH",
  "api/temperatures/route.ts GET",
  "api/temperatures/route.ts POST",
  // « Mon compte », every laboratory role.
  "compte/layout.tsx layout",
  "compte/page.tsx page",
  "api/compte/mot-de-passe/route.ts POST",
];

/** Handlers that stay the administrator's alone — the system powers the Direction does not get. */
const ADMIN_ONLY = [
  // Users, settings, company, documents, catalogue, imports, journal, e-mail log.
  "admin/layout.tsx layout",
  "admin/utilisateurs/page.tsx page",
  "admin/reglages/page.tsx page",
  "admin/entreprise/page.tsx page",
  "admin/documents/page.tsx page",
  "admin/catalogue/page.tsx page",
  "admin/import/page.tsx page",
  "admin/journal/page.tsx page",
  "admin/envois/page.tsx page",
  "admin/factures/page.tsx page",
  "api/admin/users/route.ts GET",
  "api/admin/users/route.ts POST",
  "api/admin/users/[id]/route.ts PATCH",
  "api/admin/lab-settings/route.ts PUT",
  "api/admin/company/route.ts PUT",
  "api/admin/documents/route.ts PUT",
  "api/admin/counters/route.ts PUT",
  "api/admin/import/criteres/route.ts POST",
  "api/admin/import/legacy/route.ts POST",
  "api/admin/import/clients/route.ts POST",
  // Catalogue writes.
  "api/parameters/route.ts POST",
  "api/product-types/route.ts POST",
  "api/profiles/route.ts POST",
  "api/norms/route.ts POST",
  "api/regulations/route.ts POST",
  // Merges, the silent conclusion edit, reopening for amendment, reactivation.
  "api/clients/[id]/merge/route.ts POST",
  "api/clients/[id]/attach-as-site/route.ts POST",
  "api/reports/[id]/admin-edit/route.ts GET",
  "api/reports/[id]/admin-edit/route.ts PATCH",
  "api/samples/[id]/reopen/route.ts POST",
  "api/samples/[id]/reactivate/route.ts POST",
];

/** Spaces the Direction never enters (none of them admits the validateur either). */
const CLOSED_SPACES = [
  "admin/",
  "api/admin/",
  "api/reports/",
  "api/invoices/",
  "comptabilite/",
  "commercial/",
  "magasin/",
  "api/stock/",
  "api/suppliers/",
  "api/purchase-invoices/",
  "reception/",
  "programmation/",
  "api/programmation/",
  "technicien/",
  "preleveur/",
  "portail/",
  "api/portail/",
];

describe("the Direction's guards (12/10) — read from every page and route", () => {
  it("finds the application's guards", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(guards.length).toBeGreaterThan(150);
  });

  it("admits the Direction exactly where the validateur is admitted, and nowhere else", () => {
    const mismatched = guards
      .filter((guard) => guard.roles.includes("VALIDATEUR") !== guard.roles.includes("DIRECTION"))
      .map((guard) => `${guard.at}: (${guard.roles.join(", ")})`);
    expect(mismatched).toEqual([]);
  });

  it("admits the Direction at exactly the places the laboratory's answer gives it", () => {
    expect([...new Set(admits("DIRECTION"))].sort()).toEqual([...DIRECTION_ADMITTED].sort());
  });

  it("keeps every system power the administrator's alone", () => {
    for (const at of ADMIN_ONLY) {
      const found = guards.filter((guard) => guard.at === at);
      expect(found.length, at).toBeGreaterThan(0);
      for (const guard of found) expect(guard.roles, at).toEqual(["ADMIN"]);
    }
  });

  it("never opens the administration, billing, commercial, stock, reception, programme, bench or portal spaces", () => {
    const leaks = guards
      .filter((guard) => CLOSED_SPACES.some((space) => guard.at.startsWith(space)))
      .filter((guard) => guard.roles.includes("DIRECTION"))
      .map((guard) => guard.at);
    expect(leaks).toEqual([]);
  });

  it("refuses the hold release, the cancellation, the programme, the bench take and the results to the Direction", () => {
    for (const route of [
      "api/samples/[id]/release/route.ts",
      "api/samples/[id]/take/route.ts",
      "api/samples/[id]/cancel/route.ts",
      "api/samples/[id]/programme/route.ts",
      "api/samples/[id]/results/route.ts",
      "api/samples/[id]/results/submit/route.ts",
      "api/series/[id]/reception/route.ts",
    ]) {
      const found = guards.filter((guard) => guard.at.startsWith(`${route} `));
      expect(found.length, route).toBeGreaterThan(0);
      for (const guard of found) expect(guard.roles, guard.at).not.toContain("DIRECTION");
    }
  });
});

describe("the approval route lets the Direction sign step 2 — under the same rules", () => {
  const route = readFileSync(fileURLToPath(new URL("../app/api/samples/[id]/validation/route.ts", import.meta.url)), "utf8");

  it("decides the approval with canApprove and the signer's own id (two different people)", () => {
    expect(route).toMatch(/canApprove\(sample, session\.role, session\.id\)/);
  });

  it("answers 409 to a signatory of step 2 the state refuses, 403 to any other role", () => {
    expect(route).toMatch(/status: signsAdministratively\(session\.role\) \? 409 : 403/);
    expect(route).not.toMatch(/session\.role === "ADMIN"/);
  });

  it("keeps the race guard on the technical signature checked at approval", () => {
    expect(route).toMatch(/validatedById: sample\.validatedById/);
  });
});

describe("Better Auth never makes the Direction an administrator (auth-server.ts)", () => {
  it("keeps the admin plugin's role list to ADMIN", () => {
    const source = readFileSync(fileURLToPath(new URL("./auth-server.ts", import.meta.url)), "utf8");
    expect(source).toMatch(/adminRoles:\s*\["ADMIN"\]/);
  });
});

describe("the decisions behind the screens, for the Direction", () => {
  const guardOf = (rel: string) => guards.filter((guard) => guard.at.startsWith(`${rel} `));

  it("« Corriger la fiche »: offered until the approval, like the validateur — the intake guard agrees", () => {
    for (const status of CORRECTABLE_STATUSES) expect(verbsFor({ status }, "DIRECTION").correct, status).toBe(true);
    for (const status of ["VALIDE", "RAPPORT_ENVOYE", "ANNULE"] as SampleStatus[]) {
      expect(verbsFor({ status }, "DIRECTION").correct, status).toBe(false);
    }
    const [intake] = guardOf("api/samples/[id]/intake/route.ts");
    expect([...intake.roles].sort()).toEqual([...FICHE_CORRECTION_ROLES].sort());
  });

  it("never cancels nor reactivates a sample", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS", "ANNULE"] as SampleStatus[]) {
      const verbs = verbsFor({ status }, "DIRECTION");
      expect(verbs.cancel, status).toBe(false);
      expect(verbs.reactivate, status).toBe(false);
    }
  });

  it("reads, duplicates and resends reports, but neither edits a conclusion nor reopens one", () => {
    expect(canReadReports("DIRECTION")).toBe(true);
    expect(canResendReport("DIRECTION", "VALIDE", false)).toBe(true);
    expect(canResendReport("DIRECTION", "RAPPORT_ENVOYE", false)).toBe(true);
    expect(canResendReport("DIRECTION", "RAPPORT_ENVOYE", true)).toBe(false);
    expect(canEditConclusion("DIRECTION", false)).toBe(false);
    expect(canReopen("VALIDE", "DIRECTION")).toBe(false);
    expect(canReopen("RAPPORT_ENVOYE", "DIRECTION")).toBe(false);
    expect(reopenRefusal({ status: "VALIDE", role: "DIRECTION", reason: "erreur de lot" })).toBe(
      "Seul l'administrateur peut rouvrir un rapport pour amendement."
    );
  });

  it("sees the signed protocol, like the validateur — the photo route's guard agrees", () => {
    expect(canSeeProtocolPhoto("DIRECTION")).toBe(true);
    const [photo] = guardOf("api/series/[id]/protocol-photo/route.ts");
    expect(photo.roles).toEqual([...PROTOCOL_PHOTO_ROLES]);
  });

  it("does not release a sample held at reception (403)", () => {
    const held = { status: "RECU" as const, analysisBlocked: true, awaitingClientSince: new Date("2026-10-12T09:00:00.000Z") };
    expect(releaseRefusal("DIRECTION", held)?.status).toBe(403);
  });

  it("is signed out after 30 minutes without activity, lands on /validation, and is a laboratory account", () => {
    expect(idleTimeoutFor("DIRECTION")).toBe(IDLE_TIMEOUT_MS);
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(ROLE_HOME.DIRECTION).toBe("/validation");
    expect(LAB_ROLES).toContain("DIRECTION");
    expect(roleAllowed("DIRECTION", ["ADMIN"])).toBe(false);
    expect(roleAllowed("DIRECTION", ["VALIDATEUR", "DIRECTION", "ADMIN"])).toBe(true);
  });
});
