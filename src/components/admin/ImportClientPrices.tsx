"use client";

import { useState } from "react";
import { CheckCircle2, PlayCircle, Tags, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDecimal } from "@/lib/labels";
import {
  CLIENT_PRICE_FILE_HEADER,
  type ConflictPrice,
  type MissingAnalysis,
  type MissingClient,
  type PriceConflict,
  type PriceImportCategory,
  type PriceImportExample,
} from "@/lib/client-prices-import";

/**
 * « Importer les prix clients » (lot 4H, H5 — RETOUR-LABO-04-11.md §5): the
 * prices proper to some clients in the old software, matched to our clients
 * and analyses. Analyse first — matched, client introuvable, analyse
 * introuvable, doublons —; « Importer les prix » writes, after a
 * confirmation. The administrator only (the page and the route).
 */

type Summary = {
  mode: "analyse" | "commit";
  rows: number;
  counts: Record<PriceImportCategory, number>;
  matched: number;
  conflicts: number;
  conflictList: PriceConflict[];
  duplicateRule: string;
  legacyTariff: { equal: number; withTariff: number; skipped: boolean };
  clients: { matched: number; notFound: number; ambiguous: number; bySite: number; byIce: number; byName: number };
  archivedClients: number;
  missingClients: MissingClient[];
  missingAnalyses: MissingAnalysis[];
  examples: Record<PriceImportCategory, PriceImportExample[]>;
  written?: { created: number; updated: number };
};

const SECTIONS: { key: PriceImportCategory; analyse: string; done: string; tone: "ok" | "warn" | "muted" }[] = [
  { key: "create", analyse: "Prix à créer", done: "Prix créés", tone: "ok" },
  { key: "update", analyse: "Prix déjà repris, à mettre à jour", done: "Prix mis à jour", tone: "ok" },
  { key: "clientNotFound", analyse: "Client introuvable — prix ignorés", done: "Client introuvable — prix ignorés", tone: "warn" },
  { key: "clientAmbiguous", analyse: "Client ambigu (plusieurs fiches) — prix ignorés", done: "Client ambigu (plusieurs fiches) — prix ignorés", tone: "warn" },
  { key: "analysisNotFound", analyse: "Analyse introuvable — prix ignorés", done: "Analyse introuvable — prix ignorés", tone: "warn" },
  { key: "duplicate", analyse: "Doublons — un seul prix gardé", done: "Doublons — un seul prix gardé", tone: "muted" },
  { key: "keptManual", analyse: "Prix saisis sur la fiche — conservés", done: "Prix saisis sur la fiche — conservés", tone: "muted" },
  { key: "keptRemoved", analyse: "Prix retirés à la main sur la fiche — non repris", done: "Prix retirés à la main sur la fiche — non repris", tone: "muted" },
  {
    key: "sameAsLegacyTariff",
    analyse: "Égaux au tarif de l'ancien logiciel — non repris, le catalogue s'applique",
    done: "Égaux au tarif de l'ancien logiciel — non repris, le catalogue s'applique",
    tone: "muted",
  },
  { key: "unchanged", analyse: "Déjà repris, inchangés", done: "Déjà repris, inchangés", tone: "muted" },
  { key: "zeroPrice", analyse: "Prix à 0 — le catalogue s'applique", done: "Prix à 0 — le catalogue s'applique", tone: "muted" },
  { key: "rejected", analyse: "Lignes illisibles — ignorées", done: "Lignes illisibles — ignorées", tone: "muted" },
];

const TONE_BADGES = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  muted: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
/** « 6 695 », with the space every screen prints (labels.ts). */
const nf = { format: (value: number) => formatDecimal(value, 0) };

