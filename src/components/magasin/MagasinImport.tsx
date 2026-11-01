"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/labels";

/**
 * One import of the magasin (lot 3D, M8): choose the workbook, read what
 * would be created (l'essai), then import — « créer seulement ».
 */

type Report = {
  mode: "analyse" | "commit";
  rows: number;
  toCreate: {
    line: number;
    name: string;
    unit?: string;
    location?: string | null;
    opening?: number;
    lot?: string | null;
    expiryDay?: string | null;
    unitPriceHT?: number | null;
    paymentTermDays?: number;
    ice?: string | null;
    withholdingSubject?: boolean;
  }[];
  alreadyKnown: { line: number; name: string }[];
  invalid: { line: number; error: string }[];
  created: number;
};

export function MagasinImport({ kind, endpoint, help }: { kind: "articles" | "fournisseurs"; endpoint: string; help: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noun = kind === "articles" ? "article" : "fournisseur";

  async function call(mode: "analyse" | "commit") {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import impossible.");
      setReport(data);
      if (mode === "commit") router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="text-sm text-slate-600">{help}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 focus-within:ring-2 focus-within:ring-brand">
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          {file ? file.name : "Choisir le fichier (.xlsx ou .csv)"}
          <input
            type="file"
            accept=".xlsx,.csv,.xls"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              event.target.value = "";
              setReport(null);
              setError("");
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => call("analyse")}
          disabled={!file || busy}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-brand px-4 text-sm font-semibold text-brand transition hover:bg-brand/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          {busy && report === null ? "Analyse…" : "Analyser"}
        </button>
        {report?.mode === "analyse" && report.toCreate.length > 0 && (
          <button
            type="button"
            onClick={() => call("commit")}
            disabled={busy}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {busy ? "Import…" : `Importer ${report.toCreate.length} ${noun}${report.toCreate.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-4 space-y-3 text-sm" aria-live="polite">
          <p className={report.mode === "commit" ? "font-semibold text-emerald-700" : "text-slate-700"}>
            {report.mode === "commit"
              ? `${report.created} ${noun}${report.created > 1 ? "s" : ""} créé${report.created > 1 ? "s" : ""}.`
              : `${report.rows} ligne${report.rows > 1 ? "s" : ""} lue${report.rows > 1 ? "s" : ""} : ${report.toCreate.length} ${noun}${report.toCreate.length > 1 ? "s" : ""} à créer, ${report.alreadyKnown.length} déjà connu${report.alreadyKnown.length > 1 ? "s" : ""}, ${report.invalid.length} ligne${report.invalid.length > 1 ? "s" : ""} refusée${report.invalid.length > 1 ? "s" : ""}.`}
          </p>
          {report.mode === "analyse" && report.toCreate.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Ligne</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Nom</th>
                    {kind === "articles" ? (
                      <>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Stock d&apos;ouverture</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Lot / expiration</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Prix HT</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Lieu</th>
                      </>
                    ) : (
                      <>
                        <th scope="col" className="px-3 py-2 font-semibold">Délai</th>
                        <th scope="col" className="px-3 py-2 font-semibold">ICE</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Retenue</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {report.toCreate.slice(0, 50).map((row) => (
                    <tr key={`${row.line}-${row.name}`} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 tabular-nums text-slate-500">{row.line}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{row.name}</td>
                      {kind === "articles" ? (
                        <>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {row.opening} {row.unit}
                          </td>
                          <td className="px-3 py-1.5">{[row.lot, row.expiryDay].filter(Boolean).join(" · ")}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{row.unitPriceHT ? formatCurrency(row.unitPriceHT) : ""}</td>
                          <td className="px-3 py-1.5">{row.location ?? ""}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5">{row.paymentTermDays === 0 ? "Comptant" : `${row.paymentTermDays} jours`}</td>
                          <td className="px-3 py-1.5">{row.ice ?? ""}</td>
                          <td className="px-3 py-1.5">{row.withholdingSubject ? "Soumis" : ""}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.toCreate.length > 50 && <p className="px-3 py-2 text-xs text-slate-500">… et {report.toCreate.length - 50} autres.</p>}
            </div>
          )}
          {report.alreadyKnown.length > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-600">Déjà connus — laissés tels quels ({report.alreadyKnown.length})</summary>
              <ul className="mt-2 list-disc pl-5 text-slate-600">
                {report.alreadyKnown.map((row) => (
                  <li key={`${row.line}-${row.name}`}>
                    Ligne {row.line} : {row.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {report.invalid.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-rose-700">Lignes refusées ({report.invalid.length})</summary>
              <ul className="mt-2 list-disc pl-5 text-rose-700">
                {report.invalid.map((row) => (
                  <li key={`${row.line}-${row.error}`}>
                    Ligne {row.line} : {row.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
