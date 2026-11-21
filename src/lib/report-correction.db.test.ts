import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CORRECTION_MESSAGES, parseCorrectionTrace, versionIssuedAt } from "./report-amendment";
import { alertNotSentForVersion } from "./alert-moment";

/**
 * Lot 5A, K11 — « Corriger avant envoi » against a real MySQL (review of lot
 * 5A: the riskiest item rewrites a frozen ReportVersion in place, and was
 * covered by pure and source tests only).
 *
 * The LOCAL database only (`.env.local`, or QUALILAB_LOCAL_DATABASE_URL),
 * never production: skipped unless its host is this machine and its name a
 * local one (« qualilab_local »), or when it does not answer — the guard of
 * `report-number.race.test.ts`. Its own records: a « TEST UI K11 » série of
 * the « TEST UI » client under this run's tag, approved in a free year past
 * 2100 (its report numbers never touch a real year's counter). Only this
 * run's samples (their reports, versions and results cascade), journal
 * rows, e-mail log rows and counter row are deleted at the end. No e-mail
 * leaves: without RESEND_API_KEY a send is recorded as simulated.
 */

vi.mock("server-only", () => ({}));

const TEST_CLIENT_NAME = "TEST UI 2026-10-06 Traiteur";
const TAG_PREFIX = "TEST-UI-K11-";

function localDatabaseUrl(): string | null {
  let url = process.env.QUALILAB_LOCAL_DATABASE_URL ?? null;
  if (!url) {
    try {
      url = /^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(".env.local", "utf8"))?.[1] ?? null;
    } catch {
      return null;
    }
  }
  if (!url) return null;
  const { hostname, pathname } = new URL(url);
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname) && /_(local|test)$/.test(pathname) ? url : null;
}

async function connect() {
  const url = localDatabaseUrl();
  if (!url) return null;
  process.env.DATABASE_URL = url;
  // Never a real e-mail from a test: the send is recorded as simulated.
  delete process.env.RESEND_API_KEY;
  const { prisma } = await import("./prisma");
  const answered = await Promise.race([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
  ]);
  return answered ? prisma : null;
}

const prisma = await connect();

