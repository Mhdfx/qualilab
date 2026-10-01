"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, PlayCircle, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The old software's catalogue — regulations, product types, criteria —
 * from the CSV files of `scripts/legacy/extract-legacy.py`
 * (RETOUR-LABO-30-09.md, slice J). Analyse first, then import.
 */

type Summary = {
  mode: "analyse" | "commit";
  regulations: { total: number; new: number; withoutText: number };
  types: { total: number; distinct: number; workbook: number; legacyExisting: number; toCreate: number; inactive: number };
  criteria: {
    rows: number;
    usable: number;
    missingC: number;
    skipped: { reason: string; count: number }[];
    unmatchedParameters: { label: string; count: number }[];
    unmatchedRows: number;
  };
  norms: number;
  created?: { regulations: number; productTypes: number; parameters: number; norms: number; versions: number; criteria: number; linked: number };
};

const FILES = [
  { key: "regulations", label: "regulations.csv", hint: "les 176 sources réglementaires" },
  { key: "types", label: "types.csv", hint: "les 634 types de produits" },
  { key: "criteria", label: "criteria.csv", hint: "leurs critères, une ligne par type × paramètre" },
] as const;
type FileKey = (typeof FILES)[number]["key"];

export function ImportLegacy() {
  const router = useRouter();
  const [texts, setTexts] = useState<Partial<Record<FileKey, string>>>({});
  const [names, setNames] = useState<Partial<Record<FileKey, string>>>({});
  const [createMissing, setCreateMissing] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = FILES.every((f) => texts[f.key]);

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

  async function call(mode: "analyse" | "commit") {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/import/legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...texts, mode, createMissing }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import impossible.");
      setSummary(data);
      if (mode === "commit") router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const done = summary?.mode === "commit";

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Database className="h-4 w-4 text-brand" aria-hidden="true" />
          Catalogue de l&apos;ancien logiciel — réglementations, types de produits, critères
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Les trois fichiers écrits par <code className="font-mono text-xs">scripts/legacy/extract-legacy.py</code>. Un type déjà
          présent dans le classeur de septembre garde ses critères de septembre et reçoit sa réglementation ; un type que seul
          l&apos;ancien logiciel connaît est créé avec ses critères, inactif s&apos;il n&apos;a pas servi depuis 2025. Rien n&apos;est écrit
          avant « Importer » ; relancer ne crée aucun doublon. La mémoire des désignations (memory.csv) s&apos;importe dans la section
          « Mémoire des clients » ci-dessus.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {FILES.map((f) => (
            <div key={f.key} className="rounded-xl border border-slate-200 p-3">
              <p className="font-mono text-sm font-semibold text-slate-800">{f.label}</p>
              <p className="text-xs text-slate-500">{f.hint}</p>
              <label className="mt-2 inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {names[f.key] ? "Remplacer" : "Choisir"}
                <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(f.key, e)} className="sr-only" />
              </label>
              {names[f.key] && <p className="mt-1 truncate text-xs text-emerald-700">{names[f.key]}</p>}
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
          <span>
            Créer les paramètres inconnus du catalogue (catégorie « alimentaire ») — sinon leurs critères sont listés et ignorés.
          </span>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => call("analyse")}
            disabled={busy || !ready}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {busy && !summary ? "Analyse…" : "Analyser"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </Card>

      {summary && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{done ? "Catalogue importé" : "Ce que contiennent les fichiers"}</h2>
            {done && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Terminé
              </span>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Réglementations" value={summary.regulations.total} hint={`${summary.regulations.new} nouvelle${summary.regulations.new > 1 ? "s" : ""} · ${summary.regulations.withoutText} sans texte`} />
            <Stat label="Types de produits" value={summary.types.distinct} hint={`${summary.types.workbook} du classeur · ${summary.types.toCreate} à créer (${summary.types.inactive} inactifs)`} />
            <Stat label="Critères" value={summary.criteria.usable} hint={`sur ${summary.criteria.rows} lignes · ${summary.criteria.missingC} sans c`} />
            <Stat label="Normes" value={summary.norms} hint="versions reconnues" />
          </dl>
          {summary.created && (
            <p className="mt-3 text-sm text-slate-700">
              Écrit : {summary.created.regulations} réglementations, {summary.created.productTypes} types, {summary.created.criteria} critères,
              {" "}{summary.created.norms} normes / {summary.created.versions} versions, {summary.created.parameters} paramètres,
              {" "}{summary.created.linked} types du classeur reliés à leur réglementation.
            </p>
          )}
          {summary.criteria.skipped.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Lignes non importées : {summary.criteria.skipped.map((s) => `${s.reason} (${s.count})`).join(" · ")}
            </p>
          )}
          {summary.criteria.unmatchedParameters.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-800">
                Paramètres inconnus du catalogue ({summary.criteria.unmatchedParameters.length}, {summary.criteria.unmatchedRows} critères)
              </p>
              <ul className="mt-1.5 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {summary.criteria.unmatchedParameters.map((u) => (
                  <li key={u.label} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                    {u.label} <span className="text-amber-600">×{u.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!done && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => call("commit")}
                disabled={busy}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {busy ? "Import…" : "Importer"}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
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
