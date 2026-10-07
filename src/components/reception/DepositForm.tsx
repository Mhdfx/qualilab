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
  SampleStatus,
  SampleType,
  SamplerKind,
  SurfaceState,
} from "@/generated/prisma/enums";
import {
  CADRE_CHOICES,
  CADRE_LABELS,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  SAMPLER_KIND_LABELS,
  formatCadre,
  formatDateTime,
} from "@/lib/labels";
import { type ReceptionThresholds } from "@/lib/reception-rules";
import { sampleRef } from "@/lib/reception-input";
import { SERIE_MESSAGES, sampleLineMessage } from "@/lib/serie-input";
import { repetitionRange } from "@/lib/series";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { LegalTimeHint } from "@/components/LegalTimeHint";
import { LineEditor } from "@/components/preleveur/LineEditor";
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
  parameterFamily,
  serieAnalyses,
  toLocalInput,
  type ClientMemory,
  type ClientOption,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
  type ProductTypeOption,
  type ProfileOption,
} from "@/components/preleveur/visit-types";
import { Checklist, ConformityChip } from "./reception-widgets";
import { countLabel, depositLineChecks, familiesSummary, lineSampleRefs, sampleCount } from "./reception-logic";
import type { TechnicianOption } from "./types";

const subscribeNoop = () => () => {};

/**
 * What the counter records on top of the sample itself. Keyed by the line:
 * when both families are ticked the line becomes two samples (« 2M »,
 * « 2P ») and `POST /api/series` gives both the same temperature,
 * conformity, decision and technician.
 */
type LineIntake = {
  temperature: string;
  conformityChoice: boolean | null;
  reason: NonConformityReason | "";
  note: string;
  technicianId: string;
  /** Non-conform only: « Détruire » instead of « Analyser malgré tout ». */
  destroy: boolean;
};

type CreatedDeposit = {
  id: string;
  serialNumber: string;
  client: { name: string };
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
    controlCode: string | null;
    unitCount: number;
    conformity: boolean | null;
    conformityReason: NonConformityReason | null;
    cancelReason: CancelReason | null;
    nature: { label: string; family: Family };
    technician: { name: string } | null;
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
 * §3.2).
 */
