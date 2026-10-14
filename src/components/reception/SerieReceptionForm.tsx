"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Printer,
  FileText,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import type {
  AirMethod,
  Cadre,
  CancelReason,
  Family,
  HandsState,
  LineKind,
  NonConformityReason,
  QuantityUnit,
  SampleStatus,
  SampleType,
  SamplerKind,
  SerieKind,
  StorageClass,
  SurfaceState,
  TemperatureSource,
} from "@/generated/prisma/enums";
import {
  CANCEL_REASON_LABELS,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  QUANTITY_UNIT_LABELS,
  SAMPLER_KIND_LABELS,
  SERIE_KIND_LABELS,
  TEMPERATURE_SOURCE_LABELS,
  formatCadre,
  formatDate,
  formatDateTime,
  formatDecimal,
} from "@/lib/labels";
import {
  EXPLOITABLE_MESSAGES,
  checklistSummary,
  justifyAcceptanceMessage,
  parameterSpellings,
  proposedConformity,
  receptionChecklist,
  rowToJustify,
  type ChecklistRow,
  type ReceptionThresholds,
} from "@/lib/reception-rules";
import type { ReceivedChecklist } from "@/lib/reception-audit";
import {
  CONSULTATION_TIME_LABEL,
  EMPTY_CONSULTATION,
  consultationDraftError,
  consultationPayload,
  type ConsultationDraft,
  type ReceptionDecision,
} from "@/lib/client-consultation";
import {
  COMPLEMENTARY_MESSAGES,
  TEMPERATURE_SOURCES,
  complementaryChecklist,
  expiredDlcNote,
  signedProtocolRow,
  type ComplementaryKey,
} from "@/lib/reception-complementary";
import { protocolPhotoHref } from "@/lib/protocol-photo-access";
import { repetitionRange } from "@/lib/series";
import { futureFieldError } from "@/lib/device-time";
import { arrivalRefusal } from "@/lib/serie-input";
import { Card } from "@/components/ui/Card";
import { LabDateTimeInput, dateTimePending } from "@/components/LabDateTimeInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { fromLocalInput, localInputDate, toLocalInput } from "@/components/preleveur/visit-types";
import {
  Checklist,
  ConformityChip,
  ConsultationFields,
  DecisionChips,
  ReceptionNoteField,
  SignedProtocolCheck,
  StorageClassSelect,
  consultationAtId,
  useMinuteClock,
} from "./reception-widgets";
import { receptionLineMessage, sampleRef } from "@/lib/reception-input";
import { SampleVerbs, type VerbSample } from "@/components/samples/SampleVerbs";
import type { Role } from "@/lib/roles";
import {
  coolerOutOfRange,
  countLabel,
  errorConcernsSample,
  missingFamilies as missingFamiliesOf,
  receptionDesignation,
  receptionTemperatureSource,
  sampleHeading,
  storageDefaultLabel,
} from "./reception-logic";

/**
 * Reception of a série in one screen — WORKFLOW.md §3.3.
 *
 * The header carries what the cooler tells (arrival, temperature); every
 * sample (« Échantillon N », RETOUR-LABO-06-10.md §5, V2) shows what the
 * préleveur wrote, what the réceptionniste measures, the acceptance
 * checklist — the eight rules of the bon de réception, computed live with
 * the lab's thresholds — and the conformity with its coded motif. Rule (1),
 * « exploitable or not », is the réceptionniste's answer, one per sample,
 * required before the série can be received (retour du 08/10). Below the
 * eight rules, the contrôles complémentaires (hors bon): C3 (emballage) and
 * C5 (identification) are ticked Oui / Non for every sample — a « Non »
 * makes it non conforme with the matching motif. C6, the protocol signed by
 * the interlocutor, is the série's own row on a visit, above the samples:
 * the préleveur's photo, or an optional « reçu » Oui / Non. The two
 * samples of a two-family line (« 2M », « 2P » — V3) are received one by
 * one, each with its own rules (100 g micro, 300 g physico-chimie) and its
 * own container (12/10): both cards start from the quantity the préleveur
 * wrote for the line, and say to weigh each family's part. One button
 * numbers everything.
 *
 * A non-conform sample is analysed anyway — the client's agreement noted
 * (« Accord du client », required when the laboratory says so) —, held
 * « en attente du client » (received, numbered, released later from
 * « Bloqués »), or destroyed (A9).
 *
 * No technician here (retour du 08/10, RETOUR-LABO-06-10.md §9.3), nor
 * anywhere since 13/10 (prise en charge libre, PROGRAMME.md §10): the
 * responsable des paramètres programmes the analyses, then the sample waits
 * in « À prendre » until a technician takes it.
 */

export type ReceptionLineData = {
  id: string;
  code: string;
  lineNumber: number;
  lineKind: LineKind;
  type: SampleType;
  status: SampleStatus;
  lieu: string;
  produit: string | null;
  numeroLot: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  /** « État de la surface » (V2) / « Méthode de prélèvement » of the air (V4):
   * null on a sample entered before 07/10; optional while the série's
   * select does not carry them everywhere. */
  surfaceState?: SurfaceState | null;
  airMethod?: AirMethod | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  remarks: string | null;
  unitCount: number;
  controlCode: string | null;
  receptionTemperature: number | null;
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  /** « Observation de réception » (A7); optional on an older payload. */
  receptionNote?: string | null;
  /** Held at reception, and since when it waits for the client (A9); optional on an older payload. */
  analysisBlocked?: boolean;
  awaitingClientSince?: string | null;
  cancelReason: CancelReason | null;
  nature: { id: string; code: string; label: string; family: Family };
  productType: { id: string; name: string } | null;
  /** `aliases` (one per line): histamine and Salmonella are recognised on them too. */
  parameters: { parameter: { id: string; name: string; unit: string | null; aliases?: string | null } }[];
  /** Who took it at the bench — « Prendre en charge », or a first result (PROGRAMME.md §10). */
  technician: { id: string; name: string } | null;
  /** When it was taken; optional on an older payload. */
  assignedAt?: string | null;
};

