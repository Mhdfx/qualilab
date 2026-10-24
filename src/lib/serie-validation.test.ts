import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SampleStatus } from "@/generated/prisma/enums";
import { ROLES, type Role } from "./roles";
import { SERIES_VALIDATION } from "./lab-proposals";
import { approvalState, validationControls } from "./sample-status";
import { sampleTimeline, type TimelineSample } from "./sample-timeline";
import {
  PDF_RENDER_WORST_S,
  PROXY_READ_TIMEOUT_S,
  SERIE_BATCH_CHUNK,
  SERIE_BATCH_MAX,
  SERIE_BATCH_MIN,
  SERIE_BATCH_UNCERTAIN,
  SERIE_SEND_CHUNK,
  alertsLeaveAt,
  readSerieBatchReply,
  readSerieSendRequest,
  readSerieValidationAction,
  readSerieValidationRequest,
  serieActionRefusal,
  serieAlertNotice,
  serieBatchChunkSize,
  serieBatchChunks,
  serieBatchCounts,
  serieBatchStopped,
  serieBatchSummary,
  serieConclusion,
  serieLine,
  serieResultCounts,
  serieSendPlan,
  serieSendRefusal,
  serieStepRefusal,
  serieValidationPlan,
  serieViewActions,
  signatureDetail,
  type SerieSendCandidate,
  type SerieValidationCandidate,
} from "./serie-validation";

/**
 * « Toute la série » at the validation desk (re-ask 2.16 — Q92 « avoir les
 * deux options », plan D3 + D4): the plans the dialog shows, the requests
 * the routes read, and the proof that a série signs each sample through the
 * per-sample rules — never a rule of its own.
 */

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const VALID1 = { id: "u-valid1", role: "VALIDATEUR" as Role };
const DIR1 = { id: "u-dir1", role: "DIRECTION" as Role };
const ADMIN = { id: "u-admin", role: "ADMIN" as Role };
const REG = { id: "reg-1", title: "Règlement TEST" };
/** LabSettings.alertAfterTechnicalValidation, ON by default. */
const AT_TECHNICAL = { alertsAtTechnical: true };
const AT_APPROVAL = { alertsAtTechnical: false };

function candidate(overrides: Partial<SerieValidationCandidate> = {}): SerieValidationCandidate {
  return {
    id: "s1",
    code: "S-2026-0001-1M",
    controlCode: "C-0001",
    lineNumber: 1,
    designation: "Produit X 1",
    status: "RESULTATS_SAISIS",
    validatedById: null,
    amendmentPending: false,
    nonConformes: 0,
    anomalies: 0,
    alertables: 0,
    conclusion: "Satisfaisant",
    productTypeId: null,
    proposedRegulation: null,
    recordedRegulation: null,
    ...overrides,
  };
}

function sendCandidate(overrides: Partial<SerieSendCandidate> = {}): SerieSendCandidate {
  return {
    id: "s1",
    code: "S-2026-0001-1M",
    controlCode: "C-0001",
    lineNumber: 1,
    designation: "Produit X 1",
    status: "VALIDE",
    report: { number: "RAP-2026-00001", version: 0, sentAt: null, amendedAt: null, amendmentPending: false },
    ...overrides,
  };
}

describe("the switch (re-ask 2.16)", () => {
  it("is ON: the proposal the laboratory read", () => {
    expect(SERIES_VALIDATION).toBe(true);
  });

  it("closes the four série routes when off (404), before anything is read", () => {
    for (const route of [
      "../app/api/series/[id]/validation/route.ts",
      "../app/api/series/[id]/reports/route.ts",
      "../app/api/series/[id]/reports/send/route.ts",
    ]) {
      const text = source(route);
      const handlers = text.split(/export async function (?:GET|POST)\(/).slice(1);
      expect(handlers.length, route).toBeGreaterThan(0);
      for (const handler of handlers) {
        const off = handler.indexOf("if (!SERIES_VALIDATION)");
        expect(off, route).toBeGreaterThan(0);
        expect(off, route).toBeLessThan(handler.indexOf("await params"));
        expect(handler.slice(off, off + 200), route).toMatch(/status: 404/);
      }
    }
  });

  it("takes the série buttons off /validation and off the sample's page when off", () => {
    expect(source("../app/validation/page.tsx")).toMatch(/SERIES_VALIDATION \?/);
    expect(source("../app/validation/[id]/page.tsx")).toMatch(/SERIES_VALIDATION/);
  });
});

describe("serieActionRefusal — who may run each action at all (403 otherwise)", () => {
  it("the technical validation: the per-sample step 1 signatories", () => {
    for (const role of ROLES) {
      const allowed = ["VALIDATEUR", "DIRECTION", "ADMIN"].includes(role);
      expect(serieActionRefusal("validate", role) === null, role).toBe(allowed);
    }
  });

  it("the administrative validation: the Direction and the administrator only", () => {
    for (const role of ROLES) {
      expect(serieActionRefusal("approve", role) === null, role).toBe(role === "DIRECTION" || role === "ADMIN");
    }
  });

  it("the send: the roles of « Envoyer au client » (RESEND_REPORT_ROLES)", () => {
    for (const role of ROLES) {
      const allowed = ["GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN"].includes(role);
      expect(serieActionRefusal("send", role) === null, role).toBe(allowed);
    }
  });
});

describe("serieStepRefusal — the per-sample rules, applied to each sample", () => {
  it("sets aside a cancelled, an already validated and a not yet submitted sample, in plain words", () => {
    expect(serieStepRefusal(candidate({ status: "ANNULE" }), "validate", VALID1)).toBe("Échantillon annulé.");
    for (const status of ["VALIDE", "RAPPORT_ENVOYE"] as SampleStatus[]) {
      expect(serieStepRefusal(candidate({ status }), "approve", DIR1), status).toBe("Déjà validé.");
    }
    for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE"] as SampleStatus[]) {
      expect(serieStepRefusal(candidate({ status }), "validate", VALID1), status).toMatch(/^Résultats pas encore soumis \(« .+ »\)\.$/);
    }
  });

  it("step 1: eligible until signed; then « déjà enregistrée » (canValidateTechnically's words)", () => {
    expect(serieStepRefusal(candidate(), "validate", VALID1)).toBeNull();
    expect(serieStepRefusal(candidate({ validatedById: "u-x" }), "validate", VALID1)).toBe(
      "La validation technique est déjà enregistrée."
    );
  });

  it("step 2: needs step 1, and never the person who signed it (canApprove's words)", () => {
    expect(serieStepRefusal(candidate(), "approve", DIR1)).toBe(
      "La validation technique est requise avant la validation administrative."
    );
    expect(serieStepRefusal(candidate({ validatedById: VALID1.id }), "approve", DIR1)).toBeNull();
    expect(serieStepRefusal(candidate({ validatedById: DIR1.id }), "approve", DIR1)).toMatch(/deux signataires différents/);
    expect(serieStepRefusal(candidate({ validatedById: VALID1.id }), "approve", VALID1)).toMatch(/Seule la direction/);
  });

  it("leaves a pending amendment to its own page (its approval issues « -A1 »)", () => {
    for (const [action, validatedById] of [["validate", null], ["approve", VALID1.id]] as const) {
      expect(serieStepRefusal(candidate({ amendmentPending: true, validatedById }), action, DIR1)).toMatch(/^Amendement du rapport en cours/);
    }
  });

  it("agrees with the sample's own panel (validationControls) on every step, role and signer", () => {
    for (const role of ROLES) {
      for (const validatedById of [null, "u-other", "u-me"]) {
        const sample = candidate({ validatedById });
        const signer = { id: "u-me", role };
        const controls = validationControls(approvalState({ validatedById, approvedById: null }), role, { validatedById, userId: "u-me" });
        const serieValidates = !serieActionRefusal("validate", role) && serieStepRefusal(sample, "validate", signer) === null;
        const serieApproves = !serieActionRefusal("approve", role) && serieStepRefusal(sample, "approve", signer) === null;
        expect(serieValidates, `${role} ${validatedById}`).toBe(controls.validate);
        expect(serieApproves, `${role} ${validatedById}`).toBe(controls.approve);
      }
    }
  });
});

