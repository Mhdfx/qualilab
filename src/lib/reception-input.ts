import type { NonConformityReason, QuantityUnit, SerieKind, StorageClass, TemperatureSource } from "@/generated/prisma/enums";
import { futureMessage } from "./labels";
import {
  EXPLOITABLE_MESSAGES,
  RECEPTION_NOTE_MAX,
  RECEPTION_NOTE_MESSAGES,
  evaluateReception,
  justifyAcceptanceMessage,
  receptionChecklist,
  rowToJustify,
  type Check,
  type ChecklistRow,
  type ReceptionLine,
  type ReceptionThresholds,
} from "./reception-rules";
import {
  COMPLEMENTARY_MESSAGES,
  STORAGE_CLASSES,
  TEMPERATURE_SOURCES,
  complementaryChecklist,
  complementaryRefusal,
  parseChoice,
  storedSignedProtocolAnswer,
} from "./reception-complementary";
import { NON_CONFORMITY_REASONS, arrivalRefusal } from "./serie-input";
import {
  CONSULTATION_MESSAGES,
  consultationMissing,
  parseConsultation,
  parseDecision,
  type ClientConsultation,
  type ReceptionDecision,
} from "./client-consultation";

/**
 * Validating the grouped reception of a série — pure, shared by the screen
 * and by `POST /api/series/[id]/reception`.
 *
 * The API receives every line still waiting (`PRELEVE`) with what the
 * réceptionniste measured or confirmed. The rules engine runs again here,
 * with the laboratory's thresholds: a line under a blocking rule cannot be
 * declared conform, whatever the browser sent.
 *
 * Rule (1) of the bon de réception (retour du 08/10, « les règles comme une
 * checklist »): every line says whether the sample is exploitable for the
 * analysis. A page opened before the checklist sends no answer and is told
 * so; a non-exploitable sample cannot be declared conform. The eight-row
 * checklist travels with each clean line, for the audit. Rule (6) follows
 * the class chosen here: a food received « Ambiant » is a stable food, its
 * temperature is not required (12/10).
 *
 * A non-conform line is decided case by case (RETOUR-LABO-29-09.md, slice
 * E): analysed anyway, or destroyed — received and numbered like the others
 * (it prints on the bon de réception), then cancelled with the motif
 * « Détruit à réception ». Since A9 it may also wait for the client's
 * opinion (« En attente du client »: received, held until released), and an
 * analysis carries the client's agreement when given — required when the
 * laboratory says so (`LabSettings.consultationRequired`).
 *
 * The technician is not the réceptionniste's to choose (retour du 08/10,
 * RETOUR-LABO-06-10.md §9.3), nor anyone's since 13/10: the responsable des
 * paramètres programmes the analyses, then the sample waits in « À prendre »
 * until a technician takes it (prise en charge libre, PROGRAMME.md §10). A
 * `technicianId` still sent — a page opened before the change — is ignored,
 * never refused: the reception goes through, without a technician.
 *
 * The contrôles complémentaires (hors bon, `reception-complementary.ts`)
 * follow the same pattern: every line ticks C3 (emballage) and C5
 * (identification) — a page opened before them is told to reload — and a
 * line whose complementary control is NON_CONFORME cannot be declared
 * conform, exactly like a blocking rule of the paper. The coded rows travel
 * beside the checklist (`complementary`), for the audit.
 *
 * The arrival typed at reception is checked against the série's sampling
 * times: never before the end of the sampling, nor before its start when no
 * end was typed (`arrivalRefusal`, the rule of the visit's creation). With
 * no arrival typed, the reception instant is used — always valid.
 *
 * Every sample may carry an « Observation de réception » (≤ 1 000
 * characters); it becomes required when a row « à vérifier » — a paper rule
 * or a contrôle complémentaire — is accepted conforme: the acceptance is
 * justified (« Échantillon 2 : justifiez l'acceptation (C2 … à vérifier). »).
 *
 * C6, the signed protocol, is answered once for the série — a visit without
 * a photo: « Protocole papier signé reçu » Oui / Non, or nothing (optional).
 * It is stored on the série only (`storedSignedProtocolAnswer`) and never
 * weighs on a sample's conformity.
 *
 * Messages name the sample (« Échantillon 2 : … », RETOUR-LABO-06-10.md §5,
 * V2); the two samples of a two-family line share the line number and are
 * told apart by their letter (« Échantillon 2M », « Échantillon 2P »).
 */

