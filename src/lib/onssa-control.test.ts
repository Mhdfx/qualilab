import { describe, expect, it } from "vitest";
import { ONSSA_OFFICIAL_CONTROL } from "./lab-proposals";
import {
  EMPTY_ONSSA_DRAFT,
  NO_ONSSA_CONTROL,
  ONSSA_CONTROL_MESSAGES,
  ONSSA_TEXT_MAX,
  formatOnssaControl,
  onssaDraftError,
  onssaDraftOf,
  onssaPayload,
  patchOnssaControl,
  readOnssaControl,
} from "./onssa-control";
import { validateSerie, type NatureRef } from "./serie-input";

/**
 * Lot 3E, N1 (RETOUR-LABO-28-10.md §3.2, O-6): « contrôle officiel » /
 * autocontrôle beside the cadre — the rules the creation, the correction
 * and the screens share. Invented names only.
 */

describe("the switch", () => {
  it("is on: the owner's go of 01/11 (O-6 taken as yes)", () => {
    expect(ONSSA_OFFICIAL_CONTROL).toBe(true);
  });

  it("off, every série reads as an autocontrôle and nothing is ever patched", () => {
    expect(readOnssaControl({ controleOfficiel: true, organismePreleveur: "DR Test" }, false)).toEqual({
      ok: true,
      value: NO_ONSSA_CONTROL,
    });
    expect(patchOnssaControl(NO_ONSSA_CONTROL, { controleOfficiel: true, organismePreleveur: "DR Test" }, false)).toEqual({
      ok: true,
      changed: false,
    });
  });
});

describe("readOnssaControl — a new série", () => {
  it("reads an absent block as an autocontrôle with no origin (a page opened before the fields)", () => {
    expect(readOnssaControl({})).toEqual({ ok: true, value: NO_ONSSA_CONTROL });
  });

  it("keeps an official control with its body, establishment and origin, spaces tidied", () => {
    expect(
      readOnssaControl({
        controleOfficiel: true,
        organismePreleveur: "  DR ONSSA   Région Test ",
        etablissement: "Établissement Test",
        origine: "Importé",
      })
    ).toEqual({
      ok: true,
      value: {
        controleOfficiel: true,
        organismePreleveur: "DR ONSSA Région Test",
        etablissement: "Établissement Test",
        origine: "Importé",
      },
    });
  });

  it("requires the body of an official control; the establishment and the origin stay optional", () => {
    expect(readOnssaControl({ controleOfficiel: true })).toEqual({ ok: false, error: ONSSA_CONTROL_MESSAGES.bodyMissing });
    expect(readOnssaControl({ controleOfficiel: true, organismePreleveur: "   " })).toEqual({
      ok: false,
      error: ONSSA_CONTROL_MESSAGES.bodyMissing,
    });
    expect(readOnssaControl({ controleOfficiel: true, organismePreleveur: "DR Test" })).toMatchObject({
      ok: true,
      value: { etablissement: null, origine: null },
    });
  });

  it("drops the body and the establishment of an autocontrôle, keeps its origin", () => {
    expect(
      readOnssaControl({ controleOfficiel: false, organismePreleveur: "DR Test", etablissement: "X", origine: "Local" })
    ).toEqual({ ok: true, value: { ...NO_ONSSA_CONTROL, origine: "Local" } });
  });

  it("refuses a box that is not a boolean, a text that is not a string or too long", () => {
    expect(readOnssaControl({ controleOfficiel: "oui" })).toEqual({ ok: false, error: ONSSA_CONTROL_MESSAGES.invalidFlag });
    expect(readOnssaControl({ origine: 12 })).toMatchObject({ ok: false, error: expect.stringContaining("L'origine") });
    expect(
      readOnssaControl({ controleOfficiel: true, organismePreleveur: "x".repeat(ONSSA_TEXT_MAX + 1) })
    ).toMatchObject({ ok: false, error: expect.stringContaining("191 caractères") });
    expect(readOnssaControl({ controleOfficiel: true, organismePreleveur: "x".repeat(ONSSA_TEXT_MAX) })).toMatchObject({
      ok: true,
    });
  });
});

