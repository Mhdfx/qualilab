"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  Printer,
  Tag,
  User,
  Wallet,
} from "lucide-react";
import type {
  AirMethod,
  Cadre,
  CancelReason,
  Family,
  NonConformityReason,
  PaymentMode,
  QuantityUnit,
  SampleStatus,
  SampleType,
  SamplerKind,
  StorageClass,
  SurfaceState,
} from "@/generated/prisma/enums";
import {
  CADRE_CHOICES,
  CADRE_LABELS,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  QUANTITY_UNIT_LABELS,
  SAMPLER_KIND_LABELS,
  formatCadre,
  formatDateTime,
} from "@/lib/labels";
import {
  EXPLOITABLE_MESSAGES,
  justifyAcceptanceMessage,
  rowToJustify,
  type ReceptionThresholds,
} from "@/lib/reception-rules";
import { COMPLEMENTARY_MESSAGES, expiredDlcNote } from "@/lib/reception-complementary";
import { parseIsoDay } from "@/lib/date-only";
import {
  CONSULTATION_TIME_LABEL,
  EMPTY_CONSULTATION,
  consultationDraftError,
  consultationPayload,
  type ConsultationDraft,
  type ReceptionDecision,
} from "@/lib/client-consultation";
import { sampleRef } from "@/lib/reception-input";
import { SAMPLING_TIME_UNKNOWN, SERIE_MESSAGES, arrivalRefusal, sampleLineMessage } from "@/lib/serie-input";
import { repetitionRange } from "@/lib/series";
import { futureFieldError } from "@/lib/device-time";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { LabDateTimeInput, dateTimePending } from "@/components/LabDateTimeInput";
import { LineEditor } from "@/components/preleveur/LineEditor";
import { ClientPicker, type PickedClient } from "@/components/commercial/ClientPicker";
import { SitePicker, withNewSite } from "@/components/commercial/SitePicker";
import {
  duplicateDraft,
  emptyLine,
  fromLocalInput,
  lineCategory,
  lineDesignation,
  lineDraftError,
  lineNatures,
  linePayload,
  localInputDate,
  mergeSuggestions,
  toLocalInput,
  parameterFamily,
  serieAnalyses,
  type ClientMemory,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
  type ProductTypeOption,
  type ProfileOption,
} from "@/components/preleveur/visit-types";
import {
  AllExploitableBar,
  Checklist,
  ConformityChip,
  ConsultationFields,
  DecisionChips,
  ReceptionNoteField,
  StorageClassSelect,
  consultationAtId,
  useMinuteClock,
} from "./reception-widgets";
import {
  allExploitableNotice,
  answerAllExploitable,
  countLabel,
  depositLineChecklist,
  familiesSummary,
  lineSampleRefs,
  sampleCount,
  storageDefaultLabel,
  unansweredExploitableCount,
} from "./reception-logic";

const subscribeNoop = () => () => {};

/**
 * What the counter records on top of the sample itself. Keyed by the line:
 * when both families are ticked the line becomes two samples (« 2M »,
 * « 2P ») and `POST /api/series` gives both the same answer to rule (1),
 * temperature, conformity and decision — but each its own weight (one
 * container per family, 12/10: « Quantité 2P » is kept here, the line's own
 * quantity is the « 2M » part). No technician (RETOUR-LABO-06-10.md §9.3):
 * once programmed, the sample waits in « À prendre » until a technician
 * takes it (prise en charge libre, PROGRAMME.md §10).
 */
type LineIntake = {
  /** « Quantité 2P »: the physico-chemistry part of a two-family line, as typed. */
  chimieQuantity: string;
  /** Its unit; null = the line's own unit until one is chosen. */
  chimieQuantityUnit: QuantityUnit | null;
  /** Rule (1) of the bon: null until the counter answers (the card, or « Tous exploitables ») — never pre-answered. */
  exploitable: boolean | null;
  /** C5 (identification): null until ticked — never pre-answered. No C3 since 16/10 (Q70). */
  identificationOk: boolean | null;
  temperature: string;
  /** « Conservation » (C2) for the line; null = each sample's default. */
  storageClass: StorageClass | null;
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

type CreatedDeposit = {
  id: string;
  serialNumber: string;
  client: { name: string };
  /** The site of the deposit; null: the client's siège. */
  site: { name: string } | null;
  arrivedAt: string | null;
  samples: {
    id: string;
    code: string;
    lineNumber: number;
    lineKind: LineDraft["lineKind"];
    status: SampleStatus;
    produit: string | null;
    surfaceLabel: string | null;
    personName: string | null;
    /** Optional: only once the série's select carries them. */
    surfaceState?: SurfaceState | null;
    airMethod?: AirMethod | null;
    /** The exposed plate's duration (16/10): « Boîte exposée 45 min ». */
    airExposureMin?: number | null;
    controlCode: string | null;
    unitCount: number;
    conformity: boolean | null;
    conformityReason: NonConformityReason | null;
    cancelReason: CancelReason | null;
    /** « En attente du client » since (A9); optional on an older answer. */
    awaitingClientSince?: string | null;
    nature: { label: string; family: Family };
  }[];
};

/** « Prélèvement effectué par » at the counter. « Service vétérinaire » is
 * gone (RETOUR-LABO-06-10.md §5, V1): « Autre » + the service's name. */
const SAMPLER_CHOICES: { value: SamplerKind; label: string }[] = [
  { value: "CLIENT", label: "Le client" },
  { value: "AUTRE", label: "Autre" },
];
const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "ESPECES", label: "Espèces" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "VIREMENT", label: "Virement" },
  { value: "CARTE", label: "Carte" },
];
const REASONS = Object.keys(NON_CONFORMITY_REASON_LABELS) as NonConformityReason[];
const CADRE_NOTE_MAX = 191;
/** « + Nouveau client » at the counter (RETOUR-LABO-16-10.md E1). */
const CREATE_AT_THE_COUNTER = { origin: "DEPOT" } as const;

/** An analysis as `GET /api/parameters` sends it — with its aliases, which
 * the checklist reads to recognise histamine and Salmonella. */
type CatalogueParameter = ParameterOption & { aliases?: string | null };

/** The id of « Exploitable » on the card of a line — focused when rule (1) is unanswered. */
const exploitableAnchor = (key: string) => `exploitable-${key}`;
/** The id of « Oui » of C5 — focused when it is unanswered. */
const identificationAnchor = (key: string) => `identification-${key}`;
/** The id of « Observation de réception » — focused when an accepted doubt is not justified. */
const noteAnchor = (key: string) => `obs-${key}`;

const CHIP_ON = "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20";
const CHIP_OFF = "border-slate-200 text-slate-600 hover:border-slate-300";

