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
import type { NonConformityReason, PaymentMode, SampleType, SamplerKind } from "@/generated/prisma/enums";
import {
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  SAMPLER_KIND_LABELS,
  formatDateTime,
} from "@/lib/labels";
import { evaluateReception, proposedConformity, type ReceptionThresholds } from "@/lib/reception-rules";
import { unitLetter } from "@/lib/series";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { LineEditor } from "@/components/preleveur/LineEditor";
import {
  emptyLine,
  fromLocalInput,
  kindsFor,
  lineDesignation,
  mergeSuggestions,
  toLocalInput,
  type ClientMemory,
  type ClientOption,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
  type ProfileOption,
} from "@/components/preleveur/visit-types";
import { Checklist, ConformityChip } from "./reception-widgets";
import type { TechnicianOption } from "./types";

const subscribeNoop = () => () => {};

/** What the counter records on top of the line itself. */
type LineIntake = {
  temperature: string;
  conformityChoice: boolean | null;
  reason: NonConformityReason | "";
  note: string;
  technicianId: string;
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
    produit: string | null;
    surfaceLabel: string | null;
    personName: string | null;
    controlCode: string | null;
    unitCount: number;
    conformity: boolean | null;
    conformityReason: NonConformityReason | null;
    technician: { name: string } | null;
  }[];
};

const SAMPLER_CHOICES: SamplerKind[] = ["CLIENT", "SERVICE_VETERINAIRE", "AUTRE"];
const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "ESPECES", label: "Espèces" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "VIREMENT", label: "Virement" },
  { value: "CARTE", label: "Carte" },
];
const REASONS = Object.keys(NON_CONFORMITY_REASON_LABELS) as NonConformityReason[];

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** A deposit line is weighed at the counter: grams for food, litres for water. */
function depositLine(nature: NatureOption | undefined, previous?: LineDraft): LineDraft {
  const line = emptyLine(nature, previous);
  return {
    ...line,
    lieu: previous?.lieu ?? "Dépôt au laboratoire",
    quantity: "",
    quantityUnit: line.lineKind === "EAU" ? "L" : "G",
  };
}

/**
 * The bon de réception, filled at the counter when a client brings samples:
 * the same lines as a visit, plus what the reception measures — the deposit
 * is numbered and received in the same transaction (WORKFLOW.md §3.2).
 */
