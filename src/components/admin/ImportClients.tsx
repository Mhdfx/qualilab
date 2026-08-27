"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, PlayCircle, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  CLIENT_IMPORT_FIELDS,
  FIELD_LABELS,
  type ClientImportField,
  type ImportMapping,
} from "@/lib/client-import";

/**
 * The legacy-data wizard: paste or upload the export, check the proposed
 * column mapping, read the dry-run, then — and only then — import. Built
 * before the laboratory's file exists (NEEDEDINFO item 7): whatever shape it
 * arrives in, the adaptation happens in the mapping step, not in code.
 */

type Analysis = {
  columns: string[];
  guess: ImportMapping;
  rowCount: number;
  preview: string[][];
};

type Report = {
  rowCount: number;
  toCreate: number;
  created: number;
  invalid: { line: number; error: string }[];
  duplicates: { line: number; error: string }[];
  preview: { name: string; ice: string | null; email: string | null }[];
};

export function ImportClients() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/import/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Import impossible.");
    return data;
  }

  function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Fichier trop volumineux (2 Mo maximum).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(typeof reader.result === "string" ? reader.result : "");
      setFileName(file.name);
      setAnalysis(null);
      setReport(null);
      setDone(false);
      setError("");
    };
    reader.readAsText(file);
  }

  async function analyse() {
    if (busy || !csv.trim()) return;
    setBusy(true);
    setError("");
    setReport(null);
    setDone(false);
    try {
      const data: Analysis = await call({});
      setAnalysis(data);
      setMapping(data.guess);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run(commit: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data: Report = await call({ mapping, hasHeader, commit });
      setReport(data);
      if (commit) {
        setDone(true);
        router.refresh();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <FileUp className="h-4 w-4 text-brand" aria-hidden="true" />
          1 · Le fichier
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Export CSV de l&apos;ancien système (Excel : « Enregistrer sous » →
          CSV). Séparateur point-virgule, virgule ou tabulation — détecté
          automatiquement.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand/30">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Choisir un fichier CSV
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={readFile}
              className="sr-only"
            />
          </label>
          {fileName && (
            <span className="text-sm text-slate-600">{fileName}</span>
          )}
        </div>

        <label htmlFor="csv-paste" className="mt-4 block text-sm font-medium text-slate-700">
          … ou collez le contenu ici
        </label>
        <textarea
          id="csv-paste"
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setAnalysis(null);
            setReport(null);
            setDone(false);
          }}
          rows={5}
          placeholder={"Raison sociale;ICE;Email\nRestaurant Atlas;001234567000045;chef@atlas.ma"}
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />

        <button
          type="button"
          onClick={analyse}
          disabled={busy || !csv.trim()}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {busy && !analysis ? "Analyse…" : "Analyser le fichier"}
        </button>
      </Card>

      {analysis && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            2 · La correspondance des colonnes
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {analysis.rowCount} ligne{analysis.rowCount > 1 ? "s" : ""} lue
            {analysis.rowCount > 1 ? "s" : ""}. Vérifiez ce que contient chaque
            colonne — la proposition vient des en-têtes du fichier.
          </p>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(event) => setHasHeader(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            La première ligne contient les en-têtes (pas des données)
          </label>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr>
                  {analysis.columns.map((column, index) => (
                    <th key={index} className="px-2 pb-2 text-left align-top">
                      <select
                        aria-label={`Champ pour la colonne ${column || index + 1}`}
                        value={mapping[index] ?? ""}
                        onChange={(event) =>
                          setMapping((current) => {
                            const next = [...current];
                            next[index] = event.target.value as
                              | ClientImportField
                              | "";
                            return next;
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      >
                        <option value="">— Ignorer —</option>
                        {CLIENT_IMPORT_FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {FIELD_LABELS[field]}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block truncate font-normal text-slate-500">
                        {column || `Colonne ${index + 1}`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.preview.slice(hasHeader ? 1 : 0).map((row, r) => (
                  <tr key={r} className="border-t border-slate-100">
                    {analysis.columns.map((_, c) => (
                      <td key={c} className="truncate px-2 py-1.5 text-slate-700">
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => run(false)}
            disabled={busy}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            Simuler l&apos;import (aucune écriture)
          </button>
        </Card>
      )}

      {report && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            3 · {done ? "Résultat" : "Simulation"}
          </h2>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReportStat label="Lignes lues" value={report.rowCount} />
            <ReportStat
              label={done ? "Clients créés" : "Clients à créer"}
              value={done ? report.created : report.toCreate}
              tone="ok"
            />
            <ReportStat label="Lignes invalides" value={report.invalid.length} tone={report.invalid.length ? "warn" : undefined} />
            <ReportStat label="Doublons ignorés" value={report.duplicates.length} tone={report.duplicates.length ? "warn" : undefined} />
          </dl>

          {[...report.invalid, ...report.duplicates].length > 0 && (
            <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {[...report.invalid, ...report.duplicates]
                .sort((a, b) => a.line - b.line)
                .map((item, index) => (
                  <li key={index}>
                    Ligne {item.line} : {item.error}
                  </li>
                ))}
            </ul>
          )}

          {done ? (
            <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Import terminé — {report.created} client
              {report.created > 1 ? "s" : ""} créé
              {report.created > 1 ? "s" : ""}, visibles dans l&apos;espace
              commercial. L&apos;opération est tracée au journal.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => run(true)}
              disabled={busy || report.toCreate === 0}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {busy
                ? "Import…"
                : `Importer ${report.toCreate} client${report.toCreate > 1 ? "s" : ""}`}
            </button>
          )}
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ReportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>
        {value}
      </dd>
    </div>
  );
}