describe("serieValidationPlan — what the dialog lists", () => {
  it("keeps every sample, in the série's order: eligible ones and the others with their reason", () => {
    const plan = serieValidationPlan(
      [
        candidate({ id: "a", lineNumber: 1, code: "S-1-1M" }),
        candidate({ id: "b", lineNumber: 2, code: "S-1-2M", status: "EN_ANALYSE" }),
        candidate({ id: "c", lineNumber: 3, code: "S-1-3M", controlCode: null }),
      ],
      "validate",
      VALID1,
      AT_TECHNICAL
    );
    expect(plan.action).toBe("validate");
    expect(plan.eligible.map((line) => line.id)).toEqual(["a", "c"]);
    expect(plan.skipped).toEqual([
      { id: "b", reference: "C-0001", line: "2M", designation: "Produit X 1", reason: "Résultats pas encore soumis (« En analyse »)." },
    ]);
    // The blind reference: the control code, else the code.
    expect(plan.eligible[1].reference).toBe("S-1-3M");
  });

  it("records the regulation the sample's panel would preselect, shown in the dialog", () => {
    const plan = serieValidationPlan([candidate({ productTypeId: "pt-1", proposedRegulation: REG })], "validate", VALID1, AT_TECHNICAL);
    expect(plan.eligible[0]).toMatchObject({ regulationId: "reg-1", regulation: "Règlement TEST" });
  });

  it("sets aside a sample judged against criteria whose only regulation is archived: its panel asks for one too", () => {
    // `proposeRegulation` returns the sample's own when it is active: no
    // proposal with one recorded means it is archived — the panel shows
    // « Choisir… » and refuses to sign; the série never signs with it.
    const plan = serieValidationPlan(
      [candidate({ productTypeId: "pt-1", validatedById: VALID1.id, recordedRegulation: "Ancien règlement" })],
      "approve",
      DIR1,
      AT_TECHNICAL
    );
    expect(plan.eligible).toEqual([]);
    expect(plan.skipped[0].reason).toBe("Réglementation en vigueur à choisir : à valider depuis sa fiche.");
  });

  it("sets aside a sample judged against criteria with no regulation at all: chosen on its page", () => {
    const plan = serieValidationPlan([candidate({ productTypeId: "pt-1" })], "validate", VALID1, AT_TECHNICAL);
    expect(plan.eligible).toEqual([]);
    expect(plan.skipped[0].reason).toBe("Réglementation en vigueur à choisir : à valider depuis sa fiche.");
  });

  it("needs no regulation for a sample judged without criteria — and names the one it keeps, if any", () => {
    const plan = serieValidationPlan(
      [candidate({ id: "a", productTypeId: null }), candidate({ id: "b", productTypeId: null, recordedRegulation: "Ancien règlement" })],
      "validate",
      VALID1,
      AT_TECHNICAL
    );
    expect(plan.eligible[0]).toMatchObject({ regulationId: null, regulation: null });
    // Posted as null, `regulationFor` keeps the recorded one: said so, never « sans ».
    expect(plan.eligible[1]).toMatchObject({ regulationId: null, regulation: "Ancien règlement" });
  });

  it("carries what the sample's panel warns about: non-conform results, anomalies, alerts", () => {
    const plan = serieValidationPlan(
      [candidate({ nonConformes: 2, anomalies: 1, alertables: 1 })],
      "validate",
      VALID1,
      AT_TECHNICAL
    );
    expect(plan.alertsAtTechnical).toBe(true);
    expect(plan.eligible[0]).toMatchObject({ nonConformes: 2, anomalies: 1, alertables: 1, alertNow: true });
  });

  it("carries the conclusion each report will print — the sample's own page's, before the signature", () => {
    const plan = serieValidationPlan(
      [candidate({ id: "a", conclusion: "Non satisfaisant" }), candidate({ id: "b", conclusion: "Sans interprétation officielle (trop peu d'unités)" })],
      "validate",
      VALID1,
      AT_TECHNICAL
    );
    expect(plan.eligible.map((line) => line.conclusion)).toEqual(["Non satisfaisant", "Sans interprétation officielle (trop peu d'unités)"]);
  });

  it("alertNow: only on the signature that sends the alert (LabSettings.alertAfterTechnicalValidation)", () => {
    const alerting = candidate({ alertables: 1, validatedById: VALID1.id });
    const fresh = candidate({ alertables: 1 });
    expect(serieValidationPlan([fresh], "validate", VALID1, AT_TECHNICAL).eligible[0].alertNow).toBe(true);
    expect(serieValidationPlan([fresh], "validate", VALID1, AT_APPROVAL).eligible[0].alertNow).toBe(false);
    expect(serieValidationPlan([alerting], "approve", DIR1, AT_TECHNICAL).eligible[0].alertNow).toBe(false);
    expect(serieValidationPlan([alerting], "approve", DIR1, AT_APPROVAL).eligible[0].alertNow).toBe(true);
    // Nothing alertable: never, at either step.
    expect(serieValidationPlan([candidate({ nonConformes: 3 })], "validate", VALID1, AT_TECHNICAL).eligible[0].alertNow).toBe(false);
  });

  it("serieLine names « 2M » / « 2P » for the two samples of a two-family line", () => {
    expect(serieLine({ id: "x", code: "S-2026-0004-2P", controlCode: null, lineNumber: 2, designation: "—" }).line).toBe("2P");
    expect(serieLine({ id: "x", code: "S-2026-0004-3", controlCode: null, lineNumber: 3, designation: "—" }).line).toBe("3");
  });
});

