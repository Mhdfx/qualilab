import { describe, expect, it } from "vitest";
import type { SampleStatus } from "@/generated/prisma/enums";
import { ROLES } from "@/lib/roles";
import { verbsFor } from "@/lib/sample-verbs";
import { heldInvoiceFor } from "@/lib/price-access";
import { billedCorrectionWarning, cancelConsequences } from "@/components/samples/sample-verbs-logic";
import { invoiceReadIds, summaryLineOf, verbSampleOf, verbsReadBilling, withVerbFacts } from "./reception-verbs";
import type { ReceptionLineData } from "./SerieReceptionForm";

/**
 * The reception's « Annuler » says what /validation/[id] and
 * /programmation/[id] say (HANDOFF §9, 16/10 D1): the invoice holding the
 * sample and the contamination alert already sent, read for the whole série
 * in one query each — and only for whoever may cancel or correct billable
 * work there. Invented designations and invoice numbers only.
 */

const ALL_STATUSES: SampleStatus[] = [
  "PRELEVE",
  "RECU",
  "PROGRAMME",
  "EN_ANALYSE",
  "RESULTATS_SAISIS",
  "VALIDE",
  "RAPPORT_ENVOYE",
  "ANNULE",
];

/** A sample as the série's query reads it: the rest of the line does not matter here. */
const row = (id: string, status: SampleStatus, extra: { alertsSentAt?: Date | null; report?: { id: string } | null } = {}) => ({
  id,
  status,
  code: `1/26-${id}`,
  alertsSentAt: extra.alertsSentAt ?? null,
  report: extra.report ?? null,
});

const SENT = new Date("2026-10-19T08:00:00.000Z");

describe("verbsReadBilling — who needs the invoice and the alert on the reception page", () => {
  it("the administrator, on billable work he may cancel or correct", () => {
    const read = ALL_STATUSES.filter((status) => verbsReadBilling(status, "ADMIN"));
    expect(read).toEqual(["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"]);
  });

  it("never the réception: it neither cancels nor changes the analyses of programmed work (Q13 / Q128)", () => {
    expect(ALL_STATUSES.filter((status) => verbsReadBilling(status, "RECEPTIONNISTE"))).toEqual([]);
  });

  it("never before the programme: nothing is billed yet", () => {
    expect(verbsReadBilling("PRELEVE", "ADMIN")).toBe(false);
    expect(verbsReadBilling("RECU", "ADMIN")).toBe(false);
  });

  it("agrees with the verbs, for every role whatever the page's guard: read exactly where « Annuler » or « Corriger les analyses » shows on billable work", () => {
    for (const status of ALL_STATUSES) {
      for (const role of ROLES) {
        const verbs = verbsFor({ status }, role);
        const billable = ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS", "VALIDE", "RAPPORT_ENVOYE"].includes(status);
        if (billable && verbs.cancel) expect(verbsReadBilling(status, role)).toBe(true);
        // `billedCorrectionWarning` needs `invoiced` too.
        if (billable && verbs.correctAnalyses) expect(verbsReadBilling(status, role)).toBe(true);
        // Never read where no verb says it: the alert's date stays on the server.
        if (verbsReadBilling(status, role)) expect(billable && (verbs.cancel || verbs.correctAnalyses)).toBe(true);
      }
    }
  });
});

describe("invoiceReadIds — one heldInvoices call for the série", () => {
  it("a série still at the reception: no id, so no query", () => {
    expect(invoiceReadIds([row("a", "PRELEVE"), row("b", "PRELEVE")], "ADMIN")).toEqual([]);
    expect(invoiceReadIds([row("a", "RECU"), row("b", "ANNULE")], "ADMIN")).toEqual([]);
  });

  it("the administrator: every billable sample of the série at once", () => {
    const samples = [row("a", "RECU"), row("b", "PROGRAMME"), row("c", "EN_ANALYSE"), row("d", "RESULTATS_SAISIS"), row("e", "VALIDE")];
    expect(invoiceReadIds(samples, "ADMIN")).toEqual(["b", "c", "d"]);
  });

  it("the réception: nothing to read", () => {
    expect(invoiceReadIds([row("b", "PROGRAMME"), row("c", "EN_ANALYSE")], "RECEPTIONNISTE")).toEqual([]);
  });
});

