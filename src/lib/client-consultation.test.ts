import { describe, expect, it } from "vitest";
import {
  CONSULTATION_CHANNELS,
  CONSULTATION_MESSAGES,
  EMPTY_CONSULTATION,
  RECEPTION_DECISIONS,
  consultationDraftError,
  consultationMissing,
  consultationText,
  isEmptyConsultation,
  parseConsultation,
  parseDecision,
  storedConsultation,
} from "./client-consultation";
import { CONSULTATION_CHANNEL_LABELS, RECEPTION_DECISION_LABELS } from "./labels";

const now = new Date("2026-10-10T14:30:00.000Z");

describe("parseDecision — analyse, wait for the client, destroy", () => {
  it("keeps the 29/09 default (analyse) and the three decisions, refuses the rest", () => {
    expect(parseDecision(undefined)).toBe("ANALYSER");
    expect(parseDecision(null)).toBe("ANALYSER");
    expect(parseDecision("DETRUIRE")).toBe("DETRUIRE");
    expect(parseDecision("EN_ATTENTE_CLIENT")).toBe("EN_ATTENTE_CLIENT");
    expect(parseDecision("BLOQUER")).toBeNull();
    expect(parseDecision(1)).toBeNull();
  });

  it("derives the accepted values from their labels", () => {
    expect(RECEPTION_DECISIONS).toEqual(Object.keys(RECEPTION_DECISION_LABELS));
    expect(CONSULTATION_CHANNELS).toEqual(Object.keys(CONSULTATION_CHANNEL_LABELS));
  });
});

describe("parseConsultation — the client's agreement (ISO 17025 §7.4.3)", () => {
  it("records nothing when nothing is given", () => {
    expect(parseConsultation(undefined, now)).toEqual({ ok: true, value: null });
    expect(parseConsultation(null, now)).toEqual({ ok: true, value: null });
    expect(parseConsultation({ name: " ", channel: "", at: "", note: "" }, now)).toEqual({ ok: true, value: null });
  });

  it("needs the name and the channel together, and dates it now by default", () => {
    expect(parseConsultation({ name: "M. Exemple" }, now)).toEqual({ ok: false, error: CONSULTATION_MESSAGES.incomplete });
    expect(parseConsultation({ channel: "TELEPHONE", note: "OK" }, now)).toEqual({ ok: false, error: CONSULTATION_MESSAGES.incomplete });
    expect(parseConsultation({ name: "  M. Exemple ", channel: "TELEPHONE", note: "  " }, now)).toEqual({
      ok: true,
      value: { name: "M. Exemple", channel: "TELEPHONE", at: now, note: null },
    });
  });

  it("takes a date-time given, never in the future, and refuses an unknown channel or a bad date", () => {
    const at = "2026-10-10T14:05:00.000Z";
    const parsed = parseConsultation({ name: "M. Exemple", channel: "EMAIL", at, note: "Analyse demandée par écrit" }, now);
    expect(parsed).toEqual({
      ok: true,
      value: { name: "M. Exemple", channel: "EMAIL", at: new Date(at), note: "Analyse demandée par écrit" },
    });
    const future = parseConsultation({ name: "M. Exemple", channel: "EMAIL", at: "2026-10-10T15:00:00.000Z" }, now);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/^L'heure de l'accord du client est dans le futur/);
    expect(parseConsultation({ name: "M. Exemple", channel: "FAX" }, now)).toEqual({ ok: false, error: CONSULTATION_MESSAGES.channel });
    expect(parseConsultation({ name: "M. Exemple", channel: "EMAIL", at: "hier" }, now)).toEqual({ ok: false, error: CONSULTATION_MESSAGES.date });
    expect(parseConsultation("M. Exemple", now)).toEqual({ ok: false, error: CONSULTATION_MESSAGES.incomplete });
  });

  it("bounds the name and the note", () => {
    expect(parseConsultation({ name: "x".repeat(192), channel: "SUR_PLACE" }, now)).toEqual({
      ok: false,
      error: CONSULTATION_MESSAGES.nameTooLong,
    });
    expect(parseConsultation({ name: "M. Exemple", channel: "SUR_PLACE", note: "x".repeat(2001) }, now)).toEqual({
      ok: false,
      error: CONSULTATION_MESSAGES.noteTooLong,
    });
  });
});

