import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The per-sample signatures and the série's send (validation-server.ts,
 * re-ask 2.16, plan D3 + D4) run for real; the database, the journal and
 * the dispatch are stubbed, and what they are asked to do is checked: the
 * série's number on every journal entry and every send, the approval
 * journalled whatever follows its claim, and a send already under way set
 * aside rather than shown « En échec ».
 */

const stubs = vi.hoisted(() => ({
  prisma: {
    sample: { updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    clientProduct: { update: vi.fn() },
    regulation: { findFirst: vi.fn(), findMany: vi.fn() },
    emailLog: { findFirst: vi.fn() },
  },
  logAudit: vi.fn(),
  issueReportFor: vi.fn(),
  sendReport: vi.fn(),
  sendContaminationAlerts: vi.fn(),
  getLabSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: stubs.prisma }));
vi.mock("./audit", () => ({ logAudit: stubs.logAudit }));
vi.mock("./report-dispatch", () => ({
  issueReportFor: stubs.issueReportFor,
  sendReport: stubs.sendReport,
  sendContaminationAlerts: stubs.sendContaminationAlerts,
}));
vi.mock("./lab-settings", () => ({ getLabSettings: stubs.getLabSettings }));
// K7 (lot 4A): `ALERTS_AT_VALIDATION` is off by default; a test turns it back on to check the way back.
const switches = vi.hoisted(() => ({ alertsAtValidation: false }));
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  get ALERTS_AT_VALIDATION() {
    return switches.alertsAtValidation;
  },
}));

import { approveSample, runSerieSend, sendReportWithAlerts, validateTechnically, type ValidationSample } from "./validation-server";

const VALID1 = { id: "u-valid1", role: "VALIDATEUR" as const };
const DIR1 = { id: "u-dir1", role: "DIRECTION" as const };
const REG = { id: "reg-1", title: "Règlement TEST" };
const SERIE = { viaSerie: "991/26" };
const IN_FLIGHT = "Un envoi de ce rapport est déjà en cours : il ne part qu'une fois.";

function sample(overrides: Partial<ValidationSample> = {}): ValidationSample {
  return {
    id: "s1",
    code: "991/26-1",
    status: "RESULTATS_SAISIS",
    validatedById: VALID1.id,
    approvedById: null,
    productTypeId: "pt-1",
    productId: "cp-1",
    regulationId: null,
    regulation: null,
    report: null,
    technicianId: "u-tech1",
    technician: { name: "Personne Test" },
    parameters: [],
    ...overrides,
  };
}

/** The journal entries written, as { action, metadata }. */
const journal = () =>
  stubs.logAudit.mock.calls.map(([entry]) => entry as { action: string; metadata: Record<string, unknown> });
const entries = (action: string) => journal().filter((entry) => entry.action === action);

beforeEach(() => {
  vi.clearAllMocks();
  switches.alertsAtValidation = false;
  stubs.logAudit.mockResolvedValue(undefined);
  stubs.prisma.sample.updateMany.mockResolvedValue({ count: 1 });
  stubs.prisma.clientProduct.update.mockResolvedValue({});
  stubs.issueReportFor.mockResolvedValue({ id: "r1", number: "RAP-2026-00001" });
  stubs.sendReport.mockResolvedValue({ ok: true, status: "SIMULE", to: ["x@test.invalid"] });
  stubs.sendContaminationAlerts.mockResolvedValue({ ok: true, sent: 0 });
  stubs.getLabSettings.mockResolvedValue({ alertAfterTechnicalValidation: true, regulationMicroId: null, regulationChimieId: null });
});

