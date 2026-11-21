"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, History, Link2, PlayCircle, Upload, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatDateTime, formatDecimal } from "@/lib/labels";
import { LEGACY_CLIENTS_FILE_HEADER } from "@/lib/legacy-history";
import { AMBIGUITY_LABELS, type AmbiguityReason, type MonthCategory } from "@/lib/legacy-history-import";
import type { LegacyImportFollowUp } from "@/lib/legacy-history-server";

/**
 * « Importer l'historique de l'ancien logiciel » (lot 5B, HA3 —
 * RETOUR-LABO-20-11.md §6), the administrator only (the page and the route):
 *   1. « Rattacher les clients » — clients.csv analysed: certain matches
 *      (written on confirmation), ambiguous ones decided here one by one (a
 *      fiche, or « Ne pas reprendre »), clients not found listed;
 *   2. « Importer les mois » — the monthly files, one call each: analysed
 *      first, then imported on confirmation, file after file;
 *   3. the follow-up: samples per year, links, the months imported.
 * Nothing is written before a confirmation; the same file twice writes nothing.
 */

const nf = (value: number) => formatDecimal(value, 0);
const plural = (count: number, one: string, many: string) => `${nf(count)} ${count > 1 ? many : one}`;

type Candidate = { id: string; name: string; ice: string | null; archived: boolean };
type ClientsSummary = {
  mode: "analyse" | "commit";
  rows: number;
  counts: { certain: number; byIce: number; byName: number; ambiguous: number; missing: number; linked: number; excluded: number; rejected: number; review: number };
  samples: { linked: number; certain: number; waiting: number };
  ambiguous: { legacyClientId: number; name: string; ice: string; samples: number; reason: AmbiguityReason; homonyms: number[]; candidates: Candidate[] }[];
  missing: { legacyClientId: number; name: string; ice: string; samples: number }[];
  certainExamples: { legacyClientId: number; name: string; client: string; by: "ICE" | "NOM"; samples: number }[];
  review: { legacyClientId: number; name: string; client: string; by: string; samples: number; homonyms: number[] }[];
  rejected: { line: number; reason: string }[];
  written?: number;
};

type MonthSummary = {
  mode: "analyse" | "commit";
  header: { month: string; part: number; parts: number };
  lines: number;
  counts: Record<MonthCategory, number>;
  results: number;
  notLinkedClients: number;
  rejected: { line: number; reason: string }[];
  written?: { created: number; rewritten: number; hidden: number; removed: number; results: number };
  durationMs?: number;
};

type FollowUp = LegacyImportFollowUp;

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/import/historique", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Import impossible.");
  return data;
}

export function ImportLegacyHistory({ initialFollowUp }: { initialFollowUp: FollowUp }) {
  const [followUp, setFollowUp] = useState<FollowUp>(initialFollowUp);
  // Read again after each write (GET /api/admin/import/historique).
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/import/historique", { cache: "no-store" });
      if (response.ok) setFollowUp(await response.json());
    } catch {
      // The follow-up is a convenience: the steps work without it.
    }
  }, []);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <History className="h-4 w-4 text-brand" aria-hidden="true" />
          Importer l&apos;historique de l&apos;ancien logiciel
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Les échantillons que l&apos;ancien logiciel a rendus depuis 2017, avec leurs analyses, montrés en lecture seule sur la fiche
          client et sur le portail (« Historique (ancien logiciel) », « le rapport signé fait foi »). Les fichiers sont écrits par{" "}
          <span className="font-mono">scripts/legacy/extract-legacy-history.py</span>. D&apos;abord les clients, puis les mois.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Un échantillon n&apos;arrive chez un client que par une correspondance certaine (l&apos;ICE, ou un nom qui ne désigne qu&apos;une
          fiche active et que ne porte aucun autre client de l&apos;ancien logiciel) ou tranchée ici à la main. Rien n&apos;est écrit avant votre confirmation ; relancer un fichier n&apos;écrit que le nouveau
          ou le changé.
        </p>
      </Card>
      <ClientsStep onDone={refresh} />
      <MonthsStep onDone={refresh} />
      <FollowUpCard followUp={followUp} />
    </div>
  );
}

// ---- step 1 ------------------------------------------------------------------------------