export type ReceptionSerieData = {
  id: string;
  serialNumber: string;
  kind: SerieKind;
  client: { id: string; name: string };
  site: { id: string; name: string } | null;
  interlocutor: string | null;
  samplerKind: SamplerKind;
  samplerUser: { id: string; name: string } | null;
  samplerName: string | null;
  cadre: Cadre;
  /** The precision of « Autre » (V1); optional on an older payload. */
  cadreNote?: string | null;
  clientReference: string | null;
  startedAt: string;
  endedAt: string | null;
  arrivedAt: string | null;
  coolerTemperature: number | null;
  analysesMicro: boolean;
  analysesChimie: boolean;
  notes: string | null;
  receivedAt: string | null;
  samples: ReceptionLineData[];
  /** C6: a photo of the signed protocol is attached — counted by the page, never the image. */
  hasSignedProtocol?: boolean;
  /** C6: the answer an earlier reception of the série stored; null = none. */
  signedProtocolReceived?: boolean | null;
};

type ReceivedLine = {
  id: string;
  code: string;
  lineNumber: number;
  controlCode: string | null;
  unitCount: number;
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
  /** « Observation de réception » (A7). */
  receptionNote?: string | null;
  analysisBlocked: boolean;
  /** « En attente du client » since (A9). */
  awaitingClientSince?: string | null;
  status?: SampleStatus;
  cancelReason?: CancelReason | null;
  produit: string | null;
  surfaceLabel: string | null;
  surfaceState?: SurfaceState | null;
  airMethod?: AirMethod | null;
  personName: string | null;
  nature: { label: string };
  /** Read from the database on a série already received — the technician
   * who took the sample at the bench (or, before 13/10, the one assigned to
   * it); never in the answer of the reception itself. */
  technician?: { id: string; name: string } | null;
  /** When they took it. */
  assignedAt?: string | null;
  /** In the answer of the reception: the checklist as the API decided it (A8). */
  checklist?: ChecklistRow[];
  complementary?: ChecklistRow[];
};

type LineState = {
  sampleId: string;
  temperature: string;
  /** Once the réceptionniste typed a temperature, the cooler no longer overrides it. */
  temperatureTouched: boolean;
  /** Where the temperature was read, when chosen on the card (water: « Flacon témoin »); null = derived. */
  sourceChoice: TemperatureSource | null;
  /** « Conservation » (C2); null = the kind's default. */
  storageClass: StorageClass | null;
  quantity: string;
  quantityUnit: QuantityUnit;
  /** Rule (1) of the bon: null until the réceptionniste answers. */
  exploitable: boolean | null;
  /** C3 (emballage) and C5 (identification): null until ticked. */
  packagingOk: boolean | null;
  identificationOk: boolean | null;
  /** The réceptionniste's own choice; null = follow the rules' proposal. */
  conformityChoice: boolean | null;
  reason: NonConformityReason | "";
  note: string;
  /** « Observation de réception » (A7) — required to accept a doubt conforme. */
  receptionNote: string;
  /** Non-conform only: analyse anyway, wait for the client, or destroy (A9). */
  decision: ReceptionDecision;
  /** « Accord du client », for « Analyser malgré tout » (A9). */
  consultation: ConsultationDraft;
};

const REASONS = Object.keys(NON_CONFORMITY_REASON_LABELS) as NonConformityReason[];
const UNITS = Object.keys(QUANTITY_UNIT_LABELS) as QuantityUnit[];

