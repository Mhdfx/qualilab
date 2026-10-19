"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FlaskConical,
  Hash,
  Layers,
  ListChecks,
  Lock,
  Package,
  ReceiptText,
  Save,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ProgrammePriority } from "@/generated/prisma/enums";
import {
  ANALYSIS_FAMILY_LABELS,
  PROGRAMME_PRIORITY_LABELS,
  formatCurrency,
  formatDateTime,
} from "@/lib/labels";
import { fmt } from "@/lib/interpretation";
import { normInForce, parameterCaption } from "@/lib/parameter-caption";
import {
  DUE_AT_TOLERANCE_MS,
  MAX_PARAMETER_NOTE,
  MAX_PROGRAMME_NOTE,
  MAX_TEST_PORTION,
  PROGRAMME_PRIORITIES,
} from "@/lib/programme-input";
import type { ReceptionThresholds } from "@/lib/reception-rules";
import type { Role } from "@/lib/roles";
import { twinOfCode } from "@/lib/sample-code";
import { verbsFor } from "@/lib/sample-verbs";
import { MAX_UNITS } from "@/lib/series";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { LabDateTimeInput, dateTimePending } from "@/components/LabDateTimeInput";
import { Checklist } from "@/components/reception/reception-widgets";
import { fromLocalInput } from "@/components/preleveur/visit-types";
import { SampleVerbs, type VerbSample } from "@/components/samples/SampleVerbs";
import { FamilyPickerDialog } from "./FamilyPickerDialog";
import {
  UNIT_CHOICES,
  adoptReferential,
  applyProductType,
  applyProfile,
  benchHolder,
  benchHolderNotice,
  billingLines,
  checkAllOfType,
  clampUnits,
  confirmationNotice,
  criteriaOf,
  entryChecks,
  familyChangeNotice,
  familyChangeTookAway,
  familyCheckCount,
  familyCheckLabel,
  familyParameterRows,
  groupParameters,
  initialDraft,
  natureChangeNotice,
  natureChoices,
  natureHint,
  otherParameterGroups,
  profileApplied,
  programmeReadOnlyReason,
  programmeVerbsLead,
  programmeVerbsNote,
  settingOf,
  toRequestBody,
  toggleParameter,
  typeOf,
  uncheckAllOfType,
  unitWarning,
  updateSetting,
  type BenchHolder,
  type ParameterGroup,
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
 * started the sheet is read-only — the responsable des paramètres changes
 * the analyses through « Corriger les analyses », with a reason (16/10,
 * Q128), and the identification is the reception's or the validation's.
 *
 * RETOUR-LABO-06-10.md §5 (V3, Q49 by default): the fine « Nature
 * d'analyse » is chosen here, within the sample's family — or, since 16/10
 * (Q129), among « Autres analyses » (« Analyse sensorielle » of a food) and
 * back to the family of the code's letter; the code and the N° de contrôle
 * never change (`natureChoices`). Choosing one
 * reloads the referential of that nature at once (`GET …/programme
 * ?natureId=` — its analyses, profiles and prices), drops the ticked
 * analyses it does not offer and says which; the sample takes the nature
 * when the programme is saved (`natureId` in the PUT). Nothing is written
 * before that save, so leaving the page keeps the old nature.
 *
 * The sheet hands the sample to nobody (« prise en charge libre », 13/10 —
 * PROGRAMME.md §10): confirming puts it in the bench's « À prendre » list,
 * where a technician takes it. « Organisation » only says who holds it —
 * read-only — and an edit of a sample already taken leaves it with them.
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
  /**
   * The invoice holding the line (`heldInvoices`; number null = a draft), or
   * null: a confirmed programme is billable, and a change of its analyses
   * never reaches that invoice by itself — the sheet says so before and
   * after the save.
   */
  invoiced?: { number: string | null } | null;
};

type SavedState = Pick<ProgrammeSampleData, "status" | "analysisBlocked"> &
  Pick<ProgrammeState, "programmedAt" | "programmedBy" | "editable"> & {
    /** Who held the sample at the bench when the server last answered (`benchHolder`). */
    holder: BenchHolder | null;
  };