describe("approveSample — the administrative validation, from the sample or from its série", () => {
  it("« Valider et envoyer » through the série: the report and the alerts carry its number, then the approval is journalled once", async () => {
    const outcome = await approveSample(sample(), DIR1, REG, { sendReport: true }, SERIE);
    expect(outcome.ok).toBe(true);
    expect(stubs.sendReport).toHaveBeenCalledWith("s1", DIR1.id, expect.objectContaining(SERIE));
    expect(stubs.sendContaminationAlerts).toHaveBeenCalledWith("s1", DIR1.id, expect.objectContaining(SERIE));
    const approved = entries("SAMPLE_APPROVED");
    expect(approved).toHaveLength(1);
    expect(approved[0].metadata).toMatchObject({ step: "2/2", reportNumber: "RAP-2026-00001", send: true, viaSerie: "991/26" });
    expect(approved[0].metadata).not.toHaveProperty("incomplete");
    // Still written after what the approval caused.
    const approvedAt = stubs.logAudit.mock.invocationCallOrder[journal().findIndex((entry) => entry.action === "SAMPLE_APPROVED")];
    expect(approvedAt).toBeGreaterThan(stubs.sendReport.mock.invocationCallOrder[0]);
    // The regulation changed (none recorded): journalled with the série too, and remembered for the product.
    expect(entries("SAMPLE_REGULATION_SET")[0].metadata).toMatchObject({ before: null, after: "Règlement TEST", viaSerie: "991/26" });
    expect(stubs.prisma.clientProduct.update).toHaveBeenCalledWith({ where: { id: "cp-1" }, data: { regulationId: "reg-1" } });
  });

  it("the sample's own panel: no série anywhere", async () => {
    await approveSample(sample({ regulationId: "reg-1", regulation: { title: "Règlement TEST" } }), DIR1, REG, { sendReport: true });
    expect(stubs.sendReport).toHaveBeenCalledWith("s1", DIR1.id, {});
    expect(entries("SAMPLE_APPROVED")[0].metadata).not.toHaveProperty("viaSerie");
    // The regulation recorded is the one proposed: no SAMPLE_REGULATION_SET, the product untouched.
    expect(entries("SAMPLE_REGULATION_SET")).toHaveLength(0);
    expect(stubs.prisma.clientProduct.update).not.toHaveBeenCalled();
  });

  it("journals the approval even when what follows its claim throws — marked incomplete — and the error goes on", async () => {
    stubs.issueReportFor.mockRejectedValue(new Error("issue failed"));
    await expect(approveSample(sample(), DIR1, REG, { sendReport: false }, SERIE)).rejects.toThrow("issue failed");
    const approved = entries("SAMPLE_APPROVED");
    expect(approved).toHaveLength(1);
    expect(approved[0].metadata).toMatchObject({ reportNumber: null, send: false, incomplete: true, viaSerie: "991/26" });
    expect(stubs.sendContaminationAlerts).not.toHaveBeenCalled();
  });

  it("…and when the regulation's write throws, before the report", async () => {
    stubs.prisma.clientProduct.update.mockRejectedValue(new Error("write failed"));
    await expect(approveSample(sample(), DIR1, REG, { sendReport: false })).rejects.toThrow("write failed");
    expect(entries("SAMPLE_APPROVED")[0].metadata).toMatchObject({ incomplete: true });
    expect(stubs.issueReportFor).not.toHaveBeenCalled();
  });

  it("a claim lost to someone else writes and journals nothing", async () => {
    stubs.prisma.sample.updateMany.mockResolvedValue({ count: 0 });
    const outcome = await approveSample(sample(), DIR1, REG, { sendReport: true }, SERIE);
    expect(outcome).toMatchObject({ ok: false, status: 409 });
    expect(stubs.logAudit).not.toHaveBeenCalled();
    expect(stubs.issueReportFor).not.toHaveBeenCalled();
  });
});

describe("approveSample — K10, the box « Logo d'accréditation » (Q13 of 04/11)", () => {
  it("passes the box to the issue and journals what the version froze", async () => {
    stubs.issueReportFor.mockResolvedValue({
      id: "r1",
      number: "RAP-2026-00001",
      accreditationLogo: { printed: false, byRule: true, byHand: true },
    });
    await approveSample(sample(), DIR1, REG, { sendReport: false, accreditationLogo: false }, SERIE);
    expect(stubs.issueReportFor).toHaveBeenCalledWith("s1", DIR1.id, { accreditationLogo: false });
    expect(entries("SAMPLE_APPROVED")[0].metadata).toMatchObject({ accreditationLogo: "retiré à la main", accreditationLogoByHand: true, viaSerie: "991/26" });
  });

  it("without the box (no logo uploaded), the rule: null passed, the rule's decision journalled", async () => {
    stubs.issueReportFor.mockResolvedValue({
      id: "r1",
      number: "RAP-2026-00001",
      accreditationLogo: { printed: true, byRule: true, byHand: false },
    });
    await approveSample(sample(), DIR1, REG, { sendReport: false });
    expect(stubs.issueReportFor).toHaveBeenCalledWith("s1", DIR1.id, { accreditationLogo: null });
    const metadata = entries("SAMPLE_APPROVED")[0].metadata;
    expect(metadata).toMatchObject({ accreditationLogo: "imprimé (règle par défaut)" });
    expect(metadata).not.toHaveProperty("accreditationLogoByHand");
  });

  it("a report issued before (nothing issued now) journals no logo", async () => {
    await approveSample(sample(), DIR1, REG, { sendReport: false });
    expect(entries("SAMPLE_APPROVED")[0].metadata).not.toHaveProperty("accreditationLogo");
  });

  it("journals the box as posted even when the report failed to issue — the send that issues it later follows it", async () => {
    stubs.issueReportFor.mockResolvedValue(null);
    await approveSample(sample(), DIR1, REG, { sendReport: false, accreditationLogo: false });
    const metadata = entries("SAMPLE_APPROVED")[0].metadata;
    expect(metadata).toMatchObject({ reportNumber: null, accreditationLogoRequested: false });
    expect(metadata).not.toHaveProperty("accreditationLogo");
  });

  it("the rule (box untouched, or none): nothing requested is journalled", async () => {
    await approveSample(sample(), DIR1, REG, { sendReport: false, accreditationLogo: null });
    expect(entries("SAMPLE_APPROVED")[0].metadata).not.toHaveProperty("accreditationLogoRequested");
  });
});

