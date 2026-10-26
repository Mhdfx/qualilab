import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The owner's rule of 25/10 in the answers of the routes a role outside the
 * billing calls: the programme d'analyse (GET, PUT) and « Corriger la fiche
 * / les analyses » (PATCH …/intake). The handlers run for real; the
 * database, the session guard, the journal, the invoice holding the sample
 * (`heldInvoices`) and the programme's loaders are stubbed. Invented
 * numbers only.
 */

const stubs = vi.hoisted(() => {
  const db = () => ({
    $queryRaw: vi.fn(),
    sample: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    sampleParameter: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    result: { deleteMany: vi.fn() },
    analysisParameter: { findMany: vi.fn() },
    productType: { findMany: vi.fn(), findFirst: vi.fn() },
  });
  const tx = db();
  const prisma = { ...db(), $transaction: vi.fn() };
  return {
    tx,
    prisma,
    session: { current: null as unknown },
    held: vi.fn(),
    audit: vi.fn(),
    referential: {
      loadProgrammeSample: vi.fn(),
      loadProgrammeNatures: vi.fn(),
      loadProgrammeReferential: vi.fn(),
      normVersionsForParameters: vi.fn(),
      programmeNatureContext: vi.fn(),
      programmeOf: vi.fn(),
      serializeProgramme: vi.fn(),
    },
    input: { resolveProgrammeNature: vi.fn(), validateProgramme: vi.fn(), programmeParameterRows: vi.fn() },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/auth", () => ({ requireApiRole: async () => stubs.session.current }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.audit }));
vi.mock("@/lib/billing-hold", () => ({ heldInvoices: stubs.held }));
vi.mock("@/lib/programme-referential", () => stubs.referential);
vi.mock("@/lib/programme-input", () => stubs.input);

import { GET as programmeGet, PUT as programmePut } from "../app/api/samples/[id]/programme/route";
import { PATCH as intakePatch } from "../app/api/samples/[id]/intake/route";

const sessionOf = (role: string) => ({ id: `u-${role.toLowerCase()}`, username: role.toLowerCase(), name: role, role, mustChangePassword: false });
const params = { params: Promise.resolve({ id: "s1" }) };

/** The full notice and the redacted one (`billedAnalysesNotice`). */
const FULL =
  "Échantillon déjà facturé (FAC-2026-00012) : prévenez la comptabilité — avoir pour une analyse retirée, facture complémentaire pour une analyse ajoutée.";
const REDACTED = "Échantillon déjà facturé : prévenez la comptabilité.";

beforeEach(() => {
  vi.clearAllMocks();
  stubs.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(stubs.tx));
  stubs.held.mockResolvedValue(new Map([["s1", { invoiceId: "inv-1", number: "FAC-2026-00012" }]]));
  stubs.audit.mockResolvedValue(undefined);
});

describe("GET /api/samples/[id]/programme — the referential's catalogue prices", () => {
  beforeEach(() => {
    stubs.referential.loadProgrammeSample.mockResolvedValue({ id: "s1" });
    stubs.referential.loadProgrammeNatures.mockResolvedValue([]);
    stubs.referential.programmeNatureContext.mockReturnValue({});
    stubs.referential.serializeProgramme.mockReturnValue({ sample: { id: "s1" }, programme: {} });
    stubs.referential.loadProgrammeReferential.mockResolvedValue({ prices: {} });
    stubs.input.resolveProgrammeNature.mockReturnValue({ ok: true, natureId: "n-micro", changed: null });
  });

  it("asks for them for the administrator, never for the responsable des paramètres", async () => {
    for (const [role, withPrices] of [
      ["ADMIN", true],
      ["PROGRAMMATEUR", false],
    ] as const) {
      stubs.session.current = sessionOf(role);
      stubs.referential.loadProgrammeReferential.mockClear();
      const response = await programmeGet(new Request("http://localhost/api/samples/s1/programme?natureId=n-micro"), params);
      expect(response.status, role).toBe(200);
      expect(stubs.referential.loadProgrammeReferential, role).toHaveBeenCalledWith(
        { id: "s1" },
        expect.objectContaining({ natureId: "n-micro", withPrices })
      );
    }
  });

  it("answers the guard's refusal as it is", async () => {
    stubs.session.current = NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    expect((await programmeGet(new Request("http://localhost/api"), params)).status).toBe(403);
    expect(stubs.referential.loadProgrammeReferential).not.toHaveBeenCalled();
  });
});

describe("PUT /api/samples/[id]/programme — an edit of the analyses of a billed, confirmed programme", () => {
  const confirmed = {
    id: "s1",
    code: "12/26-1M",
    controlCode: "10/26",
    status: "PROGRAMME",
    analysisBlocked: false,
    type: "ALIMENTAIRE",
    natureId: "n-micro",
    nature: { id: "n-micro", code: "MICRO", label: "Microbiologie test" },
    clientId: "c1",
    technician: null,
    parameters: [
      { parameterId: "p1", normVersionId: null },
      { parameterId: "p2", normVersionId: null },
    ],
  };
  const edited = { ...confirmed, parameters: [{ parameterId: "p1", normVersionId: null }] };

  beforeEach(() => {
    stubs.referential.loadProgrammeSample.mockResolvedValueOnce(confirmed).mockResolvedValueOnce(edited);
    stubs.referential.loadProgrammeNatures.mockResolvedValue([]);
    stubs.referential.programmeNatureContext.mockReturnValue({});
    stubs.referential.normVersionsForParameters.mockResolvedValue({});
    stubs.referential.programmeOf.mockImplementation((row: typeof confirmed) => ({ parameterIds: row.parameters.map((p) => p.parameterId) }));
    stubs.referential.serializeProgramme.mockReturnValue({ sample: { id: "s1", status: "PROGRAMME" }, programme: {} });
    stubs.input.resolveProgrammeNature.mockReturnValue({ ok: true, natureId: "n-micro", changed: null });
    stubs.input.validateProgramme.mockReturnValue({
      ok: true,
      value: {
        natureId: "n-micro",
        confirm: false,
        parameters: [{ parameterId: "p1" }],
        parameterIds: ["p1"],
        productTypeId: null,
        unitCount: 1,
        testPortion: null,
        priority: "NORMALE",
        dueAt: null,
        programmeNote: "",
      },
    });
    stubs.input.programmeParameterRows.mockReturnValue([{ sampleId: "s1", parameterId: "p1" }]);
    stubs.prisma.analysisParameter.findMany.mockResolvedValue([{ id: "p1", name: "Germes test", category: "ALIMENTAIRE" }]);
    stubs.tx.$queryRaw.mockResolvedValue([]);
    stubs.tx.sampleParameter.findMany.mockResolvedValue([]);
    stubs.tx.sample.updateMany.mockResolvedValue({ count: 1 });
  });

  const put = () => programmePut(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify({ parameterIds: ["p1"] }) }), params);

  it("the administrator: the invoice named, and its label", async () => {
    stubs.session.current = sessionOf("ADMIN");
    const response = await put();
    expect(response.status).toBe(200);
    expect((await response.json()).billing).toEqual({ invoice: "FAC-2026-00012", notice: FULL });
  });

  it("the responsable des paramètres: the warning without the number — no `invoice`, no « FAC- » anywhere", async () => {
    stubs.session.current = sessionOf("PROGRAMMATEUR");
    const response = await put();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.billing).toEqual({ notice: REDACTED });
    expect(JSON.stringify(body)).not.toContain("FAC-");
    // The journal still names it for the accountant (« Analyses modifiées après facturation »).
    expect(stubs.audit.mock.calls[0][0].metadata.billedOn).toEqual({ invoiceId: "inv-1", number: "FAC-2026-00012" });
  });
});