const QUANTITY_UNITS = ["UNITE", "G", "ML", "L"] as const;

/**
 * A line of the série as the database holds it before reception. Its
 * « Conservation » is the reception's own answer (`storageClass` of the
 * payload), never the stored one; `productNames` (désignation, product type,
 * nature) let rule (8) recognise live bivalve molluscs.
 */
export type ReceptionCandidate = Omit<ReceptionLine, "storageClass"> & {
  id: string;
  lineNumber: number;
  status: string;
  /** The sample's code (« 1/26-2M »): its letter names one of two samples
   * of the same line in the messages. Optional — « 2 » without it. */
  code?: string | null;
  /** C7: the DLC as stored (`@db.Date`); null or absent = none given. */
  expiryDate?: Date | null;
};

/**
 * « 2M » / « 2P » for one of the two samples of a two-family line, read from
 * its code (« 1/26-2M »); the bare line number otherwise — older codes
 * included.
 */
export function sampleRef(lineNumber: number, code?: string | null): string {
  const match = code ? /-(\d+)([MP])$/.exec(code) : null;
  return match && Number(match[1]) === lineNumber ? `${lineNumber}${match[2]}` : String(lineNumber);
}

export type CleanReceptionLine = {
  sampleId: string;
  lineNumber: number;
  /** « 2 », or « 2M » / « 2P » for the two samples of a two-family line. */
  ref: string;
  receptionTemperature: number | null;
  /** Where it was read (C2): the cooler, the sample, a witness bottle; null without a temperature or from an older page. */
  temperatureSource: TemperatureSource | null;
  /** The conservation class chosen (C2); null = the kind's default. */
  storageClass: StorageClass | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  /** Rule (1): the réceptionniste's answer, written to `Sample.receptionExploitable`. */
  exploitable: boolean;
  /** C3 and C5, the réceptionniste's ticks — `Sample.receptionPackagingOk` / `receptionIdentificationOk`. */
  packagingOk: boolean;
  identificationOk: boolean;
  conformity: boolean;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  /** « Observation de réception » — the justification of an accepted doubt; null when empty. */
  receptionNote: string | null;
  /** « Détruire » on a non-conform line: no analysis, cancelled at once. */
  destroy: boolean;
  /** The decision on the line: « Analyser » (also every conform line), « En attente du client », « Détruire ». */
  decision: ReceptionDecision;
  /** « En attente du client »: received, held (`analysisBlocked`) until released. */
  awaitClient: boolean;
  /** The client's agreement to analyse a non-conform line; null = not recorded. */
  consultation: ClientConsultation | null;
  checks: Check[];
  /** The eight rules of the bon, as computed with the laboratory's thresholds — audited. */
  checklist: ChecklistRow[];
  /** The contrôles complémentaires (hors bon), C1 … C7 — audited beside the checklist. */
  complementary: ChecklistRow[];
};

export type CleanReception = {
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  /** C6 as stored on the série: the answer on a visit without a photo, null otherwise. */
  signedProtocolReceived: boolean | null;
  lines: CleanReceptionLine[];
};

/** The série's times, as the database holds them, and the reception instant. */
export type ReceptionSerieTimes = {
  startedAt: Date;
  endedAt: Date | null;
  /** The arrival already recorded on the série (the préleveur's), if any. */
  arrivedAt?: Date | null;
  /** False on a deposit whose sampling time was not given (C1). */
  samplingTimeDeclared?: boolean | null;
  /** The reception instant; now when absent. */
  receivedAt?: Date;
  /** C6: a visit's answer is stored, a deposit's never; absent = not stored. */
  kind?: SerieKind;
  /** C6: a photo of the signed protocol is attached — it answers, nothing else is stored. */
  hasSignedProtocol?: boolean;
};