describe("patchOnssaControl — a correction", () => {
  const official = {
    controleOfficiel: true,
    organismePreleveur: "DR Test",
    etablissement: "Établissement Test",
    origine: "Local",
  };

  it("changes only what is sent, and says which fields changed", () => {
    expect(patchOnssaControl(official, { origine: "Importé" })).toEqual({
      ok: true,
      changed: true,
      value: { ...official, origine: "Importé" },
      fields: ["origine"],
    });
  });

  it("is a no-op when nothing ONSSA is sent or the values are the stored ones", () => {
    expect(patchOnssaControl(official, { notes: "x" })).toEqual({ ok: true, changed: false });
    expect(patchOnssaControl(official, { ...official })).toEqual({ ok: true, changed: false });
  });

  it("unticking clears the body and the establishment; ticking without a body is refused", () => {
    expect(patchOnssaControl(official, { controleOfficiel: false })).toEqual({
      ok: true,
      changed: true,
      value: { ...NO_ONSSA_CONTROL, origine: "Local" },
      fields: ["controleOfficiel", "organismePreleveur", "etablissement"],
    });
    expect(patchOnssaControl(NO_ONSSA_CONTROL, { controleOfficiel: true })).toEqual({
      ok: false,
      error: ONSSA_CONTROL_MESSAGES.bodyMissing,
    });
    expect(patchOnssaControl(official, { organismePreleveur: "" })).toEqual({
      ok: false,
      error: ONSSA_CONTROL_MESSAGES.bodyMissing,
    });
  });

  it("refuses a malformed box", () => {
    expect(patchOnssaControl(official, { controleOfficiel: "true" })).toEqual({
      ok: false,
      error: ONSSA_CONTROL_MESSAGES.invalidFlag,
    });
  });
});

describe("the screens' draft", () => {
  it("round-trips a stored série and sends no body for an autocontrôle", () => {
    const draft = onssaDraftOf({ controleOfficiel: false, organismePreleveur: null, etablissement: null, origine: "Local" });
    expect(draft).toEqual({ ...EMPTY_ONSSA_DRAFT, origine: "Local" });
    expect(onssaPayload({ ...draft, organismePreleveur: "typed then unticked" })).toEqual({
      ...NO_ONSSA_CONTROL,
      origine: "Local",
    });
    expect(onssaDraftOf(undefined)).toEqual(EMPTY_ONSSA_DRAFT);
  });

  it("checks the draft with the server's rule", () => {
    expect(onssaDraftError({ ...EMPTY_ONSSA_DRAFT, controleOfficiel: true })).toBe(ONSSA_CONTROL_MESSAGES.bodyMissing);
    expect(onssaDraftError({ ...EMPTY_ONSSA_DRAFT, controleOfficiel: true, organismePreleveur: "DR Test" })).toBeNull();
    expect(onssaDraftError(EMPTY_ONSSA_DRAFT)).toBeNull();
  });

  it("formats the journal's before / after", () => {
    expect(formatOnssaControl(NO_ONSSA_CONTROL)).toBe("Autocontrôle");
    expect(formatOnssaControl({ ...NO_ONSSA_CONTROL, origine: "Local" })).toBe("Autocontrôle — origine : Local");
    expect(
      formatOnssaControl({ controleOfficiel: true, organismePreleveur: "DR Test", etablissement: null, origine: "Importé" })
    ).toBe("Contrôle officiel — DR Test · origine : Importé");
  });
});

describe("validateSerie carries the block (visit and deposit alike)", () => {
  const natures = new Map<string, NatureRef>([
    ["aliments", { id: "aliments", code: "MICRO_ALIMENTS", family: "MICRO", defaultLineKind: "ALIMENT", active: true }],
  ]);
  const line = {
    lineKind: "ALIMENT",
    analysesMicro: true,
    produit: "Produit test",
    lieu: "Poste test",
    productTemperature: "2",
    ambientTemperature: "20",
    parameterIds: [],
  };
  const visit = {
    clientId: "c1",
    cadre: "CONVENTION",
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    lines: [line],
  };

  it("defaults to an autocontrôle, the cadre untouched", () => {
    const r = validateSerie(visit, natures, { kind: "VISITE" });
    expect(r).toMatchObject({ ok: true, value: { cadre: "CONVENTION", onssa: NO_ONSSA_CONTROL } });
  });

  it("keeps an official control beside any cadre", () => {
    const r = validateSerie(
      { ...visit, cadre: "AUTRE", controleOfficiel: true, organismePreleveur: "DR Test", origine: "Local" },
      natures,
      { kind: "VISITE" }
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        cadre: "AUTRE",
        onssa: { controleOfficiel: true, organismePreleveur: "DR Test", etablissement: null, origine: "Local" },
      },
    });
  });

  it("refuses an official control without its body, before the lines are read", () => {
    expect(validateSerie({ ...visit, controleOfficiel: true, lines: [] }, natures, { kind: "VISITE" })).toEqual({
      ok: false,
      error: ONSSA_CONTROL_MESSAGES.bodyMissing,
    });
  });
});