/** The id of the card of « Échantillon N », to bring an error into view. */
const sampleAnchor = (lineNumber: number) => `deposit-sample-${lineNumber}`;

/** Scrolls a sample to fix into view (after the next paint, so that a card
 * shown again by « Modifier » exists). */
function reveal(id: string) {
  requestAnimationFrame(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  });
}

/** « 250 g », « 1,5 L », « quantité non pesée » — the recap of a typed quantity. */
function quantityRecap(value: string, unit: QuantityUnit) {
  return value.trim() ? `${value.trim()} ${QUANTITY_UNIT_LABELS[unit]}` : "quantité non pesée";
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * A deposit sample is weighed at the counter: grams for food, litres for
 * water. It continues the previous one (type, families, analyses, place) —
 * the place of a first sample is the counter itself.
 */
function depositLine(natures: readonly NatureOption[], previous?: LineDraft): LineDraft {
  const line = emptyLine(natures, previous);
  return {
    ...line,
    lieu: previous?.lieu ?? "Dépôt au laboratoire",
    quantity: "",
    quantityUnit: line.lineKind === "EAU" ? "L" : "G",
  };
}

/**
 * The bon de réception, filled at the counter when a client brings samples:
 * the same samples as a visit, plus what the reception measures — the
 * deposit is numbered and received in the same transaction (WORKFLOW.md
 * §3.2). The client is searched on the server (`ClientPicker`), never the
 * whole base loaded up front; its sites come with the client picked.
 *
 * The times (16/10, Q118): « Prélevé le » is required — the client who
 * truly does not know ticks « Heure de prélèvement inconnue du client »
 * (proposal of the re-ask 2.6, `SAMPLING_TIME_UNKNOWN`) — and « Arrivé le »
 * too, pre-filled with the instant the form opened: the live delay (C1),
 * the recap and the bon read it.
 */
export function DepositForm({
  thresholds,
  consultationRequired = false,
}: {
  thresholds: ReceptionThresholds;
  /** LabSettings.consultationRequired: analysing a non-conform line needs the client's agreement (A9). */
  consultationRequired?: boolean;
}) {
  const router = useRouter();
  const isMounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [natures, setNatures] = useState<NatureOption[]>([]);
  const [parametersByType, setParametersByType] = useState<Partial<Record<SampleType, CatalogueParameter[]>>>({});
  const [loadingTypes, setLoadingTypes] = useState<Set<SampleType>>(new Set());
  const requestedTypes = useRef<Set<SampleType>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedDeposit | null>(null);

  // The client picked in the search, with its active sites — and, found by
  // one of its sites (« Client — Site »), that site chosen.
  const [client, setClient] = useState<PickedClient | null>(null);
  const clientId = client?.id ?? "";
  const [siteId, setSiteId] = useState("");
  /** A new site's name typed in SitePicker but not created yet: « Continuer » refuses. */
  const [sitePending, setSitePending] = useState(false);
  const [samplerKind, setSamplerKind] = useState<SamplerKind>("CLIENT");
  // A choice, never deduced from who sampled, none preselected (V1).
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [cadreNote, setCadreNote] = useState("");
  const [samplerName, setSamplerName] = useState("");
  const [interlocutor, setInterlocutor] = useState("");
  const [clientReference, setClientReference] = useState("");
  // LEGAL wall time ("YYYY-MM-DDTHH:mm"): LabDateTimeInput converts a drifting device's hour.
  // « Prélevé le », required (16/10, Q118): empty until the client gives it —
  // never « now » —, or « inconnue du client » ticked on purpose (re-ask 2.6).
  const [startedAt, setStartedAt] = useState("");
  const [samplingUnknown, setSamplingUnknown] = useState(false);
  // The counter's clock: the reception instant (C7) and the arrival of an
  // emptied « Arrivé le » (C1); null on the server and during hydration.
  const now = useMinuteClock();
  // « Arrivé le », required: while untouched, the current minute — never the
  // instant the form opened: a form left open would date the arrival too
  // early and C1 would understate the delay. Untouched, nothing is sent and
  // the API stamps the save instant (`createSerie`). null = not edited yet;
  // "" = emptied on purpose. The field is drawn once mounted, so the
  // server's markup never shows this value.
  const [editedArrival, setEditedArrival] = useState<string | null>(null);
  const arrivedAt = editedArrival ?? (now ? toLocalInput(now) : "");
  // The refusals shown under « Prélevé le » and « Arrivé le » (§8.1).
  const [startedError, setStartedError] = useState<string | null>(null);
  const [arrivedError, setArrivedError] = useState<string | null>(null);
  // « Tous exploitables »: the confirmation of the last click, read out.
  const [bulkNotice, setBulkNotice] = useState("");
  const [notes, setNotes] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMode, setAdvanceMode] = useState<PaymentMode | "">("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [intake, setIntake] = useState<Record<string, LineIntake>>({});
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([]);
  const [memory, setMemory] = useState<ClientMemory>({ places: [], products: [] });

  const ensureParameters = useCallback((type: SampleType | undefined) => {
    if (!type || requestedTypes.current.has(type)) return;
    requestedTypes.current.add(type);
    setLoadingTypes((prev) => new Set(prev).add(type));
    fetch(`/api/parameters?category=${type}`)
      .then((r) => r.json())
      .then((data: CatalogueParameter[]) => {
        setParametersByType((prev) => ({ ...prev, [type]: Array.isArray(data) ? data : [] }));
      })
      .catch(() => {
        // A later edit of the line asks again.
        requestedTypes.current.delete(type);
      })
      .finally(() => {
        setLoadingTypes((prev) => {
          const next = new Set(prev);
          next.delete(type);
          return next;
        });
      });
  }, []);

  useEffect(() => {
    fetch("/api/natures")
      .then((r) => r.json())
      .then((n: NatureOption[]) => {
        const first = depositLine(n);
        setNatures(n);
        setLines((prev) => (prev.length ? prev : [first]));
        ensureParameters(lineCategory(n, first));
      });
  }, [ensureParameters]);

  useEffect(() => {
    let cancelled = false;
    fetch(clientId ? `/api/profiles?clientId=${clientId}` : "/api/profiles")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => {
        if (!cancelled) setProfiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    fetch(clientId ? `/api/product-types?clientId=${clientId}` : "/api/product-types")
      .then((r) => r.json())
      .then((data: ProductTypeOption[]) => {
        if (!cancelled) setProductTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    if (!clientId) {
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/clients/${clientId}/memory${siteId ? `?siteId=${siteId}` : ""}`)
      .then((r) => r.json())
      .then((data: { places?: { label: string }[]; products?: { label: string }[] }) => {
        if (cancelled) return;
        setMemory({
          places: (data.places ?? []).map((p) => p.label),
          products: (data.products ?? []).map((p) => p.label),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId, siteId]);

  // The sites of the client picked (the search returns them with it).
  const sites = client?.sites ?? [];
  const selectedSite = sites.find((s) => s.id === siteId);

  const productSuggestions = useMemo(
    () => mergeSuggestions(memory.products, lines.map((l) => l.produit)),
    [memory.products, lines]
  );
  const placeSuggestions = useMemo(
    () => mergeSuggestions(memory.places, lines.map((l) => l.lieu)),
    [memory.places, lines]
  );

  function clearError() {
    setError("");
    setErrorLine(null);
  }

  function intakeOf(key: string): LineIntake {
    return (
      intake[key] ?? {
        chimieQuantity: "",
        chimieQuantityUnit: null,
        exploitable: null,
        identificationOk: null,
        temperature: "",
        storageClass: null,
        conformityChoice: null,
        reason: "",
        note: "",
        receptionNote: "",
        decision: "ANALYSER",
        consultation: EMPTY_CONSULTATION,
      }
    );
  }

  /**
   * Rule (1) answered for the line. « Non exploitable » makes it non conform
   * with the motif of rule (1); « Exploitable » afterwards drops that motif.
   */
  function answerExploitable(key: string, exploitable: boolean) {
    const current = intakeOf(key);
    updateIntake(
      key,
      exploitable
        ? { exploitable, reason: current.reason === "NON_EXPLOITABLE" ? "" : current.reason }
        : { exploitable, reason: "NON_EXPLOITABLE" }
    );
  }

  /**
   * « Tous exploitables » (16/10, Q64): rule (1) « Exploitable » on every
   * line still unanswered — a « Non exploitable » already chosen stays, and
   * an unanswered line carries no rule (1) motif, so nothing else moves.
   */
  function answerAllLines() {
    const { lines: answered, count } = answerAllExploitable(lines.map((line) => intakeOf(line.key)));
    if (count === 0) return;
    setIntake((prev) => ({ ...prev, ...Object.fromEntries(lines.map((line, i) => [line.key, answered[i]])) }));
    setBulkNotice(allExploitableNotice(count));
    clearError();
  }

  /**
   * C5 answered for the line. « Non » makes it non conform with the motif
   * IDENTIFICATION unless one is chosen; « Oui » afterwards drops that motif.
   */
  function answerIdentification(key: string, ok: boolean) {
    const current = intakeOf(key);
    updateIntake(key, {
      identificationOk: ok,
      reason: ok ? (current.reason === "IDENTIFICATION" ? "" : current.reason) : current.reason || "IDENTIFICATION",
    });
  }

  function updateIntake(key: string, patch: Partial<LineIntake>) {
    setIntake((prev) => ({ ...prev, [key]: { ...intakeOf(key), ...patch } }));
    clearError();
  }

  /** Every edit of a sample, the type and family changes included: the
   * patch arrives consistent from the LineEditor, the analyses of the
   * resulting category are loaded if they are not yet. */
  function patchLine(line: LineDraft, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, ...patch } : l)));
    ensureParameters(lineCategory(natures, { ...line, ...patch }));
  }

  function addLine() {
    const line = depositLine(natures, lines.at(-1));
    ensureParameters(lineCategory(natures, line));
    setLines((prev) => [...prev, line]);
  }

  function duplicateLine(key: string) {
    const index = lines.findIndex((l) => l.key === key);
    if (index < 0) return;
    const copy = duplicateDraft(lines[index], natures);
    // The copy is another sample: rule (1) and the ticked control are
    // answered for it again, and their motifs do not travel without them.
    const source = intakeOf(key);
    const answered: NonConformityReason[] = ["NON_EXPLOITABLE", "IDENTIFICATION"];
    setIntake((current) => ({
      ...current,
      [copy.key]: {
        ...source,
        exploitable: null,
        identificationOk: null,
        // What was observed on the original is not the copy's, nor the client's agreement.
        receptionNote: "",
        consultation: EMPTY_CONSULTATION,
        reason: source.reason && answered.includes(source.reason) ? "" : source.reason,
      },
    }));
    setLines((prev) => {
      const at = prev.findIndex((l) => l.key === key);
      return at < 0 ? prev : [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)];
    });
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
    clearError();
  }

  /**
   * Live rules for one line: the eight rules of the bon for each sample it
   * becomes (one per ticked family — 100 g micro on « Quantité 2M », 300 g
   * physico-chimie on « Quantité 2P »), merged into one checklist, the
   * proposal and the effective conformity, shared by both samples.
   */
  function evaluate(line: LineDraft) {
    const category = lineCategory(natures, line);
    const catalogue = category ? (parametersByType[category] ?? []) : [];
    const ticked = line.parameterIds.flatMap((id) => catalogue.filter((p) => p.id === id));
    const samples = lineNatures(natures, line);
    const families = samples.map((s) => s.family);
    const twins = samples.length > 1;
    const extra = intakeOf(line.key);
    const chimieUnit = extra.chimieQuantityUnit ?? line.quantityUnit;
    const typedStart = samplingUnknown ? null : localInputDate(startedAt);
    const typedArrival = localInputDate(arrivedAt);
    const productType = productTypes.find((t) => t.id === line.productTypeId);
    const { rows, proposal } = depositLineChecklist(
      {
        lineKind: line.lineKind,
        families,
        parameters: ticked.map((p) => ({ name: p.name, aliases: p.aliases ?? null, family: parameterFamily(p) })),
        quantity: numberOrNull(line.quantity),
        quantityUnit: line.quantityUnit,
        // One container per family (12/10): the « P » sample on its own part.
        ...(twins ? { chimieQuantity: { quantity: numberOrNull(extra.chimieQuantity), quantityUnit: chimieUnit } } : {}),
        // Rule (8): the désignation, the type and each sample's nature.
        productNames: [line.produit, line.lineKind === "ALIMENT" ? productType?.name : null],
        natureLabels: Object.fromEntries(samples.map((s) => [s.family, s.nature.label])),
        receptionTemperature: numberOrNull(extra.temperature),
        unitCount: line.unitCount,
        exploitable: extra.exploitable,
        identificationOk: extra.identificationOk,
        storageClass: extra.storageClass,
        // C7: the DLC typed on a food line.
        expiryDate: line.lineKind === "ALIMENT" && line.expiryDate ? parseIsoDay(line.expiryDate) : null,
        // Typed at the counter: measured on the sample.
        temperatureSource: extra.temperature.trim() ? "ECHANTILLON" : null,
        // C1, as POST /api/series computes it (16/10, Q118): the arrival
        // typed; the sampling typed — or, unknown to the client, the arrival
        // and « non déclarée ». An empty « Prélevé le » is not an answer yet:
        // the delay waits (« non calculé »).
        serie: now
          ? {
              startedAt: samplingUnknown ? (typedArrival ?? now) : typedStart,
              endedAt: null,
              arrivedAt: typedArrival ?? now,
              samplingTimeDeclared: !samplingUnknown,
              receivedAt: now,
            }
          : null,
      },
      thresholds
    );
    const conformity = proposal.forced ? false : (extra.conformityChoice ?? proposal.conformity);
    const reason: NonConformityReason | "" = conformity ? "" : extra.reason || proposal.reason || "";
    const decision: ReceptionDecision = conformity ? "ANALYSER" : extra.decision;
    const destroy = decision === "DETRUIRE";
    // A7: a row « à vérifier » accepted conforme needs the observation.
    const doubt = rowToJustify(rows, conformity, extra.receptionNote);
    return {
      doubt,
      decision,
      families,
      twins,
      chimieUnit,
      names: ticked.map((p) => p.name),
      extra,
      rows,
      proposal,
      conformity,
      reason,
      destroy,
    };
  }

  function setStepError(message: string, line: number | null = null) {
    setError(message);
    setErrorLine(line);
    if (line !== null) reveal(sampleAnchor(line));
    return false;
  }

  function validateStep1() {
    if (!clientId) return setStepError("Choisissez le client.");
    // A new site typed but not created would be lost with step 1: the série would go to the siège.
    if (sitePending) {
      reveal("deposit-site");
      return setStepError("Créez le nouveau site ou annulez sa saisie.");
    }
    if (samplerKind === "AUTRE" && !samplerName.trim()) {
      return setStepError("Indiquez qui a effectué le prélèvement.");
    }
    if (!cadre) return setStepError(SERIE_MESSAGES.cadreMissing);
    // An unfinished or invalid date-time before any check of the times: the
    // form still holds the value from before it (the field gets the focus,
    // its own message stays under it). « Prélevé le » (skipped while
    // disabled), « Arrivé le », then the client's agreement of each line
    // where it is shown.
    for (const [field, clear] of [
      ["deposit-started", () => setStartedError(null)],
      ["deposit-arrived", () => setArrivedError(null)],
    ] as const) {
      const pending = dateTimePending(field);
      if (pending) {
        clear();
        reveal(field);
        return setStepError(pending);
      }
    }
    for (const [i, line] of lines.entries()) {
      const atId = consultationAtId(`accord-${line.key}`);
      const atPending = dateTimePending(atId);
      if (atPending) {
        setStepError(sampleLineMessage(i + 1, atPending), i + 1);
        reveal(atId);
        return false;
      }
    }
    // Both times are required (16/10, Q118) — the sampling one unless the
    // client does not know it —, then the server's own checks (5 min of
    // tolerance; the arrival never before the sampling), told next to their
    // field before « Continuer » (§8.1).
    const startedProblem = samplingUnknown
      ? null
      : startedAt
        ? futureFieldError("L'heure du prélèvement", startedAt)
        : SERIE_MESSAGES.depositStartedMissing;
    setStartedError(startedProblem);
    if (startedProblem) {
      reveal("deposit-started");
      return setStepError(startedProblem);
    }
    const typedStart = samplingUnknown ? null : localInputDate(startedAt);
    const arrival = localInputDate(arrivedAt);
    const arrivedProblem = !arrivedAt
      ? SERIE_MESSAGES.arrivalMissing
      : (futureFieldError("L'heure d'arrivée", arrivedAt) ??
        (arrival && typedStart ? arrivalRefusal(arrival, typedStart, null) : null));
    setArrivedError(arrivedProblem);
    if (arrivedProblem) {
      reveal("deposit-arrived");
      return setStepError(arrivedProblem);
    }
    if (advanceAmount.trim() && !advanceMode) return setStepError("Indiquez le mode de paiement de l'avance.");
    for (const [i, line] of lines.entries()) {
      const n = i + 1;
      // No analysis is required (V6): the programme sheet fixes them.
      const problem = lineDraftError(line, natures, { requirePlace: false });
      if (problem) return setStepError(sampleLineMessage(n, problem), n);
      const { conformity, reason, extra, doubt, decision } = evaluate(line);
      // Rule (1) is answered for every line — the API refuses otherwise.
      if (extra.exploitable === null) {
        setStepError(sampleLineMessage(n, EXPLOITABLE_MESSAGES.missing), n);
        requestAnimationFrame(() => document.getElementById(exploitableAnchor(line.key))?.focus({ preventScroll: true }));
        return false;
      }
      // C5 too.
      if (extra.identificationOk === null) {
        setStepError(sampleLineMessage(n, COMPLEMENTARY_MESSAGES.identificationMissing), n);
        requestAnimationFrame(() => document.getElementById(identificationAnchor(line.key))?.focus({ preventScroll: true }));
        return false;
      }
      if (!conformity && !reason) return setStepError(sampleLineMessage(n, "Choisissez le motif de non-conformité."), n);
      // The client's agreement: name and channel together, required when the
      // laboratory says so — the API refuses otherwise (A9).
      if (!conformity && decision === "ANALYSER") {
        const problem =
          consultationDraftError(extra.consultation, consultationRequired) ??
          futureFieldError(CONSULTATION_TIME_LABEL, extra.consultation.at);
        if (problem) {
          setStepError(sampleLineMessage(n, problem), n);
          requestAnimationFrame(() => document.getElementById(`accord-${line.key}-name`)?.focus({ preventScroll: true }));
          return false;
        }
      }
      // A doubt accepted conforme is justified — the API refuses otherwise (A7).
      if (doubt) {
        setStepError(sampleLineMessage(n, justifyAcceptanceMessage(doubt)), n);
        requestAnimationFrame(() => document.getElementById(noteAnchor(line.key))?.focus({ preventScroll: true }));
        return false;
      }
      if (!conformity && reason === "AUTRE" && !extra.note.trim()) {
        return setStepError(sampleLineMessage(n, "Précisez le motif « autre »."), n);
      }
    }
    clearError();
    return true;
  }

  async function handleConfirm() {
    setLoading(true);
    clearError();
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "DEPOT",
          clientId,
          siteId: siteId || undefined,
          samplerKind,
          cadre,
          cadreNote: cadre === "AUTRE" ? cadreNote.trim() || undefined : undefined,
          samplerName: samplerKind === "CLIENT" ? undefined : samplerName,
          interlocutor,
          clientReference,
          // Unknown to the client: the box, never an empty time (16/10, Q118).
          startedAt: samplingUnknown ? undefined : (fromLocalInput(startedAt) ?? undefined),
          samplingTimeUnknown: samplingUnknown || undefined,
          // Untouched: the API's own save instant, the minute shown.
          arrivedAt: editedArrival === null ? undefined : (fromLocalInput(arrivedAt) ?? undefined),
          notes,
          advanceAmount: advanceAmount || undefined,
          advanceMode: advanceMode || undefined,
          // The série's two boxes are computed by the API from the samples.
          lines: lines.map((line) => {
            const { conformity, reason, extra, decision, twins, chimieUnit } = evaluate(line);
            return {
              ...linePayload(line),
              // « Quantité 2P », a two-family line only (one container per family, 12/10).
              ...(twins ? { quantityChimie: extra.chimieQuantity, quantityUnitChimie: chimieUnit } : {}),
              exploitable: extra.exploitable,
              identificationOk: extra.identificationOk,
              receptionTemperature: extra.temperature,
              receptionTemperatureSource: extra.temperature.trim() ? "ECHANTILLON" : undefined,
              storageClass: extra.storageClass ?? undefined,
              conformity,
              conformityReason: conformity ? undefined : reason,
              conformityNote: extra.note,
              receptionNote: extra.receptionNote,
              decision,
              // The client's agreement, sent with « Analyser malgré tout » only.
              consultation:
                !conformity && decision === "ANALYSER" ? consultationPayload(extra.consultation, fromLocalInput) : undefined,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The API's message already names the sample (« Échantillon 2 — … »).
        setStep(1);
        setStepError(data.error ?? "Impossible d'enregistrer le dépôt.", typeof data.line === "number" ? data.line : null);
        return;
      }
      setCreated(data);
      setStep(3);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const cadreMissing = !cadre && error === SERIE_MESSAGES.cadreMissing;
  const samplesToCreate = sampleCount(lines);
  const analyses = serieAnalyses(lines);
  const serieFamilies: Family[] = [
    ...(analyses.analysesMicro ? (["MICRO"] as const) : []),
    ...(analyses.analysesChimie ? (["CHIMIE"] as const) : []),
  ];

  if (step === 3 && created) {
    // The two samples of a line side by side, microbiology first (« 2M », « 2P »).
    const samples = [...created.samples].sort((a, b) => a.lineNumber - b.lineNumber || a.code.localeCompare(b.code));
    const units = samples.reduce((n, s) => n + Math.max(1, s.unitCount), 0);
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Dépôt enregistré et réceptionné</h2>
              <p className="text-sm text-slate-500">
                {[
                  created.client.name,
                  created.site?.name,
                  created.arrivedAt ? `Arrivé le ${formatDateTime(created.arrivedAt)}` : null,
                  countLabel(samples.length, "échantillon numéroté", "échantillons numérotés"),
                  countLabel(units, "étiquette"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="ml-auto rounded-2xl bg-brand px-5 py-3 text-white shadow-lg shadow-brand/20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">N° de série</p>
              <p className="mt-0.5 font-mono text-2xl font-bold tracking-wide">{created.serialNumber}</p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Échantillon</th>
                  <th className="pb-2 pr-3 font-medium">N° de contrôle</th>
                  <th className="pb-2 pr-3 font-medium">Unités</th>
                  <th className="pb-2 font-medium">Conformité</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-slate-800">
                        {sampleRef(s.lineNumber, s.code)} · {lineDesignation(s)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {LINE_KIND_LABELS[s.lineKind]} · {s.nature.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-base font-bold text-slate-900">{s.controlCode ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {s.unitCount > 1 ? `${s.unitCount} (${repetitionRange(s.unitCount)})` : "1"}
                    </td>
                    <td className="py-2.5">
                      {s.status === "ANNULE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          Échantillon détruit
                          {s.conformityReason ? ` · ${NON_CONFORMITY_REASON_LABELS[s.conformityReason]}` : ""}
                        </span>
                      ) : s.conformity === false ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {s.conformityReason ? NON_CONFORMITY_REASON_LABELS[s.conformityReason] : "Non conforme"}
                          {s.awaitingClientSince ? " · en attente du client" : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Conforme
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={`/api/series/${created.id}/document`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimer le bon de réception
            </a>
            <a
              href={`/api/series/${created.id}/labels`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Tag className="h-4 w-4" aria-hidden="true" />
              Imprimer les étiquettes
            </a>
            <SecondaryButton type="button" onClick={() => window.location.assign("/reception/nouveau-depot")} className="min-h-[48px]">
              Nouveau dépôt
            </SecondaryButton>
            <SecondaryButton type="button" onClick={() => router.push("/reception")} className="min-h-[48px]">
              Retour à la réception
            </SecondaryButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        badge="Nouveau dépôt"
        title={step === 1 ? "Bon de réception" : "Vérification"}
        subtitle={
          step === 1
            ? "Le client apporte ses échantillons : un numéro de série pour le dépôt, chaque échantillon réceptionné sur-le-champ"
            : "Vérifiez les données avant l'enregistrement"
        }
      />
      <StepIndicator current={step as 1 | 2} />

      {step === 1 && (
        <div className="space-y-5">
          <Card className="p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Le dépôt</h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <ClientPicker
                    label="Client"
                    labelClassName="section-title mb-0.5"
                    labelIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                    excludeIds={[]}
                    selected={client}
                    siteRows
                    allowCreate={CREATE_AT_THE_COUNTER}
                    onSelect={(picked) => {
                      setClient(picked);
                      // « Client — Site » chosen: that site; otherwise the siège.
                      setSiteId(picked?.siteId ?? "");
                      setMemory({ places: [], products: [] });
                      clearError();
                      // A type of the previous client must not stay on a sample.
                      setLines((prev) => prev.map((l) => (l.productTypeId ? { ...l, productTypeId: "" } : l)));
                    }}
                  />
                </div>
                {/* Always shown, as in the old software (retour du 14/10, R1): disabled until
                    a client is picked; a new site joins its list without reloading the base. */}
                <SitePicker
                  id="deposit-site"
                  client={client}
                  value={siteId}
                  onChange={setSiteId}
                  onDraftChange={setSitePending}
                  onCreated={(site, forClient) => {
                    setClient((prev) => withNewSite(prev, forClient, site));
                    setSiteId(site.id);
                  }}
                />
              </div>

              <div role="group" aria-labelledby="deposit-sampler">
                <p id="deposit-sampler" className="section-title mb-2">
                  <User className="h-4 w-4" />
                  Prélèvement effectué par
                </p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLER_CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      onClick={() => {
                        setSamplerKind(choice.value);
                        clearError();
                      }}
                      aria-pressed={samplerKind === choice.value}
                      className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        samplerKind === choice.value ? CHIP_ON : CHIP_OFF
                      }`}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                {samplerKind === "AUTRE" && (
                  <input
                    type="text"
                    value={samplerName}
                    onChange={(e) => setSamplerName(e.target.value)}
                    aria-label="Nom de la personne ou du service qui a prélevé"
                    placeholder="Nom de la personne ou du service (ex. : service vétérinaire)"
                    className="input-field mt-2 px-4"
                  />
                )}
              </div>

              <div>
                <p id="deposit-cadre" className="section-title mb-2">
                  <ClipboardList className="h-4 w-4" />
                  Cadre
                  <span className="-ml-1 text-rose-600" aria-hidden="true">*</span>
                  <span className="sr-only">(obligatoire)</span>
                </p>
                <div
                  role="group"
                  aria-labelledby="deposit-cadre"
                  aria-describedby={cadreMissing ? "deposit-cadre-error" : undefined}
                  className={`flex flex-wrap gap-2 rounded-xl ${cadreMissing ? "ring-2 ring-rose-300 ring-offset-2" : ""}`}
                >
                  {CADRE_CHOICES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCadre(c);
                        clearError();
                      }}
                      aria-pressed={cadre === c}
                      className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        cadre === c ? CHIP_ON : CHIP_OFF
                      }`}
                    >
                      {CADRE_LABELS[c]}
                    </button>
                  ))}
                </div>
                {cadreMissing && (
                  <p id="deposit-cadre-error" className="mt-1 text-xs text-rose-600">
                    {SERIE_MESSAGES.cadreMissing}
                  </p>
                )}
                {cadre === "AUTRE" && (
                  <div className="mt-3">
                    <label htmlFor="deposit-cadre-note" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Préciser (facultatif)
                    </label>
                    <input
                      id="deposit-cadre-note"
                      type="text"
                      maxLength={CADRE_NOTE_MAX}
                      value={cadreNote}
                      onChange={(e) => setCadreNote(e.target.value)}
                      placeholder="Ex. : audit interne"
                      className="input-field px-4"
                    />
                  </div>
                )}
                {(cadre === "DEVIS_VALIDE" || cadre === "BON_COMMANDE") && (
                  <p className="mt-1 text-xs text-slate-500">
                    Le N° du {cadre === "BON_COMMANDE" ? "BC" : "devis"} se saisit dans « Référence client ».
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="deposit-interlocutor" className="section-title mb-2">
                    <User className="h-4 w-4" />
                    Déposé par (personne au comptoir)
                  </label>
                  <input
                    id="deposit-interlocutor"
                    type="text"
                    value={interlocutor}
                    onChange={(e) => setInterlocutor(e.target.value)}
                    placeholder="Nom de la personne"
                    className="input-field px-4"
                  />
                </div>
                <div>
                  <label htmlFor="deposit-reference" className="section-title mb-2">
                    <ClipboardList className="h-4 w-4" />
                    Référence client
                  </label>
                  <input
                    id="deposit-reference"
                    type="text"
                    value={clientReference}
                    onChange={(e) => setClientReference(e.target.value)}
                    placeholder="Facultatif — ex. : N° du BC ou du devis"
                    className="input-field px-4"
                  />
                </div>
              </div>

              {/* The two times of the série, both required (16/10, Q118). */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="deposit-started" className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Prélevé le
                    <span className="-ml-1 text-rose-600" aria-hidden="true">*</span>
                    <span className="sr-only">(obligatoire)</span>
                  </label>
                  {/* Rendered once mounted: the field reads the device's clock (drift hint). */}
                  {isMounted ? (
                    <LabDateTimeInput
                      id="deposit-started"
                      value={startedAt}
                      required={!samplingUnknown}
                      disabled={samplingUnknown}
                      onChange={(legalWall) => {
                        setStartedAt(legalWall);
                        if (startedError) {
                          setStartedError(null);
                          clearError();
                        }
                      }}
                      errorId={startedError ? "deposit-started-error" : undefined}
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                  {SAMPLING_TIME_UNKNOWN.allowed && (
                    <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={samplingUnknown}
                        onChange={(e) => {
                          const unknown = e.target.checked;
                          setSamplingUnknown(unknown);
                          // « Inconnue » and a time shown together would contradict each other.
                          if (unknown) setStartedAt("");
                          setStartedError(null);
                          clearError();
                        }}
                        className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
                      />
                      {SAMPLING_TIME_UNKNOWN.label}
                    </label>
                  )}
                  {startedError ? (
                    <p id="deposit-started-error" className="mt-1 text-xs font-medium text-rose-700">
                      {startedError}
                    </p>
                  ) : samplingUnknown ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Imprimé « Non déclarée » ; le délai prélèvement → laboratoire (C1) sera « à vérifier » et
                      l&apos;observation de réception obligatoire pour accepter un échantillon conforme.
                    </p>
                  ) : (
                    !startedAt && (
                      <p className="mt-1 text-xs text-slate-500">Demandez au client la date et l&apos;heure du prélèvement.</p>
                    )
                  )}
                </div>
                <div>
                  <label htmlFor="deposit-arrived" className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Arrivé le
                    <span className="-ml-1 text-rose-600" aria-hidden="true">*</span>
                    <span className="sr-only">(obligatoire)</span>
                  </label>
                  {isMounted ? (
                    <LabDateTimeInput
                      id="deposit-arrived"
                      value={arrivedAt}
                      required
                      nowButton
                      onChange={(legalWall) => {
                        setEditedArrival(legalWall);
                        if (arrivedError) {
                          setArrivedError(null);
                          clearError();
                        }
                      }}
                      errorId={arrivedError ? "deposit-arrived-error" : undefined}
                      describedBy={arrivedError ? undefined : "deposit-arrived-note"}
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                  {arrivedError ? (
                    <p id="deposit-arrived-error" className="mt-1 text-xs font-medium text-rose-700">
                      {arrivedError}
                    </p>
                  ) : (
                    <p id="deposit-arrived-note" className="mt-1 text-xs text-slate-500">
                      {editedArrival === null
                        ? "Date et heure de réception au laboratoire : l'heure actuelle tant que vous ne la modifiez pas — corrigez-la si l'échantillon est arrivé plus tôt."
                        : "Date et heure de réception au laboratoire."}
                    </p>
                  )}
                </div>
              </div>

              {/* Alone on its row since « Référence client » moved beside « Déposé par »: a narrow block, no empty grid column. */}
              <div className="sm:max-w-md">
                <div>
                  <label htmlFor="deposit-advance" className="section-title mb-2">
                    <Wallet className="h-4 w-4" />
                    Avance encaissée (DH)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="deposit-advance"
                      type="text"
                      inputMode="decimal"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      placeholder="0"
                      className="input-field px-4"
                    />
                    <select
                      aria-label="Mode de paiement"
                      value={advanceMode}
                      onChange={(e) => setAdvanceMode(e.target.value as PaymentMode | "")}
                      className="input-field w-36 px-3"
                    >
                      <option value="">Mode…</option>
                      {PAYMENT_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {lines.length > 0 && (
            <AllExploitableBar
              count={unansweredExploitableCount(lines.map((line) => intakeOf(line.key)))}
              notice={bulkNotice}
              onAnswer={answerAllLines}
            />
          )}

          {lines.map((line, index) => {
            const number = index + 1;
            const { families, twins, chimieUnit, rows, proposal, conformity, reason, extra, destroy, doubt, decision } = evaluate(line);
            const category = lineCategory(natures, line);
            const [microRef, chimieRef] = lineSampleRefs(number, families);
            return (
              <div
                key={line.key}
                id={sampleAnchor(number)}
                className={`scroll-mt-4 space-y-3 ${errorLine === number ? "rounded-2xl ring-2 ring-rose-300" : ""}`}
              >
                <LineEditor
                  index={index}
                  line={line}
                  natures={natures}
                  parameters={category ? (parametersByType[category] ?? []) : []}
                  parametersLoading={category ? loadingTypes.has(category) : false}
                  canRemove={lines.length > 1}
                  onChange={(patch) => patchLine(line, patch)}
                  onKindChange={(_kind, patch) => patchLine(line, patch)}
                  onDuplicate={() => duplicateLine(line.key)}
                  onRemove={() => removeLine(line.key)}
                  placeSuggestions={placeSuggestions}
                  productSuggestions={productSuggestions}
                  knownPlaces={memory.places}
                  knownProducts={memory.products}
                  profiles={profiles}
                  productTypes={productTypes}
                  quantityUnitFallback="G"
                  chimieQuantity={
                    twins
                      ? {
                          refs: { micro: microRef, chimie: chimieRef },
                          value: extra.chimieQuantity,
                          unit: chimieUnit,
                          onChange: (patch) =>
                            updateIntake(line.key, {
                              ...(patch.value !== undefined ? { chimieQuantity: patch.value } : {}),
                              ...(patch.unit ? { chimieQuantityUnit: patch.unit } : {}),
                            }),
                        }
                      : undefined
                  }
                />
                <Card className="p-4 sm:p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Réception de l&apos;échantillon {number}
                  </h3>
                  {twins && (
                    <p className="mt-1 text-xs text-slate-500">
                      Deux familles cochées : deux échantillons, {microRef} (microbiologie) et {chimieRef}{" "}
                      (physico-chimie), chacun avec son N° de contrôle et son propre contenant, pesé à part. La
                      réponse à la règle (1), la température, les contrôles complémentaires, la conformité et la
                      décision saisis ici valent pour les deux.
                    </p>
                  )}
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`rt-${line.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                        T° à l&apos;arrivée (°C)
                      </label>
                      <input
                        id={`rt-${line.key}`}
                        type="text"
                        inputMode="decimal"
                        value={extra.temperature}
                        onChange={(e) => updateIntake(line.key, { temperature: e.target.value })}
                        placeholder="Ex. : 4"
                        className="input-field px-4"
                      />
                    </div>
                    <div>
                      <label htmlFor={`sc-${line.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Conservation
                      </label>
                      <StorageClassSelect
                        id={`sc-${line.key}`}
                        value={extra.storageClass}
                        defaultLabel={storageDefaultLabel(line.lineKind, families)}
                        lineKind={line.lineKind}
                        onChange={(storageClass) => updateIntake(line.key, { storageClass })}
                        className="input-field px-4"
                      />
                    </div>
                  </div>

                  <Checklist
                    rows={rows}
                    exploitable={{
                      value: extra.exploitable,
                      onChange: (exploitable) => answerExploitable(line.key, exploitable),
                      id: exploitableAnchor(line.key),
                      invalid: errorLine === number && extra.exploitable === null,
                    }}
                    ticks={{
                      IDENTIFICATION: {
                        value: extra.identificationOk,
                        onChange: (ok) => answerIdentification(line.key, ok),
                        id: identificationAnchor(line.key),
                        invalid: errorLine === number && extra.identificationOk === null,
                      },
                    }}
                  />

                  <ReceptionNoteField
                    id={noteAnchor(line.key)}
                    value={extra.receptionNote}
                    onChange={(receptionNote) => updateIntake(line.key, { receptionNote })}
                    doubt={conformity ? (rows.find((row) => row.status === "A_VERIFIER") ?? null) : null}
                    invalid={errorLine === number && doubt !== null}
                    inputClassName="input-field mt-1.5 resize-y px-4 py-2"
                  />

                  <fieldset className="mt-4">
                    <legend className="text-sm font-semibold text-slate-700">Conformité</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <ConformityChip active={conformity} disabled={proposal.forced} tone="ok" label="Conforme" onClick={() => updateIntake(line.key, { conformityChoice: true })} />
                      <ConformityChip
                        active={!conformity}
                        disabled={false}
                        tone="warn"
                        label="Non conforme"
                        onClick={() => {
                          // A DLC passed (C7) and nothing else proposing a motif: « Autre », précision ready.
                          const dlcNote = proposal.reason === "AUTRE" && !extra.note.trim() ? expiredDlcNote(rows) : null;
                          updateIntake(line.key, { conformityChoice: false, ...(dlcNote ? { reason: "AUTRE", note: dlcNote } : {}) });
                        }}
                      />
                    </div>
                    {proposal.forced && (
                      <p className="mt-1.5 text-xs text-rose-700">
                        {proposal.rule === 1
                          ? `Échantillon non exploitable (règle 1) : ${twins ? "les deux échantillons sont réceptionnés non conformes" : "il est réceptionné non conforme"}.`
                          : proposal.code
                            ? `Contrôle ${proposal.code} non conforme : ${
                                twins ? "les deux échantillons sont réceptionnés non conformes" : "l'échantillon est réceptionné non conforme"
                              }${proposal.code === "C5" ? " — corrigez la fiche avant d'enregistrer" : ""}.`
                            : `La règle (${proposal.rule}) n'est pas respectée : corrigez la mesure ou réceptionnez ${
                              twins ? "les deux échantillons" : "l'échantillon"
                            } comme non conforme${twins ? "s" : ""}.`}
                      </p>
                    )}
                  </fieldset>

                  {!conformity && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`r-${line.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Motif <span className="text-rose-600">*</span>
                        </label>
                        <select
                          id={`r-${line.key}`}
                          value={reason}
                          onChange={(e) => updateIntake(line.key, { reason: e.target.value as NonConformityReason | "" })}
                          className="input-field px-4"
                        >
                          <option value="">Choisir un motif</option>
                          {REASONS.filter((r) => r !== "NON_EXPLOITABLE" || extra.exploitable === false).map((r) => (
                            <option key={r} value={r}>{NON_CONFORMITY_REASON_LABELS[r]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`n-${line.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Précision {reason === "AUTRE" && <span className="text-rose-600">*</span>}
                        </label>
                        <input
                          id={`n-${line.key}`}
                          type="text"
                          value={extra.note}
                          onChange={(e) => updateIntake(line.key, { note: e.target.value })}
                          placeholder="Facultatif"
                          className="input-field px-4"
                        />
                      </div>
                    </div>
                  )}
                  {!conformity && (
                    <DecisionChips
                      legend={`Décision pour ${twins ? "ces deux échantillons" : "cet échantillon"}`}
                      legendClassName="text-sm font-semibold text-slate-700"
                      value={decision}
                      onChange={(chosen) => updateIntake(line.key, { decision: chosen })}
                    />
                  )}
                  {!conformity && decision === "ANALYSER" && (
                    <ConsultationFields
                      idPrefix={`accord-${line.key}`}
                      value={extra.consultation}
                      onChange={(consultation) => updateIntake(line.key, { consultation })}
                      required={consultationRequired}
                      invalid={errorLine === number && consultationDraftError(extra.consultation, consultationRequired) !== null}
                      fieldClassName="input-field px-4"
                    />
                  )}
                  {!conformity && decision === "EN_ATTENTE_CLIENT" && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {twins ? "Échantillons réceptionnés et numérotés" : "Échantillon réceptionné et numéroté"}, puis bloqué
                      {twins ? "s" : ""}{" "}jusqu&apos;à l&apos;avis du client : à analyser ou détruire depuis « Bloqués » de la
                      réception.
                    </p>
                  )}
                  {destroy && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {twins
                        ? `Échantillons ${microRef} et ${chimieRef} détruits : numérotés et imprimés sur le bon de réception avec leur non-conformité, puis annulés`
                        : "Échantillon détruit : numéroté et imprimé sur le bon de réception avec sa non-conformité, puis annulé"}{" "}
                      (motif « Détruit à réception »). Aucune analyse, rien n&apos;est facturé.
                    </p>
                  )}
                </Card>
              </div>
            );
          })}

          <SecondaryButton type="button" onClick={addLine} disabled={natures.length === 0} className="w-full min-h-[48px]">
            <Plus className="h-4 w-4" />
            Ajouter un échantillon
          </SecondaryButton>

          <Card className="p-4 sm:p-6">
            <label htmlFor="deposit-notes" className="mb-2 block text-sm font-semibold text-slate-700">Notes (optionnel)</label>
            <textarea
              id="deposit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations à la réception…"
              className="input-field resize-none px-4"
            />
          </Card>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
              {error}
            </p>
          )}

          <PrimaryButton
            type="button"
            onClick={() => validateStep1() && setStep(2)}
            className="w-full min-h-[48px] py-3.5 text-sm font-bold tracking-wide"
          >
            Continuer — Vérifier ({countLabel(lines.length, "échantillon")}
            {samplesToCreate > lines.length ? ` · ${samplesToCreate} N° de contrôle` : ""})
          </PrimaryButton>
        </div>
      )}

      {step === 2 && (
        <Card className="p-6 sm:p-8">
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">Récapitulatif</h2>
            <div className="space-y-3 rounded-xl bg-slate-50 p-5 text-sm ring-1 ring-slate-100">
              <Row label="Client" value={client?.name ?? "—"} />
              <Row label="Site" value={selectedSite?.name ?? "Siège"} />
              <Row label="Prélèvement" value={samplerKind === "CLIENT" ? "Par le client" : `${SAMPLER_KIND_LABELS[samplerKind]} — ${samplerName}`} />
              <Row label="Cadre" value={cadre ? formatCadre(cadre, cadreNote) : "—"} />
              {interlocutor && <Row label="Déposé par" value={interlocutor} />}
              <Row
                label="Prélevé le"
                value={
                  samplingUnknown
                    ? "Heure inconnue du client — « Non déclarée »"
                    : isMounted && startedAt
                      ? formatDateTime(localInputDate(startedAt)!)
                      : "—"
                }
              />
              <Row label="Arrivé le" value={isMounted && arrivedAt ? formatDateTime(localInputDate(arrivedAt)!) : "—"} />
              {clientReference && <Row label="Référence client" value={clientReference} />}
              <Row label="Analyses à effectuer" value={serieFamilies.length > 0 ? familiesSummary(serieFamilies) : "—"} />
              {advanceAmount && <Row label="Avance" value={`${advanceAmount} DH — ${PAYMENT_MODES.find((m) => m.value === advanceMode)?.label ?? ""}`} />}
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {lines.map((line, i) => {
                const number = i + 1;
                const { families, twins, chimieUnit, names, conformity, reason, extra, destroy, decision } = evaluate(line);
                const [microRef, chimieRef] = lineSampleRefs(number, families);
                return (
                  <li key={line.key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                          Échantillon {number} · {LINE_KIND_LABELS[line.lineKind]}
                        </p>
                        <p className="font-medium text-slate-900">{lineDesignation(line)}</p>
                        <p className="text-xs text-slate-600">
                          {familiesSummary(families)}
                          {twins ? ` — deux échantillons : ${lineSampleRefs(number, families).join(" et ")}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          {/* Each family's container once one of them is weighed (12/10). */}
                          {twins && (line.quantity.trim() || extra.chimieQuantity.trim())
                            ? `${microRef} : ${quantityRecap(line.quantity, line.quantityUnit)} · ${chimieRef} : ${quantityRecap(extra.chimieQuantity, chimieUnit)}`
                            : quantityRecap(line.quantity, line.quantityUnit)}
                          {extra.temperature ? ` · ${extra.temperature} °C à l'arrivée` : ""}
                          {line.unitCount > 1 ? ` · n = ${line.unitCount}` : ""}
                        </p>
                        {extra.receptionNote.trim() && (
                          <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">Observation :</span> {extra.receptionNote.trim()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                          conformity ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}
                      >
                        {conformity ? "Conforme" : reason ? NON_CONFORMITY_REASON_LABELS[reason] : "Non conforme"}
                        {destroy ? " · à détruire" : decision === "EN_ATTENTE_CLIENT" ? " · en attente du client" : ""}
                      </span>
                    </div>
                    {names.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {names.map((n) => (
                          <span key={n} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/10">
                            {n}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Analyses fixées par le responsable des paramètres.</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {notes && <p className="text-sm text-slate-600">{notes}</p>}

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <SecondaryButton type="button" onClick={() => setStep(1)} className="min-h-[48px] flex-1 py-3.5">
                Modifier
              </SecondaryButton>
              <PrimaryButton
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="min-h-[48px] flex-1 py-3.5 text-sm font-bold tracking-wide"
              >
                {loading ? "Enregistrement…" : "Enregistrer et réceptionner le dépôt"}
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-200/60 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
