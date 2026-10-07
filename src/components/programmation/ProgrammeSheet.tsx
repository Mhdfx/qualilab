"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Hash,
  Layers,
  ListChecks,
  Lock,
  Package,
  ReceiptText,
  Save,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ProgrammePriority } from "@/generated/prisma/enums";
import {
  ANALYSIS_FAMILY_LABELS,
  CANCEL_REASON_LABELS,
  PROGRAMME_PRIORITY_LABELS,
  formatCurrency,
  formatDateTime,
} from "@/lib/labels";
import { fmt } from "@/lib/interpretation";
import { DUE_AT_TOLERANCE_MS, MAX_PARAMETER_NOTE, MAX_PROGRAMME_NOTE, MAX_TEST_PORTION, PROGRAMME_PRIORITIES } from "@/lib/programme-input";
import type { ReceptionThresholds } from "@/lib/reception-rules";
import type { Role } from "@/lib/roles";
import { MAX_UNITS } from "@/lib/series";
import { matchesQuery } from "@/lib/similar";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { LegalTimeHint } from "@/components/LegalTimeHint";
import { Checklist } from "@/components/reception/reception-widgets";
import { fromLocalInput } from "@/components/preleveur/visit-types";
import { SampleVerbs, type VerbSample } from "@/components/samples/SampleVerbs";
import {
  UNIT_CHOICES,
  adoptReferential,
  applyProductType,
  applyProfile,
  assignAll,
  assignByFamily,
  billingLines,
  clampUnits,
  criteriaOf,
  entryChecks,
  groupParameters,
  initialDraft,
  natureChangeNotice,
  natureChoices,
  parameterFamilies,
  profileApplied,
  settingOf,
  spansFamilies,
  toRequestBody,
  toggleParameter,
  typeOf,
  unitWarning,
  updateSetting,
  type ProgrammeDraft,
} from "./programme-sheet-logic";
import type {
  CriterionRef,
  ProgrammeReadResponse,
  ProgrammeReferentialData,
  ProgrammeResponse,
  ProgrammeSampleData,
  ProgrammeState,
} from "./programme-sheet-types";

/**
 * The programme sheet (PROGRAMME.md §4): the seven sections the responsable
 * des paramètres fills before the bench, a draft that keeps the sample
 * received, and the confirmation that moves it to PROGRAMME. Once the bench
 * started the sheet is read-only — « Corriger la fiche » takes over.
 *
 * RETOUR-LABO-06-10.md §5 (V3, Q49 by default): the fine « Nature
 * d'analyse » is chosen here, within the sample's family. Choosing one
 * reloads the referential of that nature at once (`GET …/programme
 * ?natureId=` — its analyses, profiles and prices), drops the ticked
 * analyses it does not offer and says which; the sample takes the nature
 * when the programme is saved (`natureId` in the PUT). Nothing is written
 * before that save, so leaving the page keeps the old nature.
 */

type ProgrammeSheetProps = {
  sample: ProgrammeSampleData;
  programme: ProgrammeState;
  /** The referential of the sample's own nature; the sheet replaces it when another nature is chosen. */
  referential: ProgrammeReferentialData;
  /** The laboratory's acceptance thresholds, for the entry check. */
  thresholds: ReceptionThresholds;
  role: Role;
  /** The line as « Corriger la fiche » / « Annuler » edit it; null when the role has none of these verbs. */
  verbSample: VerbSample | null;
};

type SavedState = Pick<ProgrammeSampleData, "status" | "analysisBlocked"> &
  Pick<ProgrammeState, "programmedAt" | "programmedBy" | "editable">;

const CHIP = "min-h-[40px] rounded-xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const CHIP_ON = "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20";
const CHIP_OFF = "border-slate-200 text-slate-600 hover:border-slate-300";
const chip = (active: boolean, extra = "") => `${CHIP} ${active ? CHIP_ON : CHIP_OFF} ${extra}`;

