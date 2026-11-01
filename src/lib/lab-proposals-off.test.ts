import { describe, expect, it, vi } from "vitest";

/**
 * The switches of lot 3A turned OFF (src/lib/lab-proposals.ts): each goes
 * back to the behaviour before 01/11, nothing else changes. The module is
 * mocked here, so the pure rules read `false` as the server and the screens
 * would.
 */
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE: false,
  OBSERVATION_ONLY_DELAY_AND_TEMPERATURE: false,
  COMMERCIAL_RESENDS_REPORTS: false,
}));

const { complementaryChecklist, DEFAULT_COMPLEMENTARY_THRESHOLDS } = await import("./reception-complementary");
const { rowToJustify } = await import("./reception-rules");
const { canResendReport, reportSendRefusal } = await import("./report-actions");
const { UNDECLARED_SAMPLING_HINT } = await import("./serie-input");

describe("lot 3A — the switches off", () => {
  it("UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE off: C1 of an undeclared time is « à vérifier » again, to justify", () => {
    const rows = complementaryChecklist(
      { lineKind: "ALIMENT", family: "MICRO" },
      {
        startedAt: new Date("2026-10-10T08:00:00Z"),
        endedAt: null,
        arrivedAt: new Date("2026-10-10T08:00:00Z"),
        samplingTimeDeclared: false,
        receivedAt: new Date("2026-10-10T09:00:00Z"),
      },
      DEFAULT_COMPLEMENTARY_THRESHOLDS,
      { identificationOk: true }
    );
    const c1 = rows.find((row) => row.code === "C1");
    expect(c1).toMatchObject({ status: "A_VERIFIER", reason: "DELAI", detail: "Heure de prélèvement non déclarée" });
    expect(rowToJustify(rows, true, "")).toMatchObject({ code: "C1" });
    expect(UNDECLARED_SAMPLING_HINT).toMatch(/« à vérifier » et l'observation de réception obligatoire/);
  });

  it("OBSERVATION_ONLY_DELAY_AND_TEMPERATURE off: a DLC or a quantity doubt needs the observation again", () => {
    expect(rowToJustify([{ key: "DLC" as const, status: "A_VERIFIER" as const }], true, "")).toMatchObject({ key: "DLC" });
    expect(rowToJustify([{ key: "ALIMENT_MICRO" as const, status: "A_VERIFIER" as const }], true, null)).not.toBeNull();
  });

  it("COMMERCIAL_RESENDS_REPORTS off: the gestionnaire commercial neither sends nor resends", () => {
    const sent = { sentAt: new Date("2026-10-20T10:00:00Z"), amendedAt: null, amendmentPending: false };
    expect(canResendReport("GESTIONNAIRE", "RAPPORT_ENVOYE", false, true)).toBe(false);
    expect(reportSendRefusal("GESTIONNAIRE", sent)).toBe("Votre profil n'est pas autorisé à envoyer les rapports.");
    expect(canResendReport("VALIDATEUR", "VALIDE", false, false)).toBe(true);
  });
});
