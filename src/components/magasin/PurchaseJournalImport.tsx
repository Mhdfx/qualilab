"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Info, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDecimal } from "@/lib/labels";
import { formatDateOnly, parseIsoDay } from "@/lib/date-only";
import { PURCHASE_PAYMENT_METHOD_LABELS } from "@/lib/purchase-invoice";
import type { PaymentMode } from "@/generated/prisma/enums";

/**
 * The import of the supplier invoices of the laboratory's « Journal Achat »
 * (lot 6B, RETOUR-LABO-25-11.md M17): the .xlsx advice before the file is
 * chosen, the optional « Taux EUR → DH », the analysis (what will be
 * created, what is skipped, what is refused and why, what to check), then
 * the import — « créer seulement », a second import writes nothing.
 */

type Note = { line: number; kind: string; message: string };

type JournalReport = {
  mode: "analyse" | "commit";
  file: string;
  eurRate: number | null;
  rows: number;
  templateRows: number;
  suppliers: { toCreate: { name: string; paymentTermDays: number; rows: number }[]; matched: number };
  totals: {
    invoices: number;
    paid: number;
    toPay: number;
    late: number;
    payments: number;
    ht: number;
    vat: number;
    ttc: number;
    withheld: number;
    generatedNumbers: number;
  };
  invoices: {
    line: number;
    supplier: string;
    newSupplier: boolean;
    number: string;
    generatedNumber: boolean;
    issueDay: string;
    dueDay: string;
    amountHT: number | null;
    vatAmount: number | null;
    amount: number;
    currency: string | null;
    amountForeign: number | null;
    status: "A_PAYER" | "PAYEE";
    late: boolean;
    payments: number;
    paidAt: string | null;
    paymentMethod: PaymentMode | null;
    paymentReference: string | null;
    withholdingAmount: number | null;
  }[];
  existing: { line: number; supplierName: string; number: string; same: boolean }[];
  conflicts: { supplierName: string; number: string; lines: number[] }[];
  refused: Note[];
  warnings: Note[];
  labels: { refused: Record<string, string>; warnings: Record<string, string> };
  written: { suppliersCreated: number; invoices: number; payments: number } | null;
};