describe("withVerbFacts — the série's lines with the verbs' facts", () => {
  const held = new Map([
    ["issued", { number: "FAC-2026-00012" }],
    ["draft", { number: null }],
  ]);

  it("names the invoice, a draft, or none, and the alert's date as the screen reads it", () => {
    const [issued, draft, none] = withVerbFacts(
      [row("issued", "RESULTATS_SAISIS", { alertsSentAt: SENT }), row("draft", "PROGRAMME"), row("none", "EN_ANALYSE")],
      held,
      "ADMIN"
    );
    expect(issued).toMatchObject({ invoiced: { number: "FAC-2026-00012", issued: true }, alertsSentAt: "2026-10-19T08:00:00.000Z", hasReport: false });
    expect(draft).toMatchObject({ invoiced: { number: null, issued: false }, alertsSentAt: null });
    expect(none).toMatchObject({ invoiced: null, alertsSentAt: null });
  });

  it("tells the invoice through `heldInvoiceFor`: never its id, its number for a billing role only (25/10)", () => {
    const withId = new Map([["issued", { invoiceId: "inv-1", number: "FAC-2026-00012" }]]);
    const [admin] = withVerbFacts([row("issued", "RESULTATS_SAISIS")], withId, "ADMIN");
    expect(admin.invoiced).toEqual({ number: "FAC-2026-00012", issued: true });
    // A role outside the billing that the verbs ever let read it would get the warning without the number.
    expect(heldInvoiceFor({ number: "FAC-2026-00012" }, "RECEPTIONNISTE")).toEqual({ number: null, issued: true });
  });

  it("reduces the report to whether one exists, and keeps the rest of the line", () => {
    const [line] = withVerbFacts([row("r", "RESULTATS_SAISIS", { report: { id: "rep1" } })], new Map(), "ADMIN");
    expect(line).toEqual({ id: "r", status: "RESULTATS_SAISIS", code: "1/26-r", hasReport: true, invoiced: null, alertsSentAt: null });
    expect(line).not.toHaveProperty("report");
  });

  it("before the programme: no invoice nor alert read, the report still told", () => {
    const [line] = withVerbFacts([row("p", "RECU")], held, "ADMIN");
    expect(line).toEqual({ id: "p", status: "RECU", code: "1/26-p", hasReport: false });
  });

  it("for the réception the alert's date stays on the server, even when one was sent", () => {
    const [line] = withVerbFacts([row("issued", "RESULTATS_SAISIS", { alertsSentAt: SENT })], held, "RECEPTIONNISTE");
    expect(line).not.toHaveProperty("alertsSentAt");
    expect(line).not.toHaveProperty("invoiced");
    expect(line.hasReport).toBe(false);
  });

  it("survives the page's JSON round trip: null facts stay null, unread ones stay absent", () => {
    const lines = withVerbFacts([row("none", "EN_ANALYSE"), row("p", "RECU")], new Map(), "ADMIN");
    const [read, unread] = JSON.parse(JSON.stringify(lines)) as Record<string, unknown>[];
    expect(read.invoiced).toBeNull();
    expect(read.alertsSentAt).toBeNull();
    expect(unread).not.toHaveProperty("invoiced");
  });
});

/** A line of the reception page as `SerieReceptionForm` receives it. */
const line: ReceptionLineData = {
  id: "s1",
  code: "1/26-1",
  lineNumber: 1,
  lineKind: "ALIMENT",
  type: "ALIMENTAIRE",
  status: "EN_ANALYSE",
  lieu: "Cuisine",
  produit: "Salade test",
  numeroLot: null,
  productionDate: null,
  expiryDate: null,
  quantity: 250,
  quantityUnit: "G",
  productTemperature: null,
  ambientTemperature: null,
  surfaceLabel: null,
  surfaceAreaCm2: null,
  surfaceAreaNote: null,
  airExposureMin: null,
  personName: null,
  personRole: null,
  handsState: null,
  remarks: null,
  unitCount: 1,
  controlCode: "10/26",
  receptionTemperature: 4,
  conformity: true,
  conformityReason: null,
  conformityNote: null,
  cancelReason: null,
  nature: { id: "n1", code: "AL", label: "Aliment", family: "MICRO" },
  productType: { id: "pt1", name: "Plats cuisinés" },
  parameters: [{ parameter: { id: "p1", name: "Germes test", unit: null } }],
  technician: null,
};