export function DepositForm({
  technicians,
  thresholds,
}: {
  technicians: TechnicianOption[];
  thresholds: ReceptionThresholds;
}) {
  const router = useRouter();
  const isMounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  // Nobody is pre-assigned: the responsable des paramètres attributes the
  // bench at the programme stage (PROGRAMME.md); a technician picked here is
  // only a hint.
  const defaultTechnician = "";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [natures, setNatures] = useState<NatureOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [parametersByType, setParametersByType] = useState<Partial<Record<SampleType, ParameterOption[]>>>({});
  const [loadingTypes, setLoadingTypes] = useState<Set<SampleType>>(new Set());
  const requestedTypes = useRef<Set<SampleType>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedDeposit | null>(null);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [samplerKind, setSamplerKind] = useState<SamplerKind>("CLIENT");
  // A choice, never deduced from who sampled, none preselected (V1).
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [cadreNote, setCadreNote] = useState("");
  const [samplerName, setSamplerName] = useState("");
  const [interlocutor, setInterlocutor] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [startedAt, setStartedAt] = useState(() => toLocalInput(new Date()));
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
      .then((data: ParameterOption[]) => {
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
    Promise.all([
      fetch("/api/natures").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]).then(([n, c]: [NatureOption[], ClientOption[]]) => {
      const first = depositLine(n);
      setNatures(n);
      setClients(c);
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

  const selectedClient = clients.find((c) => c.id === clientId);
  const sites = selectedClient?.sites ?? [];

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
    return intake[key] ?? { temperature: "", conformityChoice: null, reason: "", note: "", technicianId: defaultTechnician, destroy: false };
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
    setIntake((current) => ({ ...current, [copy.key]: { ...intakeOf(key) } }));
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
   * Live rules for one line: the acceptance rules of each sample it becomes
   * (one per ticked family — 100 g micro, 300 g physico-chimie), the
   * proposal and the effective conformity, shared by both samples.
   */
  function evaluate(line: LineDraft) {
    const category = lineCategory(natures, line);
    const catalogue = category ? (parametersByType[category] ?? []) : [];
    const ticked = line.parameterIds.flatMap((id) => catalogue.filter((p) => p.id === id));
    const samples = lineNatures(natures, line);
    const families = samples.map((s) => s.family);
    const extra = intakeOf(line.key);
    const { checks, familyBlocking, proposal } = depositLineChecks(
      {
        lineKind: line.lineKind,
        families,
        parameters: ticked.map((p) => ({ name: p.name, family: parameterFamily(p) })),
        quantity: numberOrNull(line.quantity),
        quantityUnit: line.quantityUnit,
        receptionTemperature: numberOrNull(extra.temperature),
        unitCount: line.unitCount,
      },
      thresholds
    );
    const conformity = proposal.forced ? false : (extra.conformityChoice ?? proposal.conformity);
    const reason: NonConformityReason | "" = conformity ? "" : extra.reason || proposal.reason || "";
    const destroy = !conformity && extra.destroy;
    return {
      families,
      twins: samples.length > 1,
      names: ticked.map((p) => p.name),
      extra,
      checks,
      familyBlocking,
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
    if (samplerKind === "AUTRE" && !samplerName.trim()) {
      return setStepError("Indiquez qui a effectué le prélèvement.");
    }
    if (!cadre) return setStepError(SERIE_MESSAGES.cadreMissing);
    if (advanceAmount.trim() && !advanceMode) return setStepError("Indiquez le mode de paiement de l'avance.");
    for (const [i, line] of lines.entries()) {
      const n = i + 1;
      // No analysis is required (V6): the programme sheet fixes them.
      const problem = lineDraftError(line, natures, { requirePlace: false });
      if (problem) return setStepError(sampleLineMessage(n, problem), n);
      const { conformity, reason, extra } = evaluate(line);
      if (!conformity && !reason) return setStepError(sampleLineMessage(n, "Choisissez le motif de non-conformité."), n);
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
          startedAt: fromLocalInput(startedAt) ?? undefined,
          notes,
          advanceAmount: advanceAmount || undefined,
          advanceMode: advanceMode || undefined,
          // The série's two boxes are computed by the API from the samples.
          lines: lines.map((line) => {
            const { conformity, reason, extra, destroy } = evaluate(line);
            return {
              ...linePayload(line),
              receptionTemperature: extra.temperature,
              conformity,
              conformityReason: conformity ? undefined : reason,
              conformityNote: extra.note,
              decision: destroy ? "DETRUIRE" : "ANALYSER",
              technicianId: destroy ? undefined : extra.technicianId,
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
                {created.client.name} · {created.arrivedAt ? formatDateTime(created.arrivedAt) : ""} ·{" "}
                {countLabel(samples.length, "échantillon numéroté", "échantillons numérotés")} ·{" "}
                {countLabel(units, "étiquette")}
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
                  <th className="pb-2 pr-3 font-medium">Conformité</th>
                  <th className="pb-2 font-medium">Technicien</th>
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
                    <td className="py-2.5 pr-3">
                      {s.status === "ANNULE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          Échantillon détruit
                          {s.conformityReason ? ` · ${NON_CONFORMITY_REASON_LABELS[s.conformityReason]}` : ""}
                        </span>
                      ) : s.conformity === false ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {s.conformityReason ? NON_CONFORMITY_REASON_LABELS[s.conformityReason] : "Non conforme"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Conforme
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-700">{s.technician?.name ?? "—"}</td>
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
                <div className={sites.length > 0 ? "" : "sm:col-span-2"}>
                  <label htmlFor="deposit-client" className="section-title mb-2">
                    <Building2 className="h-4 w-4" />
                    Client
                  </label>
                  <select
                    id="deposit-client"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setSiteId("");
                      setMemory({ places: [], products: [] });
                      clearError();
                      // A type of the previous client must not stay on a sample.
                      setLines((prev) => prev.map((l) => (l.productTypeId ? { ...l, productTypeId: "" } : l)));
                    }}
                    className="input-field px-4"
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {sites.length > 0 && (
                  <div>
                    <label htmlFor="deposit-site" className="section-title mb-2">Site (facultatif)</label>
                    <select id="deposit-site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="input-field px-4">
                      <option value="">— Siège —</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  <label htmlFor="deposit-started" className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Prélevé le
                  </label>
                  {isMounted ? (
                    <input
                      id="deposit-started"
                      type="datetime-local"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      className="input-field px-4"
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                  <LegalTimeHint />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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

          {lines.map((line, index) => {
            const number = index + 1;
            const { families, twins, checks, familyBlocking, proposal, conformity, reason, extra, destroy } = evaluate(line);
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
                />
                <Card className="p-4 sm:p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Réception de l&apos;échantillon {number}
                  </h3>
                  {twins && (
                    <p className="mt-1 text-xs text-slate-500">
                      Deux familles cochées : deux échantillons, {microRef} (microbiologie) et {chimieRef}{" "}
                      (physico-chimie), chacun avec son N° de contrôle. La température, la conformité et le technicien
                      saisis ici valent pour les deux.
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
                    {!destroy && (
                      <div>
                        <label htmlFor={`tech-${line.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Technicien{" "}
                          <span className="font-normal text-slate-500">(facultatif — le responsable des paramètres attribue)</span>
                        </label>
                        <select
                          id={`tech-${line.key}`}
                          value={extra.technicianId}
                          onChange={(e) => updateIntake(line.key, { technicianId: e.target.value })}
                          className="input-field px-4"
                        >
                          <option value="">À attribuer à la programmation</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.id}>{t.name} — {t.load} en cours</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <Checklist checks={checks} />

                  <fieldset className="mt-4">
                    <legend className="text-sm font-semibold text-slate-700">Conformité</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <ConformityChip active={conformity} disabled={proposal.forced} tone="ok" label="Conforme" onClick={() => updateIntake(line.key, { conformityChoice: true })} />
                      <ConformityChip active={!conformity} disabled={false} tone="warn" label="Non conforme" onClick={() => updateIntake(line.key, { conformityChoice: false })} />
                    </div>
                    {proposal.forced && (
                      <p className="mt-1.5 text-xs text-rose-700">
                        Une règle bloquante s&apos;applique : corrigez la mesure ou réceptionnez{" "}
                        {twins ? "les deux échantillons" : "l'échantillon"} comme non conforme{twins ? "s" : ""}.
                        {twins && familyBlocking
                          ? " Elle ne concerne qu'une famille : pour réceptionner l'autre comme conforme, dupliquez l'échantillon et ne cochez qu'une famille sur chaque copie."
                          : ""}
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
                          {REASONS.map((r) => (
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
                    <fieldset className="mt-3">
                      <legend className="text-sm font-semibold text-slate-700">
                        Décision pour {twins ? "ces deux échantillons" : "cet échantillon"}
                      </legend>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <ConformityChip active={!destroy} disabled={false} tone="ok" label="Analyser malgré tout" onClick={() => updateIntake(line.key, { destroy: false })} />
                        <ConformityChip active={destroy} disabled={false} tone="warn" label="Détruire" onClick={() => updateIntake(line.key, { destroy: true })} />
                      </div>
                    </fieldset>
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
          {technicians.length === 0 && (
            <p className="text-sm text-amber-700">
              Aucun technicien actif : le responsable des paramètres attribuera les échantillons à la programmation.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <Card className="p-6 sm:p-8">
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">Récapitulatif</h2>
            <div className="space-y-3 rounded-xl bg-slate-50 p-5 text-sm ring-1 ring-slate-100">
              <Row label="Client" value={selectedClient?.name ?? "—"} />
              <Row label="Prélèvement" value={samplerKind === "CLIENT" ? "Par le client" : `${SAMPLER_KIND_LABELS[samplerKind]} — ${samplerName}`} />
              <Row label="Cadre" value={cadre ? formatCadre(cadre, cadreNote) : "—"} />
              {interlocutor && <Row label="Déposé par" value={interlocutor} />}
              <Row label="Prélevé le" value={isMounted && startedAt ? formatDateTime(localInputDate(startedAt)!) : "—"} />
              {clientReference && <Row label="Référence client" value={clientReference} />}
              <Row label="Analyses à effectuer" value={serieFamilies.length > 0 ? familiesSummary(serieFamilies) : "—"} />
              {advanceAmount && <Row label="Avance" value={`${advanceAmount} DH — ${PAYMENT_MODES.find((m) => m.value === advanceMode)?.label ?? ""}`} />}
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {lines.map((line, i) => {
                const number = i + 1;
                const { families, twins, names, conformity, reason, extra, destroy } = evaluate(line);
                const technician = technicians.find((t) => t.id === extra.technicianId);
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
                          {line.quantity ? `${line.quantity} ${line.quantityUnit === "UNITE" ? "unité(s)" : line.quantityUnit.toLowerCase()}` : "quantité non pesée"}
                          {extra.temperature ? ` · ${extra.temperature} °C à l'arrivée` : ""}
                          {line.unitCount > 1 ? ` · n = ${line.unitCount}` : ""}
                          {destroy ? "" : technician ? ` · ${technician.name}` : " · technicien attribué à la programmation"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                          conformity ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}
                      >
                        {conformity ? "Conforme" : reason ? NON_CONFORMITY_REASON_LABELS[reason] : "Non conforme"}
                        {destroy ? " · à détruire" : ""}
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
