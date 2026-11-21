import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { raisesContaminationAlert } from "./contamination-alert";
import { PLAIN_UNIT_CONTEXT, judgingLimit } from "./result-unit";
import { suggestConformity } from "./result-value";

/**
 * Lot 5A (RETOUR-LABO-20-11.md §5) — how the rules are wired into the routes
 * and the issue, read from the sources (the database paths have no unit
 * test of their own), and what J6 does to the contamination alerts.
 */

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

describe("J6 × the contamination alerts — never silently lost (the 09/09 lesson)", () => {
  const couteau = { ...PLAIN_UNIT_CONTEXT, lineKind: "SURFACE" as const, surfaceAreaNote: "couteau" };
  const sensitive = { parameter: { alertOnExceed: true }, interpretation: null, informalInterpretation: null };

  it("a sensitive germ on a surface described in words, over a limit per cm², is non conforme and alerts", () => {
    const limit = judgingLimit(couteau, 100, "UFC/cm²");
    expect(limit).toBe(100);
    const conform = suggestConformity(120, limit);
    expect(conform).toBe(false);
    expect(raisesContaminationAlert({ ...sensitive, conform, detected: true })).toBe(true);
  });

  it("below its limit it is conforme and does not alert — as any surface judged by its value (the laboratory's rule of 20/11)", () => {
    // Before lot 5A the line carried no judgement and alerted on the presence
    // alone (O-12); judged now, a count within its limit is « satisfaisant ».
    const conform = suggestConformity(50, judgingLimit(couteau, 100, "UFC/cm²"));
    expect(conform).toBe(true);
    expect(raisesContaminationAlert({ ...sensitive, conform, detected: true })).toBe(false);
    // A germ without any limit still alerts on its presence (O-12), whatever J6.
    expect(raisesContaminationAlert({ ...sensitive, conform: null, detected: true })).toBe(true);
  });
});

describe("K11 — the issue and the routes", () => {
  const dispatch = read("./report-dispatch.ts");

  it("the approval issues the same version again when a correction is pending on it", () => {
    expect(dispatch).toContain("if (inForce && correctionPending(inForce.correctedBeforeSend)) {");
    expect(dispatch).toContain("return reissueCorrectedReport(sampleId, report, inForce, actorId, options);");
    const reissue = dispatch.slice(dispatch.indexOf("async function reissueCorrectedReport("), dispatch.indexOf("/** What the approval issues"));
    // Same number, the version and `amendedAt` never move.
    expect(reissue).toContain("const number = amendedNumber(report.number, report.version);");
    expect(reissue).toContain('data: { ...fields, amendmentPending: false, sendStatus: "NON_ENVOYE" },');
    expect(reissue).not.toMatch(/version: report\.version \+ 1|amendedAt:/);
    // An « -A1 » keeps its header; an original gets none (`amendmentOf` answers null for version 0).
    expect(reissue).toContain("amendment: await amendmentOf(report),");
    // The replaced data kept as the internal trace.
    expect(reissue).toContain("correctedBeforeSend: trace as unknown as Prisma.InputJsonValue,");
    expect(reissue).toContain("action: AUDIT_ACTIONS.REPORT_CORRECTION_ISSUED,");
  });

  it("« Rouvrir pour amendement » refuses a version never sent; the correction refuses one sent, or sent meanwhile", () => {
    expect(dispatch).toContain('if (reopenMode(reportVersionSent(report)) === "correct") {');
    const correct = dispatch.slice(dispatch.indexOf("export async function correctBeforeSend("), dispatch.indexOf("class SentMeanwhile"));
    // Never while a send of the report is under way: the same single flight as `sendReport`.
    expect(correct).toContain("const run = await reportSends.run(sampleId, () => correctBeforeSendNow(sampleId, actor, reason));");
    expect(correct).toContain('where: { id: sample.id, status: "VALIDE" },');
    expect(correct).toContain("where: { id: report.id, amendmentPending: false, version: report.version, sentAt: report.sentAt },");
    expect(correct).toContain("action: AUDIT_ACTIONS.REPORT_CORRECTED_BEFORE_SEND,");
  });

  it("the alerts of an original corrected before send follow the amendment's rule: what changed alerts again", () => {
    expect(dispatch).toContain(
      "const amendment = report !== null && (report.amendmentPending || report.version > 0 || correctedOriginal !== null);"
    );
    // Review of the integration (21/11): judged against the ledger of alerts
    // sent only — the data replaced may never have been alerted.
    const replaced = dispatch.slice(dispatch.indexOf(": correctedOriginal !== null"), dispatch.indexOf(": loadReportVersion(report.id, replacedVersion),"));
    expect(replaced).toContain("Promise.resolve(null)");
    expect(replaced).not.toContain("reportDataFromJson");
  });

  it("the route keeps the roles of the reopening", () => {
    const route = read("../app/api/samples/[id]/correct/route.ts");
    expect(route).toContain('const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");');
    expect(route).toContain("correctBeforeSend(id, { id: session.id, role: session.role, name: session.name }, reason)");
  });
});

describe("J7 — the sheet and the take route", () => {
  it("a colleague's sample answers 404 to a technician, before anything is read for the sheet", () => {
    const page = read("../app/technicien/[id]/page.tsx");
    const hidden = page.indexOf("if (isTechnician && colleagueSampleHidden(sample, session.id)) notFound();");
    expect(hidden).toBeGreaterThan(0);
    expect(hidden).toBeLessThan(page.indexOf("loadBenchPlans(sample.id),"));
  });

  it("« Libérer » journals how many readings the sample carried, and keeps the start of the analyses", () => {
    const route = read("../app/api/samples/[id]/take/route.ts");
    expect(route).toContain("typedResults: outcome.typedResults ?? 0,");
    expect(route).toContain("if (typed > 0) await tx.sample.updateMany({ where: { id }, data: { technicianId: null } });");
    expect(route).toContain("await tx.sample.updateMany({ where: { id, assignedAt: null }, data: { assignedAt: now } });");
  });
});
