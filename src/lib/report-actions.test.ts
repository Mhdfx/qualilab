import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import {
  CONCLUSION_MAX_LENGTH,
  REPORT_READ_ROLES,
  RESEND_REPORT_ROLES,
  approvalDispatch,
  canEditConclusion,
  canReadReports,
  canResendReport,
  readConclusionEdit,
  reportVersionSent,
  resendOutcome,
  validationBody,
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
  it("is offered to the gestionnaire, the validator, the Direction and the administrator on an approved report", () => {
    expect([...RESEND_REPORT_ROLES]).toEqual(["GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN"]);
    for (const role of ["GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN"]) {
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

describe("approvalDispatch — no automatic send (16/10, Q92)", () => {
  it("« Valider »: without `send`, or `send: false`, the report stays at the laboratory", () => {
    for (const body of [{ action: "approve" }, { action: "approve", send: false }, {}, null, undefined]) {
      expect(approvalDispatch(body), JSON.stringify(body)).toEqual({ ok: true, sendReport: false, sendAlerts: true });
    }
  });

  it("« Valider et envoyer »: `send: true` sends the report", () => {
    expect(approvalDispatch({ action: "approve", send: true })).toEqual({ ok: true, sendReport: true, sendAlerts: true });
  });

  it("runs the contamination alerts whatever `send` says (they never wait for the report)", () => {
    for (const send of [true, false, undefined]) {
      const plan = approvalDispatch({ send });
      expect(plan.ok && plan.sendAlerts, String(send)).toBe(true);
    }
  });

  it("refuses anything but a boolean rather than guessing (400)", () => {
    for (const send of ["true", "false", 1, 0, null, {}, []]) {
      const plan = approvalDispatch({ action: "approve", send });
      expect(plan.ok, JSON.stringify(send)).toBe(false);
      if (!plan.ok) expect(plan.error).toMatch(/send/);
    }
  });

  describe("POST /api/samples/[id]/validation, action « approve »", () => {
    const route = source("../app/api/samples/[id]/validation/route.ts");
    const approveRoute = route.slice(route.indexOf('if (action === "approve")'), route.indexOf('if (action === "reject")'));
    // The approval itself lives in validation-server.ts (re-ask 2.16, plan
    // D4), shared with « toute la série »: `approveSample`.
    const server = source("./validation-server.ts");
    const approve = server.slice(server.indexOf("export async function approveSample("), server.indexOf("export type ReportSendOutcome"));

    it("reads `send` through approvalDispatch, before the approval is written", () => {
      expect(approveRoute).toMatch(/const plan = approvalDispatch\(body\)/);
      expect(approveRoute.indexOf("approvalDispatch(body)")).toBeLessThan(approveRoute.indexOf("approveSample("));
      expect(approve).toMatch(/prisma\.sample\.updateMany/);
      // The série's approval reads it the same way, once for all its samples.
      const serie = source("../app/api/series/[id]/validation/route.ts");
      expect(serie.indexOf("approvalDispatch(body)")).toBeGreaterThan(0);
      expect(serie.indexOf("approvalDispatch(body)")).toBeLessThan(serie.indexOf("runSerieValidation("));
    });

    it("sends the report only inside `if (plan.sendReport)`, the alerts outside it", () => {
      const gate = approve.indexOf("if (plan.sendReport) {");
      expect(gate).toBeGreaterThan(0);
      // The gated block: up to its closing brace.
      let depth = 0;
      let end = approve.indexOf("{", gate);
      for (; end < approve.length; end += 1) {
        if (approve[end] === "{") depth += 1;
        if (approve[end] === "}" && --depth === 0) break;
      }
      const gated = approve.slice(gate, end + 1);
      // `context`: the série's number when signed « toute la série » (re-ask 2.16).
      expect(gated).toMatch(/sendReport\(sample\.id, session\.id, context\)/);
      expect(gated).not.toMatch(/sendContaminationAlerts/);
      expect([...approve.matchAll(/\bsendReport\(/g)]).toHaveLength(1);
      expect(approve.slice(end)).toMatch(/sendContaminationAlerts\(sample\.id, session\.id, context\)/);
    });

    it("journals which of the two buttons was used", () => {
      expect(approve).toMatch(/send: plan\.sendReport/);
    });
  });
});

describe("validationBody — what the validation panel posts (16/10, Q92)", () => {
  it("« Valider et envoyer » carries send: true, « Valider » send: false — read by approvalDispatch as such", () => {
    const withSend = validationBody("approve", "  ", "reg-1", true);
    expect(withSend).toEqual({ action: "approve", reason: "", regulationId: "reg-1", send: true });
    expect(approvalDispatch(withSend)).toEqual({ ok: true, sendReport: true, sendAlerts: true });
    const without = validationBody("approve", "", "", false);
    expect(without).toEqual({ action: "approve", reason: "", regulationId: undefined, send: false });
    expect(approvalDispatch(without)).toEqual({ ok: true, sendReport: false, sendAlerts: true });
  });

  it("never carries `send` on a technical validation or a send-back", () => {
    expect(validationBody("validate", "", "", true)).not.toHaveProperty("send");
    expect(validationBody("reject", "  refaire  ", "", true)).toEqual({ action: "reject", reason: "refaire", regulationId: undefined });
  });

  it("is what the panel posts, and « Valider et envoyer » asks for the send", () => {
    const panel = source("../components/validation/ValidationPanel.tsx");
    expect(panel).toMatch(/body: JSON\.stringify\(validationBody\(action, reason, regulationId, withSend\)\)/);
    const button = panel.slice(panel.indexOf('send("approve", true)'));
    expect(panel.indexOf('send("approve", true)')).toBeGreaterThan(0);
    expect(button.slice(0, button.indexOf("</SecondaryButton>"))).toMatch(/Valider et envoyer/);
  });
});

describe("reportVersionSent — « Envoyer » or « Renvoyer au client »", () => {
  const issued = new Date("2026-10-19T09:00:00.000Z");
  const before = new Date("2026-10-12T15:00:00.000Z");
  const after = new Date("2026-10-19T09:05:00.000Z");

  it("an original report: sent once it has a send date", () => {
    expect(reportVersionSent({ sentAt: null, amendedAt: null })).toBe(false);
    expect(reportVersionSent({ sentAt: after, amendedAt: null })).toBe(true);
  });

  it("an amended « -A1 » never sent reads « Envoyer », even though the original was sent", () => {
    expect(reportVersionSent({ sentAt: before, amendedAt: issued })).toBe(false);
  });

  it("an amended version sent after its issue reads « Renvoyer »", () => {
    expect(reportVersionSent({ sentAt: after, amendedAt: issued })).toBe(true);
  });

  it("an amended version with no send at all reads « Envoyer »", () => {
    expect(reportVersionSent({ sentAt: null, amendedAt: issued })).toBe(false);
  });

  it("is what every page offering the send reads", () => {
    for (const page of ["../app/validation/[id]/page.tsx", "../app/recherche/page.tsx", "../app/commercial/[id]/page.tsx"]) {
      const text = source(page);
      expect(text, page).toMatch(/reportVersionSent\(/);
      expect(text, page).toMatch(/amendedAt: true/);
      expect(text, page).not.toMatch(/sent=\{[^}]*sentAt !== null\}/);
    }
  });
});

describe("reading an issued report (download, duplicata, versions)", () => {
  it("is open to the validation desks, the commercial side, the accountant and the admin", () => {
    expect([...REPORT_READ_ROLES]).toEqual(["VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "ADMIN"]);
    for (const role of ROLES) {
      expect(canReadReports(role), role).toBe((REPORT_READ_ROLES as readonly string[]).includes(role));
    }
    for (const role of ["PRELEVEUR", "RECEPTIONNISTE", "PROGRAMMATEUR", "TECHNICIEN", "MAGASINIER", "CLIENT"]) {
      expect(canReadReports(role), role).toBe(false);
    }
  });

  it("matches the guards of GET /api/samples/[id]/report and of its versions", () => {
    for (const route of ["../app/api/samples/[id]/report/route.ts", "../app/api/samples/[id]/report/versions/route.ts"]) {
      const calls = guardedRoles(handler(source(route), "GET"));
      expect(calls, route).toHaveLength(1);
      expect([...calls[0]].sort(), route).toEqual([...REPORT_READ_ROLES].sort());
    }
  });

  it("is what /recherche asks before offering the report actions", () => {
    const page = source("../app/recherche/page.tsx");
    expect(page).toMatch(/const canReport = canReadReports\(session\.role\)/);
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