function ClientsStep({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<ClientsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setText(await file.text());
    setFileName(file.name);
    setSummary(null);
    setConfirming(false);
    setError("");
  }

  async function call(mode: "analyse" | "commit") {
    if (busy || !text) return;
    setBusy(true);
    setError("");
    try {
      setSummary(await post({ step: "clients", mode, text }));
      if (mode === "commit") onDone();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const done = summary?.mode === "commit";
  const counts = summary?.counts;

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users className="h-4 w-4 text-brand" aria-hidden="true" />
        1. Rattacher les clients
      </h3>
      <p className="mt-1 text-xs text-slate-500">Fichier « clients.csv » de l&apos;extraction, première ligne :</p>
      <p className="mt-1 overflow-x-auto rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">{LEGACY_CLIENTS_FILE_HEADER}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilePicker label={fileName ? "Remplacer le fichier" : "Choisir le fichier"} accept=".csv,text/csv,text/plain" onChange={readFile} />
        {fileName && <span className="text-xs text-emerald-700">{fileName}</span>}
        <button type="button" onClick={() => call("analyse")} disabled={busy || !text} className={PRIMARY}>
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          {busy && !confirming ? "Analyse…" : "Analyser"}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}

      {summary && counts && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Clients lus" value={summary.rows} />
            <Stat
              label={done ? "Rattachés maintenant" : "Certains, à rattacher"}
              value={done ? (summary.written ?? 0) : counts.certain}
              hint={`${nf(counts.byIce)} par l'ICE · ${nf(counts.byName)} par le nom · ${plural(summary.samples.certain, "échantillon", "échantillons")}`}
            />
            <Stat label="Déjà rattachés" value={counts.linked} hint={`${plural(summary.samples.linked, "échantillon", "échantillons")}${counts.excluded > 0 ? ` · ${nf(counts.excluded)} « ne pas reprendre »` : ""}`} />
            <Stat label="À trancher" value={counts.ambiguous + counts.missing} hint={`${nf(counts.ambiguous)} ambigus · ${nf(counts.missing)} introuvables · ${plural(summary.samples.waiting, "échantillon", "échantillons")} en attente`} warn />
          </dl>
          {done && (
            <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {plural(summary.written ?? 0, "client rattaché", "clients rattachés")}. Les mois peuvent maintenant être importés ; un client
              tranché plus tard reçoit ses échantillons au prochain import des mois.
            </p>
          )}
          {summary.review.length > 0 && (
            <details open className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-rose-50">
                <span>Rattachements automatiques à revoir — plusieurs clients de l&apos;ancien logiciel portent ce nom</span>
                <Badge>{summary.review.length}</Badge>
              </summary>
              <div className="max-h-80 overflow-auto px-4 pb-3">
                <p className="mb-1.5 text-xs text-slate-600">
                  Faits avant cette vérification, ils ne sont jamais réécrits par l&apos;import. Sur la fiche, « Retirer » le numéro qui
                  n&apos;appartient pas à ce client (ou confirmez qu&apos;il s&apos;agit bien du même).
                </p>
                <SimpleTable
                  head={["Client de l'ancien logiciel", "N°", "Fiche", "Homonymes (n°)", "Échantillons"]}
                  rows={summary.review.map((r) => [r.name, String(r.legacyClientId), r.client, r.homonyms.join(", "), nf(r.samples)])}
                />
              </div>
            </details>
          )}
          {summary.ambiguous.length > 0 && <AmbiguousList rows={summary.ambiguous} onDecided={onDone} />}
          {summary.missing.length > 0 && (
            <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-amber-50">
                <span>Clients de l&apos;ancien logiciel sans fiche correspondante</span>
                <Badge>{summary.missing.length}</Badge>
              </summary>
              <div className="max-h-80 overflow-auto px-4 pb-3">
                <p className="mb-1.5 text-xs text-slate-600">
                  Créez la fiche (ou corrigez le nom, l&apos;ICE) puis relancez l&apos;analyse, ou rattachez le numéro depuis la fiche du client
                  (carte « Historique (ancien logiciel) »).
                </p>
                <SimpleTable head={["Client de l'ancien logiciel", "N°", "ICE", "Échantillons"]} rows={summary.missing.map((m) => [m.name, String(m.legacyClientId), m.ice || "—", nf(m.samples)])} />
              </div>
            </details>
          )}
          {summary.certainExamples.length > 0 && (
            <details className="mt-4 rounded-xl border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
                <span>Correspondances certaines (à relire)</span>
                <Badge>{counts.certain}</Badge>
              </summary>
              <div className="max-h-96 overflow-auto px-4 pb-3">
                {counts.certain > summary.certainExamples.length && (
                  <p className="mb-1.5 text-xs text-slate-500">Les {summary.certainExamples.length} premières sur {nf(counts.certain)}.</p>
                )}
                <SimpleTable
                  head={["Client de l'ancien logiciel", "N°", "Fiche", "Par", "Échantillons"]}
                  rows={summary.certainExamples.map((c) => [c.name, String(c.legacyClientId), c.client, c.by === "ICE" ? "l'ICE" : "le nom", nf(c.samples)])}
                />
              </div>
            </details>
          )}
          {summary.rejected.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {plural(summary.rejected.length, "ligne illisible", "lignes illisibles")} : {summary.rejected.slice(0, 5).map((r) => `ligne ${r.line} (${r.reason})`).join(", ")}.
            </p>
          )}
          {!done && counts.certain > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {confirming ? (
                <Confirm
                  text={`Rattacher ${plural(counts.certain, "client certain", "clients certains")} (${plural(summary.samples.certain, "échantillon", "échantillons")}) ? Leur historique apparaîtra sur leur fiche et sur leur portail après l'import des mois.`}
                  busy={busy}
                  onCancel={() => setConfirming(false)}
                  onConfirm={() => call("commit")}
                  action="Confirmer le rattachement"
                />
              ) : (
                <div className="flex justify-end">
                  <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={PRIMARY}>
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Rattacher les clients certains
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** The ambiguous clients, decided one by one: a fiche among the candidates, or « Ne pas reprendre ». */
function AmbiguousList({ rows, onDecided }: { rows: ClientsSummary["ambiguous"]; onDecided: () => void }) {
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [decided, setDecided] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function decide(row: ClientsSummary["ambiguous"][number]) {
    const picked = choice[row.legacyClientId];
    if (!picked) return;
    setBusy(row.legacyClientId);
    setError("");
    try {
      const response = await fetch("/api/admin/historique/liens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyClientId: row.legacyClientId, legacyName: row.name, clientId: picked === "none" ? null : picked }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "La décision n'a pas été enregistrée.");
      setDecided((d) => ({
        ...d,
        [row.legacyClientId]: picked === "none" ? "Ne pas reprendre" : `Rattaché à « ${row.candidates.find((c) => c.id === picked)?.name ?? ""} »`,
      }));
      onDecided();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <details open className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-amber-50">
        <span>Clients ambigus — à trancher à la main</span>
        <Badge>{rows.length}</Badge>
      </summary>
      <div className="max-h-[32rem] space-y-3 overflow-auto px-4 pb-4">
        {error && <Alert>{error}</Alert>}
        {rows.map((row) => (
          <fieldset key={row.legacyClientId} className="rounded-xl border border-slate-200 bg-white p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">
              {row.name} <span className="font-normal text-slate-500">· n° {row.legacyClientId}{row.ice ? ` · ICE ${row.ice}` : ""} · {plural(row.samples, "échantillon", "échantillons")}</span>
            </legend>
            <p className="text-xs text-amber-800">
              {AMBIGUITY_LABELS[row.reason]}
              {row.homonyms.length > 0 ? ` Même nom dans l'ancien logiciel : n° ${row.homonyms.join(", ")}.` : ""}
              {row.candidates.length === 0 ? " Aucune fiche active : rattachez-le depuis la fiche voulue, ou ne le reprenez pas." : ""}
            </p>
            {decided[row.legacyClientId] ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {decided[row.legacyClientId]}
              </p>
            ) : (
              <>
                <div className="mt-1 space-y-1">
                  {row.candidates.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name={`legacy-${row.legacyClientId}`}
                        value={c.id}
                        checked={choice[row.legacyClientId] === c.id}
                        onChange={() => setChoice((x) => ({ ...x, [row.legacyClientId]: c.id }))}
                        className="mt-0.5"
                      />
                      <span>
                        {c.name}
                        <span className="text-xs text-slate-500">
                          {c.ice ? ` · ICE ${c.ice}` : " · sans ICE"}
                          {c.archived ? " · archivée" : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={`legacy-${row.legacyClientId}`}
                      value="none"
                      checked={choice[row.legacyClientId] === "none"}
                      onChange={() => setChoice((x) => ({ ...x, [row.legacyClientId]: "none" }))}
                    />
                    Ne pas reprendre
                  </label>
                </div>
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => decide(row)} disabled={!choice[row.legacyClientId] || busy !== null} className={SECONDARY}>
                    {busy === row.legacyClientId ? "Enregistrement…" : "Enregistrer la décision"}
                  </button>
                </div>
              </>
            )}
          </fieldset>
        ))}
      </div>
    </details>
  );
}

// ---- step 2 ------------------------------------------------------------------------------

type FileState = { file: File; summary: MonthSummary | null; error: string; state: "waiting" | "analysed" | "imported" | "error" };

function MonthsStep({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState<"analyse" | "commit" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState("");

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    event.target.value = "";
    setFiles(chosen.map((file) => ({ file, summary: null, error: "", state: "waiting" })));
    setConfirming(false);
    setProgress("");
  }

  async function run(mode: "analyse" | "commit") {
    if (busy || files.length === 0) return;
    setBusy(mode);
    setConfirming(false);
    const next = [...files];
    for (let i = 0; i < next.length; i += 1) {
      if (mode === "commit" && next[i].state !== "analysed") continue;
      setProgress(`${mode === "analyse" ? "Analyse" : "Import"} de ${next[i].file.name} (${i + 1} / ${next.length})…`);
      try {
        const summary: MonthSummary = await post({ step: "mois", mode, text: await next[i].file.text(), fileName: next[i].file.name });
        next[i] = { ...next[i], summary, error: "", state: mode === "analyse" ? "analysed" : "imported" };
      } catch (cause) {
        next[i] = { ...next[i], error: (cause as Error).message, state: "error" };
        setFiles([...next]);
        // One file failed: the next ones wait — nothing half-done is hidden behind a success.
        if (mode === "commit") break;
      }
      setFiles([...next]);
    }
    setProgress("");
    setBusy(null);
    if (mode === "commit") onDone();
  }

  const analysed = files.filter((f) => f.state === "analysed");
  const total = (key: MonthCategory) => analysed.reduce((sum, f) => sum + (f.summary?.counts[key] ?? 0), 0);
  const toWrite = total("create") + total("update") + total("hide") + total("remove");

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Upload className="h-4 w-4 text-brand" aria-hidden="true" />
        2. Importer les mois
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Les fichiers « historique-AAAA-MM.ndjson » de l&apos;extraction (un appel par fichier). Choisissez-en un ou plusieurs : chacun est
        analysé, puis importé après confirmation.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilePicker label={files.length ? "Remplacer les fichiers" : "Choisir les fichiers"} accept=".ndjson,.json,.txt,application/x-ndjson,text/plain" multiple onChange={choose} />
        {files.length > 0 && <span className="text-xs text-emerald-700">{plural(files.length, "fichier", "fichiers")}</span>}
        <button type="button" onClick={() => run("analyse")} disabled={busy !== null || files.length === 0} className={PRIMARY}>
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          {busy === "analyse" ? "Analyse…" : "Analyser"}
        </button>
      </div>
      {progress && (
        <p role="status" className="mt-3 text-sm text-slate-600">
          {progress}
        </p>
      )}

      {files.some((f) => f.summary || f.error) && (
        <div className="mt-4 max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="pb-1.5 pr-3 font-medium">Fichier</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Lus</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Nouveaux</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Changés</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Inchangés</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Annulés ou retirés</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Client non rattaché</th>
                <th scope="col" className="pb-1.5 font-medium">État</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const c = f.summary?.counts;
                return (
                  <tr key={f.file.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">{f.file.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{f.summary ? nf(f.summary.lines) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{c ? nf(c.create) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{c ? nf(c.update) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">{c ? nf(c.unchanged) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">{c ? nf(c.hide + c.remove + c.cancelledSkipped) : "—"}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${c && c.clientNotLinked + c.clientExcluded > 0 ? "text-amber-800" : ""}`}>
                      {c ? nf(c.clientNotLinked + c.clientExcluded) : "—"}
                    </td>
                    <td className="py-1.5 text-xs">
                      {f.state === "error" ? (
                        <span className="text-rose-700">{f.error}</span>
                      ) : f.state === "imported" ? (
                        <span className="text-emerald-700">
                          Importé{f.summary?.durationMs !== undefined ? ` en ${formatDecimal(f.summary.durationMs / 1000, 1)} s` : ""}
                        </span>
                      ) : f.state === "analysed" ? (
                        <span className="text-slate-600">Analysé</span>
                      ) : (
                        <span className="text-slate-400">En attente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {analysed.length > 0 && busy === null && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          {toWrite === 0 ? (
            <p className="text-sm text-slate-600">Rien à écrire : chaque échantillon rattaché de ces fichiers est déjà repris.</p>
          ) : confirming ? (
            <Confirm
              text={`Importer ${plural(analysed.length, "fichier", "fichiers")} : ${plural(total("create"), "échantillon nouveau", "échantillons nouveaux")}, ${plural(total("update"), "changé", "changés")}, ${plural(total("hide"), "annulé à masquer", "annulés à masquer")}${total("remove") > 0 ? `, ${plural(total("remove"), "retiré (client changé dans l'ancien logiciel)", "retirés (client changé dans l'ancien logiciel)")}` : ""} ? ${total("clientNotLinked") > 0 ? `${plural(total("clientNotLinked"), "échantillon attend", "échantillons attendent")} le rattachement de son client.` : ""}`}
              busy={false}
              onCancel={() => setConfirming(false)}
              onConfirm={() => run("commit")}
              action="Confirmer l'import"
            />
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={() => setConfirming(true)} className={PRIMARY}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Importer {plural(analysed.length, "fichier", "fichiers")}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- the follow-up -----------------------------------------------------------------------

function FollowUpCard({ followUp }: { followUp: FollowUp }) {
  const total = followUp.byYear.reduce((sum, y) => sum + y.count, 0);
  const links = (followUp.links.ICE ?? 0) + (followUp.links.NOM ?? 0) + (followUp.links.MAIN ?? 0);
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900">3. Suivi</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Échantillons repris" value={total} />
        <Stat label="Clients rattachés" value={links} hint={`${nf(followUp.links.ICE ?? 0)} ICE · ${nf(followUp.links.NOM ?? 0)} nom · ${nf(followUp.links.MAIN ?? 0)} à la main`} />
        <Stat label="« Ne pas reprendre »" value={followUp.excluded} />
        <Stat label="Fichiers importés" value={followUp.months.length} />
      </dl>
      {followUp.byYear.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Échantillons repris par année">
          {followUp.byYear.map((y) => (
            <li key={y.year} className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
              <span className="font-semibold tabular-nums">{y.year}</span> · {nf(y.count)}
            </li>
          ))}
        </ul>
      )}
      {followUp.months.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200">
          <summary className="cursor-pointer list-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50">Mois importés — dernier passage de chacun</summary>
          <div className="max-h-96 overflow-auto px-4 pb-3">
            <SimpleTable
              head={["Mois", "Dernier passage", "Écrits", "Inchangés", "Client non rattaché"]}
              rows={followUp.months.map((m) => [
                `${m.month}${m.parts > 1 ? ` (${m.part}/${m.parts})` : ""}`,
                formatDateTime(m.at),
                nf((m.written.created ?? 0) + (m.written.rewritten ?? 0)),
                nf(m.counts.unchanged ?? 0),
                nf((m.counts.clientNotLinked ?? 0) + (m.counts.clientExcluded ?? 0)),
              ])}
            />
          </div>
        </details>
      )}
    </Card>
  );
}

// ---- small pieces ------------------------------------------------------------------------

const PRIMARY =
  "inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function FilePicker({ label, accept, multiple = false, onChange }: { label: string; accept: string; multiple?: boolean; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand/30">
      <Upload className="h-4 w-4" aria-hidden="true" />
      {label}
      <input type="file" accept={accept} multiple={multiple} onChange={onChange} className="sr-only" />
    </label>
  );
}

function Stat({ label, value, hint, warn = false }: { label: string; value: number; hint?: string; warn?: boolean }) {
  const flagged = warn && value > 0;
  return (
    <div className={`rounded-xl px-3 py-2 ${flagged ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50"}`}>
      <dt className={`text-xs font-medium uppercase tracking-wide ${flagged ? "text-amber-800" : "text-slate-500"}`}>{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{nf(value)}</dd>
      {hint && <dd className={`text-xs ${flagged ? "text-amber-700" : "text-slate-500"}`}>{hint}</dd>}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200">{children}</span>;
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {children}
    </p>
  );
}

function Confirm({ text, busy, onCancel, onConfirm, action }: { text: string; busy: boolean; onCancel: () => void; onConfirm: () => void; action: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">{text}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY}>
          Annuler
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={PRIMARY}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {busy ? "Import…" : action}
        </button>
      </div>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          {head.map((h) => (
            <th key={h} scope="col" className="pb-1.5 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-slate-100 last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={`py-1.5 pr-3 ${i === 0 ? "text-slate-800" : "text-slate-600"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