/** The laboratory's policy the reception applies (LabSettings). */
export type ReceptionPolicy = {
  /** « Accord du client obligatoire pour analyser un non-conforme » (A9). */
  consultationRequired?: boolean;
};

export type ReceptionValidation =
  | { ok: true; value: CleanReception }
  /** `ref` names the sample (« 2 », « 2M », « 2P ») when the error is about one. */
  | { ok: false; error: string; lineNumber?: number; ref?: string };

type RawLine = Record<string, unknown>;

const INVALID = Symbol("invalid");

/** "" / null → null; "4,5" → 4.5; anything else → INVALID. */
function parseNumber(value: unknown, min: number, max: number): number | null | typeof INVALID {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return INVALID;
  return n;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** « Indiquez … » → « Échantillon 2 : indiquez … » — the reception's own form, screen and API. */
export function receptionLineMessage(ref: string, message: string) {
  return `Échantillon ${ref} : ${message.charAt(0).toLocaleLowerCase("fr")}${message.slice(1)}`;
}

export function validateReception(
  raw: unknown,
  candidates: ReceptionCandidate[],
  thresholds: ReceptionThresholds,
  serie: ReceptionSerieTimes,
  policy: ReceptionPolicy = {}
): ReceptionValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string, lineNumber?: number, ref?: string): ReceptionValidation =>
    ref === undefined ? { ok: false, error, lineNumber } : { ok: false, error, lineNumber, ref };

  const pending = candidates.filter((c) => c.status === "PRELEVE");
  if (pending.length === 0) return fail("Cette série est déjà réceptionnée.");

  // ---- Header ---------------------------------------------------------------
  let arrivedAt: Date | null = null;
  if (input.arrivedAt !== undefined && input.arrivedAt !== null && input.arrivedAt !== "") {
    const d = new Date(String(input.arrivedAt));
    if (Number.isNaN(d.getTime())) return fail("L'heure d'arrivée est invalide.");
    if (d.getTime() > Date.now() + 5 * 60 * 1000) return fail(futureMessage("L'heure d'arrivée"));
    const before = arrivalRefusal(d, serie.startedAt, serie.endedAt);
    if (before) return fail(before);
    arrivedAt = d;
  }
  const coolerTemperature = parseNumber(input.coolerTemperature, -80, 300);
  if (coolerTemperature === INVALID) {
    return fail("La température de la glacière doit être un nombre plausible.");
  }
  // C6, optional: Oui / Non, or nothing at all (an older page sends nothing).
  const protocolAnswer = input.signedProtocolReceived;
  if (protocolAnswer !== undefined && protocolAnswer !== null && typeof protocolAnswer !== "boolean") {
    return fail("Réponse invalide pour le protocole signé (C6).");
  }
  const signedProtocolReceived = storedSignedProtocolAnswer(
    serie.kind,
    serie.hasSignedProtocol ?? false,
    typeof protocolAnswer === "boolean" ? protocolAnswer : null
  );

  // C1 reads the arrival typed here, else the série's, else the reception instant.
  const timing = {
    startedAt: serie.startedAt,
    endedAt: serie.endedAt,
    arrivedAt: arrivedAt ?? serie.arrivedAt ?? null,
    samplingTimeDeclared: serie.samplingTimeDeclared ?? null,
    receivedAt: serie.receivedAt ?? new Date(),
  };

  // ---- Lines ----------------------------------------------------------------
  const rawLines = Array.isArray(input.lines) ? (input.lines as RawLine[]) : null;
  if (!rawLines) return fail("Les échantillons de la série sont manquants.");

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const lines: CleanReceptionLine[] = [];

  for (const rawLine of rawLines) {
    const sampleId = text(rawLine?.sampleId);
    const candidate = byId.get(sampleId);
    if (!candidate) return fail("Un échantillon envoyé n'appartient pas à cette série.");
    const n = candidate.lineNumber;
    const ref = sampleRef(n, candidate.code);
    if (candidate.status !== "PRELEVE") {
      // Cancelled meanwhile (« Non reçu au laboratoire », from another screen
      // or before a refresh): the page is out of date, never « received ».
      return fail(
        candidate.status === "ANNULE"
          ? `L'échantillon ${ref} est annulé : rechargez la page pour réceptionner les autres.`
          : `L'échantillon ${ref} est déjà réceptionné.`,
        n,
        ref
      );
    }
    if (seen.has(sampleId)) {
      return fail(`L'échantillon ${ref} est envoyé deux fois.`, n, ref);
    }
    seen.add(sampleId);

    const receptionTemperature = parseNumber(rawLine.receptionTemperature, -80, 300);
    if (receptionTemperature === INVALID) {
      return fail(`Échantillon ${ref} : la température à l'arrivée doit être un nombre plausible.`, n, ref);
    }

    // C2: where the temperature was read and the class it travelled in —
    // both optional (a page opened before sends neither).
    const source = parseChoice(rawLine.receptionTemperatureSource, TEMPERATURE_SOURCES);
    if (source === "invalid") return fail(`Échantillon ${ref} : origine de la température inconnue.`, n, ref);
    const storageClass = parseChoice(rawLine.storageClass, STORAGE_CLASSES);
    if (storageClass === "invalid") return fail(`Échantillon ${ref} : classe de conservation inconnue.`, n, ref);
    const temperatureSource = receptionTemperature === null ? null : source;

    const quantity = parseNumber(rawLine.quantity, 0, 1_000_000);
    if (quantity === INVALID) return fail(`Échantillon ${ref} : la quantité est invalide.`, n, ref);
    let quantityUnit: QuantityUnit | null = null;
    if (quantity !== null) {
      const unit = text(rawLine.quantityUnit) as QuantityUnit;
      if (!QUANTITY_UNITS.includes(unit)) return fail(`Échantillon ${ref} : précisez l'unité de la quantité.`, n, ref);
      quantityUnit = unit;
    }

    // Rule (1) first: a page opened before the checklist sends none.
    if (typeof rawLine.exploitable !== "boolean") return fail(receptionLineMessage(ref, EXPLOITABLE_MESSAGES.missing), n, ref);
    const exploitable = rawLine.exploitable;
    // The two ticked controls, C3 then C5 — the same refusal for an old page.
    if (typeof rawLine.packagingOk !== "boolean") {
      return fail(receptionLineMessage(ref, COMPLEMENTARY_MESSAGES.packagingMissing), n, ref);
    }
    if (typeof rawLine.identificationOk !== "boolean") {
      return fail(receptionLineMessage(ref, COMPLEMENTARY_MESSAGES.identificationMissing), n, ref);
    }
    const packagingOk = rawLine.packagingOk;
    const identificationOk = rawLine.identificationOk;
    const receptionNote = text(rawLine.receptionNote);
    if (receptionNote.length > RECEPTION_NOTE_MAX) {
      return fail(receptionLineMessage(ref, RECEPTION_NOTE_MESSAGES.tooLong), n, ref);
    }

    const measured: ReceptionLine = {
      lineKind: candidate.lineKind,
      family: candidate.family,
      parameterNames: candidate.parameterNames,
      quantity,
      quantityUnit,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round(receptionTemperature * 10) / 10,
      unitCount: candidate.unitCount,
      // The class chosen at reception: a stable food needs no temperature (rule 6).
      storageClass,
      productNames: candidate.productNames,
    };
    const checks = evaluateReception(measured, thresholds);
    const checklist = receptionChecklist(measured, thresholds, { exploitable, temperatureSource });
    const complementary = complementaryChecklist(
      {
        lineKind: candidate.lineKind,
        family: candidate.family,
        receptionTemperature: measured.receptionTemperature,
        storageClass,
        temperatureSource,
        expiryDate: candidate.expiryDate ?? null,
      },
      timing,
      thresholds,
      { packagingOk, identificationOk }
    );

    if (typeof rawLine.conformity !== "boolean") {
      return fail(`Échantillon ${ref} : indiquez la conformité.`, n, ref);
    }
    const conformity = rawLine.conformity;
    if (conformity && !exploitable) return fail(receptionLineMessage(ref, EXPLOITABLE_MESSAGES.conform), n, ref);
    const blocking = checks.find((c) => c.level === "BLOQUANT");
    if (conformity && blocking) {
      return fail(`Échantillon ${ref} : ${blocking.message} L'échantillon ne peut pas être déclaré conforme.`, n, ref);
    }
    const failingControl = complementary.find((row) => row.status === "NON_CONFORME");
    if (conformity && failingControl) return fail(`Échantillon ${ref} : ${complementaryRefusal(failingControl)}`, n, ref);
    // A doubt accepted conforme is justified in the observation (A7).
    const doubt = rowToJustify([...checklist, ...complementary], conformity, receptionNote);
    if (doubt) return fail(receptionLineMessage(ref, justifyAcceptanceMessage(doubt)), n, ref);

    let conformityReason: NonConformityReason | null = null;
    let conformityNote: string | null = null;
    if (!conformity) {
      const reason = text(rawLine.conformityReason) as NonConformityReason;
      if (!NON_CONFORMITY_REASONS.includes(reason)) {
        return fail(`Échantillon ${ref} : choisissez le motif de non-conformité.`, n, ref);
      }
      if (reason === "NON_EXPLOITABLE" && exploitable) return fail(receptionLineMessage(ref, EXPLOITABLE_MESSAGES.reason), n, ref);
      conformityReason = reason;
      const note = text(rawLine.conformityNote);
      if (reason === "AUTRE" && !note) return fail(`Échantillon ${ref} : précisez le motif « autre ».`, n, ref);
      conformityNote = note || null;
    }

    // Only a non-conform sample can be destroyed or wait for the client;
    // « analyser » is the default.
    const decision = parseDecision(rawLine.decision);
    if (!decision) return fail(`Échantillon ${ref} : décision inconnue.`, n, ref);
    if (decision === "DETRUIRE" && conformity) {
      return fail(`Échantillon ${ref} : seul un échantillon non conforme peut être détruit.`, n, ref);
    }
    if (decision === "EN_ATTENTE_CLIENT" && conformity) {
      return fail(receptionLineMessage(ref, CONSULTATION_MESSAGES.awaitConform), n, ref);
    }
    const destroy = decision === "DETRUIRE";
    // The client's agreement, for a non-conform sample analysed anyway (A9).
    let consultation: ClientConsultation | null = null;
    if (!conformity && decision === "ANALYSER") {
      const parsed = parseConsultation(rawLine.consultation, timing.receivedAt);
      if (!parsed.ok) return fail(receptionLineMessage(ref, parsed.error), n, ref);
      consultation = parsed.value;
    }
    if (consultationMissing(policy.consultationRequired ?? false, decision, conformity, consultation)) {
      return fail(receptionLineMessage(ref, CONSULTATION_MESSAGES.required), n, ref);
    }
    // `rawLine.technicianId` is deliberately not read (§9.3): nobody
    // assigns a technician, one takes the sample from « À prendre ».

    lines.push({
      sampleId,
      lineNumber: n,
      ref,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round(receptionTemperature * 10) / 10,
      temperatureSource,
      storageClass,
      quantity,
      quantityUnit,
      exploitable,
      packagingOk,
      identificationOk,
      conformity,
      conformityReason,
      conformityNote,
      receptionNote: receptionNote || null,
      destroy,
      decision,
      awaitClient: decision === "EN_ATTENTE_CLIENT",
      consultation,
      checks,
      checklist,
      complementary,
    });
  }

  const missing = pending.filter((c) => !seen.has(c.id));
  if (missing.length > 0) {
    return fail(
      `L'échantillon ${sampleRef(missing[0].lineNumber, missing[0].code)} n'est pas renseigné — la série se réceptionne en une fois.`,
      missing[0].lineNumber,
      sampleRef(missing[0].lineNumber, missing[0].code)
    );
  }

  // Line order, microbiology before physico-chemistry within a line: the
  // N° de contrôle are drawn in this order.
  lines.sort((a, b) => a.lineNumber - b.lineNumber || a.ref.localeCompare(b.ref));
  return {
    ok: true,
    value: {
      arrivedAt,
      coolerTemperature: coolerTemperature === null ? null : Math.round(coolerTemperature * 10) / 10,
      signedProtocolReceived,
      lines,
    },
  };
}