describe("validateTechnically — the alerts that leave at step 1 carry the série too", () => {
  it("K7 (Q9 of 04/11, the default): step 1 sends no alert, whatever the setting says — they leave with the report", async () => {
    const outcome = await validateTechnically(sample({ validatedById: null }), VALID1, REG, SERIE);
    expect(outcome.ok).toBe(true);
    expect(stubs.sendContaminationAlerts).not.toHaveBeenCalled();
    expect(entries("SAMPLE_VALIDATED_TECHNICAL")[0].metadata).toMatchObject({ step: "1/2", viaSerie: "991/26" });
  });

  it("K7 « Valider » (no send) at step 2 sends no alert either; « Valider et envoyer » does", async () => {
    await approveSample(sample(), DIR1, REG, { sendReport: false }, SERIE);
    expect(stubs.sendContaminationAlerts).not.toHaveBeenCalled();
    await approveSample(sample(), DIR1, REG, { sendReport: true }, SERIE);
    expect(stubs.sendContaminationAlerts).toHaveBeenCalledTimes(1);
  });

  it("K7 « Valider et envoyer »: the report failed to leave (PDF, a send under way) — the alert waits for it, as with « Envoyer au client »", async () => {
    stubs.sendReport.mockResolvedValue({ ok: false, error: "Génération du PDF impossible." });
    await approveSample(sample(), DIR1, REG, { sendReport: true });
    stubs.sendReport.mockResolvedValue({ ok: false, error: IN_FLIGHT, inFlight: true });
    await approveSample(sample(), DIR1, REG, { sendReport: true });
    stubs.sendReport.mockRejectedValue(new Error("smtp down"));
    await approveSample(sample(), DIR1, REG, { sendReport: true });
    expect(stubs.sendContaminationAlerts).not.toHaveBeenCalled();
  });

  it("K7 « Valider et envoyer »: no report address — the alert still tries its own (hypothèse, à confirmer)", async () => {
    stubs.sendReport.mockResolvedValue({ ok: false, error: "Aucune adresse email enregistrée pour ce client.", noRecipients: true });
    stubs.sendContaminationAlerts.mockResolvedValue({ ok: true, sent: 1 });
    const outcome = await approveSample(sample(), DIR1, REG, { sendReport: true });
    expect(stubs.sendContaminationAlerts).toHaveBeenCalledTimes(1);
    expect(outcome.ok && outcome.body.dispatch).toMatchObject({
      error:
        "Aucune adresse email enregistrée pour ce client. L'alerte de contamination est partie à l'adresse d'alerte du client ; le rapport reste à envoyer.",
      alerts: 1,
    });
  });

  it("the way back (switch on): the approval runs the alerts whatever the send did", async () => {
    switches.alertsAtValidation = true;
    stubs.sendReport.mockResolvedValue({ ok: false, error: "Génération du PDF impossible." });
    await approveSample(sample(), DIR1, REG, { sendReport: true });
    await approveSample(sample(), DIR1, REG, { sendReport: false });
    expect(stubs.sendContaminationAlerts).toHaveBeenCalledTimes(2);
  });

  it("the way back (switch on): passes the série's number to the alerts, and journals step 1 with it", async () => {
    switches.alertsAtValidation = true;
    const outcome = await validateTechnically(sample({ validatedById: null }), VALID1, REG, SERIE);
    expect(outcome.ok).toBe(true);
    expect(stubs.sendContaminationAlerts).toHaveBeenCalledWith("s1", VALID1.id, expect.objectContaining(SERIE));
    expect(entries("SAMPLE_VALIDATED_TECHNICAL")[0].metadata).toMatchObject({ step: "1/2", regulation: "Règlement TEST", viaSerie: "991/26" });
  });
});