describe("consultationMissing — LabSettings.consultationRequired", () => {
  const agreement = { name: "M. Exemple", channel: "TELEPHONE" as const, at: now, note: null };

  it("requires the agreement to analyse a non-conform sample, only when the laboratory says so", () => {
    expect(consultationMissing(true, "ANALYSER", false, null)).toBe(true);
    expect(consultationMissing(true, "ANALYSER", false, agreement)).toBe(false);
    expect(consultationMissing(false, "ANALYSER", false, null)).toBe(false);
  });

  it("asks nothing of a conform sample, of a wait or of a destruction", () => {
    expect(consultationMissing(true, "ANALYSER", true, null)).toBe(false);
    expect(consultationMissing(true, "EN_ATTENTE_CLIENT", false, null)).toBe(false);
    expect(consultationMissing(true, "DETRUIRE", false, null)).toBe(false);
  });
});

describe("consultationDraftError — the screens' check, the API's words", () => {
  it("lets an empty draft through unless required", () => {
    expect(isEmptyConsultation(EMPTY_CONSULTATION)).toBe(true);
    expect(consultationDraftError(EMPTY_CONSULTATION, false)).toBeNull();
    expect(consultationDraftError(EMPTY_CONSULTATION, true)).toBe(CONSULTATION_MESSAGES.required);
  });

  it("needs the name and the channel once anything is typed", () => {
    expect(consultationDraftError({ ...EMPTY_CONSULTATION, note: "rappel" }, false)).toBe(CONSULTATION_MESSAGES.incomplete);
    expect(consultationDraftError({ ...EMPTY_CONSULTATION, name: "M. Exemple" }, true)).toBe(CONSULTATION_MESSAGES.required);
    expect(consultationDraftError({ ...EMPTY_CONSULTATION, name: "M. Exemple", channel: "SUR_PLACE" }, true)).toBeNull();
  });
});

describe("consultationText — what the bon de réception appends", () => {
  it("names who agreed, how and when, on the laboratory's clock", () => {
    expect(consultationText({ name: "M. Exemple", channel: "TELEPHONE", at: new Date("2026-10-10T14:05:00.000Z") })).toBe(
      "accord de M. Exemple (tél., 10/10 14:05)"
    );
    expect(consultationText({ name: "Mme Test", channel: "SUR_PLACE", at: "2026-10-09T08:00:00.000Z" })).toBe(
      "accord de Mme Test (sur place, 09/10 08:00)"
    );
  });
});

describe("storedConsultation — the agreement as the screens read it back", () => {
  const at = new Date("2026-10-10T14:05:00.000Z");

  it("returns who, how and when when the three columns are set", () => {
    expect(
      storedConsultation({ clientConsultedName: "M. Exemple", clientConsultationChannel: "EMAIL", clientConsultedAt: at })
    ).toEqual({ name: "M. Exemple", channel: "EMAIL", at });
  });

  it("reads a sample with no agreement, or a half-written one, as « no agreement »", () => {
    expect(storedConsultation({ clientConsultedName: null, clientConsultationChannel: null, clientConsultedAt: null })).toBeNull();
    expect(storedConsultation({ clientConsultedName: "M. Exemple", clientConsultationChannel: null, clientConsultedAt: at })).toBeNull();
    expect(storedConsultation({ clientConsultedName: "", clientConsultationChannel: "TELEPHONE", clientConsultedAt: at })).toBeNull();
    expect(storedConsultation({ clientConsultedName: "M. Exemple", clientConsultationChannel: "TELEPHONE", clientConsultedAt: null })).toBeNull();
  });
});