const PREVIEW = 100;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count > 1 ? many : one}`;
const day = (iso: string | null) => (iso ? formatDateOnly(parseIsoDay(iso) ?? new Date(iso)) : "");

function grouped(notes: Note[]): [string, Note[]][] {
  const groups = new Map<string, Note[]>();
  for (const note of notes) groups.set(note.kind, [...(groups.get(note.kind) ?? []), note]);
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function PurchaseJournalImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [rate, setRate] = useState("");
  const [report, setReport] = useState<JournalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(mode: "analyse" | "commit") {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      // The import writes what the analysis showed: the rate it used.
      const used = mode === "commit" && report ? (report.eurRate === null ? "" : String(report.eurRate)) : rate;
      form.append("eurRate", used);
      const response = await fetch("/api/purchase-invoices/import", { method: "POST", body: form });
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

  const reset = () => {
    setReport(null);
    setError("");
  };

  return (
    <Card className="p-5">
      <p className="text-sm text-slate-600">
        Une ligne par facture : Fournisseurs, Délai de paiement, N° Facture, Mois, Date, Échéance, Montant HT, TVA, Montant TTC, Euro, Statut,
        Date paiement, Mode de paiement. Les fournisseurs inconnus sont créés (délai le plus fréquent de leurs lignes) ; une facture déjà
        enregistrée (même fournisseur, même numéro) n&apos;est jamais modifiée — un fichier réimporté n&apos;écrit que ses factures nouvelles.
        Les factures payées sont reprises payées, sans retenue à la source ; les autres sont « à payer ».
      </p>
      <p className="mt-3 flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Fichier « .xls » (Excel 97–2003) ? Ouvrez-le dans Excel → Fichier → Enregistrer sous → « Classeur Excel (.xlsx) » (ou LibreOffice →
          Enregistrer sous → « Excel 2007-365 »), puis choisissez le fichier .xlsx.
        </span>
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">
            Taux EUR → DH <span className="font-normal text-slate-500">(facultatif)</span>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(event) => {
              setRate(event.target.value);
              reset();
            }}
            placeholder="ex. 10,85"
            aria-describedby="eur-rate-help"
            className="input-field min-h-[42px] w-36 px-3 text-sm"
          />
        </label>
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
              reset();
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
        {report && report.mode === "analyse" && report.totals.invoices > 0 && (
          <button
            type="button"
            onClick={() => call("commit")}
            disabled={busy}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {busy ? "Import…" : `Importer ${plural(report.totals.invoices, "facture")}`}
          </button>
        )}
      </div>
      <p id="eur-rate-help" className="mt-2 text-xs text-slate-500">
        Le taux sert aux seules lignes en euros sans montant en DH : sans taux, elles sont listées « montant en DH manquant » et ne sont pas importées.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {report && <JournalReportView report={report} />}
    </Card>
  );
}

function JournalReportView({ report }: { report: JournalReport }) {
  const { totals } = report;
  const shown = report.invoices.slice(0, PREVIEW);
  return (
    <div className="mt-4 space-y-3 text-sm" aria-live="polite">
      {report.mode === "commit" && report.written ? (
        <p className="font-semibold text-emerald-700">
          {report.written.invoices === 0
            ? "Rien à importer : toutes les factures de ce fichier sont déjà enregistrées."
            : `Importé : ${plural(report.written.invoices, "facture")}, ${plural(report.written.payments, "paiement")}, ${plural(report.written.suppliersCreated, "fournisseur créé", "fournisseurs créés")}.`}
        </p>
      ) : (
        <p className="text-slate-700">
          {plural(report.rows, "ligne lue", "lignes lues")}
          {report.templateRows > 0 && ` (dont ${plural(report.templateRows, "ligne de modèle vide ignorée", "lignes de modèle vides ignorées")})`} :{" "}
          {plural(totals.invoices, "facture à créer", "factures à créer")}
          {report.existing.length > 0 && `, ${plural(report.existing.length, "déjà enregistrée", "déjà enregistrées")} (sautées)`}
          {report.refused.length > 0 && `, ${plural(report.refused.length, "ligne refusée", "lignes refusées")}`}.
        </p>
      )}

      {totals.invoices > 0 && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Payées", `${totals.paid}`, `${plural(totals.payments, "paiement")} repris`],
            ["À payer", `${totals.toPay}`, totals.late > 0 ? `dont ${totals.late} en retard` : "aucune en retard"],
            ["Fournisseurs", `${report.suppliers.toCreate.length} à créer`, `${report.suppliers.matched} déjà connus`],
            ["Total TTC", formatCurrency(totals.ttc), `HT ${formatCurrency(totals.ht)} · TVA ${formatCurrency(totals.vat)}`],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{value}</dd>
              <dd className="text-xs text-slate-500">{detail}</dd>
            </div>
          ))}
        </dl>
      )}
      {totals.withheld > 0 && (
        <p className="text-xs text-violet-700">Retenue à la source sur les factures à payer : {formatCurrency(totals.withheld)}.</p>
      )}
      {report.mode === "analyse" && totals.late > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {plural(totals.late, "facture à payer a", "factures à payer ont")} une échéance passée : elles apparaîtront « En retard » sur le
          tableau de bord du magasin.
        </p>
      )}

      {report.mode === "analyse" && shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <caption className="sr-only">Factures à créer</caption>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Ligne</th>
                <th scope="col" className="px-3 py-2 font-semibold">Fournisseur</th>
                <th scope="col" className="px-3 py-2 font-semibold">N° facture</th>
                <th scope="col" className="px-3 py-2 font-semibold">Date / échéance</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">TTC</th>
                <th scope="col" className="px-3 py-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((invoice) => (
                <tr key={invoice.line} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-1.5 tabular-nums text-slate-500">{invoice.line}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {invoice.supplier}
                    {invoice.newSupplier && <span className="block text-[11px] font-normal text-emerald-700">nouveau fournisseur</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {invoice.number}
                    {invoice.generatedNumber && <span className="block font-sans text-[11px] text-amber-700">numéro attribué</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                    {day(invoice.issueDay)}
                    <span className="block text-slate-500">→ {day(invoice.dueDay)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatCurrency(invoice.amount)}
                    {invoice.amountHT === null ? (
                      <span className="block text-[11px] text-slate-500">TTC seul</span>
                    ) : (
                      <span className="block text-[11px] text-slate-500">HT {formatCurrency(invoice.amountHT)}</span>
                    )}
                    {invoice.currency && invoice.amountForeign !== null && (
                      <span className="block text-[11px] text-slate-500">
                        {formatDecimal(invoice.amountForeign, 2)} {invoice.currency}
                      </span>
                    )}
                    {invoice.withholdingAmount ? <span className="block text-[11px] text-violet-700">retenue {formatCurrency(invoice.withholdingAmount)}</span> : null}
                  </td>
                  <td className="px-3 py-1.5">
                    {invoice.status === "PAYEE" ? (
                      <span className="text-emerald-700">
                        Payée{invoice.paidAt ? ` le ${day(invoice.paidAt)}` : ""}
                        <span className="block text-[11px] text-slate-500">
                          {[invoice.paymentMethod ? PURCHASE_PAYMENT_METHOD_LABELS[invoice.paymentMethod] : null, invoice.paymentReference, invoice.payments > 1 ? `${invoice.payments} paiements` : invoice.payments === 0 ? "sans ligne de paiement" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    ) : (
                      <span className={invoice.late ? "text-rose-700" : "text-slate-700"}>{invoice.late ? "À payer — en retard" : "À payer"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.invoices.length > PREVIEW && (
            <p className="px-3 py-2 text-xs text-slate-500">… et {report.invoices.length - PREVIEW} autres factures.</p>
          )}
        </div>
      )}

      {report.conflicts.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-rose-700">À trancher — même numéro sur des lignes différentes, non importées ({report.conflicts.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-rose-700">
            {report.conflicts.map((conflict) => (
              <li key={`${conflict.supplierName}-${conflict.number}`}>
                {conflict.supplierName}, n° {conflict.number} : lignes {conflict.lines.join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      {grouped(report.refused.filter((note) => note.kind !== "a-trancher")).map(([kind, notes]) => (
        <details key={`refused-${kind}`} open={notes.length <= 10}>
          <summary className="cursor-pointer text-rose-700">
            Refusées — {report.labels.refused[kind] ?? kind} ({notes.length})
          </summary>
          <ul className="mt-2 list-disc pl-5 text-rose-700">
            {notes.map((note) => (
              <li key={`${note.line}-${note.message}`}>
                Ligne {note.line} : {note.message}
              </li>
            ))}
          </ul>
        </details>
      ))}

      {grouped(report.warnings).map(([kind, notes]) => (
        <details key={`warning-${kind}`}>
          <summary className="cursor-pointer text-amber-800">
            À vérifier — {report.labels.warnings[kind] ?? kind} ({notes.length})
          </summary>
          <ul className="mt-2 list-disc pl-5 text-amber-900">
            {notes.map((note, index) => (
              <li key={`${note.line}-${index}`}>
                Ligne {note.line} : {note.message}
              </li>
            ))}
          </ul>
        </details>
      ))}

      {report.suppliers.toCreate.length > 0 && (
        <details>
          <summary className="cursor-pointer text-slate-700">Fournisseurs à créer ({report.suppliers.toCreate.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-slate-600">
            {report.suppliers.toCreate.map((supplier) => (
              <li key={supplier.name}>
                {supplier.name} — {supplier.paymentTermDays === 0 ? "comptant" : `${supplier.paymentTermDays} jours`} ({plural(supplier.rows, "ligne")})
              </li>
            ))}
          </ul>
        </details>
      )}

      {report.existing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-slate-600">Déjà enregistrées — laissées telles quelles ({report.existing.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-slate-600">
            {report.existing.map((row) => (
              <li key={`${row.line}-${row.number}`}>
                Ligne {row.line} : {row.supplierName}, n° {row.number}
                {!row.same && <span className="text-amber-800"> — la facture enregistrée diffère (date ou montant) : à vérifier</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
