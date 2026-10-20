"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ListChecks, Pencil, Plus, Search, X, Bell, BellOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/invoices/InvoiceDialogs";
import { FAMILY_SHORT_LABELS as FAMILY_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { DEFAULT_PARAMETER_FAMILY, PARAMETER_FAMILIES } from "@/lib/parameter-validation";
import { parameterMatches, RECLASSIFY_FAMILY_LABELS as TARGET_LABELS, type ReclassifyPlan } from "@/lib/parameter-reclassify";
import type { Family, SampleType } from "@/generated/prisma/client";

export type ParameterRow = {
  id: string;
  name: string;
  category: SampleType;
  /** MICRO / CHIMIE / AUTRE — the analyses are grouped by it on the sample card and go to the sample of their family. */
  family: Family;
  unit: string | null;
  threshold: string | null;
  limitValue: number | null;
  alertOnExceed: boolean;
  calcFactor: number;
  aliases: string | null;
  /** The norm in force (`normInForce`), searched with the name — null when no criterion cites one. */
  normLabel?: string | null;
};

const DOMAINS: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

const FAMILY_BADGE: Record<Family, string> = {
  MICRO: "bg-teal-50 text-teal-700 ring-teal-200",
  CHIMIE: "bg-sky-50 text-sky-700 ring-sky-200",
  AUTRE: "bg-slate-100 text-slate-600 ring-slate-200",
};

type FamilyFilter = Family | "TOUTES";
type CategoryFilter = SampleType | "TOUTES";

/** The reclassification's buttons, the 19/10 case first: « Passer en Physico-chimie ». */
const TARGETS: readonly Family[] = ["CHIMIE", "AUTRE", "MICRO"];

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/**
 * The laboratory's analysis parameters.
 *
 * This screen is where the real norms are entered. A limit here decides
 * whether a result is declared conform, and the "sensitive" flag decides which
 * germs raise a contamination alert — so the screen says that plainly rather
 * than presenting the fields as neutral settings.
 *
 * Each parameter also carries its family (RETOUR-LABO-06-10.md §5, V3):
 * microbiology, physico-chemistry or other. The sample card groups the
 * analyses by it and each one goes to the sample of its family — every
 * parameter is « Microbiologie » until it is set here.
 *
 * « Reclasser plusieurs paramètres » (RETOUR-LABO-19-10.md D-19): the
 * filters (category, domain, search on the name, an alias or the norm) and
 * a box per parameter; « Passer en Physico-chimie (N) » opens a confirmation
 * that lists what changes, what the server refuses and why
 * (`/api/parameters/reclassify`, `planReclassification`), then writes one
 * journal entry per parameter.
 */
export function ParametersManager({ parameters }: { parameters: ParameterRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState<SampleType | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("TOUTES");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("TOUTES");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<Family | null>(null);

  const provisional = parameters.filter((p) => p.alertOnExceed).length;

  // Each filter's counts follow the two others (the search included).
  const inCategory = (p: ParameterRow, category: CategoryFilter = categoryFilter) =>
    category === "TOUTES" || p.category === category;
  const inFamily = (p: ParameterRow, family: FamilyFilter = familyFilter) => family === "TOUTES" || p.family === family;
  const searched = query.trim() === "" ? parameters : parameters.filter((p) => parameterMatches(p, query));
  const familyCount = (family: FamilyFilter) => searched.filter((p) => inCategory(p) && inFamily(p, family)).length;
  const categoryCount = (category: CategoryFilter) => searched.filter((p) => inCategory(p, category) && inFamily(p)).length;
  const shown = searched.filter((p) => inCategory(p) && inFamily(p));
  const shownIds = new Set(shown.map((p) => p.id));

  const chosen = parameters.filter((p) => selected.has(p.id));
  const hidden = chosen.filter((p) => !shownIds.has(p.id)).length;
  const toMove = (family: Family) => chosen.filter((p) => p.family !== family).length;

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  return (
    <div>
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <b>Les limites actuelles sont provisoires.</b> Elles suivent les
            normes marocaines usuelles en attendant les valeurs officielles du
            laboratoire. Les modifier ici suffit — aucune intervention technique
            n&apos;est nécessaire. {provisional} paramètre
            {provisional > 1 ? "s" : ""} déclenche
            {provisional > 1 ? "nt" : ""} une alerte de contamination.
          </span>
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Fermer le message"
            className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <FilterChips
            label="Catégorie"
            options={(["TOUTES", ...DOMAINS] as CategoryFilter[]).map((category) => ({
              value: category,
              label: category === "TOUTES" ? "Toutes" : SAMPLE_TYPE_LABELS[category],
              count: categoryCount(category),
            }))}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
          <FilterChips
            label="Domaine"
            options={(["TOUTES", ...PARAMETER_FAMILIES] as FamilyFilter[]).map((family) => ({
              value: family,
              label: family === "TOUTES" ? "Tous" : FAMILY_LABELS[family],
              count: familyCount(family),
            }))}
            value={familyFilter}
            onChange={setFamilyFilter}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1 sm:max-w-md">
            <label htmlFor="p-search" className="mb-1.5 block text-xs font-medium text-slate-600">
              Rechercher
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="p-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom, autre libellé ou norme"
                className="min-h-[38px] w-full rounded-lg border border-slate-300 pl-8 pr-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            aria-pressed={selecting}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              selecting ? "border-brand bg-brand-light/60 text-brand" : "border-slate-300 text-slate-700 hover:border-slate-400"
            }`}
          >
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            {selecting ? "Terminer la sélection" : "Reclasser plusieurs paramètres"}
          </button>
        </div>
        {selecting && (
          <p className="text-xs text-slate-500">
            Cochez les paramètres (les filtres et « Tout cocher » aident), puis choisissez leur domaine. La
            confirmation liste chaque paramètre avant d&apos;écrire ; chacun est inscrit au journal.
          </p>
        )}
      </div>

      <div className="space-y-6">
        {DOMAINS.filter((domain) => categoryFilter === "TOUTES" || categoryFilter === domain).map((domain) => {
          const rows = shown.filter((p) => p.category === domain);
          const allTicked = rows.length > 0 && rows.every((row) => selected.has(row.id));
          return (
            <section key={domain}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {SAMPLE_TYPE_LABELS[domain]}
                </h2>
                <div className="flex flex-wrap items-center gap-1">
                  {selecting && rows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggle(rows.map((row) => row.id), !allTicked)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {allTicked ? `Tout décocher (${rows.length})` : `Tout cocher (${rows.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(domain);
                      setEditing(null);
                      setError("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Ajouter
                  </button>
                </div>
              </div>

              <Card className="overflow-hidden">
                {creating === domain && (
                  <ParameterForm
                    category={domain}
                    defaultFamily={familyFilter === "TOUTES" ? DEFAULT_PARAMETER_FAMILY : familyFilter}
                    onCancel={() => setCreating(null)}
                    onSaved={() => {
                      setCreating(null);
                      router.refresh();
                    }}
                    onError={setError}
                  />
                )}

                {rows.length === 0 && creating !== domain ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    {query.trim() !== ""
                      ? "Aucun paramètre de cette catégorie ne correspond à la recherche."
                      : familyFilter === "TOUTES"
                        ? "Aucun paramètre dans cette catégorie."
                        : `Aucun paramètre « ${FAMILY_LABELS[familyFilter]} » dans cette catégorie.`}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map((row) =>
                      editing === row.id ? (
                        <li key={row.id}>
                          <ParameterForm
                            category={domain}
                            parameter={row}
                            onCancel={() => setEditing(null)}
                            onSaved={() => {
                              setEditing(null);
                              router.refresh();
                            }}
                            onError={setError}
                          />
                        </li>
                      ) : (
                        <li
                          key={row.id}
                          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${selected.has(row.id) ? "bg-brand-light/30" : ""}`}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            {selecting && (
                              <input
                                id={`p-pick-${row.id}`}
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={(event) => toggle([row.id], event.target.checked)}
                                aria-label={`Sélectionner « ${row.name} »`}
                                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                              />
                            )}
                            <label htmlFor={selecting ? `p-pick-${row.id}` : undefined} className={`min-w-0 ${selecting ? "cursor-pointer" : ""}`}>
                              <span className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                                {row.name}
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${FAMILY_BADGE[row.family] ?? FAMILY_BADGE.AUTRE}`}
                                  title="Domaine"
                                >
                                  {FAMILY_LABELS[row.family] ?? row.family}
                                </span>
                                {row.alertOnExceed ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                                    <Bell className="h-3 w-3" aria-hidden="true" />
                                    alerte
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-sm text-slate-500">
                                {row.unit ?? "unité non définie"} · seuil{" "}
                                {row.threshold ?? "—"} · limite{" "}
                                {row.limitValue !== null ? (
                                  <span className="font-mono font-medium text-slate-700">
                                    {row.limitValue}
                                  </span>
                                ) : (
                                  <span className="text-amber-700">non définie</span>
                                )}
                                {row.calcFactor !== 1 && (
                                  <>
                                    {" "}
                                    · facteur{" "}
                                    <span className="font-mono font-medium text-violet-700">
                                      ×{row.calcFactor}
                                    </span>
                                  </>
                                )}
                                {row.normLabel && <> · {row.normLabel}</>}
                              </span>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setEditing(row.id);
                              setCreating(null);
                              setError("");
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Modifier
                          </button>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </Card>
            </section>
          );
        })}
      </div>

      {selecting && selected.size > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-slate-700">
              <b>{plural(selected.size, "paramètre")}</b> sélectionné{selected.size > 1 ? "s" : ""}
              {hidden > 0 && <span className="text-slate-500"> — dont {hidden} masqué{hidden > 1 ? "s" : ""} par les filtres</span>}
            </p>
            {TARGETS.map((family) => {
              const count = toMove(family);
              return (
                <button
                  key={family}
                  type="button"
                  disabled={count === 0}
                  onClick={() => {
                    setError("");
                    setNotice("");
                    setTarget(family);
                  }}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40 ${
                    family === "CHIMIE" ? "bg-brand text-white hover:bg-brand-dark" : "border border-slate-300 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  Passer en {TARGET_LABELS[family]} ({count})
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Vider la sélection
            </button>
          </div>
        </div>
      )}

      {target && (
        <ReclassifyDialog
          family={target}
          parameterIds={chosen.map((p) => p.id)}
          onClose={() => setTarget(null)}
          onDone={(applied) => {
            setTarget(null);
            setSelected(new Set());
            setNotice(
              `${plural(applied, "paramètre")} passé${applied > 1 ? "s" : ""} en « ${TARGET_LABELS[target]} » — chaque changement est inscrit au journal (« Paramètre modifié »).`
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; count: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={`Filtrer par ${label.toLowerCase()}`}>
      <p className="mb-1.5 text-xs font-medium text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active ? "border-brand bg-brand-light/60 text-brand" : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {option.label}
              <span className="text-xs font-normal text-slate-500">{option.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type PlanResponse = ReclassifyPlan & { error?: string; applied?: number };

/**
 * The confirmation of a reclassification: the server's plan first (a
 * preview, nothing written), then « Confirmer » sends only what it accepted.
 * A 409 (something refused or changed in between) shows the new plan.
 */
function ReclassifyDialog({
  family,
  parameterIds,
  onClose,
  onDone,
}: {
  family: Family;
  parameterIds: string[];
  onClose: () => void;
  onDone: (applied: number) => void;
}) {
  const [plan, setPlan] = useState<ReclassifyPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const confirm = useRef<HTMLButtonElement>(null);
  // The ids at opening: the preview runs once, whatever the parent re-renders.
  const asked = useRef(parameterIds);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/parameters/reclassify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parameterIds: asked.current, family, preview: true }),
        });
        const data = (await response.json().catch(() => ({}))) as PlanResponse;
        if (cancelled) return;
        if (!response.ok) setError(data.error ?? "La vérification a échoué.");
        else setPlan(data);
      } catch {
        if (!cancelled) setError("Une erreur réseau est survenue. Réessayez.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [family]);

  useEffect(() => {
    if (plan && plan.changes.length > 0) confirm.current?.focus();
  }, [plan]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !plan || plan.changes.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/parameters/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameterIds: plan.changes.map((change) => change.id), family }),
      });
      const data = (await response.json().catch(() => ({}))) as PlanResponse;
      if (response.ok) {
        onDone(data.applied ?? plan.changes.length);
        return;
      }
      setError(data.error ?? "Le reclassement a échoué.");
      // Refused in between: the server's new plan replaces the old one.
      if (Array.isArray(data.changes)) setPlan(data);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const label = TARGET_LABELS[family];
  const count = plan?.changes.length ?? 0;
  return (
    <Dialog
      title={`Passer en « ${label} »`}
      description="Vérifiez la liste avant de confirmer : chaque paramètre changé est inscrit au journal (« Paramètre modifié »)."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        {!plan && busy && <p className="text-sm text-slate-500">Vérification des paramètres…</p>}

        {plan && (
          <div className="space-y-4 text-sm">
            {count > 0 ? (
              <div>
                <p className="mb-2 font-medium text-slate-800">
                  {plural(count, "paramètre")} passer{count > 1 ? "ont" : "a"} en « {label} » :
                </p>
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {plan.changes.map((change) => (
                    <li key={change.id} className="px-3 py-2">
                      <p className="font-medium text-slate-800">{change.name}</p>
                      <p className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                        {SAMPLE_TYPE_LABELS[change.category]} · {TARGET_LABELS[change.from]}
                        <ArrowRight className="h-3 w-3" aria-label="devient" />
                        {TARGET_LABELS[family]}
                      </p>
                      {(change.openSamples > 0 || change.otherDomainTypes > 0) && (
                        <p className="mt-0.5 text-xs text-amber-700">
                          {change.openSamples > 0 &&
                            `Portée par ${plural(change.openSamples, "échantillon")} en cours d'un autre domaine : elle y reste.`}
                          {change.openSamples > 0 && change.otherDomainTypes > 0 && " "}
                          {change.otherDomainTypes > 0 &&
                            `Citée par ${plural(change.otherDomainTypes, "famille")} de produits d'un autre domaine.`}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  {family === "AUTRE"
                    ? "Une analyse « Autres analyses » ne se coche ni sur le protocole ni au dépôt : elle se programme sur la fiche de programme (nature « Analyse sensorielle »). Les échantillons déjà enregistrés gardent leurs analyses."
                    : `Les échantillons déjà enregistrés gardent leurs analyses (affichées « autre domaine que l'échantillon ») ; les prochains protocoles et dépôts les proposent sous « ${family === "CHIMIE" ? "Analyses physico-chimiques" : "Analyses microbiologiques"} ».`}
                </p>
              </div>
            ) : (
              <p className="text-slate-700">Aucun paramètre à reclasser.</p>
            )}

            {plan.refused.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                <p className="mb-1 font-medium">
                  {plural(plan.refused.length, "paramètre")} refusé{plan.refused.length > 1 ? "s" : ""} — non
                  reclassé{plan.refused.length > 1 ? "s" : ""} :
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {plan.refused.map((refusal) => (
                    <li key={refusal.id}>
                      <b>{refusal.name ?? refusal.id}</b> — {refusal.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.unchanged.length > 0 && (
              <p className="text-xs text-slate-500">
                {plural(plan.unchanged.length, "paramètre")} déjà en « {label} » : rien à faire.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy && !!plan}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Annuler
          </button>
          <button
            ref={confirm}
            type="submit"
            disabled={busy || count === 0}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {busy && plan ? "Reclassement…" : `Confirmer (${count})`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ParameterForm({
  category,
  parameter,
  defaultFamily = DEFAULT_PARAMETER_FAMILY,
  onCancel,
  onSaved,
  onError,
}: {
  category: SampleType;
  parameter?: ParameterRow;
  /** The family a new parameter starts with: the filter's, else microbiology. */
  defaultFamily?: Family;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(parameter?.name ?? "");
  const [family, setFamily] = useState<Family>(parameter?.family ?? defaultFamily);
  const [unit, setUnit] = useState(parameter?.unit ?? "");
  const [threshold, setThreshold] = useState(parameter?.threshold ?? "");
  const [limitValue, setLimitValue] = useState(
    parameter?.limitValue !== null && parameter?.limitValue !== undefined
      ? String(parameter.limitValue)
      : ""
  );
  const [alertOnExceed, setAlertOnExceed] = useState(parameter?.alertOnExceed ?? false);
  const [calcFactor, setCalcFactor] = useState(
    parameter && parameter.calcFactor !== 1 ? String(parameter.calcFactor) : ""
  );
  const [aliases, setAliases] = useState(parameter?.aliases ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");

    try {
      const response = await fetch(
        parameter ? `/api/parameters/${parameter.id}` : "/api/parameters",
        {
          method: parameter ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            family,
            unit,
            threshold,
            limitValue,
            alertOnExceed,
            calcFactor,
            aliases,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onSaved();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-l-4 border-brand bg-brand-light/20 px-4 py-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          id="p-name"
          label="Paramètre"
          value={name}
          onChange={setName}
          disabled={!!parameter}
          hint={parameter ? "Le nom ne se modifie pas" : undefined}
        />
        <div>
          <label htmlFor="p-family" className="block text-xs font-medium text-slate-600">
            Domaine
          </label>
          <select
            id="p-family"
            value={family}
            onChange={(event) => setFamily(event.target.value as Family)}
            className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {PARAMETER_FAMILIES.map((option) => (
              <option key={option} value={option}>
                {FAMILY_LABELS[option]}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[11px] text-slate-500">Range l&apos;analyse sur l&apos;échantillon de son domaine</p>
        </div>
        <Field id="p-unit" label="Unité" value={unit} onChange={setUnit} placeholder="UFC/g" />
        <Field
          id="p-threshold"
          label="Seuil affiché"
          value={threshold}
          onChange={setThreshold}
          placeholder="1.10² UFC/g"
          hint="Tel qu'il apparaît sur le rapport"
        />
        <Field
          id="p-limit"
          label="Limite (nombre)"
          value={limitValue}
          onChange={setLimitValue}
          placeholder="100"
          inputMode="decimal"
          hint="Sert au calcul de conformité"
        />
        <Field
          id="p-factor"
          label="Facteur de calcul"
          value={calcFactor}
          onChange={setCalcFactor}
          placeholder="1"
          inputMode="decimal"
          hint="Multiplie la lecture brute (dilution) — vide = aucune transformation"
        />
      </div>

      <div className="mt-3">
        <label htmlFor="p-aliases" className="block text-xs font-medium text-slate-600">
          Autres libellés (un par ligne)
        </label>
        <textarea
          id="p-aliases"
          value={aliases}
          onChange={(event) => setAliases(event.target.value)}
          rows={2}
          placeholder={"Recherche de Salmonella /25g\nSalmonella spp"}
          className="input-field mt-1 resize-y px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          Les orthographes du classeur des critères qui désignent ce germe — l&apos;import les reconnaît.
        </p>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
        <input
          type="checkbox"
          checked={alertOnExceed}
          onChange={(event) => setAlertOnExceed(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium text-slate-800">
            {alertOnExceed ? (
              <Bell className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            )}
            Paramètre sensible
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Un dépassement de la limite déclenche une alerte de contamination
            au client, à la validation technique ou administrative selon les
            réglages du circuit. Nécessite une limite.
          </span>
        </span>
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  inputMode?: "decimal";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-100 disabled:text-slate-500"
      />
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