export function DepositForm({
  technicians,
  thresholds,
  blockNonConform,
}: {
  technicians: TechnicianOption[];
  thresholds: ReceptionThresholds;
  blockNonConform: boolean;
}) {
  const router = useRouter();
  const isMounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const defaultTechnician = technicians[0]?.id ?? "";

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
  const [memory, setMemory] = useState<ClientMemory>({ places: [], products: [] });

  const ensureParameters = useCallback((type: SampleType | undefined) => {
    if (!type || requestedTypes.current.has(type)) return;
    requestedTypes.current.add(type);
    setLoadingTypes((prev) => new Set(prev).add(type));
    fetch(`/api/parameters?category=${type}`)
      .then((r) => r.json())
      .then((data: ParameterOption[]) => {
        setParametersByType((prev) => ({ ...prev, [type]: data }));
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
      setNatures(n);
      setClients(c);
      setLines((prev) => (prev.length ? prev : [depositLine(n[0])]));
      ensureParameters(n[0]?.legacyType);
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

  function intakeOf(key: string): LineIntake {
    return intake[key] ?? { temperature: "", conformityChoice: null, reason: "", note: "", technicianId: defaultTechnician };
  }

  function updateIntake(key: string, patch: Partial<LineIntake>) {
    setIntake((prev) => ({ ...prev, [key]: { ...intakeOf(key), ...patch } }));
    setError("");
    setErrorLine(null);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function changeNature(key: string, natureId: string) {
    const nature = natures.find((n) => n.id === natureId);
    ensureParameters(nature?.legacyType);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const kinds = kindsFor(nature);
        const lineKind = kinds.includes(l.lineKind) ? l.lineKind : (nature?.defaultLineKind ?? "ALIMENT");
        return {
          ...l,
          natureId,
          lineKind,
          parameterIds: [],
          quantityUnit: lineKind === "EAU" ? "L" : l.quantityUnit === "L" ? "G" : l.quantityUnit,
        };
      })
    );
  }

  function addLine() {
    const last = lines.at(-1);
    const nature = natures.find((n) => n.id === last?.natureId) ?? natures[0];
    ensureParameters(nature?.legacyType);
    setLines((prev) => [...prev, depositLine(nature, last)]);
  }

  function duplicateLine(key: string) {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === key);
      if (index < 0) return prev;
      const copy: LineDraft = { ...prev[index], key: emptyLine(undefined).key, numeroLot: "", productionDate: "", expiryDate: "" };
      setIntake((current) => ({ ...current, [copy.key]: { ...intakeOf(key) } }));
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  /** Live rules for one line: checks, proposal and the effective conformity. */
  function evaluate(line: LineDraft) {
    const nature = natures.find((n) => n.id === line.natureId);
    const names = (nature ? parametersByType[nature.legacyType] ?? [] : [])
      .filter((p) => line.parameterIds.includes(p.id))
      .map((p) => p.name);
    const extra = intakeOf(line.key);
    const quantity = numberOrNull(line.quantity);
    const checks = evaluateReception(
      {
        lineKind: line.lineKind,
        family: nature?.family ?? "AUTRE",
        parameterNames: names,
        quantity,
        quantityUnit: quantity === null ? null : line.quantityUnit,
        receptionTemperature: numberOrNull(extra.temperature),
        unitCount: line.unitCount,
      },
      thresholds
    );
    const proposal = proposedConformity(checks);
    const conformity = proposal.forced ? false : (extra.conformityChoice ?? proposal.conformity);
    const reason: NonConformityReason | "" = conformity ? "" : extra.reason || proposal.reason || "";
    return { nature, names, extra, checks, proposal, conformity, reason };
  }

  function setStepError(message: string, line: number | null = null) {
    setError(message);
    setErrorLine(line);
    return false;
  }

  function validateStep1() {
    if (!clientId) return setStepError("Choisissez le client.");
    if ((samplerKind === "SERVICE_VETERINAIRE" || samplerKind === "AUTRE") && !samplerName.trim()) {
      return setStepError("Indiquez qui a effectué le prélèvement.");
    }
    if (advanceAmount.trim() && !advanceMode) return setStepError("Indiquez le mode de paiement de l'avance.");
    for (const [i, line] of lines.entries()) {
      const n = i + 1;
      if (!line.natureId) return setStepError("Choisissez la nature d'analyse.", n);
      if (line.lineKind === "ALIMENT" && !line.produit.trim()) return setStepError("Indiquez la désignation du produit.", n);
      if (line.lineKind === "SURFACE" && !line.surfaceLabel.trim()) return setStepError("Indiquez la surface prélevée.", n);
      if (line.lineKind === "MAINS" && !line.personName.trim()) return setStepError("Indiquez la personne prélevée.", n);
      if (line.parameterIds.length === 0) return setStepError("Choisissez au moins une analyse.", n);
      const { conformity, reason, extra } = evaluate(line);
      if (!conformity && !reason) return setStepError("Choisissez le motif de non-conformité.", n);
      if (!conformity && reason === "AUTRE" && !extra.note.trim()) return setStepError("Précisez le motif « autre ».", n);
      if (!(blockNonConform && !conformity) && !extra.technicianId) return setStepError("Attribuez un technicien.", n);
    }
    setError("");
    setErrorLine(null);
    return true;
  }

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "DEPOT",
          clientId,
          siteId: siteId || undefined,
          samplerKind,
          samplerName: samplerKind === "CLIENT" ? undefined : samplerName,
          interlocutor,
          clientReference,
          startedAt: fromLocalInput(startedAt) ?? undefined,
          notes,
          advanceAmount: advanceAmount || undefined,
          advanceMode: advanceMode || undefined,
          lines: lines.map((line) => {
            const { conformity, reason, extra } = evaluate(line);
            return {
              ...Object.fromEntries(Object.entries(line).filter(([k]) => k !== "key")),
              handsState: line.handsState || undefined,
              receptionTemperature: extra.temperature,
              conformity,
              conformityReason: conformity ? undefined : reason,
              conformityNote: extra.note,
              technicianId: blockNonConform && !conformity ? undefined : extra.technicianId,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Impossible d'enregistrer le dépôt.");
        setErrorLine(typeof data.line === "number" ? data.line : null);
        setStep(1);
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

  if (step === 3 && created) {
    const units = created.samples.reduce((n, s) => n + Math.max(1, s.unitCount), 0);
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Dépôt enregistré et réceptionné</h2>
              <p className="text-sm text-slate-500">
                {created.client.name} · {created.arrivedAt ? formatDateTime(created.arrivedAt) : ""} ·{" "}
                {created.samples.length} ligne{created.samples.length > 1 ? "s" : ""} · {units} étiquette{units > 1 ? "s" : ""}
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
                  <th className="pb-2 pr-3 font-medium">Ligne</th>
                  <th className="pb-2 pr-3 font-medium">N° de contrôle</th>
                  <th className="pb-2 pr-3 font-medium">Unités</th>
                  <th className="pb-2 pr-3 font-medium">Conformité</th>
                  <th className="pb-2 font-medium">Technicien</th>
                </tr>
              </thead>
              <tbody>
                {created.samples.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-slate-800">{s.lineNumber} · {lineDesignation(s)}</span>
                      <span className="block text-xs text-slate-500">{LINE_KIND_LABELS[s.lineKind]}</span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-base font-bold text-slate-900">{s.controlCode ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {s.unitCount > 1 ? `${s.unitCount} (${unitLetter(1)}–${unitLetter(s.unitCount)})` : "1"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {s.conformity === false ? (
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
            ? "Le client apporte ses échantillons : un numéro de série, une ligne par échantillon, réceptionnés sur-le-champ"
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
                  <label className="section-title mb-2">
                    <Building2 className="h-4 w-4" />
                    Client
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setSiteId("");
                      setMemory({ places: [], products: [] });
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
                    <label className="section-title mb-2">Site (facultatif)</label>
                    <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="input-field px-4">
                      <option value="">— Siège —</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <p className="section-title mb-2">
                  <User className="h-4 w-4" />
                  Prélèvement effectué par
                </p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLER_CHOICES.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSamplerKind(k)}
                      aria-pressed={samplerKind === k}
                      className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition ${
                        samplerKind === k
                          ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {k === "CLIENT" ? "Le client" : k === "SERVICE_VETERINAIRE" ? "Service vétérinaire" : "Autre"}
                    </button>
                  ))}
                </div>
                {samplerKind !== "CLIENT" && (
                  <input
                    type="text"
                    value={samplerName}
                    onChange={(e) => setSamplerName(e.target.value)}
                    placeholder={SAMPLER_KIND_LABELS[samplerKind] + " — nom"}
                    className="input-field mt-2 px-4"
                  />
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="section-title mb-2">
                    <User className="h-4 w-4" />
                    Déposé par (personne au comptoir)
                  </label>
                  <input
                    type="text"
                    value={interlocutor}
                    onChange={(e) => setInterlocutor(e.target.value)}
                    placeholder="Nom de la personne"
                    className="input-field px-4"
                  />
                </div>
                <div>
                  <label className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Prélevé le
                  </label>
                  {isMounted ? (
                    <input
                      type="datetime-local"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      className="input-field px-4"
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="section-title mb-2">
                    <ClipboardList className="h-4 w-4" />
                    N° de factures / référence client
                  </label>
                  <input
                    type="text"
                    value={clientReference}
                    onChange={(e) => setClientReference(e.target.value)}
                    placeholder="Facultatif"
                    className="input-field px-4"
                  />
                </div>
                <div>
                  <label className="section-title mb-2">
                    <Wallet className="h-4 w-4" />
                    Avance encaissée (DH)
                  </label>
                  <div className="flex gap-2">
                    <input
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
            const { nature, checks, proposal, conformity, reason, extra } = evaluate(line);
            const type = nature?.legacyType;
            return (
              <div key={line.key} className={errorLine === index + 1 ? "space-y-3 rounded-2xl ring-2 ring-rose-300" : "space-y-3"}>
                <LineEditor
                  index={index}
                  line={line}
                  natures={natures}
                  parameters={type ? (parametersByType[type] ?? []) : []}
                  parametersLoading={type ? loadingTypes.has(type) : false}
                  canRemove={lines.length > 1}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onNatureChange={(id) => changeNature(line.key, id)}
                  onDuplicate={() => duplicateLine(line.key)}
                  onRemove={() => removeLine(line.key)}
                  placeSuggestions={placeSuggestions}
                  productSuggestions={productSuggestions}
                  profiles={profiles.filter((p) => p.natureId === line.natureId)}
                />
                <Card className="p-4 sm:p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Réception de la ligne {index + 1}
                  </h3>
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
                    {!(blockNonConform && !conformity) && (
                      <div>
                        <label htmlFor={`tech-${line.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Technicien <span className="text-rose-600">*</span>
                        </label>
                        <select
                          id={`tech-${line.key}`}
                          value={extra.technicianId}
                          onChange={(e) => updateIntake(line.key, { technicianId: e.target.value })}
                          className="input-field px-4"
                        >
                          <option value="">Sélectionner un technicien</option>
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
                        Une règle bloquante s&apos;applique : corrigez la mesure ou réceptionnez la ligne comme non conforme.
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
                  {blockNonConform && !conformity && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      Ligne bloquée à la réception : numérotée, mais analysée seulement après libération par un administrateur.
                    </p>
                  )}
                </Card>
              </div>
            );
          })}

          <SecondaryButton type="button" onClick={addLine} className="w-full min-h-[48px]">
            <Plus className="h-4 w-4" />
            Ajouter une ligne
          </SecondaryButton>

          <Card className="p-4 sm:p-6">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations à la réception…"
              className="input-field resize-none px-4"
            />
          </Card>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
              {errorLine ? `Ligne ${errorLine} — ` : ""}
              {error}
            </p>
          )}

          <PrimaryButton
            type="button"
            onClick={() => validateStep1() && setStep(2)}
            disabled={technicians.length === 0}
            className="w-full min-h-[48px] py-3.5 text-sm font-bold tracking-wide"
          >
            Continuer — Vérifier ({lines.length} ligne{lines.length > 1 ? "s" : ""})
          </PrimaryButton>
          {technicians.length === 0 && (
            <p className="text-sm text-amber-700">Aucun technicien disponible. Créez un compte technicien avant de réceptionner.</p>
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
              {interlocutor && <Row label="Déposé par" value={interlocutor} />}
              <Row label="Prélevé le" value={isMounted && startedAt ? formatDateTime(new Date(startedAt)) : "—"} />
              {clientReference && <Row label="Référence client" value={clientReference} />}
              {advanceAmount && <Row label="Avance" value={`${advanceAmount} DH — ${PAYMENT_MODES.find((m) => m.value === advanceMode)?.label ?? ""}`} />}
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {lines.map((line, i) => {
                const { nature, names, conformity, reason, extra } = evaluate(line);
                const technician = technicians.find((t) => t.id === extra.technicianId);
                return (
                  <li key={line.key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                          Ligne {i + 1} · {nature?.label}
                        </p>
                        <p className="font-medium text-slate-900">{lineDesignation(line)}</p>
                        <p className="text-xs text-slate-500">
                          {line.quantity ? `${line.quantity} ${line.quantityUnit === "UNITE" ? "unité(s)" : line.quantityUnit.toLowerCase()}` : "quantité non pesée"}
                          {extra.temperature ? ` · ${extra.temperature} °C à l'arrivée` : ""}
                          {line.unitCount > 1 ? ` · n = ${line.unitCount}` : ""}
                          {technician ? ` · ${technician.name}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                          conformity ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}
                      >
                        {conformity ? "Conforme" : reason ? NON_CONFORMITY_REASON_LABELS[reason] : "Non conforme"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {names.map((n) => (
                        <span key={n} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/10">
                          {n}
                        </span>
                      ))}
                    </div>
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