const CHIP = "min-h-[40px] rounded-xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const CHIP_ON = "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20";
const CHIP_OFF = "border-slate-200 text-slate-600 hover:border-slate-300";
const chip = (active: boolean, extra = "") => `${CHIP} ${active ? CHIP_ON : CHIP_OFF} ${extra}`;
/** « Cocher tout » / « Décocher tout »: compact, still a 40 px target, with the sheet's focus ring. */
const BULK_BUTTON =
  "min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

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
  invoiced = null,
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
    holder: benchHolder(sample),
  });
  const [busy, setBusy] = useState<"draft" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Saved on a line an invoice holds, with other analyses: what to tell the accountant.
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  // What a change of family did (F6), said in section 1 where it was made;
  // `tookAway` = analyses removed or n lowered (amber). Cleared by the next
  // change of family or a save.
  const [familyNotice, setFamilyNotice] = useState<{ text: string; tookAway: boolean } | null>(null);
  // « Choisir une famille de produits » (F5), and « Analyses hors famille »
  // folded or not (F6: null = open while one of them is ticked, else folded;
  // pinned open once one of its boxes is used, so it never closes under the cursor).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState<boolean | null>(null);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const readOnly = !saved.editable;
  const confirmed = saved.status === "PROGRAMME";
  const type = typeOf(referential, draft.productTypeId);
  const criteria = useMemo(() => criteriaOf(type), [type]);
  const groups = useMemo(() => groupParameters(referential, sample.nature.family), [referential, sample.nature.family]);
  const twin = twinOfCode(sample.code);
  const natures = natureChoices(referential, sample.nature.family, twin);
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
  const holderNotice = benchHolderNotice(saved.holder, saved);

  // The family as « Paramètres à rechercher » (F6), and the analyses outside it.
  const familyRows = familyParameterRows(draft, referential);
  const familyCount = familyCheckCount(draft, referential);
  const others = otherParameterGroups(groups, draft, referential);
  const othersTicked = others.reduce(
    (sum, group) => sum + group.parameters.filter((parameter) => draft.parameterIds.includes(parameter.id)).length,
    0
  );
  const othersTotal = others.reduce((sum, group) => sum + group.parameters.length, 0);
  const othersShown = othersOpen ?? othersTicked > 0;
  // The type the line carries but the client may no longer use (retired, or another client's).
  const lostType = sample.productTypeId && !typeOf(referential, sample.productTypeId) ? sample.productType : null;

  function patch(changes: Partial<ProgrammeDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  /**
   * The picker's choice (F5): the family replaces the previous one's germs
   * (F6, `applyProductType`) and the sheet says which analyses left. The
   * current family chosen again changes nothing.
   */
  function chooseFamily(typeId: string) {
    setPickerOpen(false);
    if (readOnly || typeId === draft.productTypeId) return;
    const next = applyProductType(draft, typeId, referential);
    setDraft(next);
    setError("");
    setNotice("");
    setFamilyNotice({ text: familyChangeNotice(draft, next, referential), tookAway: familyChangeTookAway(draft, next) });
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
      holder: benchHolder(data.sample),
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
    setFamilyNotice(null);
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
   * Another nature of the same family (Q49), or of « Autres analyses » and
   * back (Q129): its referential replaces the one on screen, the analyses it
   * does not offer leave the draft. The sample itself only changes when the
   * programme is saved.
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
      setNotice(natureChangeNotice(label, result.dropped, next.natureId === savedNatureId, result.reset));
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
    setBillingNotice(null);
    setFamilyNotice(null);
    if ((confirm || confirmed) && draft.parameterIds.length === 0) {
      setError("Choisissez au moins une analyse avant de confirmer le programme.");
      return;
    }
    // An unfinished or invalid date-time before checking the delay: the sheet
    // still holds the value from before it (the field gets the focus).
    const duePending = dateTimePending("programme-due");
    if (duePending) {
      setError(duePending);
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
      const data = (await response.json().catch(() => ({}))) as Partial<ProgrammeResponse> & {
        error?: string;
        billing?: { notice?: unknown };
      };
      if (!response.ok || !data.sample || !data.programme) {
        setError(data.error ?? "Impossible d'enregistrer le programme.");
        return;
      }
      adopt(data as ProgrammeResponse);
      if (typeof data.billing?.notice === "string") setBillingNotice(data.billing.notice);
      const natureNote =
        data.programme.natureId && data.programme.natureId !== savedNatureId
          ? ` Nature d'analyse : ${data.sample.nature.label}.`
          : "";
      setNotice(
        (confirm && data.sample.status === "PROGRAMME"
          ? confirmationNotice(benchHolder(data.sample))
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

  /**
   * The analyses grouped by domain, a box each — all of them, or those
   * outside the family (F6). `onToggle` runs with each box used (the panel
   * outside the family stays open once the programmer works in it).
   */
  function analysisGroups(list: ParameterGroup[], onToggle?: () => void) {
    return (
      <div className="space-y-4">
        {list.map((group) => {
          const ticked = group.parameters.filter((parameter) => draft.parameterIds.includes(parameter.id)).length;
          return (
            <div key={group.family} role="group" aria-label={group.label}>
              <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
                <span className="font-normal normal-case tracking-normal text-slate-500">
                  {ticked} sur {group.parameters.length}
                </span>
                {group.foreign && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-amber-700 ring-1 ring-amber-200">
                    autre domaine que l&apos;échantillon
                  </span>
                )}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.parameters.map((parameter) => {
                  const checked = draft.parameterIds.includes(parameter.id);
                  // « Norme en vigueur · unité » under the name, when known (14/10).
                  const caption = parameterCaption({
                    normLabel: normInForce(referential.normVersions[parameter.id] ?? []),
                    unit: parameter.unit,
                  });
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
                        onChange={() => {
                          onToggle?.();
                          setDraft((current) => toggleParameter(current, parameter.id, referential));
                        }}
                        disabled={readOnly || !!pendingNature}
                        className="accent-brand h-4 w-4"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block">{parameter.name}</span>
                        {caption && <span className="block text-xs text-slate-600">{caption}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {list.some((group) => group.foreign) && (
          <p className="text-xs text-slate-500">
            Une analyse d&apos;un autre domaine se programme d&apos;ordinaire sur l&apos;autre échantillon du même numéro (« …M » / « …P »).
          </p>
        )}
      </div>
    );
  }

  const readOnlyReason = programmeReadOnlyReason(
    { editable: saved.editable, status: saved.status, analysisBlocked: saved.analysisBlocked, cancelReason: sample.cancelReason },
    role
  );
  // What is not this person's among the corrections (16/10, Q128).
  const verbsNote = programmeVerbsNote(role, saved.status);
  // The verbs `SampleVerbs` renders below, from the same rule.
  const verbsLead = verbSample ? programmeVerbsLead(verbsFor(verbSample, role)) : "";

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

      {/* 1 — Nature, famille de produits et paramètres à rechercher */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={1}
          icon={Package}
          title="Nature, famille de produits et paramètres à rechercher"
          hint="La famille apporte les critères d'interprétation (n, c, m, M par germe) : ses paramètres, cochés d'office, remplacent ceux de la famille précédente — les analyses cochées à la main et les demandes du préleveur restent — et son n est proposé. Sans famille, lecture en valeur simple."
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
                ? `Domaine : ${familyLabel}.`
                : natureHint(sample.nature.family, twin, natures.length, referential.natureHome ?? null)}
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
        <div>
          <p id="programme-family-label" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Package className="h-4 w-4 text-brand" aria-hidden="true" />
            Famille de produits
          </p>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p id="programme-family-current" className="min-w-0 text-sm">
              {type ? (
                <>
                  <span className="block font-medium text-slate-800">{type.name}</span>
                  <span className="block text-xs text-slate-500">
                    {type.clientId ? "Famille du client" : "Catalogue commun"} ·{" "}
                    {type.criteriaCount === 0 ? "aucun critère" : `${type.criteriaCount} critère${type.criteriaCount > 1 ? "s" : ""}`}
                    {type.natureId === null ? " · type d'analyse à préciser" : ""}
                  </span>
                </>
              ) : (
                <span className="text-slate-600">Aucune famille — lecture en valeur simple.</span>
              )}
            </p>
            {!readOnly && (
              <SecondaryButton
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={!!busy || !!pendingNature}
                aria-haspopup="dialog"
                aria-describedby="programme-family-label programme-family-current"
                className="shrink-0"
              >
                {type ? "Changer de famille…" : "Choisir une famille…"}
              </SecondaryButton>
            )}
          </div>
        </div>
        {/* Mounted from the start so the change is announced; empty until a family is chosen. */}
        <p
          id="programme-family-notice"
          role="status"
          aria-live="polite"
          className={
            familyNotice
              ? `mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                  familyNotice.tookAway ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-200 bg-teal-50 text-teal-800"
                }`
              : ""
          }
        >
          {familyNotice && (
            <>
              {familyNotice.tookAway ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{familyNotice.text}</span>
            </>
          )}
        </p>
        {pickerOpen && (
          <FamilyPickerDialog referential={referential} draft={draft} onChoose={chooseFamily} onClose={closePicker} />
        )}
        {lostType && !draft.productTypeId && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              La famille « {lostType.name}{" "}» enregistrée sur l&apos;échantillon n&apos;est plus proposée à ce client : choisissez-en une autre, ou gardez « Aucune famille ».
            </span>
          </p>
        )}

        {type && familyRows.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-slate-700">Paramètres à rechercher</legend>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-xs text-slate-500" aria-live="polite">
                {familyCheckLabel(familyCount)}
              </p>
              {!readOnly && familyCount.total > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((current) => checkAllOfType(current, referential))}
                    disabled={!!pendingNature}
                    className={BULK_BUTTON}
                  >
                    Cocher tout
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => uncheckAllOfType(current, referential))}
                    disabled={!!pendingNature}
                    className={BULK_BUTTON}
                  >
                    Décocher tout
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <caption className="sr-only">Paramètres à rechercher de « {type.name} » : germe, norme, unité, n, c, m, M</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="w-10 pb-2 pr-2 font-medium"><span className="sr-only">Rechercher</span></th>
                    <th scope="col" className="pb-2 pr-3 font-medium">Germe</th>
                    <th scope="col" className="pb-2 pr-3 font-medium">Norme</th>
                    <th scope="col" className="pb-2 pr-3 font-medium">Unité</th>
                    <th scope="col" className="pb-2 pr-3 text-right font-medium">n</th>
                    <th scope="col" className="pb-2 pr-3 text-right font-medium">c</th>
                    <th scope="col" className="pb-2 pr-3 text-right font-medium">m</th>
                    <th scope="col" className="pb-2 text-right font-medium">M</th>
                  </tr>
                </thead>
                <tbody>
                  {familyRows.map((row) => {
                    const limits = limitCells(row.criterion);
                    const boxId = `programme-germ-${row.parameterId}`;
                    return (
                      <tr key={row.parameterId} className={`border-b border-slate-100 ${row.checked ? "bg-brand-light/30" : ""}`}>
                        <td className="py-2 pr-2 align-top">
                          <input
                            id={boxId}
                            type="checkbox"
                            checked={row.checked}
                            onChange={() => setDraft((current) => toggleParameter(current, row.parameterId, referential))}
                            disabled={readOnly || !row.available || !!pendingNature}
                            className="accent-brand mt-0.5 h-4 w-4"
                          />
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <label htmlFor={boxId} className={`font-medium text-slate-800 ${readOnly || !row.available ? "" : "cursor-pointer"}`}>
                            {row.name}
                          </label>
                          {!row.available && <span className="block text-xs text-slate-500">pas proposé pour cette nature</span>}
                        </td>
                        <td className="py-2 pr-3 align-top text-xs text-slate-500">{row.normLabel ?? "—"}</td>
                        <td className="py-2 pr-3 align-top text-xs text-slate-600">{row.unit ?? "—"}</td>
                        <td className="py-2 pr-3 text-right align-top tabular-nums text-slate-700">{row.criterion.n}</td>
                        <td className="py-2 pr-3 text-right align-top tabular-nums text-slate-700">{row.criterion.c ?? "—"}</td>
                        <td className="py-2 pr-3 text-right align-top font-mono text-slate-700">{limits.m}</td>
                        <td className="py-2 text-right align-top font-mono text-slate-700">{limits.bigM}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        )}
        {type && familyRows.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Aucun critère enregistré pour cette famille : lecture en valeur simple.</p>
        )}
      </Card>

      {/* 2 — Analyses */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          index={2}
          icon={FlaskConical}
          title="Analyses"
          hint={
            familyCount.total > 0
              ? "Les paramètres de la famille se cochent en section 1 ; les analyses hors famille, dont celles demandées par le préleveur, sont ici. Un profil remplace la sélection ; au moins une analyse pour confirmer."
              : "Les analyses cochées par le préleveur sont pré-cochées. Un profil remplace la sélection ; au moins une analyse pour confirmer."
          }
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
          ) : type && familyCount.total > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Les paramètres de « {type.name} » se cochent en section 1 : {familyCheckLabel(familyCount)}.
              </p>
              {others.length > 0 && (
                <div className="rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setOthersOpen(!othersShown)}
                    aria-expanded={othersShown}
                    aria-controls="programme-other-analyses"
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span>
                      Analyses hors famille
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {othersTicked} cochée{othersTicked > 1 ? "s" : ""} sur {othersTotal}
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${othersShown ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  <div id="programme-other-analyses" hidden={!othersShown} className="border-t border-slate-100 p-3.5">
                    {analysisGroups(others, () => setOthersOpen((open) => open ?? true))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            analysisGroups(groups)
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
              {sample.unitCount} unité{sample.unitCount > 1 ? "s" : ""} prélevée{sample.unitCount > 1 ? "s" : ""}{" "}sur le terrain · 5 pour la plupart des aliments, 9 pour l&apos;histamine.
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
                      className="input-field w-28 shrink-0 px-3 text-right disabled:bg-slate-50"
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
          hint="La version de norme imprimée comme méthode sur le rapport : celle en vigueur par défaut, celle du critère si une famille est choisie."
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
                      <p className="mt-1 text-xs text-slate-500">Critère de la famille : {criterion.normVersion.label}.</p>
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
          hint="Priorité, délai de rendu promis et consignes. Le technicien n'est plus choisi ici : il prend lui-même l'échantillon à la paillasse."
        />
        {/* Read-only (13/10): who took the sample at the bench, or where it waits for a technician. */}
        <p
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            saved.holder ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <User className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{holderNotice}</span>
        </p>

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
            {/* A promised date is in the future by nature: no « dans le futur » check, no « Maintenant » (§8.1). */}
            <LabDateTimeInput
              id="programme-due"
              value={draft.dueAt}
              onChange={(legalWall) => patch({ dueAt: legalWall })}
              disabled={readOnly}
              inputClassName="input-field px-3 disabled:bg-slate-50"
            />
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
          hint="Les huit règles du bon de réception, recalculées avec les analyses et les unités programmées."
        />
        <Checklist rows={checks} />
        <p className="mt-3 text-xs text-slate-500">
          La réception a déjà accepté cet échantillon : ces rappels n&apos;empêchent pas la confirmation.
          {verbsLead ? ` ${verbsLead}` : ""}
        </p>
        {(verbSample || verbsNote) && (
          <div className="mt-3 space-y-2">
            {verbSample && <SampleVerbs role={role} sample={verbSample} onChanged={reload} />}
            {verbsNote && <p className="text-xs text-slate-500">{verbsNote}</p>}
          </div>
        )}
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
          {type ? ` · ${type.name}` : " · sans famille"}
          {saved.holder ? ` · pris par ${saved.holder.names}` : confirmed ? " · à prendre" : ""}
          {draft.priority === "URGENTE" ? " · urgente" : ""}
          {natureChanged && draftNature ? ` · nature : ${draftNature.label} (à enregistrer)` : ""}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}
        {billingNotice ? (
          <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{billingNotice}</p>
        ) : (
          invoiced &&
          confirmed &&
          !readOnly && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {invoiced.number === null
                ? "Échantillon sur un brouillon de facture : un changement d'analyses est à signaler à la comptabilité."
                : `Échantillon déjà facturé (${invoiced.number}) : un changement d'analyses est à signaler à la comptabilité (avoir ou facture complémentaire).`}
            </p>
          )
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
            Le brouillon laisse l&apos;échantillon « Reçu » ; la confirmation le passe à « Programmé », le place dans « À prendre » à la paillasse et ouvre la facturation.
          </p>
        )}
      </Card>
    </div>
  );
}