describe("sendReportWithAlerts — « Envoyer au client », per sample or for the série", () => {
  it("says when another send of this report is under way (inFlight), and sends no alert then", async () => {
    stubs.sendReport.mockResolvedValue({ ok: false, error: IN_FLIGHT, inFlight: true });
    expect(await sendReportWithAlerts("s1", VALID1.id, SERIE)).toEqual({ ok: false, error: IN_FLIGHT, inFlight: true });
    expect(stubs.sendContaminationAlerts).not.toHaveBeenCalled();
  });

  it("any other refusal is a plain failure, and the alert waits for the report", async () => {
    stubs.sendReport.mockResolvedValue({ ok: false, error: "Génération du PDF impossible." });
    expect(await sendReportWithAlerts("s1", VALID1.id)).toEqual({ ok: false, error: "Génération du PDF impossible." });
    expect(stubs.sendContaminationAlerts).not.toHaveBeenCalled();
  });

  it("K7: no report address — the report stays « à envoyer », the alert leaves to its own address and says so", async () => {
    stubs.sendReport.mockResolvedValue({ ok: false, error: "Aucune adresse email enregistrée pour ce client.", noRecipients: true });
    stubs.sendContaminationAlerts.mockResolvedValue({ ok: true, sent: 1 });
    expect(await sendReportWithAlerts("s1", VALID1.id, SERIE)).toEqual({
      ok: false,
      error:
        "Aucune adresse email enregistrée pour ce client. L'alerte de contamination est partie à l'adresse d'alerte du client ; le rapport reste à envoyer.",
      alerts: 1,
    });
    expect(stubs.sendContaminationAlerts).toHaveBeenCalledWith("s1", VALID1.id, SERIE);
    // No alert due: the refusal alone.
    stubs.sendContaminationAlerts.mockResolvedValue({ ok: true, sent: 0 });
    expect(await sendReportWithAlerts("s1", VALID1.id)).toEqual({ ok: false, error: "Aucune adresse email enregistrée pour ce client.", alerts: 0 });
    // Neither address: both refusals.
    stubs.sendContaminationAlerts.mockResolvedValue({ ok: false, error: "Aucune adresse d'alerte enregistrée pour ce client." });
    expect(await sendReportWithAlerts("s1", VALID1.id)).toEqual({
      ok: false,
      error:
        "Aucune adresse email enregistrée pour ce client. Alerte de contamination non envoyée : Aucune adresse d'alerte enregistrée pour ce client.",
      alertsError: "Aucune adresse d'alerte enregistrée pour ce client.",
    });
  });
});

describe("runSerieSend — « Envoyer la série au client »", () => {
  const line = (id: string, lineNumber: number) => ({
    id,
    code: `991/26-${lineNumber}`,
    controlCode: `C-000${lineNumber}`,
    lineNumber,
    status: "VALIDE",
    lineKind: "ALIMENT",
    produit: `Produit X ${lineNumber}`,
    surfaceLabel: null,
    surfaceState: null,
    personName: null,
    airMethod: null,
    airExposureMin: null,
    report: { number: `RAP-2026-0000${lineNumber}`, version: 0, sentAt: null, amendedAt: null, amendmentPending: false },
  });

  it("sends each report with the série's number; one already under way is set aside, a refusal fails", async () => {
    const lines = [line("a", 1), line("b", 2), line("c", 3)];
    stubs.prisma.sample.findMany.mockResolvedValue(lines);
    stubs.prisma.sample.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const found = lines.find((entry) => entry.id === where.id);
      return found ? { status: found.status, report: found.report } : null;
    });
    stubs.sendReport
      .mockResolvedValueOnce({ ok: true, status: "SIMULE", to: ["x@test.invalid"] })
      .mockResolvedValueOnce({ ok: false, error: IN_FLIGHT, inFlight: true })
      .mockResolvedValueOnce({ ok: false, error: "Aucune adresse email enregistrée pour ce client." });

    const outcome = await runSerieSend({ id: "serie-1", serialNumber: "991/26" }, VALID1.id, ["a", "b", "c"]);

    expect(outcome.map((entry) => entry.outcome)).toEqual(["done", "skipped", "failed"]);
    expect(outcome[1].detail).toMatch(/^Un envoi de ce rapport était déjà en cours .* il ne part qu'une fois/);
    expect(outcome[2].detail).toBe("Aucune adresse email enregistrée pour ce client.");
    for (const call of stubs.sendReport.mock.calls) expect(call[2]).toMatchObject(SERIE);
    // Each sample re-read in this série right before its own send.
    expect(stubs.prisma.sample.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a", serieId: "serie-1" } }));
  });
});
