import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/series/[id]/document — the bon de réception of a deposit and its
 * « Avance » (the amount paid at the counter and its mode). The owner's
 * rule of 25/10: the réception keeps it, so do the billing roles; the
 * validateur, who may print the bon by its URL, gets it empty, like
 * « Reste ». The handler and the bon's HTML run for real; the database, the
 * guard, the company, the logo and Chromium are stubbed. Invented names only.
 */

const stubs = vi.hoisted(() => ({
  prisma: {
    serie: { findUnique: vi.fn() },
    labSettings: { findUnique: vi.fn() },
    documentReference: { findUnique: vi.fn() },
  },
  session: { current: null as unknown },
  html: { last: "" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/auth", () => ({ requireApiRole: async () => stubs.session.current }));
vi.mock("@/lib/pdf", () => ({
  renderPdf: async (html: string) => {
    stubs.html.last = html;
    return Buffer.from("%PDF-test");
  },
}));
vi.mock("@/lib/company-server", () => ({
  getCompany: async () => ({
    name: "Laboratoire test",
    tagline: "",
    address: "1 rue test",
    city: "Ville test",
    phone: "0500000000",
    email: "labo@example.test",
    website: "",
    ice: "000000000000000",
    rc: "",
    bank: "",
    rib: "",
    iban: "",
    swift: "",
    logoData: null,
    fiscalId: null,
    patente: null,
    cnss: null,
    fax: null,
  }),
}));
vi.mock("@/lib/document-logo", () => ({ documentLogo: async () => null }));

import { GET } from "../app/api/series/[id]/document/route";

const DEPOSIT = {
  id: "serie-1",
  kind: "DEPOT",
  serialNumber: "12/26",
  clientReference: null,
  cadre: "CONVENTION",
  cadreNote: null,
  interlocutor: "Déposant test",
  samplerKind: "CLIENT",
  samplerName: null,
  startedAt: new Date("2026-10-20T08:00:00.000Z"),
  endedAt: null,
  arrivedAt: new Date("2026-10-20T08:30:00.000Z"),
  coolerTemperature: null,
  advanceAmount: "300.00",
  advanceMode: "ESPECES",
  analysesMicro: true,
  analysesChimie: false,
  notes: null,
  createdById: "u-recep",
  client: { name: "Client test", address: null, phone: null },
  site: null,
  samplerUser: null,
  receivedBy: { name: "Réception test" },
  samples: [],
};

const sessionOf = (role: string) => ({ id: `u-${role.toLowerCase()}`, username: role.toLowerCase(), name: role, role, mustChangePassword: false });

async function bonFor(role: string) {
  stubs.session.current = sessionOf(role);
  stubs.html.last = "";
  const response = await GET(new Request("http://localhost/api/series/serie-1/document"), { params: Promise.resolve({ id: "serie-1" }) });
  expect(response.status, role).toBe(200);
  return stubs.html.last;
}

/** The text of the bon's « Avance : » field. */
const advanceOf = (html: string) => {
  const match = html.match(/Avance :<\/span>\s*<span class="v">([^<]*)<\/span>/);
  expect(match, "the « Avance » field").not.toBeNull();
  return match![1];
};

beforeEach(() => {
  vi.clearAllMocks();
  stubs.prisma.serie.findUnique.mockResolvedValue(DEPOSIT);
  stubs.prisma.labSettings.findUnique.mockResolvedValue(null);
  stubs.prisma.documentReference.findUnique.mockResolvedValue(null);
});

describe("the bon de réception's « Avance », role by role (25/10)", () => {
  it("prints the advance and its mode for the réception and the billing roles", async () => {
    for (const role of ["RECEPTIONNISTE", "ADMIN", "DIRECTION", "GESTIONNAIRE"]) {
      const advance = advanceOf(await bonFor(role));
      expect(advance, role).toMatch(/^300,00\sDH — Espèces$/);
    }
  });

  it("prints it empty for the validateur, like « Reste »", async () => {
    const html = await bonFor("VALIDATEUR");
    expect(advanceOf(html)).toBe("");
    expect(html).not.toContain("Espèces");
    expect(html).not.toMatch(/300,00/);
  });
});
