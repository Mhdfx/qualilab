"use client";

import { formatCurrency, formatDecimal } from "@/lib/labels";
import { formatDateOnly, parseIsoDay } from "@/lib/date-only";

/**
 * The analysis (and the result) of the import of the stock file, one tab per
 * article (lot 6A, RETOUR-LABO-25-11.md M14): per article its status, the
 * movements to write with their bon de commande, lot, expiry, price and the
 * level they lead to, the adjustment to the file's last « Stock »; then the
 * rows refused, the doubts, the texts outside any table.
 */

export type WorkbookReportData = {
  mode: "analyse" | "commit";
  format: "par-article";
  detected: "par-article" | "registre";
  file: string;
  sheets: number;
  tables: number;
  dataRows: number;
  totals: { toCreate: number; resumed: number; untouched: number; movements: number; adjustments: number; skipped: number; refused: number };
  articles: {
    name: string;
    sheet: string;
    line: number;
    unit: string;
    location: string | null;
    status: "a-creer" | "reprise" | "suivi-a-la-main" | "archive";
    statusLabel: string;
    levelNow: number;
    levelAfter: number;
    lastStock: number | null;
    adjustment: { from: number; to: number } | null;
    skipped: number;
    rows: number;
    movements: {
      line: number;
      day: string;
      type: "ENTREE" | "SORTIE";
      opening: boolean;
      quantity: number;
      orderReference: string | null;
      lot: string | null;
      expiryDay: string | null;
      unitPriceHT: number | null;
      check: string;
      checkLabel: string;
      levelAfter: number;
    }[];
  }[];
  refused: { sheet: string; line: number; message: string }[];
  warnings: { sheet: string; line: number; message: string }[];
  ignored: { sheet: string; cell: string; text: string }[];
  emptySheets: string[];
  written: { articlesCreated: number; articlesResumed: number; movements: number; adjustments: number } | null;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count > 1 ? many : one}`;
const day = (iso: string | null) => (iso ? formatDateOnly(parseIsoDay(iso) ?? new Date(iso)) : "");
const quantity = (value: number) => formatDecimal(value, 2);

const STATUS_STYLE: Record<WorkbookReportData["articles"][number]["status"], string> = {
  "a-creer": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  reprise: "bg-sky-50 text-sky-700 ring-sky-200",
  "suivi-a-la-main": "bg-amber-50 text-amber-800 ring-amber-200",
  archive: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** What a commit of this analysis writes: articles to create, rows and adjustments of the ones already imported. */
export function workbookWriteCount(report: WorkbookReportData): { articles: number; movements: number; adjustments: number } {
  const writing = report.articles.filter(
    (article) => article.status === "a-creer" || (article.status === "reprise" && (article.movements.length > 0 || article.adjustment))
  );
  return {
    articles: writing.length,
    movements: report.totals.movements,
    adjustments: report.totals.adjustments,
  };
}

export function StockWorkbookReport({ report }: { report: WorkbookReportData }) {
  const { totals } = report;
  return (
    <div className="mt-4 space-y-3 text-sm" aria-live="polite">
      {report.mode === "commit" && report.written ? (
        <p className="font-semibold text-emerald-700">
          {report.written.articlesCreated + report.written.articlesResumed + report.written.movements + report.written.adjustments === 0
            ? "Rien à importer : tout ce fichier est déjà dans le stock."
            : `Importé : ${plural(report.written.articlesCreated, "article créé", "articles créés")}, ${plural(report.written.articlesResumed, "article complété", "articles complétés")}, ${plural(report.written.movements, "mouvement")}, ${plural(report.written.adjustments, "ajustement")} au niveau de la fiche.`}
        </p>
      ) : (
        <p className="text-slate-700">
          {plural(report.sheets, "onglet")}, {plural(report.tables, "tableau", "tableaux")}, {plural(report.dataRows, "ligne lue", "lignes lues")} :{" "}
          {plural(totals.toCreate, "article à créer", "articles à créer")}, {plural(totals.movements, "mouvement")} à écrire
          {totals.adjustments > 0 && `, ${plural(totals.adjustments, "ajustement")} au niveau de la fiche`}
          {totals.skipped > 0 && `, ${plural(totals.skipped, "ligne déjà importée", "lignes déjà importées")} (sautées)`}
          {totals.untouched > 0 && `, ${plural(totals.untouched, "article non touché", "articles non touchés")}`}
          {totals.refused > 0 && `, ${plural(totals.refused, "ligne ignorée", "lignes ignorées")}`}.
        </p>
      )}
      {report.mode === "analyse" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          La fiche n&apos;écrit aucune sortie : le niveau importé n&apos;est pas le stock réel. Après l&apos;import, faites un inventaire
          article par article (mouvement « Ajustement »).
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-xs">
          <caption className="sr-only">Articles du fichier et mouvements</caption>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Article (onglet)</th>
              <th scope="col" className="px-3 py-2 font-semibold">Date</th>
              <th scope="col" className="px-3 py-2 font-semibold">Bon de commande</th>
              <th scope="col" className="px-3 py-2 font-semibold">Lot / expiration</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Quantité</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Prix HT</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Stock</th>
            </tr>
          </thead>
          {report.articles.map((article) => (
            <tbody key={article.name} className="border-t border-slate-200">
              <tr className="bg-white">
                <th scope="rowgroup" colSpan={7} className="px-3 pb-1 pt-2.5 text-left font-normal">
                  <span className="font-semibold text-slate-800">{article.name}</span>
                  <span className="text-slate-500"> · {article.unit}</span>
                  <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_STYLE[article.status]}`}>
                    {article.statusLabel}
                  </span>
                  <span className="block text-slate-500">
                    {plural(article.rows, "ligne")}
                    {article.skipped > 0 && ` · ${plural(article.skipped, "déjà importée", "déjà importées")}`}
                    {article.status !== "a-creer" && ` · niveau actuel ${quantity(article.levelNow)}`}
                    {(article.status === "a-creer" || article.status === "reprise") && ` · niveau après l'import ${quantity(article.levelAfter)}`}
                    {article.lastStock !== null && ` · dernier « Stock » de la fiche ${quantity(article.lastStock)}`}
                  </span>
                </th>
              </tr>
              {article.movements.map((movement) => (
                <tr key={`${article.name}-${movement.line}-${movement.type}`} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-500">
                    Ligne {movement.line}
                    {movement.opening ? " · stock de départ" : movement.type === "SORTIE" ? " · sortie" : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{day(movement.day)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{movement.orderReference ?? ""}</td>
                  <td className="px-3 py-1.5">{[movement.lot, day(movement.expiryDay)].filter(Boolean).join(" · ")}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${movement.type === "SORTIE" ? "text-rose-700" : "text-emerald-700"}`}>
                    {movement.type === "SORTIE" ? "−" : "+"}
                    {quantity(movement.quantity)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {movement.unitPriceHT !== null ? formatCurrency(movement.unitPriceHT) : ""}
                    {!["ok", "sans-prix", "un-prix"].includes(movement.check) && (
                      <span className={`block text-[11px] ${movement.check === "non-departage" ? "text-rose-700" : "text-amber-700"}`}>{movement.checkLabel}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{quantity(movement.levelAfter)}</td>
                </tr>
              ))}
              {article.adjustment && (
                <tr className="border-t border-slate-100 bg-amber-50/60">
                  <td colSpan={4} className="px-3 py-1.5 text-amber-900">
                    Ajustement daté du jour de l&apos;import : niveau de la fiche (dernier « Stock »)
                  </td>
                  <td colSpan={2} className="px-3 py-1.5 text-right tabular-nums text-amber-900">
                    {quantity(article.adjustment.from)} → {quantity(article.adjustment.to)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{quantity(article.adjustment.to)}</td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>

      {report.refused.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-rose-700">Lignes ignorées ({report.refused.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-rose-700">
            {report.refused.map((row) => (
              <li key={`${row.sheet}-${row.line}-${row.message}`}>
                « {row.sheet} », ligne {row.line} : {row.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.warnings.length > 0 && (
        <details>
          <summary className="cursor-pointer text-amber-800">À vérifier ({report.warnings.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-amber-900">
            {report.warnings.map((row, index) => (
              <li key={`${row.sheet}-${row.line}-${index}`}>
                « {row.sheet} », ligne {row.line} : {row.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(report.ignored.length > 0 || report.emptySheets.length > 0) && (
        <details>
          <summary className="cursor-pointer text-slate-600">
            Textes hors tableau, non lus ({report.ignored.length}){report.emptySheets.length > 0 && ` · onglets sans tableau (${report.emptySheets.length})`}
          </summary>
          <ul className="mt-2 list-disc pl-5 text-slate-600">
            {report.ignored.map((row) => (
              <li key={`${row.sheet}-${row.cell}`}>
                « {row.sheet} », {row.cell} : {row.text}
              </li>
            ))}
            {report.emptySheets.map((sheet) => (
              <li key={`vide-${sheet}`}>« {sheet} » : aucun tableau (en-tête « Date », « Libellé », « Entrée » introuvable)</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
