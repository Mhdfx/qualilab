"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, PlayCircle, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The client memory — what the designation corrector proposes
 * (RETOUR-LABO-29-09.md, slice A). Two sources: the samples already in the
 * database, or the old software's export. Analyse first, then import.
 */

type Summary = {
  mode: "analyse" | "commit";
  source: "samples" | "csv";
  rows: number;
  clients: number;
  unmatched: { client: string; count: number }[];
  unmatchedCount: number;
  products: { total: number; new: number };
  places: { total: number; new: number };
};

export function ImportMemoire() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(source: "samples" | "csv", mode: "analyse" | "commit") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/import/memoire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, mode, csv: source === "csv" ? csv : undefined }),
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

  function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(typeof reader.result === "string" ? reader.result : "");
      setFileName(file.name);
      setSummary(null);
      setError("");
    };
    reader.readAsText(file);
  }

  const done = summary?.mode === "commit";

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Database className="h-4 w-4 text-brand" aria-hidden="true" />
          Mémoire des clients — désignations et lieux
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          C&apos;est ce que le correcteur propose sur le terrain (« Vouliez-vous dire … ? »). Elle se remplit
          d&apos;elle-même avec chaque visite ; chargez-la ici pour qu&apos;elle soit utile dès le premier jour.
          Rien n&apos;est écrit avant « Importer », et relancer ne crée aucun doublon.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Depuis les échantillons du logiciel</p>
            <p className="mt-1 text-xs text-slate-500">Toutes les désignations et tous les lieux déjà saisis, client par client.</p>
            <button
              type="button"
              onClick={() => call("samples", "analyse")}
              disabled={busy}
              className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              Analyser
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Depuis l&apos;ancien logiciel (CSV)</p>
            <p className="mt-1 text-xs text-slate-500">
              Une ligne par échantillon, avec au moins les colonnes « Client » (nom ou ICE) et « Désignation »
              (ou « NOM_PRODUIT ») ; « Lieu » est facultatif.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Choisir le fichier
                <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} className="sr-only" />
              </label>
              {fileName && <span className="text-xs text-slate-600">{fileName}</span>}
              <button
                type="button"
                onClick={() => call("csv", "analyse")}
                disabled={busy || !csv}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
              >
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                Analyser
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </Card>

      {summary && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {done ? "Mémoire importée" : summary.source === "csv" ? "Ce que contient le fichier" : "Ce que contiennent les échantillons"}
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
            <Stat label="Clients" value={summary.clients} />
            <Stat label="Désignations" value={summary.products.total} hint={`${summary.products.new} nouvelle${summary.products.new > 1 ? "s" : ""}`} />
            <Stat label="Lieux" value={summary.places.total} hint={`${summary.places.new} nouveau${summary.places.new > 1 ? "x" : ""}`} />
          </dl>
          {summary.unmatchedCount > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-800">
                Clients du fichier introuvables dans le logiciel ({summary.unmatchedCount}) — leurs lignes sont ignorées
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {summary.unmatched.map((u) => (
                  <li key={u.client} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                    {u.client} <span className="text-amber-600">×{u.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-500">Importez d&apos;abord ces clients (ci-dessous), puis relancez.</p>
            </div>
          )}
          {!done && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => call(summary.source, "commit")}
                disabled={busy || (summary.products.new === 0 && summary.places.new === 0 && summary.clients === 0)}
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