describe("serieSendPlan — « Envoyer la série au client » (plan D3)", () => {
  it("sends each validated report not sent yet, under the number of its version in force", () => {
    const plan = serieSendPlan([
      sendCandidate({ id: "a" }),
      sendCandidate({ id: "b", report: { number: "RAP-2026-00002", version: 1, sentAt: null, amendedAt: new Date(), amendmentPending: false } }),
    ]);
    expect(plan.eligible.map((line) => [line.id, line.number])).toEqual([
      ["a", "RAP-2026-00001"],
      ["b", "RAP-2026-00002-A1"],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("sets aside what is not to send, each with its reason", () => {
    const sentAt = new Date("2026-10-20T10:00:00Z");
    expect(serieSendRefusal(sendCandidate({ status: "RAPPORT_ENVOYE" }))).toMatch(/^Rapport déjà envoyé/);
    expect(serieSendRefusal(sendCandidate({ status: "RESULTATS_SAISIS" }))).toBe("Pas encore validé (« Résultats saisis »).");
    expect(serieSendRefusal(sendCandidate({ status: "ANNULE" }))).toBe("Échantillon annulé.");
    expect(serieSendRefusal(sendCandidate({ report: null }))).toMatch(/^Rapport pas encore émis/);
    expect(
      serieSendRefusal(sendCandidate({ report: { number: "R", version: 0, sentAt: null, amendedAt: null, amendmentPending: true } }))
    ).toMatch(/^Amendement du rapport en cours/);
    expect(serieSendRefusal(sendCandidate({ report: { number: "R", version: 0, sentAt, amendedAt: null, amendmentPending: false } }))).toMatch(
      /déjà partie/
    );
    expect(serieSendRefusal(sendCandidate())).toBeNull();
  });
});

describe("serieBatchCounts — the série buttons of /validation", () => {
  const item = (serie: string, status: SampleStatus, validatedById: string | null, report: SerieSendCandidate["report"] = null) => ({
    status,
    validatedById,
    serie: { id: `id-${serie}`, serialNumber: serie },
    report,
  });

  it("counts per série what each action would take, for this signer", () => {
    const items = [
      item("S-1", "RESULTATS_SAISIS", null),
      item("S-1", "RESULTATS_SAISIS", null),
      item("S-1", "RESULTATS_SAISIS", VALID1.id),
      item("S-1", "RESULTATS_SAISIS", VALID1.id),
      item("S-1", "RESULTATS_SAISIS", DIR1.id),
      item("S-2", "RESULTATS_SAISIS", null),
    ];
    expect(serieBatchCounts(items, VALID1).get("S-1")).toEqual({ serieId: "id-S-1", validate: 2, approve: 0, send: 0 });
    // The Direction does not approve what it signed itself.
    expect(serieBatchCounts(items, DIR1).get("S-1")).toEqual({ serieId: "id-S-1", validate: 2, approve: 2, send: 0 });
    expect(serieBatchCounts(items, ADMIN).get("S-1")).toEqual({ serieId: "id-S-1", validate: 2, approve: 3, send: 0 });
  });

  it(`offers no button under ${SERIE_BATCH_MIN} samples: the sample's own panel does it`, () => {
    expect(serieBatchCounts([item("S-2", "RESULTATS_SAISIS", null)], VALID1).get("S-2")).toEqual({
      serieId: "id-S-2",
      validate: 0,
      approve: 0,
      send: 0,
    });
  });

  it("counts the reports to send by the send plan's own rule", () => {
    const report = { number: "R", version: 0, sentAt: null, amendedAt: null, amendmentPending: false };
    const items = [item("S-3", "VALIDE", "v", report), item("S-3", "VALIDE", "v", report), item("S-3", "VALIDE", "v", { ...report, amendmentPending: true })];
    expect(serieBatchCounts(items, VALID1).get("S-3")?.send).toBe(2);
    // A line read without its report's number is never counted as sendable.
    expect(serieBatchCounts([item("S-4", "VALIDE", "v"), item("S-4", "VALIDE", "v")], VALID1).get("S-4")?.send).toBe(0);
  });

  it("a view offers the actions of its own step only; the queue its two signatures", () => {
    const report = { number: "R", version: 0, sentAt: null, amendedAt: null, amendmentPending: false };
    const items = [
      item("S-5", "RESULTATS_SAISIS", null),
      item("S-5", "RESULTATS_SAISIS", null),
      item("S-5", "RESULTATS_SAISIS", VALID1.id),
      item("S-5", "RESULTATS_SAISIS", VALID1.id),
      item("S-5", "VALIDE", VALID1.id, report),
      item("S-5", "VALIDE", VALID1.id, report),
    ];
    const counts = (view: Parameters<typeof serieViewActions>[0]) => serieBatchCounts(items, DIR1, serieViewActions(view)).get("S-5");
    expect(counts(null)).toEqual({ serieId: "id-S-5", validate: 2, approve: 2, send: 0 });
    expect(counts("a_valider")).toEqual({ serieId: "id-S-5", validate: 2, approve: 0, send: 0 });
    expect(counts("attente_admin")).toEqual({ serieId: "id-S-5", validate: 0, approve: 2, send: 0 });
    expect(counts("a_envoyer")).toEqual({ serieId: "id-S-5", validate: 0, approve: 0, send: 2 });
    // The sample's own page has no view: all three.
    expect(serieBatchCounts(items, DIR1).get("S-5")).toEqual({ serieId: "id-S-5", validate: 2, approve: 2, send: 2 });
  });

  it("/validation counts each série over all its samples, never over the page shown (« à envoyer » is a page)", () => {
    const page = source("../app/validation/page.tsx");
    expect(page).toMatch(/const serieIds = \[\.\.\.new Set\(shown\.map\(\(item\) => item\.serie\.id\)\)\]/);
    expect(page).toMatch(/where: \{ serieId: \{ in: serieIds \}, status: \{ in: \["RESULTATS_SAISIS", TO_SEND_STATUS\] \} \}/);
    expect(page).toMatch(/serieBatchCounts\(serieRows, session, serieViewActions\(view\)\)/);
    expect(page).not.toMatch(/serieBatchCounts\(shown/);
  });

  it("the queue holds the série's buttons — and their dialog — in a block, never in phrasing content", () => {
    const queue = source("../components/validation/ValidationQueue.tsx");
    expect(queue).toMatch(/<div className="self-center sm:ml-auto">\s*<SerieBatchActions /);
    expect(queue).not.toMatch(/<span[^>]*>\s*<SerieBatchActions /);
  });
});

describe("the requests the routes read", () => {
  it("readSerieValidationAction: validate or approve, nothing else", () => {
    expect(readSerieValidationAction("validate")).toBe("validate");
    expect(readSerieValidationAction("approve")).toBe("approve");
    for (const raw of ["reject", "send", null, undefined, 1]) expect(readSerieValidationAction(raw)).toBeNull();
  });

  it("readSerieValidationRequest: the samples the dialog showed, each with its regulation", () => {
    expect(
      readSerieValidationRequest({ action: "approve", send: true, samples: [{ id: "a", regulationId: "r" }, { id: "b" }, { id: "c", regulationId: "" }] })
    ).toEqual({
      ok: true,
      value: { action: "approve", samples: [{ id: "a", regulationId: "r" }, { id: "b", regulationId: null }, { id: "c", regulationId: null }] },
    });
  });

  it("readSerieValidationRequest: refuses rather than guesses", () => {
    const bad = [
      null,
      { action: "reject", samples: [{ id: "a" }] },
      { action: "validate" },
      { action: "validate", samples: [] },
      { action: "validate", samples: [{ id: "" }] },
      { action: "validate", samples: [{ id: 3 }] },
      { action: "validate", samples: [{ id: "a" }, { id: "a" }] },
      { action: "validate", samples: [{ id: "a", regulationId: 4 }] },
      { action: "validate", samples: Array.from({ length: SERIE_BATCH_MAX + 1 }, (_, i) => ({ id: `s${i}` })) },
    ];
    for (const body of bad) expect(readSerieValidationRequest(body).ok, JSON.stringify(body)?.slice(0, 80)).toBe(false);
  });

  it("readSerieSendRequest: a non-empty list of distinct ids", () => {
    expect(readSerieSendRequest({ sampleIds: ["a", "b"] })).toEqual({ ok: true, sampleIds: ["a", "b"] });
    for (const body of [null, {}, { sampleIds: [] }, { sampleIds: ["a", "a"] }, { sampleIds: [""] }, { sampleIds: "a" }]) {
      expect(readSerieSendRequest(body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("what each line says once the action ran", () => {
  it("the technical validation, with the alerts that left with it", () => {
    expect(signatureDetail("validate", false, {})).toEqual({ detail: "Validation technique enregistrée." });
    expect(signatureDetail("validate", false, { dispatch: { alerts: 2 } }).detail).toBe(
      "Validation technique enregistrée. 2 alertes de contamination parties."
    );
    expect(signatureDetail("validate", false, { dispatch: { error: "Envoi des alertes impossible." } })).toEqual({
      detail: "Validation technique enregistrée.",
      warning: "Envoi des alertes impossible.",
    });
  });

  it("« Valider »: the report issued, to send", () => {
    expect(signatureDetail("approve", false, { report: { number: "RAP-1" } }).detail).toBe("Validé — rapport RAP-1 émis, à envoyer.");
  });

  it("« Valider et envoyer »: sent, simulated (never « envoyé » then), or not sent with the reason", () => {
    expect(signatureDetail("approve", true, { report: { number: "RAP-1" }, dispatch: { report: "ENVOYE" } }).detail).toBe(
      "Validé — rapport RAP-1 émis, envoyé au client."
    );
    expect(signatureDetail("approve", true, { report: { number: "RAP-1" }, dispatch: { report: "SIMULE" } }).detail).toMatch(
      /envoi simulé/
    );
    expect(signatureDetail("approve", true, { report: { number: "RAP-1" }, dispatch: { error: "Aucune adresse email enregistrée pour ce client." } })).toEqual({
      detail: "Validé — rapport RAP-1 émis, pas envoyé.",
      warning: "Aucune adresse email enregistrée pour ce client.",
    });
  });

  it("the send of the série", () => {
    expect(signatureDetail("send", true, { report: { number: "RAP-2" }, dispatch: { report: "ENVOYE", alerts: 1 } }).detail).toBe(
      "Rapport RAP-2 : envoyé au client. 1 alerte de contamination partie."
    );
  });

  it("a simulated send is flagged, and its alerts are « enregistrées », never « parties » (resendOutcome's words)", () => {
    const sent = signatureDetail("send", true, { report: { number: "RAP-2" }, dispatch: { report: "ENVOYE", alerts: 2 } });
    expect(sent.simulated).toBeUndefined();
    const simulated = signatureDetail("send", true, { report: { number: "RAP-2" }, dispatch: { report: "SIMULE", alerts: 2 } });
    expect(simulated).toEqual({
      detail: "Rapport RAP-2 : envoi simulé (aucun service d'envoi n'est encore configuré). 2 alertes de contamination enregistrées.",
      simulated: true,
    });
    expect(
      signatureDetail("approve", true, { report: { number: "RAP-1" }, dispatch: { report: "SIMULE", alerts: 1 } }).detail
    ).toMatch(/envoi simulé.*1 alerte de contamination enregistrée\.$/);
    // The technical validation sends no report: its alerts go by whether a mail provider is configured.
    expect(signatureDetail("validate", false, { dispatch: { alerts: 1 } }, false).detail).toBe(
      "Validation technique enregistrée. 1 alerte de contamination enregistrée."
    );
    expect(signatureDetail("validate", false, { dispatch: { alerts: 1 } }, true).detail).toBe(
      "Validation technique enregistrée. 1 alerte de contamination partie."
    );
  });

  it("serieBatchSummary: done, set aside, failed", () => {
    const lines = [{ outcome: "done" }, { outcome: "done" }, { outcome: "skipped" }, { outcome: "failed" }] as const;
    expect(serieBatchSummary("validate", lines)).toBe("2 validés techniquement · 1 écarté · 1 en échec");
    expect(serieBatchSummary("approve", [{ outcome: "done" }])).toBe("1 validé");
    expect(serieBatchSummary("send", [{ outcome: "done" }, { outcome: "done" }])).toBe("2 rapports envoyés");
    // Nothing done (all set aside meanwhile): said plainly, never « 0 validé ».
    expect(serieBatchSummary("validate", [{ outcome: "skipped" }, { outcome: "skipped" }])).toBe(
      "Aucun échantillon validé techniquement · 2 écartés"
    );
    expect(serieBatchSummary("approve", [{ outcome: "skipped" }])).toBe("Aucun échantillon validé · 1 écarté");
    expect(serieBatchSummary("send", [{ outcome: "failed" }])).toBe("Aucun rapport envoyé · 1 en échec");
  });

  it("serieBatchSummary: a simulated send is never counted as a report sent", () => {
    const simulated = { outcome: "done", simulated: true } as const;
    expect(serieBatchSummary("send", [simulated, simulated, simulated])).toBe("3 envois simulés");
    expect(serieBatchSummary("send", [{ outcome: "done" }, { outcome: "done" }, simulated])).toBe(
      "2 rapports envoyés · 1 envoi simulé"
    );
    expect(serieBatchSummary("send", [simulated, { outcome: "skipped" }])).toBe("1 envoi simulé · 1 écarté");
  });
});

describe("what the dialog warns about before a signature (the sample's panel's warnings)", () => {
  const result = (overrides: Partial<Parameters<typeof serieResultCounts>[0][number]> = {}) => ({
    conform: true as boolean | null,
    workStatus: "SAISI",
    informalInterpretation: null,
    parameter: { alertOnExceed: false },
    ...overrides,
  });

  it("serieResultCounts: the queue's badges, and the dispatch's own alert rule", () => {
    expect(
      serieResultCounts([
        result({ conform: false }),
        result({ conform: false, parameter: { alertOnExceed: true } }),
        result({ workStatus: "ANOMALIE", conform: null }),
        // Judged only indicatively over its limit, on a sensitive germ: alerts all the same.
        result({ conform: null, informalInterpretation: "NON_SATISFAISANT", parameter: { alertOnExceed: true } }),
        result(),
      ])
    ).toEqual({ nonConformes: 2, anomalies: 1, alertables: 2 });
  });

  it("serieConclusion: the report's conclusion, as the page and the e-mail word it", () => {
    const judged = (interpretation: "SATISFAISANT" | "ACCEPTABLE" | "NON_SATISFAISANT" | null, extra: Record<string, unknown> = {}) => ({
      interpretation,
      conform: null as boolean | null,
      informalInterpretation: null,
      ...extra,
    });
    expect(serieConclusion([judged("SATISFAISANT"), judged("ACCEPTABLE")])).toBe("Acceptable");
    expect(serieConclusion([judged("SATISFAISANT"), judged("NON_SATISFAISANT")])).toBe("Non satisfaisant");
    // A germ still judged on its old limit, over it: never « satisfaisant » above it.
    expect(serieConclusion([judged("SATISFAISANT"), judged(null, { conform: false })])).toBe("Non satisfaisant");
    // Too few units for a plan: no official verdict at all (the page's badge, the report's sentence).
    expect(serieConclusion([judged("SATISFAISANT"), judged(null, { informalInterpretation: "SATISFAISANT" })])).toBe(
      "Sans interprétation officielle (trop peu d'unités)"
    );
    expect(serieConclusion([judged(null)])).toBe("Sans interprétation");
    expect(serieConclusion([])).toBe("Sans interprétation");
    // Judged on the old limits alone, within them.
    expect(serieConclusion([judged(null, { conform: true })])).toBe("Conforme");
  });

  it("the dialog shows each line's conclusion before the signature", () => {
    const dialog = source("../components/validation/SerieBatchActions.tsx");
    expect(dialog).toMatch(/Conclusion : <b[^>]*>\{line\.conclusion\}<\/b>/);
    const server = source("./validation-server.ts");
    expect(server).toMatch(/conclusion: serieConclusion\(sample\.results\)/);
    // The verdict reads the official interpretation too, not only the indicative one.
    expect(server).toMatch(/interpretation: true,\s+informalInterpretation: true,/);
  });

  it("alertsLeaveAt: the step that sends the alerts", () => {
    expect(alertsLeaveAt("validate", true)).toBe(true);
    expect(alertsLeaveAt("approve", true)).toBe(false);
    expect(alertsLeaveAt("validate", false)).toBe(false);
    expect(alertsLeaveAt("approve", false)).toBe(true);
  });

  it("serieAlertNotice: whether the alerts leave at this step, in the panel's words", () => {
    expect(serieAlertNotice("validate", true, 2)).toMatch(/^Une alerte de contamination est envoyée au client dès la validation technique : 2 échantillons ci-dessous en déclenchent une à cette validation\.$/);
    expect(serieAlertNotice("approve", false, 1)).toMatch(/^Une alerte de contamination est envoyée au client à la validation administrative : 1 échantillon ci-dessous en déclenche une/);
    expect(serieAlertNotice("validate", false, 1)).toMatch(/sera envoyée au client après la validation administrative.*rien ne part à cette étape/);
    expect(serieAlertNotice("approve", true, 3)).toMatch(/partent dès la validation technique.*ne renvoie que celles qui auraient échoué/);
  });
});

describe("the dialog's requests: short, and an answer that never arrived claims nothing", () => {
  it("posts at most SERIE_BATCH_CHUNK samples per request, SERIE_SEND_CHUNK when each renders a PDF", () => {
    expect(serieBatchChunkSize("validate", false)).toBe(SERIE_BATCH_CHUNK);
    expect(serieBatchChunkSize("approve", false)).toBe(SERIE_BATCH_CHUNK);
    expect(serieBatchChunkSize("approve", true)).toBe(SERIE_SEND_CHUNK);
    expect(serieBatchChunkSize("send", true)).toBe(SERIE_SEND_CHUNK);
    // Each request stays under the proxy's timeout even with every PDF at its slowest, under load.
    expect(SERIE_SEND_CHUNK * PDF_RENDER_WORST_S).toBeLessThan(PROXY_READ_TIMEOUT_S);
    expect(source("../../deploy/nginx.conf.example")).toMatch(new RegExp(`proxy_read_timeout ${PROXY_READ_TIMEOUT_S}s;`));
  });

  it("serieBatchChunks keeps every line once, in the order shown", () => {
    const lines = Array.from({ length: 23 }, (_, index) => index);
    const chunks = serieBatchChunks(lines, 10);
    expect(chunks.map((chunk) => chunk.length)).toEqual([10, 10, 3]);
    expect(chunks.flat()).toEqual(lines);
    expect(serieBatchChunks([], 10)).toEqual([]);
    expect(serieBatchChunks([1, 2], 0)).toEqual([[1], [2]]);
  });

  it("readSerieBatchReply: the lines; a refusal the route gave before writing; anything else uncertain", () => {
    const lines = [{ id: "a", reference: "C-1", line: "1", designation: "—", outcome: "done", detail: "Validé." }];
    expect(readSerieBatchReply(200, { lines })).toEqual({ kind: "lines", lines });
    expect(readSerieBatchReply(403, { error: "Votre profil n'est pas autorisé à valider." })).toEqual({
      kind: "refused",
      error: "Votre profil n'est pas autorisé à valider.",
    });
    // The proxy's 502/504 page (not JSON), a 500, an answer without lines: never « nothing was recorded ».
    for (const [status, data] of [[504, null], [502, null], [500, { error: "x" }], [200, {}], [400, {}], [0, null]] as const) {
      expect(readSerieBatchReply(status, data), `${status}`).toEqual({ kind: "uncertain" });
    }
  });

  it("says what may have happened, and what was not touched", () => {
    expect(SERIE_BATCH_UNCERTAIN).toMatch(/^La réponse n'est pas arrivée : une partie de la série a peut-être été traitée\./);
    expect(serieBatchStopped("Session expirée.", 4)).toBe("Arrêté avant la fin : Session expirée. Les 4 échantillons suivants n'ont pas été traités.");
    expect(serieBatchStopped("Session expirée.", 1)).toMatch(/L'échantillon suivant n'a pas été traité\.$/);
  });

  it("the dialog posts in chunks, reads each answer through readSerieBatchReply and hides its run buttons once stopped", () => {
    const dialog = source("../components/validation/SerieBatchActions.tsx");
    expect(dialog).toMatch(/serieBatchChunks\(plan\.eligible, serieBatchChunkSize\(action, withSend\)\)/);
    expect(dialog).toMatch(/serieBatchRequest\(serieId, action, chunk, withSend\)/);
    expect(dialog).toMatch(/readSerieBatchReply\(response\.status/);
    // The headline is rebuilt from every chunk's lines.
    expect(dialog).toMatch(/serieBatchSummary\(action, outcome\.lines\)/);
    // An uncertain or stopped run is an outcome: the plan view and its run buttons are gone, close refreshes.
    expect(dialog).toMatch(/setOutcome\(\{ lines, uncertain, stopped \}\)/);
    expect(dialog).toMatch(/if \(outcome\) router\.refresh\(\)/);
  });

  it("dismisses with « Fermer », never « Annuler » (which cancels a sample in this application)", () => {
    const dialog = source("../components/validation/SerieBatchActions.tsx");
    expect(dialog).not.toMatch(/"Annuler"/);
    expect(dialog).not.toMatch(/>\s*Annuler\s*</);
  });

  it("shows the per-line warnings and the « Mode démonstration » notice of the sample's panel", () => {
    const dialog = source("../components/validation/SerieBatchActions.tsx");
    expect(dialog).toMatch(/Alerte de contamination envoyée au client à cette validation/);
    expect(dialog).toMatch(/serieAlertNotice\(action, plan\?\.alertsAtTechnical/);
    expect(dialog).toMatch(/Mode démonstration :/);
    expect(dialog).toMatch(/plan\.emailLive === false/);
  });
});

describe("a série signs each sample through the per-sample signature — never its own (plan D4)", () => {
  const server = source("./validation-server.ts");
  const run = server.slice(server.indexOf("export async function runSerieValidation("), server.indexOf("async function serieSendCandidates("));
  const runSend = server.slice(server.indexOf("export async function runSerieSend("));

  it("calls validateTechnically / approveSample per sample, and writes nothing itself", () => {
    expect(run).toMatch(/await validateTechnically\(sample, session, resolved\.regulation, context\)/);
    expect(run).toMatch(/await approveSample\(sample, session, resolved\.regulation, plan, context\)/);
    expect(run).not.toMatch(/prisma\.\w+\.(update|updateMany|create)\(/);
    expect(run).not.toMatch(/logAudit\(/);
    expect(run).not.toMatch(/\$transaction/);
  });

  it("re-reads the plan at the action and resolves each regulation as the sample's route does", () => {
    expect(run).toMatch(/serieValidationPlan\(candidates, action, session, \{ alertsAtTechnical: settings\.alertAfterTechnicalValidation \}\)/);
    expect(run).toMatch(/regulationFor\(sample, entry\.regulationId\)/);
  });

  it("keeps going after a sample that throws: its line says what landed, once checked", () => {
    expect(run).toMatch(/catch \(error\)/);
    expect(run).toMatch(/outcome: "failed", detail: await signatureAfterError\(sample\.id, action, session\.id\)/);
    const check = server.slice(server.indexOf("async function signatureAfterError("));
    expect(check).toMatch(/prisma\.sample\.findUnique\(/);
    expect(check).toMatch(/Signature enregistrée, mais la suite a échoué/);
    expect(check).toMatch(/Erreur inattendue : ouvrez sa fiche pour voir où il en est\./);
    // The old unchecked claim on the send is gone.
    expect(runSend).not.toMatch(/ce rapport n'est pas parti/);
    expect(runSend).toMatch(/detail: await sendAfterError\(id, startedAt\)/);
    const sendCheck = server.slice(server.indexOf("async function sendAfterError("));
    expect(sendCheck).toMatch(/prisma\.emailLog\.findFirst\(/);
    expect(sendCheck).toMatch(/Rapport parti, mais son inscription a échoué/);
  });

  it("sends each report through the sample's own send, the alerts riding along", () => {
    expect(runSend).toMatch(/await sendReportWithAlerts\(id, actorId, context\)/);
    expect(runSend).toMatch(/const context: SignatureContext = \{ viaSerie: serie\.serialNumber \}/);
    expect(runSend).not.toMatch(/sendReport\(/);
    // The sample's own button: no série.
    expect(source("../app/api/samples/[id]/report/send/route.ts")).toMatch(/sendReportWithAlerts\(id, session\.id\)/);
    expect(source("../app/api/series/[id]/reports/send/route.ts")).toMatch(/runSerieSend\(serie, session\.id, input\.sampleIds\)/);
  });

  it("checks each sample again right before its own send — never a report sent twice by the loop", () => {
    const loop = runSend.slice(runSend.indexOf("for (const id of requested)"), runSend.indexOf("function sendDetail("));
    const recheck = loop.indexOf("serieSendRefusal(now)");
    expect(recheck).toBeGreaterThan(0);
    expect(recheck).toBeLessThan(loop.indexOf("sendReportWithAlerts(id, actorId, context)"));
    expect(loop).toMatch(/prisma\.sample\.findUnique\(\{ where: \{ id, serieId: serie\.id \}/);
    // The number shown is the one of the version read then.
    expect(loop).toMatch(/amendedNumber\(now\.report\.number, now\.report\.version\)/);
  });

  it("sets aside — never « En échec » — a report another send was sending at that very moment", () => {
    const loop = runSend.slice(runSend.indexOf("for (const id of requested)"), runSend.indexOf("function sendDetail("));
    expect(loop).toMatch(/sent\.inFlight\s+\? \{ \.\.\.shown, outcome: "skipped", detail: SEND_IN_FLIGHT \}/);
    const dispatch = source("./report-dispatch.ts");
    const refusal = dispatch.slice(dispatch.indexOf("if (!flight.ran)"));
    expect(refusal.slice(0, refusal.indexOf("}"))).toMatch(/inFlight: true as const/);
    expect(server).toMatch(/\.\.\.\("inFlight" in result \? \{ inFlight: true as const \} : \{\}\)/);
  });

  it("the plans tell the dialog whether e-mails really leave (the panel's « Mode démonstration »)", () => {
    for (const name of ["serieValidationPlanFor", "serieSendPlanFor"]) {
      const body = server.slice(server.indexOf(`export async function ${name}(`));
      const end = body.search(/\r?\n\}\r?\n/);
      expect(end, name).toBeGreaterThan(0);
      expect(body.slice(0, end), name).toMatch(/emailLive: emailLive\(\)/);
    }
    expect(server).toMatch(/const emailLive = \(\) => !!process\.env\.RESEND_API_KEY/);
  });

  it("reads what the panel warns about with the dispatch's own alert rule", () => {
    expect(server).toMatch(/\.\.\.serieResultCounts\(sample\.results\)/);
    expect(server).toMatch(/informalInterpretation: true,\s+parameter: \{ select: \{ alertOnExceed: true \} \}/);
  });

  it("the sample's route signs through the same two functions", () => {
    const route = source("../app/api/samples/[id]/validation/route.ts");
    expect(route).toMatch(/validateTechnically\(sample, session, resolved\.regulation\)/);
    expect(route).toMatch(/approveSample\(sample, session, resolved\.regulation, plan\)/);
    expect(route).not.toMatch(/SAMPLE_APPROVED|SAMPLE_VALIDATED_TECHNICAL/);
  });

  it("journals the série on each entry of a série action (viaSerie): step 1, step 2, the regulation, the report sent, the alerts", () => {
    expect([...server.matchAll(/context\.viaSerie \? \{ viaSerie: context\.viaSerie \}/g)]).toHaveLength(3);
    expect([...server.matchAll(/await recordRegulation\(sample, regulation, session\.id, context\)/g)]).toHaveLength(2);
    // REPORT_SENT and CONTAMINATION_ALERT_SENT, written by the dispatch.
    const dispatch = source("./report-dispatch.ts");
    expect([...dispatch.matchAll(/context\.viaSerie \? \{ viaSerie: context\.viaSerie \}/g)]).toHaveLength(2);
    expect(dispatch).toMatch(/sendReportNow\(sampleId, actorId, context\)/);
    // Every send and alert of the signatures carries the context: none without.
    expect([...server.matchAll(/\bsendReport\(/g)]).toHaveLength([...server.matchAll(/\bsendReport\([^)]*, context\)/g)].length);
    expect([...server.matchAll(/\bsendContaminationAlerts\(/g)]).toHaveLength(
      [...server.matchAll(/\bsendContaminationAlerts\([^)]*, context\)/g)].length
    );
    expect([...server.matchAll(/\bsendContaminationAlerts\([^)]*, context\)/g)]).toHaveLength(3);
  });

  it("journals the approval once its claim landed, whatever follows (finally) — marked incomplete when it threw", () => {
    const approve = server.slice(server.indexOf("export async function approveSample("), server.indexOf("export type ReportSendOutcome"));
    const claim = approve.indexOf("if (claimed.count === 0)");
    const tryAt = approve.indexOf("try {");
    const finallyAt = approve.indexOf("} finally {");
    expect(claim).toBeGreaterThan(0);
    expect(tryAt).toBeGreaterThan(claim);
    expect(finallyAt).toBeGreaterThan(tryAt);
    // What may throw sits inside the try; the journal inside the finally.
    for (const call of ["recordRegulation(", "issueReportFor(", "sendReport(", "sendContaminationAlerts("]) {
      const at = approve.indexOf(call);
      expect(at, call).toBeGreaterThan(tryAt);
      expect(at, call).toBeLessThan(finallyAt);
    }
    expect(approve.slice(finallyAt)).toMatch(/action: "SAMPLE_APPROVED"/);
    expect(approve.slice(finallyAt)).toMatch(/\.\.\.\(broke \? \{ incomplete: true \} : \{\}\)/);
    expect(approve.slice(tryAt, finallyAt)).toMatch(/catch \(error\) \{\s+broke = true;\s+throw error;\s*$/);
    expect([...approve.matchAll(/logAudit\(/g)]).toHaveLength(1);
  });
});

describe("the sample's « Parcours » says when a step was taken « toute la série »", () => {
  const sample: TimelineSample = {
    sampledAt: new Date("2026-10-20T08:00:00Z"),
    receivedAt: null,
    receivedBy: null,
    programmedAt: null,
    programmedBy: null,
    assignedAt: null,
    technician: null,
    validatedAt: null,
    validatedBy: null,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
  };
  const row = (id: string, action: string, metadata: Record<string, unknown>, minute: number) => ({
    id,
    action,
    createdAt: new Date(`2026-10-23T09:${String(minute).padStart(2, "0")}:00Z`),
    actor: { name: "Personne Test" },
    metadata: JSON.stringify(metadata),
  });

  it("appends the série to the step's own note, or stands as the note", () => {
    const events = sampleTimeline(sample, [
      row("a", "SAMPLE_VALIDATED_TECHNICAL", { step: "1/2", regulation: "Règlement TEST", viaSerie: "991/26" }, 1),
      row("b", "SAMPLE_APPROVED", { step: "2/2", reportNumber: null, viaSerie: "991/26" }, 2),
      row("c", "REPORT_SENT", { number: "RAP-2026-00001", to: ["x@test.invalid"], status: "SIMULE", viaSerie: "991/26" }, 3),
      row("d", "CONTAMINATION_ALERT_SENT", { germe: "Salmonella", status: "SIMULE", viaSerie: "991/26" }, 4),
      row("e", "REPORT_SENT", { number: "RAP-2026-00002", to: ["x@test.invalid"], status: "ENVOYE" }, 5),
    ]);
    const note = (label: string, index = 0) => events.filter((event) => event.label === label)[index]?.note;
    expect(note("Validation technique")).toBe("Réglementation : Règlement TEST (toute la série 991/26)");
    expect(note("Validation administrative")).toBe("Toute la série 991/26");
    expect(note("Rapport envoyé au client")).toBe("RAP-2026-00001 — x@test.invalid — envoi simulé (toute la série 991/26)");
    expect(note("Alerte de contamination envoyée")).toBe("Salmonella — envoi simulé (toute la série 991/26)");
    // A sample's own button: nothing added.
    expect(note("Rapport envoyé au client", 1)).toBe("RAP-2026-00002 — x@test.invalid");
  });
});