describe.skipIf(!prisma)("K11 — « Corriger avant envoi » on the local database", { timeout: 90_000 }, () => {
  const db = prisma!;
  const tag = `${TAG_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let fixture: { clientId: string; validatorId: string; adminId: string; natureId: string; serieId: string };
  let year = 0;
  let line = 0;
  const reason = "Erreur de saisie du numéro de lot";
  const at = (hour: number, minute = 0) => new Date(year, 5, 15, hour, minute);
  const admin = () => ({ id: fixture.adminId, role: "ADMIN" as const, name: "Administrateur" });

  /** A sample with both signatures (validator ≠ approver), approved at `approvedAt`, with these readings. */
  async function approvedSample(
    approvedAt: Date,
    readings: { parameterId: string; value: string; numericValue: number | null }[] = []
  ) {
    line += 1;
    const sample = await db.sample.create({
      data: {
        code: `${tag}-${line}`,
        clientId: fixture.clientId,
        userId: fixture.validatorId,
        serieId: fixture.serieId,
        lineNumber: line,
        natureId: fixture.natureId,
        lieu: "TEST UI K11 — correction avant envoi",
        produit: "TEST UI K11",
        type: "ALIMENTAIRE",
        status: "VALIDE",
        validatedById: fixture.validatorId,
        validatedAt: approvedAt,
        approvedById: fixture.adminId,
        approvedAt,
      },
      select: { id: true },
    });
    for (const reading of readings) {
      await db.result.create({
        data: {
          sampleId: sample.id,
          parameterId: reading.parameterId,
          value: reading.value,
          numericValue: reading.numericValue,
          conform: false,
          interpretation: "NON_SATISFAISANT",
          threshold: "≤ 100",
          workStatus: "TERMINE",
        },
      });
    }
    return sample.id;
  }

  /** The double validation again after a correction (both signatures, the approval at `approvedAt`). */
  const validateAgain = (sampleId: string, approvedAt: Date) =>
    db.sample.update({
      where: { id: sampleId },
      data: {
        status: "VALIDE",
        validatedById: fixture.validatorId,
        validatedAt: approvedAt,
        approvedById: fixture.adminId,
        approvedAt,
      },
    });

  const reportOf = (sampleId: string) =>
    db.report.findUniqueOrThrow({
      where: { sampleId },
      select: {
        id: true,
        number: true,
        version: true,
        amendedAt: true,
        amendmentPending: true,
        sentAt: true,
        versions: { select: { version: true, number: true, issuedAt: true, data: true, correctedBeforeSend: true }, orderBy: { version: "asc" } },
      },
    });

  async function cleanUp() {
    const samples = await db.sample.findMany({ where: { code: { startsWith: tag } }, select: { id: true, report: { select: { id: true } } } });
    const reportIds = samples.flatMap((sample) => (sample.report ? [sample.report.id] : []));
    const entityIds = [...samples.map((sample) => sample.id), ...reportIds];
    if (reportIds.length > 0) await db.emailLog.deleteMany({ where: { reportId: { in: reportIds } } });
    if (entityIds.length > 0) await db.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
    // The reports, their versions and the results cascade with the samples.
    await db.sample.deleteMany({ where: { code: { startsWith: tag } } });
    await db.serie.deleteMany({ where: { serialNumber: tag } });
    if (year) await db.counter.deleteMany({ where: { kind: "RAPPORT", year } });
  }

  beforeAll(async () => {
    const client = await db.client.findFirst({ where: { name: TEST_CLIENT_NAME }, select: { id: true } });
    const validator = await db.user.findFirst({ where: { email: { startsWith: "valid1@" } }, select: { id: true } });
    const adminUser = await db.user.findFirst({ where: { email: { startsWith: "admin@" }, role: "ADMIN" }, select: { id: true } });
    const nature = await db.analysisNature.findFirst({ where: { family: "MICRO" }, select: { id: true } });
    if (!client || !validator || !adminUser || !nature) {
      throw new Error("Données de démonstration locales absentes (client TEST UI, valid1, admin, nature).");
    }
    const stale = { lt: new Date(Date.now() - 3_600_000) };
    await db.sample.deleteMany({ where: { code: { startsWith: TAG_PREFIX }, createdAt: stale } });
    await db.serie.deleteMany({ where: { serialNumber: { startsWith: TAG_PREFIX }, createdAt: stale } });
    // A free year past 2100: no counter row, no other run.
    for (;;) {
      year = 2100 + Math.floor(Math.random() * 700);
      if ((await db.counter.count({ where: { kind: "RAPPORT", year } })) === 0) break;
    }
    const serie = await db.serie.create({
      data: {
        kind: "DEPOT",
        serialNumber: tag,
        year,
        clientId: client.id,
        startedAt: at(9),
        createdById: validator.id,
        notes: "TEST UI K11 — correction avant envoi (test automatique, supprimé à la fin)",
      },
      select: { id: true },
    });
    fixture = { clientId: client.id, validatorId: validator.id, adminId: adminUser.id, natureId: nature.id, serieId: serie.id };
    await import("./report-dispatch");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await cleanUp();
    await db.$disconnect();
  }, 60_000);

  it("(1) a v0 never sent: reissued in place — same number, no « Annule et remplace », version and amendedAt unchanged, one trace entry", async () => {
    const { amendReportFor, correctBeforeSend, createReportFor, reopenForAmendment } = await import("./report-dispatch");
    const id = await approvedSample(at(10));
    const issued = await createReportFor(id);
    expect(issued?.number).toMatch(new RegExp(`^RAP-${year}-\\d{5}$`));
    const number = issued!.number;

    // An amendment is refused: a version never sent is corrected.
    expect(await reopenForAmendment(id, admin(), reason)).toMatchObject({ ok: false, status: 409, error: CORRECTION_MESSAGES.useCorrection });

    const asked = await correctBeforeSend(id, admin(), reason);
    expect(asked).toMatchObject({ ok: true, number, version: 0, frozen: false });
    const reopened = await db.sample.findUniqueOrThrow({ where: { id }, select: { status: true, validatedById: true, approvedById: true } });
    expect(reopened).toEqual({ status: "RESULTATS_SAISIS", validatedById: null, approvedById: null });
    const pending = await reportOf(id);
    expect(pending.amendmentPending).toBe(true);
    expect(parseCorrectionTrace(pending.versions[0].correctedBeforeSend).pending).toMatchObject({ reason, byId: fixture.adminId });

    await validateAgain(id, at(11));
    const reissued = await amendReportFor(id, fixture.adminId);
    expect(reissued).toMatchObject({ id: pending.id, number, correctedInPlace: true });

    const after = await reportOf(id);
    expect(after).toMatchObject({ number, version: 0, amendedAt: null, amendmentPending: false });
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0]).toMatchObject({ version: 0, number, issuedAt: at(11) });
    const data = after.versions[0].data as { number?: string; amendment?: unknown };
    expect(data.number).toBe(number);
    expect(data.amendment ?? null).toBeNull();
    const trace = parseCorrectionTrace(after.versions[0].correctedBeforeSend);
    expect(trace.pending).toBeNull();
    expect(trace.replaced).toHaveLength(1);
    expect(trace.replaced[0]).toMatchObject({ reason, correctedById: fixture.adminId, issuedAt: at(10).toISOString(), reissuedAt: at(11).toISOString() });
    expect((trace.replaced[0].data as { number?: string }).number).toBe(number);
    // K7: the version in force is dated by its reissue.
    expect(versionIssuedAt(after)).toEqual(at(11));
    // A second approval issues nothing more: no pending correction.
    expect(await amendReportFor(id, fixture.adminId)).toEqual({ id: after.id, number });
    expect((await reportOf(id)).versions).toHaveLength(1);
  });

  it("(2) an « -A1 » never sent: corrected in place, keeps its suffix and its « Annule et remplace »", async () => {
    const { amendReportFor, correctBeforeSend, createReportFor, reopenForAmendment } = await import("./report-dispatch");
    const id = await approvedSample(at(12));
    const original = (await createReportFor(id))!.number;
    // Sent: the client has v0.
    await db.report.update({ where: { sampleId: id }, data: { sentAt: at(12, 30), sendStatus: "ENVOYE" } });
    await db.sample.update({ where: { id }, data: { status: "RAPPORT_ENVOYE" } });
    expect(await reopenForAmendment(id, admin(), "Amendement du lot")).toMatchObject({ ok: true });
    await validateAgain(id, at(13));
    const amended = await amendReportFor(id, fixture.adminId);
    expect(amended?.number).toBe(`${original}-A1`);
    const a1 = await reportOf(id);
    expect(a1).toMatchObject({ version: 1, amendedAt: at(13) });

    // -A1 never sent (sentAt 12:30 < amendedAt 13:00): corrected, not amended again.
    expect(await correctBeforeSend(id, admin(), reason)).toMatchObject({ ok: true, number: `${original}-A1`, version: 1 });
    await validateAgain(id, at(14));
    expect(await amendReportFor(id, fixture.adminId)).toMatchObject({ number: `${original}-A1`, correctedInPlace: true });

    const after = await reportOf(id);
    expect(after).toMatchObject({ number: original, version: 1, amendedAt: at(13), amendmentPending: false });
    expect(after.versions.map((version) => [version.version, version.number])).toEqual([
      [0, original],
      [1, `${original}-A1`],
    ]);
    const data = after.versions[1].data as { number?: string; amendment?: { previousNumber?: string } | null };
    expect(data.number).toBe(`${original}-A1`);
    // Still « annule et remplace » the version that left.
    expect(data.amendment?.previousNumber).toBe(original);
    expect(parseCorrectionTrace(after.versions[1].correctedBeforeSend).replaced).toHaveLength(1);
    // v0, the version sent, untouched.
    expect(after.versions[0].correctedBeforeSend).toBeNull();
    expect(versionIssuedAt(after)).toEqual(at(14));
  });

  it("(3) a send recorded, or the sample sent, while the correction runs: 409, nothing changed", async () => {
    const { correctBeforeSend, createReportFor } = await import("./report-dispatch");
    for (const meanwhile of ["sentAt", "status"] as const) {
      const id = await approvedSample(at(15));
      const issued = await createReportFor(id);
      const transaction = db.$transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
      const spy = vi.spyOn(db, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
        // What `sendReport` records between the correction's read and its write.
        if (meanwhile === "sentAt") await db.report.update({ where: { sampleId: id }, data: { sentAt: new Date() } });
        else await db.sample.update({ where: { id }, data: { status: "RAPPORT_ENVOYE" } });
        return transaction(...args);
      }) as never);
      const outcome = await correctBeforeSend(id, admin(), reason);
      spy.mockRestore();
      expect(outcome, meanwhile).toEqual({ ok: false, status: 409, error: CORRECTION_MESSAGES.sentMeanwhile });
      const sample = await db.sample.findUniqueOrThrow({ where: { id }, select: { status: true, approvedById: true } });
      expect(sample, meanwhile).toEqual({ status: meanwhile === "status" ? "RAPPORT_ENVOYE" : "VALIDE", approvedById: fixture.adminId });
      const report = await reportOf(id);
      expect(report.amendmentPending, meanwhile).toBe(false);
      expect(report.number).toBe(issued!.number);
      expect(parseCorrectionTrace(report.versions[0].correctedBeforeSend).pending, meanwhile).toBeNull();
    }
  });

  it("(4) an alerting germ changed by the correction alerts again exactly once; an unchanged one is not repeated", async () => {
    const { amendReportFor, correctBeforeSend, createReportFor, sendContaminationAlerts } = await import("./report-dispatch");
    const germs = await db.analysisParameter.findMany({
      where: { alertOnExceed: true, id: { in: ["ALIMENTAIRE-E. coli", "ALIMENTAIRE-Listeria"] } },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    expect(germs).toHaveLength(2);
    const [changed, unchanged] = germs;
    const id = await approvedSample(at(16), [
      { parameterId: changed.id, value: "120", numericValue: 120 },
      { parameterId: unchanged.id, value: "250", numericValue: 250 },
    ]);
    await createReportFor(id);
    // « Valider et envoyer » with no report address: the alert leaves, the report stays unsent.
    expect(await sendContaminationAlerts(id, fixture.adminId)).toEqual({ ok: true, sent: 2 });
    const firstAlert = (await db.sample.findUniqueOrThrow({ where: { id }, select: { alertsSentAt: true } })).alertsSentAt!;
    expect(firstAlert).not.toBeNull();

    expect(await correctBeforeSend(id, admin(), reason)).toMatchObject({ ok: true });
    await db.result.updateMany({ where: { sampleId: id, parameterId: changed.id }, data: { value: "150", numericValue: 150 } });
    // Approved again now (after the first alert), with « Valider » only.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const reapproved = new Date();
    expect(reapproved.getTime()).toBeGreaterThan(firstAlert.getTime());
    await validateAgain(id, reapproved);
    expect(await amendReportFor(id, fixture.adminId)).toMatchObject({ correctedInPlace: true });

    // K7 (review of lot 5A): the badge and the série's dialog see the alert pending.
    const reissued = await reportOf(id);
    expect(versionIssuedAt(reissued)).toEqual(reapproved);
    expect(alertNotSentForVersion({ alertsSentAt: firstAlert, versionIssuedAt: versionIssuedAt(reissued) })).toBe(true);
    expect(alertNotSentForVersion({ alertsSentAt: firstAlert, versionIssuedAt: reissued.amendedAt })).toBe(false);

    // The next send alerts the changed germ only — never dropping it, never repeating the other.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await sendContaminationAlerts(id, fixture.adminId)).toEqual({ ok: true, sent: 1 });
    const rows = await db.auditLog.findMany({
      where: { entity: "Sample", entityId: id, action: "CONTAMINATION_ALERT_SENT" },
      select: { metadata: true },
    });
    const byGerm = new Map<string, number>();
    for (const row of rows) {
      const germ = (JSON.parse(row.metadata ?? "{}") as { germe?: string }).germe ?? "";
      byGerm.set(germ, (byGerm.get(germ) ?? 0) + 1);
    }
    expect(byGerm.get(changed.name)).toBe(2);
    expect(byGerm.get(unchanged.name)).toBe(1);
    const secondAlert = (await db.sample.findUniqueOrThrow({ where: { id }, select: { alertsSentAt: true } })).alertsSentAt!;
    expect(alertNotSentForVersion({ alertsSentAt: secondAlert, versionIssuedAt: versionIssuedAt(reissued) })).toBe(false);

    // Once: a third call sends nothing.
    const third = await sendContaminationAlerts(id, fixture.adminId);
    expect(third).toMatchObject({ ok: true, sent: 0 });
  });

  it("(5) two corrections, the first approved with « Valider » only: the value it brought, never alerted, still alerts once", async () => {
    // Review of the integration (21/11): the corrected original used to be
    // judged against the data it replaced — the first correction's 150, never
    // sent nor alerted — so the second correction silently dropped the alert.
    const { amendReportFor, correctBeforeSend, createReportFor, sendContaminationAlerts } = await import("./report-dispatch");
    const germ = await db.analysisParameter.findFirstOrThrow({
      where: { alertOnExceed: true, id: "ALIMENTAIRE-E. coli" },
      select: { id: true, name: true },
    });
    const id = await approvedSample(at(17), [{ parameterId: germ.id, value: "120", numericValue: 120 }]);
    await createReportFor(id);
    // 120 alerted once, the report left unsent (no report address).
    expect(await sendContaminationAlerts(id, fixture.adminId)).toEqual({ ok: true, sent: 1 });

    // Correction 1: 120 → 150, approved with « Valider » only (nothing sent).
    expect(await correctBeforeSend(id, admin(), reason)).toMatchObject({ ok: true });
    await db.result.updateMany({ where: { sampleId: id, parameterId: germ.id }, data: { value: "150", numericValue: 150 } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await validateAgain(id, new Date());
    expect(await amendReportFor(id, fixture.adminId)).toMatchObject({ correctedInPlace: true });

    // Correction 2: the germ untouched, approved again.
    expect(await correctBeforeSend(id, admin(), "Erreur sur la date de prélèvement")).toMatchObject({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await validateAgain(id, new Date());
    expect(await amendReportFor(id, fixture.adminId)).toMatchObject({ correctedInPlace: true });
    expect(parseCorrectionTrace((await reportOf(id)).versions[0].correctedBeforeSend).replaced).toHaveLength(2);

    // The 150 was never alerted: it leaves now, exactly once.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await sendContaminationAlerts(id, fixture.adminId)).toEqual({ ok: true, sent: 1 });
    expect(await sendContaminationAlerts(id, fixture.adminId)).toMatchObject({ ok: true, sent: 0 });
    const alerts = await db.auditLog.count({ where: { entity: "Sample", entityId: id, action: "CONTAMINATION_ALERT_SENT" } });
    expect(alerts).toBe(2);
  });
});
