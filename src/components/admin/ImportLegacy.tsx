"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Database, PlayCircle, Upload } from "lucide-react";
import type { Family, SampleType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/invoices/InvoiceDialogs";
import { FAMILY_SHORT_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import type { InFlightImpact, RetiredLeftActive } from "@/lib/legacy-catalogue";

/**
 * The old software's catalogue — regulations, product families, criteria —
 * from the CSV files of `scripts/legacy/extract-legacy.py`
 * (RETOUR-LABO-30-09.md, slice J), with the reprise of 16/10
 * (RETOUR-LABO-16-10.md F3): each family's type d'analyse, the criteria of
 * hands, surface, water and air families moved onto their own parameters,
 * the empty families filled, and (f) the rows the old software had deleted
 * from a family's grid (OBSOLETE = 2) deactivated. Analyse first, then import.
 *
 * The import changes the criteria the bench reads live: the analysis counts
 * the samples in progress whose verdicts change, lists the parameters to
 * create that look like existing ones, and « Importer » opens a
 * confirmation that names both. The commit carries the analysis's
 * fingerprint: a catalogue changed since (another tab, another admin) is
 * refused, nothing written, and asks for a new analysis.
 */

type Summary = {
  mode: "analyse" | "commit";
  planHash?: string;
  regulations: { total: number; new: number; matched: number; withoutText: number };
  types: { total: number; distinct: number; workbook: number; legacyExisting: number; toCreate: number; inactive: number };
  criteria: {
    rows: number;
    usable: number;
    missingC: number;
    skipped: { reason: string; count: number }[];
    unmatchedParameters: { label: string; category: SampleType; count: number; created: boolean }[];
    unmatchedRows: number;
    toInsert: number;
    alreadyPresent: number;
  };
  norms: number;
  normsToCreate: number;
  reprise: {
    natures: {
      assigned: number;
      created: number;
      familyChanged: number;
      unknown: { name: string; values: string }[];
      conflicts: { name: string; domain: Family; nature: string }[];
      unclassified: { name: string; active: boolean }[];
    };
    rebinding: { families: number; copies: number; deactivated: number; collisions: { family: string; parameter: string; target: string }[] };
    parameters: {
      name: string;
      category: SampleType;
      domain: Family;
      unit: string | null;
      reason: "rattachement" | "ancien logiciel";
      alert: boolean;
      priced: boolean;
      similar: string[];
    }[];
    nearDuplicates: number;
    fill: { families: number; criteria: number };
    stillEmpty: { active: { name: string; nature: string | null; lastUse: string | null }[]; inactive: number };
    links: number;
    handEdited: { id: string; name: string; criteria: number; regulation: boolean }[];
    orphanedSources: { name: string; category: SampleType }[];
    inFlight: InFlightImpact;
    tolerances: { rows: number; families: number };
    retired: { rows: number; families: number; leftActive: RetiredLeftActive[] };
  };
  created?: {
    regulations: number;
    regulationsMatched: number;
    productTypes: number;
    parameters: number;
    norms: number;
    versions: number;
    criteria: number;
    linked: number;
    natures: number;
    families: number;
    retired: number;
    copies: number;
    deactivated: number;
    tolerancesCleared: number;
  };
};

const FILES = [
  { key: "regulations", label: "regulations.csv", hint: "les 176 sources réglementaires" },
  { key: "types", label: "types.csv", hint: "les 634 familles de produits et leur type d'analyse" },
  { key: "criteria", label: "criteria.csv", hint: "leurs critères, une ligne par famille × paramètre" },
] as const;
type FileKey = (typeof FILES)[number]["key"];

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** What a validation wrote, in one sentence. */
function writtenSentence(c: NonNullable<Summary["created"]>): string {
  return (
    `Écrit : ${c.regulations} réglementations (${c.regulationsMatched} reconnues par leur titre), ${c.productTypes} familles, ${c.criteria} critères, ` +
    `${c.norms} normes / ${c.versions} versions, ${c.parameters} paramètres, ` +
    `${c.linked} familles reliées à leur réglementation, ${c.natures} types d'analyse, ` +
    `${c.copies} critères rattachés (${c.deactivated} anciens désactivés), ${c.families} familles vides remplies` +
    `${c.retired ? `, ${plural(c.retired, "ligne supprimée", "lignes supprimées")} dans l'ancien logiciel désactivée${c.retired > 1 ? "s" : ""}` : ""}` +
    `${c.tolerancesCleared ? `, ${c.tolerancesCleared} tolérances c sans objet effacées` : ""}.`
  );
}

/** The statuses of the samples in progress, as « 2 programmés » reads (one, many). */
const IN_FLIGHT_WORDS: Record<InFlightImpact["byStatus"][number]["status"], [string, string]> = {
  RECU: ["reçu", "reçus"],
  PROGRAMME: ["programmé", "programmés"],
  EN_ANALYSE: ["en analyse", "en analyse"],
  RESULTATS_SAISIS: ["aux résultats saisis", "aux résultats saisis"],
};

/** « 2 en analyse, 1 programmé » — the samples in progress, by status. */
function inFlightSentence(impact: InFlightImpact, key: "startJudged" | "loseCriteria" | "retired"): string {
  return impact.byStatus
    .filter((s) => s[key] > 0)
    .map((s) => `${s[key]} ${IN_FLIGHT_WORDS[s.status][s[key] > 1 ? 1 : 0]}`)
    .join(", ");
}

export function ImportLegacy() {
  const router = useRouter();
  const [texts, setTexts] = useState<Partial<Record<FileKey, string>>>({});
  const [names, setNames] = useState<Partial<Record<FileKey, string>>>({});
  const [createMissing, setCreateMissing] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const ready = FILES.every((f) => texts[f.key]);

  // Each answer (analysis or import) takes the focus, so it is read out.
  useEffect(() => {
    if (summary) resultRef.current?.focus();
  }, [summary]);

  function readFile(key: FileKey, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTexts((t) => ({ ...t, [key]: typeof reader.result === "string" ? reader.result : "" }));
      setNames((n) => ({ ...n, [key]: file.name }));
      setSummary(null);
      setError("");
    };
    reader.readAsText(file);
  }

  /** Throws the server's sentence on a refusal, for the caller to show where it belongs. */
  async function call(mode: "analyse" | "commit", confirm: { inFlight: boolean; similar: boolean } = { inFlight: false, similar: false }) {
    const response = await fetch("/api/admin/import/legacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...texts,
        mode,
        createMissing,
        ...(mode === "commit"
          ? { planHash: summary?.planHash ?? null, confirmInFlight: confirm.inFlight, confirmSimilar: confirm.similar }
          : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Import impossible.");
    setSummary(data);
    if (mode === "commit") router.refresh();
  }

  async function analyse() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      await call("analyse");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const done = summary?.mode === "commit";
  const reprise = summary?.reprise;
  const inFlight = reprise?.inFlight;
  const toCreate = (n: number, past: string, future: string) => `${n} ${done ? past : future}`;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Database className="h-4 w-4 text-brand" aria-hidden="true" />
          Catalogue de l&apos;ancien logiciel — réglementations, familles de produits, critères
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Les trois fichiers écrits par <code className="font-mono text-xs">scripts/legacy/extract-legacy.py</code>. Une famille déjà
          présente dans le classeur de septembre garde ses critères de septembre et reçoit sa réglementation — sauf si elle n&apos;a
          aucun critère actif : elle reçoit alors ceux de l&apos;ancien logiciel. Une famille que seul l&apos;ancien logiciel connaît est
          créée avec ses critères, inactive si elle n&apos;a pas servi depuis 2025. Chaque famille reçoit le type d&apos;analyse de
          l&apos;ancien logiciel quand elle n&apos;en a pas ; les critères des familles mains, surfaces, eaux et air rattachés à un paramètre
          d&apos;une autre catégorie sont copiés sur le paramètre de leur catégorie, l&apos;ancien critère désactivé. Une ligne que
          l&apos;ancien logiciel a supprimée de la grille d&apos;une famille n&apos;est jamais importée, et celles qu&apos;un import précédent a
          apportées sont désactivées — jamais supprimées. Une famille dont les critères ou la réglementation ont été modifiés à la
          main les garde. Rien n&apos;est écrit avant « Importer » ; relancer ne crée aucun doublon. La mémoire des désignations
          (memory.csv) s&apos;importe dans la section « Mémoire des clients » ci-dessus.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {FILES.map((f) => (
            <div key={f.key} className="rounded-xl border border-slate-200 p-3">
              <p className="font-mono text-sm font-semibold text-slate-800">{f.label}</p>
              <p className="text-xs text-slate-500">{f.hint}</p>
              <label className="mt-2 inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {names[f.key] ? "Remplacer" : "Choisir"}
                <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(f.key, e)} className="sr-only" />
              </label>
              {names[f.key] && <p className="mt-1 truncate text-xs text-emerald-700">{names[f.key]}</p>}
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={createMissing}
            onChange={(e) => {
              setCreateMissing(e.target.checked);
              setSummary(null);
            }}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            Créer les paramètres inconnus du catalogue, dans la catégorie et le domaine du type d&apos;analyse de leur famille — sinon
            leurs critères sont listés et ignorés.
          </span>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={analyse}
            disabled={busy || !ready}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {busy && !summary ? "Analyse…" : "Analyser"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </Card>

      {summary && reprise && inFlight && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 ref={resultRef} tabIndex={-1} className="text-sm font-semibold uppercase tracking-wide text-slate-500 focus:outline-none">
              {done ? "Catalogue importé" : "Ce que contiennent les fichiers"}
            </h2>
            {done && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Terminé
              </span>
            )}
          </div>
          <p role="status" className="mt-2 text-sm text-slate-700">
            {done && summary.created ? writtenSentence(summary.created) : "Analyse terminée : rien n'est encore écrit."}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Réglementations"
              value={summary.regulations.total}
              hint={`${toCreate(summary.regulations.new, "créées", "à créer")} · ${summary.regulations.withoutText} sans texte · ${toCreate(reprise.links, "familles reliées", "familles à relier")}`}
            />
            <Stat
              label="Familles de produits"
              value={summary.types.distinct}
              hint={`${summary.types.workbook} du classeur · ${toCreate(summary.types.toCreate, "créées", "à créer")} (${summary.types.inactive} inactives)`}
            />
            <Stat
              label="Critères"
              value={summary.criteria.usable}
              hint={`sur ${summary.criteria.rows} lignes · ${toCreate(summary.criteria.toInsert, "ajoutés", "à ajouter")} · ${summary.criteria.missingC} sans c`}
            />
            <Stat label="Normes" value={summary.norms} hint={`versions reconnues · ${toCreate(summary.normsToCreate, "créées", "à créer")}`} />
          </dl>

          <h3 className="mt-6 text-sm font-semibold text-slate-800">
            Reprise du 16/10 — types d&apos;analyse, rattachements, familles vides, lignes supprimées
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Types d'analyse"
              value={reprise.natures.assigned + reprise.natures.created}
              hint={`${reprise.natures.assigned} familles existantes (${reprise.natures.familyChanged} changent de domaine) · ${reprise.natures.created} nouvelles`}
            />
            <Stat
              label="Critères rattachés"
              value={reprise.rebinding.copies}
              hint={`${plural(reprise.rebinding.families, "famille", "familles")} · ${reprise.rebinding.deactivated} anciens ${done ? "désactivés" : "à désactiver"} · ${plural(reprise.rebinding.collisions.length, "collision", "collisions")}`}
            />
            <Stat label="Familles remplies" value={reprise.fill.families} hint={`${reprise.fill.criteria} critères de l'ancien logiciel`} />
            <Stat label="Familles encore vides" value={reprise.stillEmpty.active.length} hint={`actives · ${reprise.stillEmpty.inactive} inactives`} />
          </dl>
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-semibold">Lignes supprimées dans l&apos;ancien logiciel :</span>{" "}
            {`${reprise.retired.rows} ${done ? (reprise.retired.rows > 1 ? "désactivées" : "désactivée") : "à désactiver"}`}
            {reprise.retired.rows > 0 &&
              ` dans ${plural(reprise.retired.families, "famille", "familles")} (jamais supprimées : les échantillons déjà enregistrés gardent leurs analyses)`}
            {reprise.retired.leftActive.length > 0 &&
              ` · ${plural(reprise.retired.leftActive.length, "famille laissée telle quelle", "familles laissées telles quelles")} (grille modifiée à la main ou scindée, voir plus bas)`}
            .
          </p>
          {reprise.tolerances.rows > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {`Tolérance c sans objet (critère d'absence, ou sans limite) laissée par un import précédent : ${plural(reprise.tolerances.rows, "ligne", "lignes")} dans ${plural(reprise.tolerances.families, "famille", "familles")}, ${done ? "c effacé" : "c sera effacé"} — aucun verdict ne change, la grille s'enregistre telle qu'elle s'affiche.`}
            </p>
          )}

          {summary.criteria.skipped.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Lignes non importées : {summary.criteria.skipped.map((s) => `${s.reason} (${s.count})`).join(" · ")}
              {summary.criteria.alreadyPresent > 0 && ` · déjà présentes (${summary.criteria.alreadyPresent})`}
            </p>
          )}

          {summary.criteria.unmatchedParameters.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-800">
                Paramètres inconnus du catalogue ({summary.criteria.unmatchedParameters.length}, {summary.criteria.unmatchedRows} critères)
              </p>
              <ul className="mt-1.5 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {summary.criteria.unmatchedParameters.map((u, i) => (
                  <li key={`${u.category}|${u.label}|${i}`} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                    {u.label} <span className="text-amber-700">· {SAMPLE_TYPE_LABELS[u.category]} ×{u.count}{u.created ? (done ? " · créé" : " · à créer") : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <Details title={done ? "Paramètres créés" : "Paramètres à créer"} count={reprise.parameters.length}>
              {reprise.parameters.map((p, i) => (
                <li key={`${p.category}|${p.name}|${i}`}>
                  <span className="font-medium text-slate-800">{p.name}</span> · {SAMPLE_TYPE_LABELS[p.category]} · {FAMILY_SHORT_LABELS[p.domain]}
                  {p.unit ? ` · ${p.unit}` : " · sans unité (celle de chaque critère)"}
                  {p.alert ? " · alerte de contamination" : ""}
                  {!p.priced && <span className="font-medium text-amber-800"> · sans prix</span>}
                  <span className="text-slate-500"> — {p.reason === "rattachement" ? "pour un rattachement" : "germe de l'ancien logiciel"}</span>
                  {p.similar.length > 0 && (
                    <span className="block text-amber-800">
                      {`Ressemble à ${p.similar.map((name) => `« ${name} »`).join(", ")} : ajoutez « ${p.name} » en alias dans « Paramètres » si c'est le même germe.`}
                    </span>
                  )}
                </li>
              ))}
            </Details>
            <Details title="Collisions — critères laissés tels quels" count={reprise.rebinding.collisions.length}>
              {reprise.rebinding.collisions.map((c, i) => (
                <li key={`${c.family}|${c.parameter}|${i}`}>
                  <span className="font-medium text-slate-800">{c.family}</span> : « {c.parameter} » — la famille a déjà « {c.target} » dans sa
                  catégorie
                </li>
              ))}
            </Details>
            <Details title="Familles modifiées à la main — non reprises" count={reprise.handEdited.length}>
              {reprise.handEdited.map((f) => (
                <li key={f.id}>
                  <span className="font-medium text-slate-800">{f.name}</span> :{" "}
                  {[
                    f.criteria > 0 ? `${plural(f.criteria, "critère", "critères")} de l'ancien logiciel non repris` : null,
                    f.regulation ? "réglementation laissée telle quelle" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </li>
              ))}
            </Details>
            <Details
              title="Lignes supprimées dans l'ancien logiciel laissées actives — à décocher dans « Familles & critères »"
              count={reprise.retired.leftActive.length}
            >
              {reprise.retired.leftActive.map((f) => (
                <li key={f.id}>
                  <span className="font-medium text-slate-800">{f.name}</span> : {plural(f.rows, "ligne", "lignes")}
                  <span className="text-slate-500">
                    {" — "}
                    {f.origin === "main" ? "grille modifiée à la main (une scission compte)" : "famille créée par « Scinder par domaine »"}
                  </span>
                </li>
              ))}
            </Details>
            <Details title="Paramètres alimentaires sans critère actif après rattachement — à revoir dans « Paramètres »" count={reprise.orphanedSources.length}>
              {reprise.orphanedSources.map((p, i) => (
                <li key={`${p.category}|${p.name}|${i}`}>
                  <span className="font-medium text-slate-800">{p.name}</span> · {SAMPLE_TYPE_LABELS[p.category]}
                </li>
              ))}
            </Details>
            <Details title="Domaine choisi à la main, différent du type d'analyse de l'ancien logiciel" count={reprise.natures.conflicts.length}>
              {reprise.natures.conflicts.map((c, i) => (
                <li key={`${c.name}|${i}`}>
                  <span className="font-medium text-slate-800">{c.name}</span> : {FAMILY_SHORT_LABELS[c.domain]} ≠ {c.nature}
                </li>
              ))}
            </Details>
            <Details title="Type d'analyse inconnu dans l'ancien logiciel" count={reprise.natures.unknown.length}>
              {reprise.natures.unknown.map((u, i) => (
                <li key={`${u.name}|${i}`}>
                  <span className="font-medium text-slate-800">{u.name}</span> (valeur {u.values})
                </li>
              ))}
            </Details>
            <Details title="Familles sans correspondance dans l'ancien logiciel — type d'analyse à préciser" count={reprise.natures.unclassified.length}>
              {reprise.natures.unclassified.map((u, i) => (
                <li key={`${u.name}|${i}`}>
                  <span className="font-medium text-slate-800">{u.name}</span>
                  {!u.active && <span className="text-slate-500"> (inactive)</span>}
                </li>
              ))}
            </Details>
            <Details title="Familles actives encore sans critère" count={reprise.stillEmpty.active.length}>
              {reprise.stillEmpty.active.map((f, i) => (
                <li key={`${f.name}|${i}`}>
                  <span className="font-medium text-slate-800">{f.name}</span> · {f.nature ?? "type d'analyse à préciser"}
                  {f.lastUse && <span className="text-slate-500"> · dernière utilisation {f.lastUse.split("-").reverse().join("/")}</span>}
                </li>
              ))}
            </Details>
          </div>

          {!done && (
            <>
              <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p>
                    Les critères des familles mains, surfaces, eaux et air s&apos;appliquent dès l&apos;import, y compris aux échantillons
                    déjà à la paillasse : lancez-le quand aucun de ces échantillons n&apos;est en cours (tag et sauvegarde de la base avant,
                    en production).
                  </p>
                  <p className="font-medium">
                    {inFlight.startJudged + inFlight.loseCriteria + inFlight.retired === 0
                      ? "Aucun échantillon en cours n'est concerné."
                      : [
                          inFlight.startJudged > 0
                            ? `${plural(inFlight.startJudged, "échantillon en cours commence", "échantillons en cours commencent")} à être jugé${inFlight.startJudged > 1 ? "s" : ""} (${inFlightSentence(inFlight, "startJudged")})`
                            : null,
                          inFlight.loseCriteria > 0
                            ? `${plural(inFlight.loseCriteria, "échantillon d'une autre catégorie perd", "échantillons d'une autre catégorie perdent")} ses critères (${inFlightSentence(inFlight, "loseCriteria")})`
                            : null,
                          inFlight.retired > 0
                            ? `${plural(inFlight.retired, "échantillon en cours n'est plus jugé", "échantillons en cours ne sont plus jugés")} sur les lignes supprimées dans l'ancien logiciel (${inFlightSentence(inFlight, "retired")})`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ; ") + "."}
                  </p>
                  {reprise.nearDuplicates > 0 && (
                    <p className="font-medium">
                      {plural(reprise.nearDuplicates, "paramètre à créer ressemble", "paramètres à créer ressemblent")} à un paramètre existant
                      (voir « Paramètres à créer »).
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  aria-haspopup="dialog"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Importer…
                </button>
              </div>
            </>
          )}
        </Card>
      )}

      {confirming && summary && reprise && inFlight && (
        <ConfirmImport
          inFlight={inFlight}
          similar={reprise.parameters.filter((p) => p.similar.length > 0)}
          onClose={() => setConfirming(false)}
          onConfirm={async (confirm) => {
            setBusy(true);
            setError("");
            try {
              await call("commit", confirm);
              setConfirming(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * The confirmation of « Importer »: what changes at the bench, and the
 * look-alike parameters — each one needs its box ticked before the import.
 */
function ConfirmImport({
  inFlight,
  similar,
  onClose,
  onConfirm,
}: {
  inFlight: InFlightImpact;
  similar: Summary["reprise"]["parameters"];
  onClose: () => void;
  onConfirm: (confirm: { inFlight: boolean; similar: boolean }) => Promise<void>;
}) {
  const affected = inFlight.startJudged + inFlight.loseCriteria + inFlight.retired;
  const [inFlightRead, setInFlightRead] = useState(affected === 0);
  const [similarRead, setSimilarRead] = useState(similar.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !inFlightRead || !similarRead) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ inFlight: affected > 0, similar: similar.length > 0 });
    } catch (cause) {
      setError((cause as Error).message || "Import impossible.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Importer le catalogue de l'ancien logiciel"
      description="L'import écrit le plan analysé en une seule fois. Les critères s'appliquent aussitôt aux échantillons à la paillasse."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4 text-sm text-slate-700">
        {affected === 0 ? (
          <p>Aucun échantillon en cours (reçu, programmé, en analyse ou résultats saisis) n&apos;est concerné.</p>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <p className="font-semibold">{plural(affected, "échantillon en cours change", "échantillons en cours changent")} de verdict :</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {inFlight.startJudged > 0 && (
                <li>
                  {inFlight.startJudged > 1
                    ? `${inFlight.startJudged} commencent à être jugés par les critères de leur famille`
                    : "1 commence à être jugé par les critères de sa famille"}
                  {` (${inFlightSentence(inFlight, "startJudged")}) — les résultats déjà saisis n'en portent pas ;`}
                </li>
              )}
              {inFlight.loseCriteria > 0 && (
                <li>
                  {inFlight.loseCriteria > 1
                    ? `${inFlight.loseCriteria} d'une autre catégorie perdent leurs critères`
                    : "1 d'une autre catégorie perd ses critères"}
                  {`, désactivés par le rattachement (${inFlightSentence(inFlight, "loseCriteria")})${inFlight.retired > 0 ? " ;" : "."}`}
                </li>
              )}
              {inFlight.retired > 0 && (
                <li>
                  {inFlight.retired > 1
                    ? `${inFlight.retired} ne sont plus jugés sur les lignes que l'ancien logiciel avait supprimées de leur famille`
                    : "1 n'est plus jugé sur les lignes que l'ancien logiciel avait supprimées de sa famille"}
                  {` — la ligne en service du même germe s'applique, ou aucune (${inFlightSentence(inFlight, "retired")}).`}
                </li>
              )}
            </ul>
            <label className="mt-2 flex items-start gap-2 font-medium">
              <input type="checkbox" checked={inFlightRead} onChange={(e) => setInFlightRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
              <span>J&apos;ai vérifié ces échantillons avec la paillasse : importer quand même.</span>
            </label>
          </div>
        )}
        {similar.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <p className="font-semibold">{plural(similar.length, "paramètre à créer ressemble", "paramètres à créer ressemblent")} à un paramètre existant :</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {similar.map((p, i) => (
                <li key={`${p.category}|${p.name}|${i}`}>
                  « {p.name} » ({SAMPLE_TYPE_LABELS[p.category]}) — {p.similar.map((name) => `« ${name} »`).join(", ")}
                </li>
              ))}
            </ul>
            <p className="mt-1">
              Si c&apos;est le même germe, fermez, ajoutez le nom en alias dans « Paramètres » et relancez l&apos;analyse : il ne sera pas créé.
            </p>
            <label className="mt-2 flex items-start gap-2 font-medium">
              <input type="checkbox" checked={similarRead} onChange={(e) => setSimilarRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
              <span>Ce sont des germes distincts : les créer.</span>
            </label>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !inFlightRead || !similarRead}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {busy ? "Import…" : "Importer"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Fermer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
      {hint && <dd className="text-xs text-slate-500">{hint}</dd>}
    </div>
  );
}

/** A list the admin opens when it matters; nothing shown when empty. */
function Details({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <details className="rounded-xl border border-slate-200 px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        {title} ({count})
      </summary>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600">{children}</ul>
    </details>
  );
}