function samplerOf(serie: ReceptionSerieData) {
  if (serie.samplerKind === "QUALILAB") return serie.samplerUser?.name ?? "Qualilab";
  return serie.samplerName ?? SAMPLER_KIND_LABELS[serie.samplerKind];
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** What the verbs need of a sample, as the API serialised it. */
function verbSampleOf(line: ReceptionLineData, clientId: string, status: SampleStatus = line.status): VerbSample {
  return {
    clientId,
    productTypeId: line.productType?.id ?? null,
    id: line.id,
    code: line.code,
    controlCode: line.controlCode,
    status,
    type: line.type,
    lineKind: line.lineKind,
    produit: line.produit,
    lieu: line.lieu,
    numeroLot: line.numeroLot,
    productionDate: line.productionDate,
    expiryDate: line.expiryDate,
    quantity: line.quantity,
    quantityUnit: line.quantityUnit,
    surfaceLabel: line.surfaceLabel,
    surfaceAreaCm2: line.surfaceAreaCm2,
    personName: line.personName,
    personRole: line.personRole,
    handsState: line.handsState,
    // « État de la surface » / « Méthode de prélèvement » in « Corriger la fiche ».
    surfaceState: line.surfaceState ?? null,
    airMethod: line.airMethod ?? null,
    remarks: line.remarks,
    unitCount: line.unitCount,
    parameterIds: line.parameters.map((p) => p.parameter.id),
  };
}

function unitsLabel(unitCount: number) {
  if (unitCount <= 1) return "1 unité";
  return `${unitCount} unités (${repetitionRange(unitCount)})`;
}

/**
 * Cancelled before its reception — « Non reçu au laboratoire », or another
 * motif on a sample still PRELEVE: never numbered (every reception, deposits
 * included, draws a N° de contrôle), so never received and no checklist.
 */
function cancelledBeforeReception(sample: { status?: SampleStatus; controlCode: string | null }) {
  return sample.status === "ANNULE" && sample.controlCode === null;
}

/** A sample's card before the réceptionniste touches it; `cooler` pre-fills its temperature. */
function initialLineState(s: ReceptionLineData, cooler: string): LineState {
  return {
    sampleId: s.id,
    temperature: cooler,
    temperatureTouched: false,
    sourceChoice: null,
    storageClass: null,
    // A line never weighed on site is weighed here: grams for food, litres
    // for water. « Unité(s) » is what the paper form carries by default
    // (« 01 »), never a weight — the field is left empty so the counter
    // types what the scale reads, in a unit the acceptance rules can use.
    quantity: s.quantity === null || s.quantityUnit === "UNITE" ? "" : String(s.quantity).replace(".", ","),
    quantityUnit:
      s.quantity !== null && s.quantityUnit && s.quantityUnit !== "UNITE"
        ? s.quantityUnit
        : s.lineKind === "EAU"
          ? "L"
          : "G",
    // Never pre-answered: each sample is looked at (no « tous exploitables »,
    // no série-level « tout cocher » — Q64 pending).
    exploitable: null,
    packagingOk: null,
    identificationOk: null,
    conformityChoice: null,
    reason: "",
    note: "",
    receptionNote: "",
    decision: "ANALYSER",
    consultation: EMPTY_CONSULTATION,
  };
}

export function SerieReceptionForm({
  serie,
  thresholds,
  role,
  decided = {},
  consultationRequired = false,
}: {
  serie: ReceptionSerieData;
  thresholds: ReceptionThresholds;
  role: Role;
  /** LabSettings.consultationRequired: analysing a non-conform sample needs the client's agreement (A9). */
  consultationRequired?: boolean;
  /** Each received sample's checklist as decided, from its SAMPLE_RECEIVED entry; null = before the checklist. */
  decided?: Record<string, ReceivedChecklist | null>;
}) {
  const router = useRouter();
  const pending = serie.samples.filter((s) => s.status === "PRELEVE");
  const alreadyReceived = serie.samples.filter((s) => s.status !== "PRELEVE");
  // Of those, the samples cancelled before their reception (« Non reçu au
  // laboratoire », …) were never received: said apart.
  const cancelledEarlier = alreadyReceived.filter(cancelledBeforeReception);
  const receivedEarlier = alreadyReceived.filter((s) => !cancelledBeforeReception(s));

  // LEGAL wall time ("YYYY-MM-DDTHH:mm"): LabDateTimeInput converts a drifting device's hour.
  const [arrivedAt, setArrivedAt] = useState(
    serie.arrivedAt ? toLocalInput(new Date(serie.arrivedAt)) : ""
  );
  // The « dans le futur » refusal, shown under « Arrivée au laboratoire » (§8.1).
  const [arrivedError, setArrivedError] = useState<string | null>(null);
  const [cooler, setCooler] = useState(
    serie.coolerTemperature === null ? "" : String(serie.coolerTemperature).replace(".", ",")
  );
  const [lines, setLines] = useState<LineState[]>(() =>
    pending.map((s) =>
      initialLineState(s, serie.coolerTemperature === null ? "" : String(serie.coolerTemperature).replace(".", ","))
    )
  );
  // The cards follow the samples still to receive: a sample cancelled from
  // its card (« Annuler », e.g. « Non reçu au laboratoire ») leaves the
  // reception once the page refreshes — the state kept from before would
  // otherwise send it and the API refuse the whole série. A sample that
  // comes back (reactivated) starts from a fresh card.
  const activeLines = pending.map(
    (s) => lines.find((line) => line.sampleId === s.id) ?? initialLineState(s, cooler)
  );
  // C6, a visit without a photo: optional, never pre-answered beyond what was stored.
  const [protocolReceived, setProtocolReceived] = useState<boolean | null>(serie.signedProtocolReceived ?? null);
  const visitWithoutPhoto = serie.kind === "VISITE" && !serie.hasSignedProtocol;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; lineNumber: number | null; ref?: string | null } | null>(null);
  const [result, setResult] = useState<ReceivedLine[] | null>(null);

  const byId = useMemo(() => new Map(serie.samples.map((s) => [s.id, s])), [serie.samples]);
  // The reception instant while receiving: C1 counts up to it when no arrival is recorded.
  const now = useMinuteClock();

  // A box of the protocol that no sample still to analyse answers — only on
  // a série entered before the boxes were computed (07/10), or once the
  // samples of a family are cancelled: say so where the série is received.
  const missingFamilies = useMemo(
    () =>
      missingFamiliesOf({
        analysesMicro: serie.analysesMicro,
        analysesChimie: serie.analysesChimie,
        samples: serie.samples,
      }),
    [serie.samples, serie.analysesMicro, serie.analysesChimie]
  );

  // C2, screen only: the cooler's reading outside the chilled range.
  const coolerWarning = coolerOutOfRange(numberOrNull(cooler), thresholds)
    ? `Hors de la plage réfrigérée (${formatDecimal(thresholds.coldChainMinC)} à ${formatDecimal(thresholds.coldChainMaxC)} °C) : vérifiez la chaîne du froid.`
    : null;

  // The cooler's temperature pre-fills every sample the réceptionniste has
  // not measured separately — one reading, eight samples.
  function changeCooler(value: string) {
    setCooler(value);
    setLines((current) =>
      current.map((line) => (line.temperatureTouched ? line : { ...line, temperature: value }))
    );
  }

  function updateLine(sampleId: string, patch: Partial<LineState>) {
    setLines((current) => {
      if (current.some((line) => line.sampleId === sampleId)) {
        return current.map((line) => (line.sampleId === sampleId ? { ...line, ...patch } : line));
      }
      // A card that appeared after the page opened (`activeLines`).
      const sample = byId.get(sampleId);
      return sample ? [...current, { ...initialLineState(sample, cooler), ...patch }] : current;
    });
    setError(null);
  }

  /**
   * Rule (1) answered. « Non exploitable » makes the sample non conform with
   * the motif of rule (1); answering « Exploitable » afterwards drops that
   * motif, the rules propose again.
   */
  function answerExploitable(line: LineState, exploitable: boolean) {
    updateLine(
      line.sampleId,
      exploitable
        ? { exploitable, reason: line.reason === "NON_EXPLOITABLE" ? "" : line.reason }
        : { exploitable, reason: "NON_EXPLOITABLE" }
    );
  }

  /**
   * A ticked control answered (C3, C5). « Non » makes the sample non conform
   * with the control's motif, unless a motif is already chosen; « Oui »
   * afterwards drops that motif, the rules propose again.
   */
  function answerTick(line: LineState, key: Extract<ComplementaryKey, "EMBALLAGE" | "IDENTIFICATION">, ok: boolean) {
    const field = key === "EMBALLAGE" ? "packagingOk" : "identificationOk";
    updateLine(line.sampleId, {
      [field]: ok,
      reason: ok ? (line.reason === key ? "" : line.reason) : line.reason || key,
    });
  }

  /** The live evaluation of one sample: the eight rules, the complementary controls, proposal, effective choice. */
  function evaluate(line: LineState) {
    const sample = byId.get(line.sampleId)!;
    const quantity = numberOrNull(line.quantity);
    const paper = receptionChecklist(
      {
        lineKind: sample.lineKind,
        family: sample.nature.family,
        parameterNames: sample.parameters.flatMap((p) => parameterSpellings(p.parameter)),
        quantity,
        quantityUnit: quantity === null ? null : line.quantityUnit,
        receptionTemperature: numberOrNull(line.temperature),
        unitCount: sample.unitCount,
        // « Ambiant » on a food: a stable food, no temperature required (rule 6).
        storageClass: line.storageClass,
        // Rule (8): live bivalve molluscs, recognised on these names.
        productNames: [sample.produit, sample.productType?.name, sample.nature.label],
      },
      thresholds,
      // The cooler pre-fills every sample until one is measured apart.
      { exploitable: line.exploitable, temperatureSource: receptionTemperatureSource(line) }
    );
    const complementary = complementaryChecklist(
      {
        lineKind: sample.lineKind,
        family: sample.nature.family,
        receptionTemperature: numberOrNull(line.temperature),
        storageClass: line.storageClass,
        temperatureSource: receptionTemperatureSource(line),
        expiryDate: sample.expiryDate ? new Date(sample.expiryDate) : null,
      },
      {
        startedAt: new Date(serie.startedAt),
        endedAt: serie.endedAt ? new Date(serie.endedAt) : null,
        // As the API reads it: the arrival typed here, else the série's.
        arrivedAt: localInputDate(arrivedAt) ?? (serie.arrivedAt ? new Date(serie.arrivedAt) : null),
        receivedAt: now,
      },
      thresholds,
      { packagingOk: line.packagingOk, identificationOk: line.identificationOk }
    );
    // The paper's rules first: one of them keeps the priority over a control.
    const rows = [...paper, ...complementary];
    const proposal = proposedConformity(rows);
    const conformity = proposal.forced ? false : (line.conformityChoice ?? proposal.conformity);
    const reason: NonConformityReason | "" = conformity ? "" : line.reason || proposal.reason || "";
    // A7: a row « à vérifier » accepted conforme needs the observation.
    const doubt = rowToJustify(rows, conformity, line.receptionNote);
    return { sample, rows, proposal, conformity, reason, doubt };
  }

  async function submit() {
    if (busy) return;
    // An unfinished or invalid date-time before any check of the times: the
    // form still holds the value from before it (the field gets the focus,
    // its own message stays under it). The arrival, then the client's
    // agreement of each sample where it is shown.
    const arrivalPending = dateTimePending("arrivedAt");
    if (arrivalPending) {
      setArrivedError(null);
      setError({ message: arrivalPending, lineNumber: null });
      return;
    }
    for (const line of activeLines) {
      const atId = consultationAtId(`accord-${line.sampleId}`);
      const atPending = dateTimePending(atId);
      if (!atPending) continue;
      const sample = byId.get(line.sampleId)!;
      const ref = sampleRef(sample.lineNumber, sample.code);
      setError({ message: receptionLineMessage(ref, atPending), lineNumber: sample.lineNumber, ref });
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(atId)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    // The server's own checks (5 min of tolerance; never before the
    // sampling), told next to the field first (§8.1).
    const arrival = localInputDate(arrivedAt);
    const arrivalProblem =
      futureFieldError("L'heure d'arrivée", arrivedAt) ??
      (arrival
        ? arrivalRefusal(arrival, new Date(serie.startedAt), serie.endedAt ? new Date(serie.endedAt) : null)
        : null);
    setArrivedError(arrivalProblem);
    if (arrivalProblem) {
      setError({ message: arrivalProblem, lineNumber: null });
      document.getElementById("arrivedAt")?.focus();
      return;
    }
    // Rule (1) is answered for every sample — the API refuses otherwise.
    const unanswered = activeLines.find((line) => line.exploitable === null);
    if (unanswered) {
      const sample = byId.get(unanswered.sampleId)!;
      const ref = sampleRef(sample.lineNumber, sample.code);
      setError({
        message: receptionLineMessage(ref, EXPLOITABLE_MESSAGES.missing),
        lineNumber: sample.lineNumber,
        ref,
      });
      const target = document.getElementById(`exploitable-${unanswered.sampleId}`);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }
    // C3 and C5 are ticked for every sample too — the API refuses otherwise.
    const unticked = activeLines.find((line) => line.packagingOk === null || line.identificationOk === null);
    if (unticked) {
      const sample = byId.get(unticked.sampleId)!;
      const ref = sampleRef(sample.lineNumber, sample.code);
      const packaging = unticked.packagingOk === null;
      setError({
        message: receptionLineMessage(
          ref,
          packaging ? COMPLEMENTARY_MESSAGES.packagingMissing : COMPLEMENTARY_MESSAGES.identificationMissing
        ),
        lineNumber: sample.lineNumber,
        ref,
      });
      const target = document.getElementById(`${packaging ? "packaging" : "identification"}-${unticked.sampleId}`);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }
    // A doubt accepted conforme is justified — the API refuses otherwise (A7).
    for (const line of activeLines) {
      const { sample, doubt } = evaluate(line);
      if (!doubt) continue;
      const ref = sampleRef(sample.lineNumber, sample.code);
      setError({ message: receptionLineMessage(ref, justifyAcceptanceMessage(doubt)), lineNumber: sample.lineNumber, ref });
      const target = document.getElementById(`obs-${line.sampleId}`);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }
    // The client's agreement: name and channel together, required when the
    // laboratory says so — the API refuses otherwise (A9).
    for (const line of activeLines) {
      const { sample, conformity } = evaluate(line);
      if (conformity || line.decision !== "ANALYSER") continue;
      const problem =
        consultationDraftError(line.consultation, consultationRequired) ??
        futureFieldError(CONSULTATION_TIME_LABEL, line.consultation.at);
      if (!problem) continue;
      const ref = sampleRef(sample.lineNumber, sample.code);
      setError({ message: receptionLineMessage(ref, problem), lineNumber: sample.lineNumber, ref });
      const target = document.getElementById(`accord-${line.sampleId}-name`);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        arrivedAt: fromLocalInput(arrivedAt),
        coolerTemperature: cooler,
        // C6: a visit's answer when no photo is attached; nothing otherwise.
        signedProtocolReceived: visitWithoutPhoto ? protocolReceived : null,
        lines: activeLines.map((line) => {
          const { conformity, reason } = evaluate(line);
          return {
            sampleId: line.sampleId,
            receptionTemperature: line.temperature,
            receptionTemperatureSource: receptionTemperatureSource(line),
            storageClass: line.storageClass,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            exploitable: line.exploitable,
            packagingOk: line.packagingOk,
            identificationOk: line.identificationOk,
            conformity,
            conformityReason: conformity ? undefined : reason,
            conformityNote: line.note,
            receptionNote: line.receptionNote,
            decision: conformity ? "ANALYSER" : line.decision,
            // The client's agreement, sent with « Analyser malgré tout » only.
            consultation:
              !conformity && line.decision === "ANALYSER"
                ? consultationPayload(line.consultation, fromLocalInput)
                : undefined,
          };
        }),
      };
      const response = await fetch(`/api/series/${serie.id}/reception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError({
          message: data.error ?? "Impossible de réceptionner la série.",
          lineNumber: data.lineNumber ?? null,
          ref: data.ref ?? null,
        });
        return;
      }
      setResult(data.lines as ReceivedLine[]);
    } catch {
      setError({ message: "Une erreur réseau est survenue. Réessayez.", lineNumber: null });
    } finally {
      setBusy(false);
    }
  }

  if (result || pending.length === 0) {
    // Once the page data shows the série received (after a refresh — a
    // « Corriger la fiche » refreshes it), the summary reads the database,
    // not the answer of the reception kept in memory (recette 07/10).
    const received: ReceivedLine[] =
      result && pending.length > 0
        ? result
        : alreadyReceived.map((s) => ({
        id: s.id,
        code: s.code,
        lineNumber: s.lineNumber,
        controlCode: s.controlCode,
        unitCount: s.unitCount,
        conformity: s.conformity,
        conformityReason: s.conformityReason,
        receptionNote: s.receptionNote ?? null,
        analysisBlocked: s.analysisBlocked ?? false,
        awaitingClientSince: s.awaitingClientSince ?? null,
        produit: s.produit,
        surfaceLabel: s.surfaceLabel,
        surfaceState: s.surfaceState ?? null,
        airMethod: s.airMethod ?? null,
        personName: s.personName,
        nature: { label: s.nature.label },
        technician: s.technician,
        assignedAt: s.assignedAt ?? null,
      }));
    return (
      <ReceivedSummary
        serie={serie}
        lines={received}
        role={role}
        decided={decided}
        justReceived={result !== null}
        onBack={() => {
          router.refresh();
          router.push("/reception");
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        badge={SERIE_KIND_LABELS[serie.kind]}
        title={`Série ${serie.serialNumber}`}
        subtitle={`${serie.client.name}${serie.site ? ` · ${serie.site.name}` : ""} — ${countLabel(pending.length, "échantillon")} à réceptionner`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {serie.kind === "VISITE" && (
            <Card className="p-4 sm:p-5">
              <SignedProtocolCheck
                row={signedProtocolRow({ hasPhoto: Boolean(serie.hasSignedProtocol), received: protocolReceived })}
                photoHref={serie.hasSignedProtocol ? protocolPhotoHref(serie.id) : null}
                answer={
                  visitWithoutPhoto
                    ? {
                        value: protocolReceived,
                        // The active answer clicked again clears it: the row is optional.
                        onChange: (received) => setProtocolReceived((current) => (current === received ? null : received)),
                        id: "signed-protocol",
                      }
                    : undefined
                }
              />
            </Card>
          )}

          {receivedEarlier.length > 0 && (
            <Card className="p-4 text-sm text-slate-600">
              {countLabel(receivedEarlier.length, "échantillon")} de cette série{" "}
              {receivedEarlier.length > 1 ? "sont déjà réceptionnés" : "est déjà réceptionné"} (
              {receivedEarlier.map((s) => s.controlCode ?? s.code).join(", ")}).
            </Card>
          )}

          {cancelledEarlier.length > 0 && (
            <Card className="p-4 text-sm text-slate-600">
              {countLabel(cancelledEarlier.length, "échantillon")} de cette série{" "}
              {cancelledEarlier.length > 1 ? "sont annulés" : "est annulé"} avant la réception (
              {cancelledEarlier
                .map((s) => `${s.code}${s.cancelReason ? ` · ${CANCEL_REASON_LABELS[s.cancelReason]}` : ""}`)
                .join(", ")}
              ).
            </Card>
          )}

          {activeLines.map((line) => {
            const { sample, rows, proposal, conformity, reason, doubt } = evaluate(line);
            const highlighted = errorConcernsSample(error, sample);
            // One of the two samples of a two-family line: its own container (12/10).
            const twin = sampleRef(sample.lineNumber, sample.code) !== String(sample.lineNumber);
            return (
              <Card
                key={line.sampleId}
                className={`p-5 ${highlighted ? "ring-2 ring-rose-300" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      {sampleHeading(sample, sample.nature.label)}
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">{receptionDesignation(sample)}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {LINE_KIND_LABELS[sample.lineKind]} · {sample.lieu}
                      {sample.numeroLot ? ` · lot ${sample.numeroLot}` : ""}
                      {sample.productionDate ? ` · DLC P ${formatDate(sample.productionDate)}` : ""}
                      {sample.expiryDate ? ` · DLC E ${formatDate(sample.expiryDate)}` : ""}
                      {sample.productTemperature !== null ? ` · T°p ${formatDecimal(sample.productTemperature)} °C` : ""}
                      {sample.ambientTemperature !== null ? ` · T°a ${formatDecimal(sample.ambientTemperature)} °C` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {unitsLabel(sample.unitCount)} ·{" "}
                      {sample.parameters.length > 0
                        ? sample.parameters.map((p) => p.parameter.name).join(", ")
                        : "analyses fixées par le responsable des paramètres"}
                    </p>
                    {sample.remarks && <p className="mt-1 text-xs italic text-slate-500">{sample.remarks}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SampleVerbs sample={verbSampleOf(sample, serie.client.id)} role={role} compact />
                    <StatusBadge status={sample.status} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`t-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                      T° à l&apos;arrivée (°C)
                    </label>
                    <input
                      id={`t-${line.sampleId}`}
                      type="text"
                      inputMode="decimal"
                      value={line.temperature}
                      onChange={(e) => updateLine(line.sampleId, { temperature: e.target.value, temperatureTouched: true })}
                      placeholder="Ex. : 4"
                      className="input-field mt-1.5 px-3"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`q-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                      Quantité reçue{twin ? ` (${sampleRef(sample.lineNumber, sample.code)})` : ""}
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id={`q-${line.sampleId}`}
                        type="text"
                        inputMode="decimal"
                        aria-describedby={twin ? `q-hint-${line.sampleId}` : undefined}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.sampleId, { quantity: e.target.value })}
                        placeholder="Ex. : 250"
                        className="input-field px-3"
                      />
                      <select
                        aria-label="Unité"
                        value={line.quantityUnit}
                        onChange={(e) => updateLine(line.sampleId, { quantityUnit: e.target.value as QuantityUnit })}
                        className="input-field w-32 px-3"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {QUANTITY_UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {twin && (
                      <p id={`q-hint-${line.sampleId}`} className="mt-1 text-xs text-slate-500">
                        Un contenant par famille : pesez la part de chaque famille.
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`sc-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                      Conservation
                    </label>
                    <StorageClassSelect
                      id={`sc-${line.sampleId}`}
                      value={line.storageClass}
                      defaultLabel={storageDefaultLabel(sample.lineKind, [sample.nature.family])}
                      lineKind={sample.lineKind}
                      onChange={(storageClass) => updateLine(line.sampleId, { storageClass })}
                    />
                  </div>
                  {sample.lineKind === "EAU" && (
                    <div>
                      <label htmlFor={`src-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                        Température relevée sur
                      </label>
                      <select
                        id={`src-${line.sampleId}`}
                        value={receptionTemperatureSource(line) ?? ""}
                        disabled={!line.temperature.trim()}
                        onChange={(e) =>
                          updateLine(line.sampleId, { sourceChoice: (e.target.value || null) as TemperatureSource | null })
                        }
                        className="input-field mt-1.5 px-3 disabled:opacity-60"
                      >
                        <option value="">—</option>
                        {TEMPERATURE_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {TEMPERATURE_SOURCE_LABELS[source]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <Checklist
                  rows={rows}
                  exploitable={{
                    value: line.exploitable,
                    onChange: (exploitable) => answerExploitable(line, exploitable),
                    id: `exploitable-${line.sampleId}`,
                    invalid: highlighted && line.exploitable === null,
                  }}
                  ticks={{
                    EMBALLAGE: {
                      value: line.packagingOk,
                      onChange: (ok) => answerTick(line, "EMBALLAGE", ok),
                      id: `packaging-${line.sampleId}`,
                      invalid: highlighted && line.packagingOk === null,
                    },
                    IDENTIFICATION: {
                      value: line.identificationOk,
                      onChange: (ok) => answerTick(line, "IDENTIFICATION", ok),
                      id: `identification-${line.sampleId}`,
                      invalid: highlighted && line.identificationOk === null,
                    },
                  }}
                />

                <ReceptionNoteField
                  id={`obs-${line.sampleId}`}
                  value={line.receptionNote}
                  onChange={(receptionNote) => updateLine(line.sampleId, { receptionNote })}
                  doubt={conformity ? (rows.find((row) => row.status === "A_VERIFIER") ?? null) : null}
                  invalid={highlighted && doubt !== null}
                />

                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-slate-700">Conformité</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <ConformityChip
                      active={conformity}
                      disabled={proposal.forced}
                      tone="ok"
                      label="Conforme"
                      onClick={() => updateLine(line.sampleId, { conformityChoice: true })}
                    />
                    <ConformityChip
                      active={!conformity}
                      disabled={false}
                      tone="warn"
                      label="Non conforme"
                      onClick={() => {
                        // A DLC passed (C7) and nothing else proposing a motif: « Autre », précision ready.
                        const dlcNote = proposal.reason === "AUTRE" && !line.note.trim() ? expiredDlcNote(rows) : null;
                        updateLine(line.sampleId, {
                          conformityChoice: false,
                          ...(dlcNote ? { reason: "AUTRE" as const, note: dlcNote } : {}),
                        });
                      }}
                    />
                  </div>
                  {proposal.forced && (
                    <p className="mt-1.5 text-xs text-rose-700">
                      {proposal.rule === 1
                        ? "Échantillon non exploitable (règle 1) : il est réceptionné non conforme."
                        : proposal.code
                          ? `Contrôle ${proposal.code} non conforme : l'échantillon est réceptionné non conforme${
                              proposal.code === "C5" ? " — corrigez la fiche avant de valider" : ""
                            }.`
                          : `La règle (${proposal.rule}) n'est pas respectée : corrigez la mesure ou réceptionnez l'échantillon comme non conforme.`}
                    </p>
                  )}
                </fieldset>

                {!conformity && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`r-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                        Motif <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id={`r-${line.sampleId}`}
                        value={reason}
                        onChange={(e) => updateLine(line.sampleId, { reason: e.target.value as NonConformityReason | "" })}
                        className="input-field mt-1.5 px-3"
                      >
                        <option value="">Choisir un motif</option>
                        {REASONS.filter((r) => r !== "NON_EXPLOITABLE" || line.exploitable === false).map((r) => (
                          <option key={r} value={r}>
                            {NON_CONFORMITY_REASON_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`n-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                        Précision {reason === "AUTRE" && <span className="text-rose-600">*</span>}
                      </label>
                      <input
                        id={`n-${line.sampleId}`}
                        type="text"
                        value={line.note}
                        onChange={(e) => updateLine(line.sampleId, { note: e.target.value })}
                        placeholder="Facultatif"
                        className="input-field mt-1.5 px-3"
                      />
                    </div>
                  </div>
                )}

                {!conformity && (
                  <DecisionChips
                    legend="Décision pour cet échantillon"
                    value={line.decision}
                    onChange={(decision) => updateLine(line.sampleId, { decision })}
                  />
                )}

                {!conformity && line.decision === "ANALYSER" && (
                  <ConsultationFields
                    idPrefix={`accord-${line.sampleId}`}
                    value={line.consultation}
                    onChange={(consultation) => updateLine(line.sampleId, { consultation })}
                    required={consultationRequired}
                    invalid={highlighted && consultationDraftError(line.consultation, consultationRequired) !== null}
                  />
                )}

                {!conformity && line.decision === "EN_ATTENTE_CLIENT" && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Échantillon réceptionné et numéroté, puis bloqué jusqu&apos;à l&apos;avis du client : il apparaît dans
                    « Bloqués » de la réception, d&apos;où il sera analysé ou détruit.
                  </p>
                )}

                {!conformity && line.decision === "DETRUIRE" && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Échantillon détruit : numéroté et imprimé sur le bon de réception avec sa non-conformité, puis annulé
                    (motif « Détruit à réception »). Aucune analyse, rien n&apos;est facturé.
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Thermometer className="h-4 w-4" aria-hidden="true" />
              La glacière
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-600">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Prélevé par</dt>
                <dd className="text-right font-medium text-slate-800">{samplerOf(serie)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Cadre</dt>
                <dd className="text-right font-medium text-slate-800">{formatCadre(serie.cadre, serie.cadreNote)}</dd>
              </div>
              {serie.clientReference && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Référence client</dt>
                  <dd className="text-right font-medium text-slate-800">{serie.clientReference}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Début</dt>
                <dd className="text-right font-medium text-slate-800">{formatDateTime(serie.startedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Fin</dt>
                <dd className="text-right font-medium text-slate-800">{serie.endedAt ? formatDateTime(serie.endedAt) : "—"}</dd>
              </div>
              {serie.interlocutor && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Interlocuteur</dt>
                  <dd className="text-right font-medium text-slate-800">{serie.interlocutor}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Analyses à effectuer</dt>
                <dd className="text-right font-medium text-slate-800">
                  {[serie.analysesMicro ? "microbiologiques" : "", serie.analysesChimie ? "physico-chimiques" : ""]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
            </dl>
            {missingFamilies.length > 0 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Coché sur le protocole sans échantillon correspondant : {missingFamilies.join(" et ")}. Vérifiez avec le
                préleveur s&apos;il manque un échantillon.
              </p>
            )}

            <div className="mt-4">
              <label htmlFor="arrivedAt" className="block text-sm font-medium text-slate-700">
                Arrivée au laboratoire
              </label>
              <LabDateTimeInput
                id="arrivedAt"
                value={arrivedAt}
                onChange={(legalWall) => {
                  setArrivedAt(legalWall);
                  if (arrivedError) {
                    setArrivedError(null);
                    setError(null);
                  }
                }}
                nowButton
                className="mt-1.5"
                inputClassName="input-field px-3"
                errorId={arrivedError ? "arrivedAt-error" : undefined}
              />
              {arrivedError && (
                <p id="arrivedAt-error" className="mt-1 text-xs font-medium text-rose-700">
                  {arrivedError}
                </p>
              )}
            </div>
            <div className="mt-3">
              <label htmlFor="cooler" className="block text-sm font-medium text-slate-700">
                T° de la glacière (°C)
              </label>
              <input
                id="cooler"
                type="text"
                inputMode="decimal"
                value={cooler}
                onChange={(e) => changeCooler(e.target.value)}
                placeholder="Ex. : 3"
                className="input-field mt-1.5 px-3"
                aria-describedby={coolerWarning ? "cooler-warning" : undefined}
              />
              <p className="mt-1 text-xs text-slate-500">Pré-remplit la température de chaque échantillon.</p>
              {coolerWarning && (
                <p id="cooler-warning" className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {coolerWarning}
                </p>
              )}
            </div>
            <a
              href={`/api/series/${serie.id}/document`}
              target="_blank"
              rel="noopener"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Voir le protocole de prélèvement (PDF)
            </a>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <p>
                La validation attribue un <b>N° de contrôle</b>{" "}à chaque échantillon, en une seule opération. Les étiquettes s&apos;impriment ensuite.
                Après la programmation, l&apos;échantillon apparaît dans « À prendre » : le technicien qui le prend en charge en devient responsable.
              </p>
            </div>
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error.message}
              </p>
            )}
            <PrimaryButton
              type="button"
              onClick={submit}
              disabled={busy}
              className="mt-4 w-full min-h-[48px]"
            >
              {busy ? "Réception en cours…" : `Valider la réception (${countLabel(pending.length, "échantillon")})`}
            </PrimaryButton>
            <SecondaryButton
              type="button"
              onClick={() => router.push("/reception")}
              disabled={busy}
              className="mt-2 w-full"
            >
              Annuler
            </SecondaryButton>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * After the reception the réceptionniste labels the tubes: every number is
 * shown large, with its unit letters, and the labels print from here.
 */
function ReceivedSummary({
  serie,
  lines,
  role,
  decided,
  justReceived,
  onBack,
}: {
  serie: ReceptionSerieData;
  lines: ReceivedLine[];
  role: Role;
  decided: Record<string, ReceivedChecklist | null>;
  justReceived: boolean;
  onBack: () => void;
}) {
  const byId = new Map(serie.samples.map((s) => [s.id, s]));
  const statusOf = (line: ReceivedLine) => (justReceived ? line.status : byId.get(line.id)?.status);
  // Numbered: every received sample (a sample cancelled before its reception
  // never was); labelled: those still to analyse — as the labels route prints them.
  const numbered = lines.filter((line) => line.controlCode !== null);
  const units = numbered
    .filter((line) => statusOf(line) !== "ANNULE")
    .reduce((n, l) => n + Math.max(1, l.unitCount), 0);
  // Nobody is assigned (§9.3, prise en charge libre of 13/10): the column
  // only shows once a technician took a sample at the bench — or an older
  // programme or reception named one.
  const showTechnician = lines.some((line) => line.technician);
  const columns = showTechnician ? 6 : 5;
  // What was decided (A8): the API's answer right after the reception, the
  // journal's SAMPLE_RECEIVED entry afterwards — never a recomputation.
  const decidedOf = (line: ReceivedLine): ReceivedChecklist | null =>
    line.checklist ? { checklist: line.checklist, complementary: line.complementary ?? [] } : (decided[line.id] ?? null);
  return (
    <div>
      <PageHeader
        badge={SERIE_KIND_LABELS[serie.kind]}
        title={`Série ${serie.serialNumber}`}
        subtitle={`${serie.client.name}${serie.site ? ` · ${serie.site.name}` : ""}`}
      />
      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">
              {justReceived ? "Série réceptionnée" : "Série déjà réceptionnée"}
            </h2>
            <p className="text-sm text-slate-500">
              {countLabel(numbered.length, "échantillon numéroté", "échantillons numérotés")} · {countLabel(units, "étiquette")}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 font-medium">Échantillon</th>
                <th className="pb-2 pr-3 font-medium">N° de contrôle</th>
                <th className="pb-2 pr-3 font-medium">Unités</th>
                <th className="pb-2 pr-3 font-medium">Conformité</th>
                {showTechnician && <th className="pb-2 pr-3 font-medium">Pris en charge par</th>}
                <th className="pb-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const source = byId.get(line.id);
                const checklist = decidedOf(line);
                return (
                  <Fragment key={line.id}>
                    <tr className="align-top">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-slate-800">
                          {sampleRef(line.lineNumber, line.code)} · {line.nature.label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {source
                            ? receptionDesignation({
                                ...source,
                                surfaceState: line.surfaceState ?? source.surfaceState,
                                airMethod: line.airMethod ?? source.airMethod,
                              })
                            : (line.produit ?? line.surfaceLabel ?? line.personName ?? "—")}
                        </span>
                        {line.receptionNote && (
                          <span className="mt-1 block max-w-md whitespace-pre-line text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">Observation :</span> {line.receptionNote}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-base font-bold text-slate-900">{line.controlCode ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{unitsLabel(line.unitCount)}</td>
                      <td className="py-2.5 pr-3">
                        {(justReceived ? line.status : byId.get(line.id)?.status) === "ANNULE" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                            Annulé
                            {(() => {
                              const reason = justReceived ? line.cancelReason : byId.get(line.id)?.cancelReason;
                              return reason ? ` · ${CANCEL_REASON_LABELS[reason]}` : "";
                            })()}
                          </span>
                        ) : line.conformity === false ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            {line.conformityReason ? NON_CONFORMITY_REASON_LABELS[line.conformityReason] : "Non conforme"}
                            {line.awaitingClientSince ? " · en attente du client" : line.analysisBlocked ? " · bloquée" : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Conforme
                          </span>
                        )}
                      </td>
                      {showTechnician && (
                        <td className="py-2.5 pr-3 text-slate-700">
                          {line.technician?.name ?? "—"}
                          {line.technician && line.assignedAt && (
                            <span className="block text-xs text-slate-500">{formatDateTime(line.assignedAt)}</span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5">
                        {byId.get(line.id) && (
                          <SampleVerbs
                            sample={verbSampleOf(byId.get(line.id)!, serie.client.id, justReceived ? line.status ?? "RECU" : byId.get(line.id)!.status)}
                            role={role}
                            compact
                          />
                        )}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td colSpan={columns} className="pb-3">
                        {checklist ? (
                          <details className="group rounded-xl border border-slate-200 bg-slate-50/40">
                            <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
                              <ChevronRight
                                className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                                aria-hidden="true"
                              />
                              Checklist à la réception
                              <span className="text-xs font-normal text-slate-500">
                                {checklistSummary([...checklist.checklist, ...checklist.complementary])}
                              </span>
                            </summary>
                            <div className="px-3 pb-3">
                              <Checklist rows={[...checklist.checklist, ...checklist.complementary]} />
                            </div>
                          </details>
                        ) : (
                          <p className="px-1 text-xs text-slate-500">
                            {cancelledBeforeReception({ status: statusOf(line), controlCode: line.controlCode })
                              ? "Annulé avant la réception : pas de checklist"
                              : "Réceptionné avant la checklist"}
                          </p>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href={`/api/series/${serie.id}/labels`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimer les étiquettes
          </a>
          <a
            href={`/api/series/${serie.id}/document`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {serie.kind === "DEPOT" ? "Bon de réception (PDF)" : "Protocole de prélèvement (PDF)"}
          </a>
          <SecondaryButton type="button" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à la file de réception
          </SecondaryButton>
        </div>
      </Card>
    </div>
  );
}