describe("verbSampleOf → « Annuler » on the reception page says what the validation page says", () => {
  it("an invoiced sample: the invoice is named, the line stays, an avoir follows", () => {
    const sample = verbSampleOf({ ...line, hasReport: false, invoiced: { number: "FAC-2026-00012", issued: true }, alertsSentAt: null }, "c1");
    expect(cancelConsequences(sample)).toEqual({
      text: "L'échantillon sort de toutes les files et du rapport.",
      warnings: ["Déjà facturé (FAC-2026-00012) : sa ligne reste sur la facture, la comptabilité établira un avoir."],
    });
  });

  it("on a draft, with an alert already sent: both are said", () => {
    const sample = verbSampleOf({ ...line, invoiced: { number: null, issued: false }, alertsSentAt: "2026-10-19T08:00:00.000Z" }, "c1");
    const { warnings } = cancelConsequences(sample);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("brouillon de facture");
    expect(warnings[1]).toContain("alerte de contamination est déjà partie");
  });

  it("on no invoice: out of the billing too, no « s'il est déjà facturé »", () => {
    const { text, warnings } = cancelConsequences(verbSampleOf({ ...line, invoiced: null, alertsSentAt: null }, "c1"));
    expect(text).toBe("L'échantillon sort de toutes les files, du rapport et de la facturation.");
    expect(warnings).toEqual([]);
  });

  it("an older payload without the facts keeps the neutral wording", () => {
    expect(cancelConsequences(verbSampleOf(line, "c1")).text).toContain("s'il est déjà facturé");
  });

  it("« Corriger les analyses » warns on the invoiced sample too", () => {
    const sample = verbSampleOf({ ...line, invoiced: { number: "FAC-2026-00012", issued: true } }, "c1");
    expect(billedCorrectionWarning(sample, [])).toContain("FAC-2026-00012");
  });

  it("an issued report hides « Annuler » (corrected by the amendment), as on the validation page", () => {
    const reopened = verbSampleOf({ ...line, status: "RESULTATS_SAISIS", hasReport: true }, "c1");
    expect(verbsFor(reopened, "ADMIN").cancel).toBe(false);
    expect(verbsFor(verbSampleOf({ ...line, hasReport: false }, "c1"), "ADMIN").cancel).toBe(true);
  });

  it("a série just received: the status given overrides the line's", () => {
    const sample = verbSampleOf({ ...line, status: "PRELEVE" }, "c1", "RECU");
    expect(sample.status).toBe("RECU");
    expect(sample.parameterIds).toEqual(["p1"]);
    expect(sample.clientId).toBe("c1");
  });
});

describe("summaryLineOf — the summary read again after « Annuler » or « Corriger la fiche »", () => {
  // What `ReceivedSummary` reads while `justReceived` holds (it stays true
  // after the refresh): the line's own status, RECU when the API's answer
  // gave none.
  const summaryVerbs = (source: ReceptionLineData, role: "ADMIN" | "RECEPTIONNISTE") => {
    const summary = summaryLineOf(source);
    return verbsFor(verbSampleOf(source, "c1", summary.status ?? "RECU"), role);
  };

  it("a line cancelled in the summary shows « Annulé · Doublon », no « Annuler », and « Réactiver » for the administrator", () => {
    const cancelled: ReceptionLineData = { ...line, status: "ANNULE", cancelReason: "DOUBLON" };
    expect(summaryLineOf(cancelled)).toMatchObject({ status: "ANNULE", cancelReason: "DOUBLON" });
    expect(summaryVerbs(cancelled, "ADMIN")).toMatchObject({ cancel: false, reactivate: true });
    expect(summaryVerbs(cancelled, "RECEPTIONNISTE")).toMatchObject({ cancel: false, reactivate: false });
  });

  it("a received line still offers « Annuler » to the réception", () => {
    const received: ReceptionLineData = { ...line, status: "RECU" };
    expect(summaryLineOf(received)).toMatchObject({ status: "RECU", cancelReason: null });
    expect(summaryVerbs(received, "RECEPTIONNISTE").cancel).toBe(true);
  });

  it("a programmed line keeps its step: « Annuler » names its draft invoice, not « …et de la facturation. »", () => {
    const programmed: ReceptionLineData = { ...line, status: "PROGRAMME", invoiced: { number: null, issued: false }, alertsSentAt: null };
    const sample = verbSampleOf(programmed, "c1", summaryLineOf(programmed).status ?? "RECU");
    expect(sample.status).toBe("PROGRAMME");
    const { text, warnings } = cancelConsequences(sample);
    expect(text).toBe("L'échantillon sort de toutes les files et du rapport.");
    expect(warnings[0]).toContain("brouillon de facture");
  });

  it("an older payload without the optional fields: their defaults, never undefined", () => {
    const summary = summaryLineOf({ ...line, cancelReason: null });
    expect(summary).toMatchObject({ receptionNote: null, analysisBlocked: false, awaitingClientSince: null, assignedAt: null });
    expect(summary.nature).toEqual({ label: "Aliment" });
  });
});
