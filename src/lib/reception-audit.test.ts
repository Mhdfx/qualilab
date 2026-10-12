import { describe, expect, it } from "vitest";
import { parseChecklistRow, parseReceptionAudit, receivedChecklists } from "./reception-audit";

/** A SAMPLE_RECEIVED entry as the reception writes it (invented values). */
const entry = {
  from: "PRELEVE",
  to: "RECU",
  ref: "1",
  checklist: [
    { n: 1, key: "EXPLOITABLE", text: "échantillon exploitable", status: "CONFORME", detail: "Déclaré exploitable", rules: [] },
    { n: 2, key: "ALIMENT_MICRO", text: "poids minimal 100 g", status: "A_VERIFIER", detail: "Quantité non renseignée", reason: "QUANTITE_INSUFFISANTE", rules: ["ALIMENT_MICRO_POIDS"] },
  ],
  complementary: [
    { n: 2, key: "TRANSPORT_TEMP", code: "C2", text: "température de transport", status: "CONFORME", detail: "4 °C", rules: ["CHAINE_FROID"] },
    { n: 3, key: "EMBALLAGE", code: "C3", text: "emballage", status: "NON_CONFORME", reason: "EMBALLAGE", rules: ["EMBALLAGE"] },
  ],
};

describe("parseReceptionAudit — the checklist as decided (A8)", () => {
  it("reads the seven rules and the coded controls back", () => {
    const parsed = parseReceptionAudit(JSON.stringify(entry));
    expect(parsed?.checklist.map((row) => [row.n, row.status])).toEqual([
      [1, "CONFORME"],
      [2, "A_VERIFIER"],
    ]);
    expect(parsed?.checklist[1]).toMatchObject({ reason: "QUANTITE_INSUFFISANTE", detail: "Quantité non renseignée" });
    expect(parsed?.complementary.map((row) => [row.code, row.status])).toEqual([
      ["C2", "CONFORME"],
      ["C3", "NON_CONFORME"],
    ]);
  });

  it("reads a reception before the contrôles complémentaires: the checklist alone", () => {
    const { complementary: _coded, ...before } = entry;
    expect(_coded).toHaveLength(2);
    expect(parseReceptionAudit(JSON.stringify(before))).toMatchObject({ complementary: [] });
    expect(parseReceptionAudit(JSON.stringify({ ...before, complementary: null }))?.complementary).toEqual([]);
  });

  it("gives null for a reception before the checklist (09/10) and for anything unreadable — never throws", () => {
    expect(parseReceptionAudit(JSON.stringify({ from: "PRELEVE", to: "RECU", conformity: true }))).toBeNull();
    expect(parseReceptionAudit(JSON.stringify({ checklist: [] }))).toBeNull();
    expect(parseReceptionAudit(JSON.stringify({ checklist: "oui" }))).toBeNull();
    expect(parseReceptionAudit("{pas du json")).toBeNull();
    expect(parseReceptionAudit("null")).toBeNull();
    expect(parseReceptionAudit("[1,2]")).toBeNull();
    expect(parseReceptionAudit("")).toBeNull();
    expect(parseReceptionAudit(null)).toBeNull();
    expect(parseReceptionAudit(undefined)).toBeNull();
  });

  it("drops the rows of another shape, and keeps each group to its own rows", () => {
    const messy = {
      checklist: [entry.checklist[0], { n: "2" }, null, { ...entry.checklist[1], status: "PEUT_ETRE" }, entry.complementary[0]],
      complementary: [entry.complementary[1], { ...entry.checklist[0] }, 42],
    };
    const parsed = parseReceptionAudit(JSON.stringify(messy));
    expect(parsed?.checklist.map((row) => row.n)).toEqual([1]);
    expect(parsed?.complementary.map((row) => row.code)).toEqual(["C3"]);
  });

  it("cleans a row: unknown motif dropped, non-string rules dropped", () => {
    expect(
      parseChecklistRow({ n: 6, key: "TEMPERATURE", text: "t°", status: "A_VERIFIER", reason: "INCONNU", rules: ["A", 3, null] })
    ).toEqual({ n: 6, key: "TEMPERATURE", text: "t°", status: "A_VERIFIER", rules: ["A"] });
    expect(parseChecklistRow([1])).toBeNull();
    expect(parseChecklistRow({ n: Number.NaN, key: "X", text: "x", status: "CONFORME" })).toBeNull();
  });
});

describe("receivedChecklists — the latest entry of each sample", () => {
  it("maps each sample to its newest readable entry, null without one", () => {
    const newer = { ...entry, checklist: [{ ...entry.checklist[0], detail: "Plus récent" }] };
    const map = receivedChecklists(
      ["s1", "s2", "s3"],
      [
        { entityId: "s1", metadata: JSON.stringify(newer) },
        { entityId: "s1", metadata: JSON.stringify(entry) },
        { entityId: "s2", metadata: "{cassé" },
        { entityId: "s2", metadata: JSON.stringify(entry) },
        { entityId: "autre", metadata: JSON.stringify(entry) },
        { entityId: null, metadata: JSON.stringify(entry) },
      ]
    );
    expect(map.s1?.checklist[0].detail).toBe("Plus récent");
    // An unreadable newest entry falls back to the older one.
    expect(map.s2?.checklist).toHaveLength(2);
    expect(map.s3).toBeNull();
    expect(Object.keys(map)).toEqual(["s1", "s2", "s3"]);
  });
});