function SectionTitle({ index, icon: Icon, title, hint }: { index: number; icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand" aria-hidden="true">
        {index}
      </span>
      <div className="min-w-0">
        <h2 className="section-title">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

/** The cells of the criteria preview: m and M in the laboratory's notation, « Absence » for an absence test. */
function limitCells(criterion: CriterionRef): { m: string; bigM: string } {
  if (criterion.mKind === "ABSENCE") return { m: "Absence", bigM: "—" };
  return {
    m: criterion.mKind === "VALUE" && criterion.m !== null ? fmt(criterion.m) : "—",
    bigM: criterion.bigM !== null ? fmt(criterion.bigM) : "—",
  };
}

export function ProgrammeSheet({
  sample,
  programme,
  referential: initialReferential,
  thresholds,
  role,
  verbSample,
}: ProgrammeSheetProps) {
  const router = useRouter();
  const [referential, setReferential] = useState<ProgrammeReferentialData>(initialReferential);
  const [draft, setDraft] = useState<ProgrammeDraft>(() => initialDraft(programme, initialReferential));
  // The nature the sample carries in the database — the draft's may differ until the save.
  const [savedNatureId, setSavedNatureId] = useState(programme.natureId);
  // The nature being loaded, shown in the select while its referential travels.
  const [pendingNature, setPendingNature] = useState<string | null>(null);
  const natureRequest = useRef(0);
  // The latest committed draft, for a referential that arrives after the user kept typing.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [saved, setSaved] = useState<SavedState>({
    status: sample.status,
    analysisBlocked: sample.analysisBlocked,
    programmedAt: programme.programmedAt,
    programmedBy: programme.programmedBy,
    editable: programme.editable,
  });
  const [busy, setBusy] = useState<"draft" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [allTech, setAllTech] = useState("");
  const [microTech, setMicroTech] = useState("");
  const [chimieTech, setChimieTech] = useState("");

  const readOnly = !saved.editable;
  const confirmed = saved.status === "PROGRAMME";
  const type = typeOf(referential, draft.productTypeId);
  const criteria = useMemo(() => criteriaOf(type), [type]);
  const families = useMemo(() => parameterFamilies(referential, sample.nature.family), [referential, sample.nature.family]);
  const groups = useMemo(() => groupParameters(referential, sample.nature.family), [referential, sample.nature.family]);
  const natures = natureChoices(referential, sample.nature.family);
  const draftNature = referential.natures.find((nature) => nature.id === draft.natureId) ?? null;
  const natureChanged = draft.natureId !== savedNatureId;
  const familyLabel = ANALYSIS_FAMILY_LABELS[sample.nature.family].toLowerCase();
  const programmed = draft.parameterIds.flatMap((id) => {
    const parameter = referential.parameters.find((candidate) => candidate.id === id);
    return parameter ? [parameter] : [];
  });
  const checks = entryChecks(sample, draft, referential, thresholds);
  const billing = billingLines(draft, referential);
  const warning = unitWarning(draft, type);
  const defaultTechnician = referential.technicians.find((technician) => technician.id === draft.technicianId) ?? null;
  const splitOffered = spansFamilies(draft, families);

  const visibleTypes = referential.productTypes.filter((candidate) => candidate.id === draft.productTypeId || matchesQuery(candidate.name, typeQuery));
  const clientTypes = visibleTypes.filter((candidate) => candidate.clientId);
  const catalogueTypes = visibleTypes.filter((candidate) => !candidate.clientId);
  // The type the line carries but the client may no longer use (retired, or another client's).
  const lostType = sample.productTypeId && !typeOf(referential, sample.productTypeId) ? sample.productType : null;

  function patch(changes: Partial<ProgrammeDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  /**
   * The server's answer becomes the sheet: the stored programme, and the
   * nature it now carries (the « actuelle » flag of the natures follows).
   */
  function adopt(data: ProgrammeResponse, nextReferential: ProgrammeReferentialData = referential) {
    const natureId = data.programme.natureId ?? data.sample.natureId;
    const marked = {
      ...nextReferential,
      natures: nextReferential.natures.map((nature) => ({ ...nature, current: nature.id === natureId })),
    };
    setReferential(marked);
    setSavedNatureId(natureId);
    setPendingNature(null);
    natureRequest.current += 1;
    setDraft(initialDraft(data.programme, marked));
    setSaved({
      status: data.sample.status,
      analysisBlocked: data.sample.analysisBlocked,
      programmedAt: data.programme.programmedAt,
      programmedBy: data.programme.programmedBy,
      editable: data.programme.editable,
    });
  }

  /**
   * After a correction verb (fiche corrected, sample cancelled or reactivated)
   * the sample changed under the sheet: the header is the server's, the sheet
   * re-reads its programme — and the referential of its nature — so the
   * analyses, the units and the status follow.
   */
  async function reload() {
    router.refresh();
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/samples/${sample.id}/programme`);
      const data = (await response.json().catch(() => ({}))) as Partial<ProgrammeReadResponse>;
      if (!response.ok || !data.sample || !data.programme) return;
      adopt(data as ProgrammeResponse, data.referential ?? referential);
      setNotice("Fiche mise à jour.");
    } catch {
      // The server part of the page was refreshed anyway; the next save re-checks everything.
    }
  }

  /**
   * Another nature of the same family (Q49): its referential replaces the one
   * on screen, the analyses it does not offer leave the draft. The sample
   * itself only changes when the programme is saved.
   */
  async function changeNature(natureId: string) {
    if (readOnly || busy || !natureId || natureId === (pendingNature ?? draft.natureId)) return;
    const ticket = ++natureRequest.current;
    setError("");
    setNotice("");
    setPendingNature(natureId);
    try {
      const response = await fetch(`/api/samples/${sample.id}/programme?natureId=${encodeURIComponent(natureId)}`);
      const data = (await response.json().catch(() => ({}))) as Partial<ProgrammeReadResponse> & { error?: string };
      if (ticket !== natureRequest.current) return;
      if (!response.ok || !data.referential) {
        setError(data.error ?? "Impossible de charger les analyses de cette nature. Réessayez.");
        return;
      }
      const next: ProgrammeReferentialData = {
        ...data.referential,
        // The « actuelle » flag is the stored nature's, whatever the route computed it for.
        natures: data.referential.natures.map((nature) => ({ ...nature, current: nature.id === savedNatureId })),
      };
      const result = adoptReferential(draftRef.current, referential, next);
      setReferential(next);
      setDraft(result.draft);
      const label = next.natures.find((nature) => nature.id === next.natureId)?.label ?? "choisie";
      setNotice(natureChangeNotice(label, result.dropped, next.natureId === savedNatureId));
    } catch {
      if (ticket === natureRequest.current) setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      if (ticket === natureRequest.current) setPendingNature(null);
    }
  }

  async function save(confirm: boolean) {
    if (busy || readOnly || pendingNature) return;
    setError("");
    setNotice("");
    if ((confirm || confirmed) && draft.parameterIds.length === 0) {
      setError("Choisissez au moins une analyse avant de confirmer le programme.");
      return;
    }
    if (draft.dueAt) {
      const due = fromLocalInput(draft.dueAt);
      if (!due) {
        setError("Le délai de rendu est invalide.");
        return;
      }
      if (new Date(due).getTime() < Date.now() - DUE_AT_TOLERANCE_MS) {
        setError("Le délai de rendu ne peut pas être dans le passé.");
        return;
      }
    }
    setBusy(confirm ? "confirm" : "draft");
    try {
      const response = await fetch(`/api/samples/${sample.id}/programme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequestBody(draft, confirm)),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<ProgrammeResponse> & { error?: string };
      if (!response.ok || !data.sample || !data.programme) {
        setError(data.error ?? "Impossible d'enregistrer le programme.");
        return;
      }
      adopt(data as ProgrammeResponse);
      const natureNote =
        data.programme.natureId && data.programme.natureId !== savedNatureId
          ? ` Nature d'analyse : ${data.sample.nature.label}.`
          : "";
      setNotice(
        (confirm && data.sample.status === "PROGRAMME"
          ? "Programme confirmé : l'échantillon est prêt pour la paillasse."
          : confirmed
            ? "Modifications du programme enregistrées."
            : "Brouillon enregistré — l'échantillon reste « Reçu » jusqu'à la confirmation.") + natureNote
      );
      // The header (status, « confirmé le … par … ») is the server's: refresh it.
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const readOnlyReason = (() => {
    if (!readOnly) return null;
    if (saved.status === "PRELEVE") {
      return "Cet échantillon n'est pas encore réceptionné : le programme se décide après la réception.";
    }
    if (saved.status === "ANNULE") {
      return `Échantillon annulé${sample.cancelReason ? ` (${CANCEL_REASON_LABELS[sample.cancelReason]})` : ""} : seul un administrateur peut le réactiver.`;
    }
    if (saved.analysisBlocked) {
      return "Échantillon bloqué en réception : un administrateur doit le libérer avant la programmation.";
    }
    return "Fiche en lecture seule : la paillasse a commencé. Les changements passent désormais par « Corriger la fiche », avec un motif.";
  })();

  return (
    <div className="space-y-5">
      {readOnlyReason && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{readOnlyReason}</span>
        </p>
      )}
      {confirmed && saved.programmedAt && (
        <p className="flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Programme confirmé le <b className="font-semibold">{formatDateTime(saved.programmedAt)}</b>
            {saved.programmedBy ? ` par ${saved.programmedBy.name}` : ""}.
            {readOnly ? "" : " Il reste modifiable tant que la paillasse n'a pas commencé."}
          </span>
        </p>
      )}

      {/* 1 — Nature, type de produit et critères */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={1}
          icon={Package}
          title="Nature, type de produit et critères"
          hint="Le type apporte les critères d'interprétation (n, c, m, M par germe) ; ses germes s'ajoutent aux analyses et son n est proposé. « — aucun — » laisse la lecture simple."
        />
        <div className="mb-5">
          <label htmlFor="programme-nature" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Layers className="h-4 w-4 text-brand" aria-hidden="true" />
            Nature d&apos;analyse
          </label>
          <select
            id="programme-nature"
            value={pendingNature ?? draft.natureId}
            onChange={(e) => changeNature(e.target.value)}
            disabled={readOnly || !!busy || !!pendingNature || natures.length < 2}
            aria-describedby="programme-nature-hint"
            className="input-field px-4 disabled:bg-slate-50"
          >
            {/* A nature missing from the referential still names itself. */}
            {!natures.some((nature) => nature.id === draft.natureId) && (
              <option value={draft.natureId}>{draftNature?.label ?? sample.nature.label}</option>
            )}
            {natures.map((nature) => (
              <option key={nature.id} value={nature.id}>
                {`${nature.label}${nature.id === savedNatureId ? " — actuelle" : ""}${nature.active ? "" : " (archivée)"}`}
              </option>
            ))}
          </select>
          <p id="programme-nature-hint" className="mt-1 text-xs text-slate-500">
            {pendingNature
              ? "Chargement des analyses de cette nature…"
              : readOnly
                ? `Famille : ${familyLabel}.`
                : natures.length < 2
                ? `Aucune autre nature active dans la même famille (${familyLabel}).`
                : `Dans la même famille (${familyLabel}) : l'autre famille fait l'objet d'un autre échantillon. Changer de nature recharge les analyses, les profils et les prix ; la nature change à l'enregistrement du programme.`}
          </p>
          {natureChanged && !readOnly && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Nature modifiée ({draftNature?.label ?? "nouvelle nature"}) : enregistrez le programme pour l&apos;appliquer à l&apos;échantillon.
              </span>
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={typeQuery}
              onChange={(e) => setTypeQuery(e.target.value)}
              placeholder="Rechercher un type (ex. : salade, charcuterie)"
              aria-label="Rechercher un type de produit"
              disabled={readOnly}
              className="input-field pl-9 pr-4 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label htmlFor="programme-type" className="sr-only">Type de produit</label>
            <select
              id="programme-type"
              value={draft.productTypeId}
              onChange={(e) => setDraft((current) => applyProductType(current, e.target.value, referential))}
              disabled={readOnly}
              className="input-field px-4 disabled:bg-slate-50"
            >
              <option value="">— aucun —</option>
              {clientTypes.length > 0 && (
                <optgroup label="Types du client">
                  {clientTypes.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </optgroup>
              )}
              {catalogueTypes.length > 0 && (
                <optgroup label="Catalogue">
                  {catalogueTypes.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
        {typeQuery && visibleTypes.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">Aucun type ne correspond à « {typeQuery} ».</p>
        )}
        {lostType && !draft.productTypeId && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Le type « {lostType.name} » enregistré sur l&apos;échantillon n&apos;est plus proposé à ce client : choisissez-en un autre, ou laissez « — aucun — ».
            </span>
          </p>
        )}

        {type && criteria.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="mb-2 text-left text-xs text-slate-500">
                Critères de « {type.name} » — {criteria.length} germe{criteria.length > 1 ? "s" : ""}
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Germe</th>
                  <th className="pb-2 pr-3 font-medium">Norme</th>
                  <th className="pb-2 pr-3 text-right font-medium">n</th>
                  <th className="pb-2 pr-3 text-right font-medium">c</th>
                  <th className="pb-2 pr-3 text-right font-medium">m</th>
                  <th className="pb-2 text-right font-medium">M</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((criterion) => {
                  const limits = limitCells(criterion);
                  const programmedGerm = draft.parameterIds.includes(criterion.parameterId);
                  return (
                    <tr key={criterion.parameterId} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {criterion.parameterName}
                        {!programmedGerm && <span className="ml-1.5 text-xs font-normal text-slate-400">non programmé</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{criterion.normVersion?.label ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{criterion.n}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{criterion.c ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-700">{limits.m}{criterion.unit && limits.m !== "—" ? <span className="ml-1 text-xs text-slate-400">{criterion.unit}</span> : null}</td>
                      <td className="py-2 text-right font-mono text-slate-700">{limits.bigM}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {type && criteria.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Aucun critère enregistré pour ce type : lecture en valeur simple.</p>
        )}
      </Card>

      {/* 2 — Analyses */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={2}
          icon={FlaskConical}
          title="Analyses"
          hint="Les analyses cochées par le préleveur sont pré-cochées. Un profil remplace la sélection ; au moins une analyse pour confirmer."
        />
        {referential.profiles.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" />
              Profil d&apos;analyses
            </p>
            <div className="flex flex-wrap gap-2">
              {referential.profiles.map((profile) => {
                const applied = profileApplied(draft, profile, referential);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setDraft((current) => applyProfile(current, profile, referential))}
                    aria-pressed={applied}
                    disabled={readOnly}
                    className={chip(applied)}
                  >
                    {profile.name}
                    {profile.clientId ? " · contrat" : ""}
                    {profile.unitCount > 1 ? ` · n = ${profile.unitCount}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">
            Analyses programmées <span className="text-rose-600" aria-hidden="true">*</span>
            <span className="ml-2 text-xs font-normal text-slate-500">{draft.parameterIds.length} sur {referential.parameters.length}</span>
          </legend>
          {referential.parameters.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun paramètre n&apos;est défini pour cette nature : l&apos;administrateur doit en créer avant la programmation.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const ticked = group.parameters.filter((parameter) => draft.parameterIds.includes(parameter.id)).length;
                return (
                  <div key={group.family} role="group" aria-label={group.label}>
                    <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group.label}
                      <span className="font-normal normal-case tracking-normal text-slate-400">
                        {ticked} sur {group.parameters.length}
                      </span>
                      {group.foreign && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-amber-700 ring-1 ring-amber-200">
                          autre famille que l&apos;échantillon
                        </span>
                      )}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.parameters.map((parameter) => {
                        const checked = draft.parameterIds.includes(parameter.id);
                        return (
                          <label
                            key={parameter.id}
                            className={`flex min-h-[44px] items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all ${
                              readOnly ? "cursor-default" : "cursor-pointer"
                            } ${checked ? "border-brand/40 bg-brand-light/60 shadow-sm ring-1 ring-brand/10" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setDraft((current) => toggleParameter(current, parameter.id, referential))}
                              disabled={readOnly || !!pendingNature}
                              className="accent-brand h-4 w-4"
                            />
                            <span className="min-w-0 flex-1">
                              {parameter.name}
                              {parameter.unit && <span className="ml-1.5 text-xs text-slate-400">{parameter.unit}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {groups.some((group) => group.foreign) && (
                <p className="text-xs text-slate-500">
                  Une analyse d&apos;une autre famille se programme d&apos;ordinaire sur l&apos;autre échantillon du même numéro (« …M » / « …P »).
                </p>
              )}
            </div>
          )}
        </fieldset>
      </Card>

      {/* 3 — Nombres */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={3}
          icon={Hash}
          title="Nombres"
          hint="Les unités lues séparément (R1 … Rn), la prise d'essai engagée et, par germe, le facteur de dilution propre à cet échantillon."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700">Unités à lire (n)</p>
            <div className="flex flex-wrap gap-2">
              {UNIT_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patch({ unitCount: n })}
                  aria-pressed={draft.unitCount === n}
                  disabled={readOnly}
                  className={chip(draft.unitCount === n, "min-w-[52px] px-3 font-semibold")}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="programme-units" className="text-xs text-slate-500">ou saisir le nombre :</label>
              <input
                id="programme-units"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_UNITS}
                value={draft.unitCount}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 1 && n <= MAX_UNITS) patch({ unitCount: clampUnits(n) });
                }}
                disabled={readOnly}
                className="input-field w-24 px-3 disabled:bg-slate-50"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {sample.unitCount} unité{sample.unitCount > 1 ? "s" : ""} prélevée{sample.unitCount > 1 ? "s" : ""} sur le terrain · 5 pour la plupart des aliments, 9 pour l&apos;histamine.
            </p>
            {warning && (
              <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{warning}</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="programme-test-portion" className="mb-1.5 block text-sm font-semibold text-slate-700">Prise d&apos;essai</label>
            <input
              id="programme-test-portion"
              type="text"
              value={draft.testPortion}
              onChange={(e) => patch({ testPortion: e.target.value })}
              maxLength={MAX_TEST_PORTION}
              placeholder="Ex. : 25 g, 100 mL"
              disabled={readOnly}
              className="input-field px-4 disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-500">Facultatif — la quantité engagée par analyse.</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-700">Facteur de dilution par analyse</p>
          {programmed.length === 0 ? (
            <p className="text-sm text-slate-500">Cochez d&apos;abord les analyses (section 2).</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {programmed.map((parameter) => {
                const setting = settingOf(draft, parameter.id);
                const id = `dilution-${parameter.id}`;
                return (
                  <li key={parameter.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2">
                    <label htmlFor={id} className="min-w-0 flex-1 text-sm text-slate-800">
                      {parameter.name}
                      {parameter.calcFactor !== 1 && (
                        <span className="ml-1.5 text-xs text-slate-400">facteur du paramètre ×{parameter.calcFactor}</span>
                      )}
                    </label>
                    <input
                      id={id}
                      type="text"
                      inputMode="decimal"
                      value={setting.dilutionFactor}
                      onChange={(e) => setDraft((current) => updateSetting(current, parameter.id, { dilutionFactor: e.target.value }))}
                      placeholder="×10 → 10"
                      disabled={readOnly}
                      className="input-field w-28 px-3 text-right disabled:bg-slate-50"
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-slate-500">Facultatif : remplace le facteur du paramètre pour cet échantillon seulement.</p>
        </div>
      </Card>

      {/* 4 — Méthodes */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={4}
          icon={BookOpen}
          title="Méthodes"
          hint="La version de norme imprimée comme méthode sur le rapport : celle en vigueur par défaut, celle du critère si un type est choisi."
        />
        {programmed.length === 0 ? (
          <p className="text-sm text-slate-500">Cochez d&apos;abord les analyses (section 2).</p>
        ) : (
          <ul className="space-y-3">
            {programmed.map((parameter) => {
              const setting = settingOf(draft, parameter.id);
              const options = referential.normVersions[parameter.id] ?? [];
              const criterion = criteria.find((candidate) => candidate.parameterId === parameter.id);
              const versionId = `norm-${parameter.id}`;
              const noteId = `note-${parameter.id}`;
              return (
                <li key={parameter.id} className="grid gap-3 rounded-xl border border-slate-200 p-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <label htmlFor={versionId} className="block text-sm font-medium text-slate-800">{parameter.name}</label>
                    {options.length === 0 ? (
                      <p className="mt-1.5 text-xs text-slate-500">Aucune version de norme référencée pour ce paramètre.</p>
                    ) : (
                      <select
                        id={versionId}
                        value={setting.normVersionId}
                        onChange={(e) => setDraft((current) => updateSetting(current, parameter.id, { normVersionId: e.target.value }))}
                        disabled={readOnly}
                        className="input-field mt-1.5 px-3 disabled:bg-slate-50"
                      >
                        {/* A norm with no version in force proposes nothing: the choice is explicit. */}
                        {!setting.normVersionId && <option value="">— à choisir —</option>}
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                            {option.current ? " — en vigueur" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {criterion?.normVersion && (
                      <p className="mt-1 text-xs text-slate-500">Critère du type : {criterion.normVersion.label}.</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={noteId} className="block text-sm font-medium text-slate-700">Note de méthode</label>
                    <input
                      id={noteId}
                      type="text"
                      value={setting.note}
                      onChange={(e) => setDraft((current) => updateSetting(current, parameter.id, { note: e.target.value }))}
                      maxLength={MAX_PARAMETER_NOTE}
                      placeholder="Facultatif — méthode interne, matériel"
                      disabled={readOnly}
                      className="input-field mt-1.5 px-3 disabled:bg-slate-50"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 5 — Organisation */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={5}
          icon={Users}
          title="Organisation"
          hint="Le technicien par défaut lit tout l'échantillon ; une analyse peut être confiée à un autre. Priorité, délai de rendu promis et consignes."
        />
        {referential.technicians.length === 0 && (
          <p className="mb-3 text-sm text-amber-700">Aucun technicien actif : l&apos;administrateur doit créer un compte technicien avant l&apos;attribution.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="programme-technician" className="mb-1.5 block text-sm font-semibold text-slate-700">Technicien par défaut</label>
            <select
              id="programme-technician"
              value={draft.technicianId}
              onChange={(e) => patch({ technicianId: e.target.value })}
              disabled={readOnly}
              className="input-field px-3 disabled:bg-slate-50"
            >
              <option value="">— à attribuer —</option>
              {referential.technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>{technician.name}</option>
              ))}
            </select>
            {sample.technician && sample.technician.id !== draft.technicianId && (
              <p className="mt-1 text-xs text-slate-500">Attribué à la réception : {sample.technician.name}.</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700">Raccourcis</p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="programme-all-tech" className="sr-only">Technicien pour toutes les analyses</label>
              <select
                id="programme-all-tech"
                value={allTech}
                onChange={(e) => setAllTech(e.target.value)}
                disabled={readOnly}
                className="input-field w-auto min-w-[160px] flex-1 px-3 disabled:bg-slate-50"
              >
                <option value="">Choisir…</option>
                {referential.technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>{technician.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => allTech && setDraft((current) => assignAll(current, allTech))}
                disabled={readOnly || !allTech}
                className={chip(false, "font-semibold")}
              >
                Tous à ce technicien
              </button>
            </div>
            {splitOffered && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label htmlFor="programme-micro-tech" className="text-xs text-slate-500">micro à</label>
                <select
                  id="programme-micro-tech"
                  value={microTech}
                  onChange={(e) => setMicroTech(e.target.value)}
                  disabled={readOnly}
                  className="input-field w-auto min-w-[120px] flex-1 px-3 disabled:bg-slate-50"
                >
                  <option value="">Choisir…</option>
                  {referential.technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </select>
                <label htmlFor="programme-chimie-tech" className="text-xs text-slate-500">chimie à</label>
                <select
                  id="programme-chimie-tech"
                  value={chimieTech}
                  onChange={(e) => setChimieTech(e.target.value)}
                  disabled={readOnly}
                  className="input-field w-auto min-w-[120px] flex-1 px-3 disabled:bg-slate-50"
                >
                  <option value="">Choisir…</option>
                  {referential.technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => microTech && chimieTech && setDraft((current) => assignByFamily(current, families, microTech, chimieTech))}
                  disabled={readOnly || !microTech || !chimieTech}
                  className={chip(false, "font-semibold")}
                >
                  Répartir
                </button>
              </div>
            )}
          </div>
        </div>

        {programmed.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">Technicien par analyse</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {programmed.map((parameter) => {
                const setting = settingOf(draft, parameter.id);
                const id = `tech-${parameter.id}`;
                return (
                  <li key={parameter.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2">
                    <label htmlFor={id} className="min-w-0 flex-1 text-sm text-slate-800">{parameter.name}</label>
                    <select
                      id={id}
                      value={setting.technicianId}
                      onChange={(e) => setDraft((current) => updateSetting(current, parameter.id, { technicianId: e.target.value }))}
                      disabled={readOnly}
                      className="input-field w-auto max-w-[55%] px-3 disabled:bg-slate-50"
                    >
                      <option value="">{defaultTechnician ? `— ${defaultTechnician.name} —` : "— celui de l'échantillon —"}</option>
                      {referential.technicians.map((technician) => (
                        <option key={technician.id} value={technician.id}>{technician.name}</option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-slate-700">Priorité</legend>
            <div className="flex flex-wrap gap-2">
              {PROGRAMME_PRIORITIES.map((priority: ProgrammePriority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => patch({ priority })}
                  aria-pressed={draft.priority === priority}
                  disabled={readOnly}
                  className={
                    draft.priority === priority && priority === "URGENTE"
                      ? `${CHIP} border-rose-400 bg-rose-50 text-rose-800 ring-1 ring-rose-200`
                      : chip(draft.priority === priority)
                  }
                >
                  {PROGRAMME_PRIORITY_LABELS[priority]}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="programme-due" className="mb-1.5 block text-sm font-semibold text-slate-700">Délai de rendu promis</label>
            <input
              id="programme-due"
              type="datetime-local"
              value={draft.dueAt}
              onChange={(e) => patch({ dueAt: e.target.value })}
              disabled={readOnly}
              className="input-field px-3 disabled:bg-slate-50"
            />
            <LegalTimeHint />
            <p className="mt-1 text-xs text-slate-500">Facultatif — jamais dans le passé.</p>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="programme-note" className="mb-1.5 block text-sm font-semibold text-slate-700">Consignes</label>
          <textarea
            id="programme-note"
            value={draft.programmeNote}
            onChange={(e) => patch({ programmeNote: e.target.value })}
            rows={3}
            maxLength={MAX_PROGRAMME_NOTE}
            placeholder="Préparation, conservation, remarques pour le comptable…"
            disabled={readOnly}
            className="input-field resize-none px-4 disabled:bg-slate-50"
          />
          <p className="mt-1 text-xs text-slate-500">Lues par la paillasse et par le comptable (section 7).</p>
        </div>
      </Card>

      {/* 6 — Vérification d'entrée */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={6}
          icon={ClipboardCheck}
          title="Vérification d'entrée"
          hint="Les règles de recevabilité de la réception, recalculées avec les analyses et les unités programmées."
        />
        <Checklist checks={checks} />
        <p className="mt-3 text-xs text-slate-500">
          La réception a déjà accepté cet échantillon : ces rappels n&apos;empêchent pas la confirmation. Une identification à corriger ou un échantillon à annuler passe par les verbes ci-dessous.
        </p>
        <div className="mt-3">
          {verbSample ? (
            <SampleVerbs role={role} sample={verbSample} onChanged={reload} />
          ) : (
            <p className="text-xs text-slate-500">
              La correction de la fiche (désignation, quantité, lot…) et l&apos;annulation relèvent de la réception ou de l&apos;administrateur.
            </p>
          )}
        </div>
      </Card>

      {/* 7 — Facturation */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={7}
          icon={ReceiptText}
          title="Facturation"
          hint="Les lignes proposées au comptable dès la confirmation : chaque analyse programmée à son prix du catalogue."
        />
        {billing.lines.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune analyse programmée : rien à facturer pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Analyse</th>
                  <th className="pb-2 text-right font-medium">Prix catalogue (HT)</th>
                </tr>
              </thead>
              <tbody>
                {billing.lines.map((line) => (
                  <tr key={line.parameterId} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-800">{line.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {line.unitPrice === null ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">prix à saisir</span>
                      ) : (
                        <span className="text-slate-800">{formatCurrency(line.unitPrice)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 pr-3 text-sm font-semibold text-slate-700">Total des lignes tarifées</td>
                  <td className="pt-2 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(billing.total)}</td>
                </tr>
              </tfoot>
            </table>
            {billing.unpriced > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {billing.unpriced} analyse{billing.unpriced > 1 ? "s" : ""} sans prix au catalogue : le comptable saisira le prix à la facturation.
              </p>
            )}
          </div>
        )}
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Note pour le comptable</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
            {draft.programmeNote.trim() || <span className="text-slate-400">Aucune — les consignes de la section 5 sont transmises telles quelles.</span>}
          </p>
        </div>
      </Card>

      {/* Pied */}
      <Card className="p-4 sm:p-6">
        <p className="text-sm text-slate-600">
          <b className="font-semibold text-slate-800">{draft.parameterIds.length}</b> analyse{draft.parameterIds.length > 1 ? "s" : ""} · n = <b className="font-semibold text-slate-800">{draft.unitCount}</b>
          {type ? ` · ${type.name}` : " · sans type"}
          {defaultTechnician ? ` · ${defaultTechnician.name}` : " · technicien à attribuer"}
          {draft.priority === "URGENTE" ? " · urgente" : ""}
          {natureChanged && draftNature ? ` · nature : ${draftNature.label} (à enregistrer)` : ""}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}
        {readOnly ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Programme en lecture seule.
          </p>
        ) : confirmed ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row-reverse">
            <PrimaryButton type="button" onClick={() => save(false)} disabled={!!busy || !!pendingNature} className="sm:flex-1">
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy === "draft" ? "Enregistrement…" : "Enregistrer les modifications"}
            </PrimaryButton>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row-reverse">
            <PrimaryButton type="button" onClick={() => save(true)} disabled={!!busy || !!pendingNature} className="sm:flex-1">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {busy === "confirm" ? "Confirmation…" : "Confirmer le programme"}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => save(false)} disabled={!!busy || !!pendingNature} className="sm:flex-1">
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy === "draft" ? "Enregistrement…" : "Enregistrer le brouillon"}
            </SecondaryButton>
          </div>
        )}
        {!readOnly && !confirmed && (
          <p className="mt-2 text-xs text-slate-500">
            Le brouillon laisse l&apos;échantillon « Reçu » ; la confirmation le passe à « Programmé » et ouvre la paillasse et la facturation.
          </p>
        )}
      </Card>
    </div>
  );
}
