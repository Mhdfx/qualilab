import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import {
  CONCLUSION_MAX_LENGTH,
  RESEND_REPORT_ROLES,
  canEditConclusion,
  canResendReport,
  readConclusionEdit,
  resendOutcome,
} from "./report-actions";

/**
 * The manual (re)send of a report (finalversion.md:116) and the
 * administrator's silent conclusion edit (HANDOFF §8, 18/08). No route test
 * harness exists in this repository: the guards are read from the routes'
 * source, the way portal-guards.test.ts and compte-guard.test.ts do.
 */

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/** The role list of each requireRole / requireApiRole call of a file, in order. */
function guardedRoles(text: string): string[][] {
  return [...text.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((match) =>
    [...match[1].matchAll(/["']([A-Z_]+)["']/g)].map((role) => role[1])
  );
}

/** The body of one exported handler, up to the next export. */
function handler(text: string, method: string): string {
  const start = text.search(new RegExp(`export\\s+async\\s+function\\s+${method}\\b`));
  expect(start, method).toBeGreaterThanOrEqual(0);
  const next = text.slice(start + 1).search(/export\s+async\s+function\s+[A-Z]+\b/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

describe("« Renvoyer au client »", () => {
  it("is offered to the gestionnaire, the validator and the administrator on an approved report", () => {
    for (const role of ["GESTIONNAIRE", "VALIDATEUR", "ADMIN"]) {
      expect(canResendReport(role, "VALIDE", false), role).toBe(true);
      expect(canResendReport(role, "RAPPORT_ENVOYE", false), role).toBe(true);
    }
  });

  it("is refused to every other role", () => {
    for (const role of ROLES.filter((r) => !(RESEND_REPORT_ROLES as readonly string[]).includes(r))) {
      expect(canResendReport(role, "RAPPORT_ENVOYE", false), role).toBe(false);
    }
    expect(canResendReport("COMPTABLE", "VALIDE", false)).toBe(false);
  });

  it("waits for both signatures and is hidden while an amendment is pending", () => {
    for (const status of ["PRELEVE", "RECU", "EN_ANALYSE", "RESULTATS_SAISIS", "ANNULE"] as const) {
      expect(canResendReport("ADMIN", status, false), status).toBe(false);
    }
    expect(canResendReport("GESTIONNAIRE", "RAPPORT_ENVOYE", true)).toBe(false);
  });

  it("matches the guard of POST /api/samples/[id]/report/send (GESTIONNAIRE 200, COMPTABLE 403)", () => {
    const calls = guardedRoles(source("../app/api/samples/[id]/report/send/route.ts"));
    expect(calls).toHaveLength(1);
    expect([...calls[0]].sort()).toEqual([...RESEND_REPORT_ROLES].sort());
    expect(calls[0]).not.toContain("COMPTABLE");
  });
});

describe("resendOutcome", () => {
  it("reads a real send", () => {
    const outcome = resendOutcome({ ok: true, status: "ENVOYE", to: ["qualite@example.test", "direction@example.test"], alerts: 0 });
    expect(outcome.simulated).toBe(false);
    expect(outcome.headline).toBe("Rapport envoyé au client.");
    expect(outcome.recipients).toEqual(["qualite@example.test", "direction@example.test"]);
    expect(outcome.alerts).toBeNull();
    expect(outcome.alertsError).toBeNull();
  });

  it("says plainly that a simulated send did not leave the laboratory", () => {
    const outcome = resendOutcome({ ok: true, status: "SIMULE", to: ["qualite@example.test"], alerts: 2 });
    expect(outcome.simulated).toBe(true);
    expect(outcome.headline).toMatch(/simulé/);
    expect(outcome.headline).toMatch(/n'a pas quitté le laboratoire/);
    expect(outcome.alerts).toBe("2 alertes de contamination enregistrées avec le rapport.");
  });

  it("counts the alerts that rode along, singular and plural", () => {
    expect(resendOutcome({ status: "ENVOYE", to: [], alerts: 1 }).alerts).toBe("1 alerte de contamination envoyée avec le rapport.");
    expect(resendOutcome({ status: "ENVOYE", to: [], alerts: 3 }).alerts).toBe("3 alertes de contamination envoyées avec le rapport.");
  });

  it("keeps the alerts' failure next to a report that did leave", () => {
    const outcome = resendOutcome({ status: "ENVOYE", to: ["a@example.test"], alerts: 0, alertsError: " Envoi des alertes impossible. " });
    expect(outcome.headline).toBe("Rapport envoyé au client.");
    expect(outcome.alertsError).toBe("Envoi des alertes impossible.");
  });

  it("never invents what the answer does not carry", () => {
    const outcome = resendOutcome(null);
    expect(outcome.recipients).toEqual([]);
    expect(outcome.alerts).toBeNull();
    expect(outcome.alertsError).toBeNull();
    expect(resendOutcome({ to: ["a@example.test", 4, null], alerts: -1 }).recipients).toEqual(["a@example.test"]);
    expect(resendOutcome({ alerts: 1.5 }).alerts).toBeNull();
  });
});

describe("« Modifier la conclusion » (silent administrator edit)", () => {
  it("is the administrator's only, and hidden while an amendment is pending", () => {
    expect(canEditConclusion("ADMIN", false)).toBe(true);
    expect(canEditConclusion("ADMIN", true)).toBe(false);
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      expect(canEditConclusion(role, false), role).toBe(false);
    }
  });

  it("accepts a trimmed, non-empty text", () => {
    expect(readConclusionEdit({ conclusion: "  Échantillon satisfaisant.  " }, false)).toEqual({
      ok: true,
      conclusion: "Échantillon satisfaisant.",
    });
  });

  it("refuses an empty or missing conclusion (400)", () => {
    for (const body of [{ conclusion: "   " }, { conclusion: 12 }, {}, null, "texte"]) {
      const edit = readConclusionEdit(body, false);
      expect(edit.ok, JSON.stringify(body)).toBe(false);
      if (!edit.ok) expect(edit.status).toBe(400);
    }
  });

  it(`caps the text at ${CONCLUSION_MAX_LENGTH} characters (400 above)`, () => {
    expect(readConclusionEdit({ conclusion: "a".repeat(CONCLUSION_MAX_LENGTH) }, false).ok).toBe(true);
    // Trimmed first: surrounding spaces never push a text over the cap.
    expect(readConclusionEdit({ conclusion: ` ${"a".repeat(CONCLUSION_MAX_LENGTH)} ` }, false).ok).toBe(true);
    const over = readConclusionEdit({ conclusion: "a".repeat(CONCLUSION_MAX_LENGTH + 1) }, false);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.status).toBe(400);
      expect(over.error).toMatch(/2\s000 caractères/u);
    }
  });

  it("refuses an edit while an amendment is pending (409), whatever the text", () => {
    const edit = readConclusionEdit({ conclusion: "Texte correct." }, true);
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.status).toBe(409);
  });

  describe("PATCH/GET /api/reports/[id]/admin-edit", () => {
    const route = source("../app/api/reports/[id]/admin-edit/route.ts");

    it("admits ADMIN only on every handler (VALIDATEUR gets 403)", () => {
      for (const method of ["GET", "PATCH"]) {
        const calls = guardedRoles(handler(route, method));
        expect(calls, method).toEqual([["ADMIN"]]);
      }
    });

    it("writes no audit row, as the laboratory decided (18/08)", () => {
      // Comments may explain why; the code must not call the journal.
      const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/logAudit|auditLog/);
    });

    it("validates the body through readConclusionEdit (cap and amendment refusal)", () => {
      expect(handler(route, "PATCH")).toMatch(/readConclusionEdit\(/);
    });
  });
});