export function ImportClientPrices() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(typeof reader.result === "string" ? reader.result : "");
      setFileName(file.name);
      setSummary(null);
      setConfirming(false);
      setError("");
    };
    reader.readAsText(file);
  }

  async function call(mode: "analyse" | "commit") {
    if (busy || !csv) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/import/prix-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Import impossible.");
      setSummary(data);
    } catch (cause) {
      setError((cause as Error).message);
      if (mode === "commit") setSummary(null);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const done = summary?.mode === "commit";
  const counts = summary?.counts;
  const written = summary?.written;
  const toWrite = counts ? counts.create + counts.update : 0;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Tags className="h-4 w-4 text-brand" aria-hidden="true" />
          Importer les prix clients
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          L&apos;ancien logiciel garde, pour certains clients, un prix propre par analyse. Ce fichier les rattache à nos clients
          (par l&apos;ICE, sinon par le nom ; un site de l&apos;ancien logiciel au client qui en reçoit les factures) et à nos
          analyses (par le nom ou un alias, dans le domaine du type d&apos;analyse). La facture propose ensuite le prix du client à la
          place de celui du catalogue, toujours modifiable.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Rien n&apos;est écrit avant « Importer les prix », et relancer ne crée aucun doublon. Un prix saisi sur la fiche d&apos;un
          client n&apos;est jamais remplacé, un prix retiré sur la fiche n&apos;est jamais remis. Un prix à 0 n&apos;est pas repris : le
          catalogue s&apos;applique ; un prix égal au tarif de l&apos;ancien logiciel non plus (hypothèse, à confirmer par C-8).
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800">Fichier des prix clients (CSV, séparateur point-virgule)</p>
          <p className="mt-1 text-xs text-slate-500">
            Écrit par <span className="font-mono">scripts/legacy/extract-client-prices.py</span>, avec la première ligne :
          </p>
          <p className="mt-1 overflow-x-auto rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">{CLIENT_PRICE_FILE_HEADER}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand/30">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {fileName ? "Remplacer le fichier" : "Choisir le fichier"}
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} className="sr-only" />
            </label>
            {fileName && <span className="text-xs text-emerald-700">{fileName}</span>}
            <button
              type="button"
              onClick={() => call("analyse")}
              disabled={busy || !csv}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {busy && !summary ? "Analyse…" : "Analyser"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </Card>

      {summary && counts && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {done ? "Prix importés" : "Ce que contient le fichier"}
            </h2>
            {done && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Terminé
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Prix lus" value={summary.rows} />
            <Stat
              label="Rattachés"
              value={summary.matched}
              hint={`${plural(summary.clients.matched, "client", "clients")} : ${summary.clients.byIce} par l'ICE, ${summary.clients.byName} par le nom, ${summary.clients.bySite} par le site`}
            />
            <Stat
              label={done ? "Créés · mis à jour" : "À créer · à mettre à jour"}
              value={done && written ? written.created + written.updated : toWrite}
              hint={done && written ? `${nf.format(written.created)} · ${nf.format(written.updated)}` : `${nf.format(counts.create)} · ${nf.format(counts.update)}`}
            />
            <Stat
              label="Inchangés"
              value={counts.unchanged + counts.keptManual + counts.keptRemoved}
              hint={
                counts.keptManual + counts.keptRemoved > 0
                  ? [counts.keptManual > 0 ? `${counts.keptManual} saisis sur la fiche` : "", counts.keptRemoved > 0 ? `${counts.keptRemoved} retirés à la main` : ""]
                      .filter(Boolean)
                      .join(" · ")
                  : "déjà repris"
              }
            />
            <Stat
              label="Client introuvable"
              value={counts.clientNotFound + counts.clientAmbiguous}
              hint={`${plural(summary.clients.notFound, "client", "clients")}${summary.clients.ambiguous > 0 ? ` · ${summary.clients.ambiguous} ambigus` : ""}`}
              warn
            />
            <Stat label="Analyse introuvable" value={counts.analysisNotFound} hint={`${plural(summary.missingAnalyses.length, "libellé", "libellés")}`} warn />
            <Stat label="Doublons" value={counts.duplicate} hint={summary.conflicts > 0 ? `dont ${summary.conflicts} à un autre prix` : "même prix"} />
            <Stat
              label="Égaux à l'ancien tarif"
              value={summary.legacyTariff.equal}
              hint={`sur ${nf.format(summary.legacyTariff.withTariff)} avec un tarif · ${summary.legacyTariff.skipped ? "non repris" : "repris quand même"}`}
            />
            <Stat label="Prix à 0 · illisibles" value={counts.zeroPrice + counts.rejected} hint={`${nf.format(counts.zeroPrice)} · ${nf.format(counts.rejected)}`} />
          </dl>

          {done && written && (
            <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Écrit : {plural(written.created, "prix créé", "prix créés")}, {plural(written.updated, "prix mis à jour", "prix mis à jour")}. Les
              fiches des clients les listent sous « Prix propres au client ».
            </p>
          )}
          {summary.legacyTariff.equal > 0 && (
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {`${nf.format(summary.legacyTariff.equal)} prix propres de l'ancien logiciel sont égaux à son tarif de l'analyse : ce ne sont pas des prix négociés. `}
              {summary.legacyTariff.skipped
                ? "Ils ne sont pas repris : ces clients suivent le catalogue (hypothèse, à confirmer par C-8)."
                : "Ils sont repris quand même : ces clients resteront à l'ancien tarif quand le catalogue changera."}{" "}
              Avant l&apos;import en production, comparez l&apos;ancien tarif au catalogue de production.
            </p>
          )}
          {summary.archivedClients > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {plural(summary.archivedClients, "client archivé reçoit", "clients archivés reçoivent")} des prix (aucune fiche conservée
              vers laquelle les reporter) : ils resteront inactifs tant que le client l&apos;est.
            </p>
          )}

          {summary.missingClients.length > 0 && (
            <Missing
              title="Clients de l'ancien logiciel sans fiche correspondante"
              hint="Créez la fiche (ou corrigez le nom, l'ICE) puis relancez l'analyse : leurs prix seront repris."
              head={["Client de l'ancien logiciel", "N°", "Prix", "Motif"]}
              rows={summary.missingClients.map((c) => [c.name, String(c.legacyClientId), String(c.prices), c.reason === "ambigu" ? "plusieurs fiches" : "introuvable"])}
            />
          )}
          {summary.missingAnalyses.length > 0 && (
            <Missing
              title="Analyses de l'ancien logiciel sans analyse correspondante"
              hint="Ajoutez l'orthographe en alias dans « Paramètres » (ou créez l'analyse), puis relancez l'analyse."
              head={["Analyse de l'ancien logiciel", "Type d'analyse", "Prix", "Motif"]}
              rows={summary.missingAnalyses.map((a) => [a.label, a.legacyNatureId === null ? "—" : `n° ${a.legacyNatureId}`, String(a.prices), a.reason])}
            />
          )}

          {summary.conflictList.length > 0 && (
            <Conflicts conflicts={summary.conflictList} total={summary.conflicts} rule={summary.duplicateRule} />
          )}

          <div className="mt-5 space-y-2">
            {SECTIONS.filter((s) => counts[s.key] > 0).map((section) => (
              <Examples
                key={section.key}
                title={done ? section.done : section.analyse}
                count={counts[section.key]}
                examples={summary.examples[section.key]}
                tone={section.tone}
              />
            ))}
          </div>

          {!done && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {toWrite === 0 ? (
                <p className="text-sm text-slate-600">Rien à écrire : chaque prix rattaché est déjà repris.</p>
              ) : confirming ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    Créer {plural(counts.create, "prix", "prix")}
                    {counts.update > 0 ? ` et mettre à jour ${plural(counts.update, "prix", "prix")} déjà repris` : ""} pour{" "}
                    {plural(summary.clients.matched, "client", "clients")} ? Les factures proposeront ces prix à la place du catalogue.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                      className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => call("commit")}
                      disabled={busy}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {busy ? "Import…" : "Confirmer l'import"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={busy}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Tags className="h-4 w-4" aria-hidden="true" />
                    Importer les prix
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint, warn = false }: { label: string; value: number; hint?: string; warn?: boolean }) {
  const flagged = warn && value > 0;
  return (
    <div className={`rounded-xl px-3 py-2 ${flagged ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50"}`}>
      <dt className={`text-xs font-medium uppercase tracking-wide ${flagged ? "text-amber-800" : "text-slate-500"}`}>{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{nf.format(value)}</dd>
      {hint && <dd className={`text-xs ${flagged ? "text-amber-700" : "text-slate-500"}`}>{hint}</dd>}
    </div>
  );
}

function Missing({ title, hint, head, rows }: { title: string; hint: string; head: string[]; rows: string[][] }) {
  return (
    <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
        <span>{title}</span>
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200">{rows.length}</span>
      </summary>
      <div className="max-h-80 overflow-auto px-4 pb-3">
        <p className="mb-1.5 text-xs text-slate-600">{hint}</p>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              {head.map((h, i) => (
                <th key={h} scope="col" className={`pb-1.5 pr-3 font-medium ${i === 2 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")} className="border-b border-slate-100 last:border-0">
                {row.map((cell, i) => (
                  <td key={i} className={`py-1.5 pr-3 ${i === 0 ? "text-slate-800" : i === 2 ? "text-right tabular-nums text-slate-900" : "text-slate-600"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** « 320,00 DH — site « X » (type d'analyse n° 12, modifié le 22/02/2022) » */
function conflictCell(price: ConflictPrice): string {
  const source = price.source === "site" ? `site « ${price.legacyName} »` : `client « ${price.legacyName} »`;
  const details = [price.legacyNatureId === null ? null : `type d'analyse n° ${price.legacyNatureId}`, price.modifiedOn ? `modifié le ${price.modifiedOn}` : null]
    .filter(Boolean)
    .join(", ");
  return `${formatCurrency(price.price)} — ${source}${details ? ` (${details})` : ""}, ligne ${price.line}`;
}

function Conflicts({ conflicts, total, rule }: { conflicts: PriceConflict[]; total: number; rule: string }) {
  return (
    <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
        <span>Prix en conflit — même client et même analyse, à des prix différents</span>
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200">{nf.format(total)}</span>
      </summary>
      <div className="max-h-96 overflow-auto px-4 pb-3">
        <p className="mb-1.5 text-xs text-slate-600">
          Gardé : {rule} (hypothèse, à confirmer par C-8). Les autres prix ne sont pas repris ; corrigez la fiche du client si le
          laboratoire en décide autrement.
          {/* `total` counts the other prices, the list one row per client and analysis. */}
          {conflicts.reduce((sum, c) => sum + c.others.length, 0) < total ? ` Les ${conflicts.length} premiers clients et analyses.` : ""}
        </p>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="pb-1.5 pr-3 font-medium">Client</th>
              <th scope="col" className="pb-1.5 pr-3 font-medium">Analyse</th>
              <th scope="col" className="pb-1.5 pr-3 font-medium">Prix gardé</th>
              <th scope="col" className="pb-1.5 font-medium">Autres prix</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={`${c.kept.line}`} className="border-b border-slate-100 align-top last:border-0">
                <td className="py-1.5 pr-3 text-slate-800">{c.client}</td>
                <td className="py-1.5 pr-3 text-slate-700">{c.analysis}</td>
                <td className="py-1.5 pr-3 text-slate-900">{conflictCell(c.kept)}</td>
                <td className="py-1.5 text-slate-600">
                  {c.others.map((o) => (
                    <span key={o.line} className="block">
                      {conflictCell(o)}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Examples({
  title,
  count,
  examples,
  tone,
}: {
  title: string;
  count: number;
  examples: PriceImportExample[];
  tone: keyof typeof TONE_BADGES;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 open:bg-slate-50/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
        <span>{title}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ${TONE_BADGES[tone]}`}>{nf.format(count)}</span>
      </summary>
      <div className="overflow-x-auto px-4 pb-3">
        {count > examples.length && <p className="mb-1.5 text-xs text-slate-500">Les {examples.length} premiers exemples sur {nf.format(count)}.</p>}
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="pb-1.5 pr-3 font-medium">Ligne</th>
              <th scope="col" className="pb-1.5 pr-3 font-medium">Client du fichier</th>
              <th scope="col" className="pb-1.5 pr-3 font-medium">Analyse du fichier</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Prix HT</th>
              <th scope="col" className="pb-1.5 font-medium">Détail</th>
            </tr>
          </thead>
          <tbody>
            {examples.map((e) => (
              <tr key={e.line} className="border-b border-slate-100 align-top last:border-0">
                <td className="py-1.5 pr-3 tabular-nums text-slate-500">{e.line}</td>
                <td className="py-1.5 pr-3 text-slate-800">{e.client || "—"}</td>
                <td className="py-1.5 pr-3 text-slate-600">{e.parameter || "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-900">{e.price === null ? "—" : formatCurrency(e.price)}</td>
                <td className="py-1.5 text-slate-600">{e.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
