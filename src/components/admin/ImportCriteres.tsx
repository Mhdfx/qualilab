"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, PlayCircle, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The criteria workbook (CRITERES.md §5): choose the .xlsx, read what it
 * contains, then import. Idempotent — running it twice updates in place.
 */

type Summary = {
  mode: "analyse" | "commit";
  rows: number;
  refused: { line: number; productType: string; reason: string }[];
  productTypes: { total: number; existing: number; toCreate: number };
  parameters: { matched: number; unmatched: { label: string; count: number }[] };
  norms: number;
  criteria: { usable: number; refusedUnknownParameter: number; existing: number; duplicates: number };
  duplicates: { line: number; productType: string; parameterLabel: string }[];
  created?: { productTypes: number; parameters: number; norms: number; versions: number; criteria: number; updated: number };
};

export function ImportCriteres() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(mode: "analyse" | "commit", missing = createMissing) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      form.append("createMissing", missing ? "1" : "0");
      const response = await fetch("/api/admin/import/criteres", { method: "POST", body: form });
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

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    setFile(chosen);
    setSummary(null);
    setError("");
  }

  const done = summary?.mode === "commit";

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <FileSpreadsheet className="h-4 w-4 text-brand" aria-hidden="true" />
          Critères d&apos;interprétation — le classeur
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Le classeur Excel du laboratoire : un bloc par type de produit (micro-organismes, norme, n, c, m, M). Les types, les normes et les critères sont créés ou mis à jour ; rien n&apos;est écrit avant « Importer ».
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand/30">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Choisir le classeur .xlsx
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} className="sr-only" />
          </label>
          {file && <span className="text-sm text-slate-600">{file.name}</span>}
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={createMissing}
              onChange={(e) => {
                setCreateMissing(e.target.checked);
                if (summary && !done) void call("analyse", e.target.checked);
              }}
              className="h-4 w-4 accent-brand"
            />
            Créer les germes inconnus comme paramètres
          </label>
          <button
            type="button"
            onClick={() => call("analyse")}
            disabled={!file || busy}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {busy && !summary ? "Lecture…" : "Analyser"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </Card>

      {summary && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {done ? "Import effectué" : "Ce que contient le classeur"}
            </h2>
            {done && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Terminé
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Lignes lues" value={summary.rows} />
            <Stat label="Types de produits" value={summary.productTypes.total} hint={`${summary.productTypes.toCreate} à créer · ${summary.productTypes.existing} connus`} />
            <Stat label="Normes (versions)" value={summary.norms} />
            <Stat label="Critères importables" value={summary.criteria.usable} hint={summary.criteria.refusedUnknownParameter > 0 ? `${summary.criteria.refusedUnknownParameter} sans germe connu` : `catalogue actuel : ${summary.criteria.existing} critère${summary.criteria.existing > 1 ? "s" : ""}`} />
          </dl>

          {summary.created && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Créés : {summary.created.productTypes} type{summary.created.productTypes > 1 ? "s" : ""}, {summary.created.parameters} paramètre{summary.created.parameters > 1 ? "s" : ""}, {summary.created.norms} norme{summary.created.norms > 1 ? "s" : ""} ({summary.created.versions} version{summary.created.versions > 1 ? "s" : ""}), {summary.created.criteria} critère{summary.created.criteria > 1 ? "s" : ""} · {summary.created.updated} mis à jour.
            </p>
          )}

          {summary.parameters.unmatched.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-800">
                Germes absents des paramètres ({summary.parameters.unmatched.length})
                {createMissing && !done && <span className="ml-2 font-normal text-slate-500">— seront créés en microbiologie alimentaire</span>}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {summary.parameters.unmatched.map((u) => (
                  <li key={u.label} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                    {u.label} <span className="text-amber-600">×{u.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.duplicates.length > 0 && (
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {summary.duplicates.length} ligne{summary.duplicates.length > 1 ? "s" : ""} en double (même type, même germe, même version de norme) — la première lue est gardée :{" "}
              {summary.duplicates.slice(0, 8).map((d) => `L${d.line} ${d.parameterLabel}`).join(" · ")}
              {summary.duplicates.length > 8 ? " …" : ""}
            </p>
          )}

          {summary.refused.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-800">Lignes non lues ({summary.refused.length})</p>
              <div className="mt-1.5 max-h-56 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <tbody>
                    {summary.refused.map((r) => (
                      <tr key={`${r.line}-${r.reason}`} className="border-b border-slate-100">
                        <td className="px-2 py-1 font-mono text-slate-500">L{r.line}</td>
                        <td className="px-2 py-1 text-slate-700">{r.productType}</td>
                        <td className="px-2 py-1 text-slate-600">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!done && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => call("commit")}
                disabled={busy || summary.criteria.usable === 0}
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