describe("PATCH /api/samples/[id]/intake — « Corriger les analyses » on a billed sample", () => {
  const sampleAt = (status: string) => ({
    id: "s1",
    code: "12/26-1M",
    controlCode: "10/26",
    status,
    lineKind: "ALIMENT",
    type: "ALIMENTAIRE",
    produit: "Salade test",
    lieu: "Cuisine test",
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    quantity: null,
    quantityUnit: null,
    productTemperature: null,
    ambientTemperature: null,
    surfaceLabel: null,
    surfaceAreaCm2: null,
    surfaceAreaNote: null,
    surfaceState: null,
    personName: null,
    personRole: null,
    handsState: null,
    airMethod: null,
    airExposureMin: null,
    remarks: null,
    unitCount: 1,
    productTypeId: null,
    clientId: "c1",
    validatedById: null,
    parameters: [
      { parameterId: "p1", technicianId: null, normVersionId: null, dilutionFactor: null, note: null },
      { parameterId: "p2", technicianId: null, normVersionId: null, dilutionFactor: null, note: null },
    ],
  });

  async function correct(role: string, status: string) {
    const sample = sampleAt(status);
    stubs.session.current = sessionOf(role);
    stubs.prisma.sample.findUnique.mockResolvedValue(sample);
    stubs.prisma.analysisParameter.findMany.mockResolvedValue([{ id: "p1", name: "Germes test", category: "ALIMENTAIRE" }]);
    stubs.tx.$queryRaw.mockResolvedValue([{ status }]);
    stubs.tx.sampleParameter.findMany.mockResolvedValue(sample.parameters);
    stubs.tx.sample.update.mockResolvedValue({ ...sample, parameters: [sample.parameters[0]] });
    const response = await intakePatch(
      new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ reason: "Analyse retirée (test)", parameterIds: ["p1"] }) }),
      params
    );
    return { status: response.status, body: await response.json() };
  }

  it("the Direction and the administrator: the full answer", async () => {
    for (const [role, status] of [
      ["DIRECTION", "RECU"],
      ["ADMIN", "EN_ANALYSE"],
    ] as const) {
      const { status: code, body } = await correct(role, status);
      expect(code, role).toBe(200);
      expect(body.billing, role).toEqual({ invoice: "FAC-2026-00012", notice: FULL });
    }
  });

  it("the responsable des paramètres, the validateur, the réception: the warning without the number", async () => {
    for (const [role, status] of [
      ["PROGRAMMATEUR", "EN_ANALYSE"],
      ["VALIDATEUR", "RECU"],
      ["RECEPTIONNISTE", "RECU"],
    ] as const) {
      const { status: code, body } = await correct(role, status);
      expect(code, role).toBe(200);
      expect(body.billing, role).toEqual({ notice: REDACTED });
      expect(JSON.stringify(body), role).not.toContain("FAC-");
    }
  });

  it("a draft keeps its own sentence for everyone, and no invoice means no `billing`", async () => {
    stubs.held.mockResolvedValue(new Map([["s1", { invoiceId: "inv-2", number: null }]]));
    expect((await correct("PROGRAMMATEUR", "EN_ANALYSE")).body.billing.notice).toContain("brouillon de facture");
    expect((await correct("ADMIN", "EN_ANALYSE")).body.billing.invoice).toBe("brouillon");
    stubs.held.mockResolvedValue(new Map());
    expect((await correct("PROGRAMMATEUR", "EN_ANALYSE")).body).not.toHaveProperty("billing");
  });
});
