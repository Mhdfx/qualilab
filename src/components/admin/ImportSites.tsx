"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, MapPin, PlayCircle, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  SITE_FILE_HEADER,
  type ParentSummary,
  type SiteImportCategory,
  type SiteImportExample,
} from "@/lib/sites-import";

/**
 * « Sites de l'ancien logiciel » (RETOUR-LABO-06-10.md §5, V5): the sites the
 * client import of 01/10 turned into separate clients go back under their
 * client, and those mistaken clients are emptied into the site and archived.
 * Analyse first; « Rattacher les sites » writes, after a confirmation.
 */

type Written = {
  created: number;
  completed: number;
  attached: number;
  withHistory: number;
  places: { moved: number; merged: number };
  products: { moved: number; merged: number };
  emails: number;
  productTypes: number;
  profiles: number;
};

type Summary = {
  mode: "analyse" | "commit";
  rows: number;
  counts: Record<SiteImportCategory, number>;
  inactive: number;
  completed: number;
  examples: Record<SiteImportCategory, SiteImportExample[]>;
  parents: ParentSummary[];
  written?: Written;
};

/** The lists of examples, most important first: what changes clients, then what is skipped. */
const SECTIONS: { key: SiteImportCategory; analyse: string; done: string; tone: "ok" | "warn" | "muted" }[] = [
  { key: "attach", analyse: "Clients à rattacher à leur site, puis archiver", done: "Clients rattachés à leur site, puis archivés", tone: "ok" },
  { key: "withHistory", analyse: "Clients avec un historique — signalés, non touchés", done: "Clients avec un historique — signalés, non touchés", tone: "warn" },
  { key: "ambiguousSite", analyse: "Noms de site ambigus — site créé, aucun client touché", done: "Noms de site ambigus — site créé, aucun client touché", tone: "warn" },
  { key: "ambiguousParent", analyse: "Clients parents ambigus — lignes ignorées", done: "Clients parents ambigus — lignes ignorées", tone: "warn" },
  { key: "missingParent", analyse: "Clients parents introuvables — lignes ignorées", done: "Clients parents introuvables — lignes ignorées", tone: "warn" },
  { key: "duplicate", analyse: "Doublons dans le fichier — lignes ignorées", done: "Doublons dans le fichier — lignes ignorées", tone: "muted" },
  { key: "rejected", analyse: "Lignes incomplètes — ignorées", done: "Lignes incomplètes — ignorées", tone: "muted" },
  { key: "create", analyse: "Sites à créer", done: "Sites créés", tone: "ok" },
  { key: "present", analyse: "Sites déjà présents", done: "Sites déjà présents", tone: "muted" },
];

const TONE_BADGES = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  muted: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** « Créer 12 sites, compléter 2 sites et archiver 10 clients … ? » */
function confirmText(create: number, completed: number, attach: number): string {
  const steps = [
    create > 0 ? `créer ${plural(create, "site", "sites")}` : null,
    completed > 0 ? `compléter ${plural(completed, "site", "sites")}` : null,
    attach > 0 ? `archiver ${plural(attach, "client", "clients")} après le transfert de leurs lieux, produits et adresses` : null,
  ].filter((step): step is string => step !== null);
  const sentence = steps.length > 1 ? `${steps.slice(0, -1).join(", ")} et ${steps[steps.length - 1]}` : (steps[0] ?? "");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} ? Les clients archivés restent consultables dans l'historique.`;
}

/** « Transférés aux sites : 40 lieux (dont 3 fusionnés), … » */
function transferText(written: Written): string {
  const places = written.places.moved + written.places.merged;
  const products = written.products.moved + written.products.merged;
  const parts = [
    `${plural(places, "lieu", "lieux")}${written.places.merged > 0 ? ` (dont ${written.places.merged} fusionnés avec ceux du site)` : ""}`,
    `${plural(products, "produit", "produits")}${written.products.merged > 0 ? ` (dont ${written.products.merged} fusionnés avec ceux du client)` : ""}`,
    plural(written.emails, "adresse", "adresses"),
    ...(written.productTypes > 0 ? [plural(written.productTypes, "type de produit", "types de produits")] : []),
    ...(written.profiles > 0 ? [plural(written.profiles, "profil d'analyses", "profils d'analyses")] : []),
  ];
  return `Transférés aux sites : ${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}.`;
}

export function ImportSites() {
  const router = useRouter();
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
      const response = await fetch("/api/admin/import/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import impossible.");
      setSummary(data);
      if (mode === "commit") router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
      // A commit stopped half-way changed the database: the analysis shown is stale.
      if (mode === "commit") setSummary(null);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const done = summary?.mode === "commit";
  const counts = summary?.counts;
  const written = summary?.written;
  const toWrite = counts ? counts.create + counts.attach + (summary?.completed ?? 0) : 0;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
          Sites de l&apos;ancien logiciel — rattachement aux clients
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Dans l&apos;ancien logiciel, les sites d&apos;un client (les restaurants d&apos;une chaîne, les cantines d&apos;une
          collectivité…) sont rangés sous ce client ; l&apos;import des clients en a fait des clients séparés. Ce fichier crée chaque
          site sous son client. Quand un « client » n&apos;est en réalité que l&apos;un de ces sites et n&apos;a ni série, ni
          échantillon, ni facture, ses lieux, ses produits et ses adresses passent au site, puis il est archivé ; s&apos;il a un
          historique, il est seulement signalé. Un nom douteux crée le site sans toucher aux clients.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Rien n&apos;est écrit avant « Rattacher les sites », et relancer ne crée aucun doublon. Les adresses transférées arrivent
          avec « Reçoit les rapports » et « Reçoit les alertes » décochés et le nom du site dans leur libellé : tant que l&apos;envoi
          par site n&apos;existe pas, une adresse cochée recevrait les rapports de tous les sites du client.
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800">Fichier des sites (CSV, séparateur point-virgule)</p>
          <p className="mt-1 text-xs text-slate-500">Une ligne par site, avec la première ligne :</p>
          <p className="mt-1 overflow-x-auto rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">{SITE_FILE_HEADER}</p>
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
              {done ? "Sites rattachés" : "Ce que contient le fichier"}
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
            <Stat
              label={done ? "Sites créés" : "Sites à créer"}
              value={done && written ? written.created : counts.create}
              hint={summary.inactive > 0 ? `dont ${plural(summary.inactive, "inactif", "inactifs")}` : undefined}
            />
            <Stat
              label="Déjà présents"
              value={counts.present}
              hint={
                done && written
                  ? written.completed > 0 ? `${plural(written.completed, "complété", "complétés")}` : undefined
                  : summary.completed > 0 ? `${summary.completed} à compléter` : undefined
              }
            />
            <Stat label={done ? "Clients rattachés" : "Clients à rattacher"} value={done && written ? written.attached : counts.attach} hint="puis archivés" />
            <Stat label="Avec historique" value={counts.withHistory} hint="signalés, non touchés" warn />
            <Stat
              label="Noms ambigus"
              value={counts.ambiguousSite + counts.ambiguousParent}
              hint={`${counts.ambiguousSite} de site · ${counts.ambiguousParent} de client`}
              warn
            />
            <Stat label="Clients introuvables" value={counts.missingParent} hint="lignes ignorées" warn />
            <Stat label="Lignes écartées" value={counts.duplicate + counts.rejected} hint="doublons ou incomplètes" />
          </dl>

          {done && written && (
            <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p>
                Écrit : {plural(written.created, "site créé", "sites créés")}, {plural(written.completed, "site complété", "sites complétés")},{" "}
                {plural(written.attached, "client rattaché puis archivé", "clients rattachés puis archivés")}.
              </p>
              {written.attached > 0 && <p className="mt-1">{transferText(written)}</p>}
              {written.withHistory > 0 && (
                <p className="mt-1 text-amber-800">
                  {written.withHistory > 1
                    ? `${written.withHistory} clients ont reçu un historique entre l'analyse et l'écriture : ils sont restés tels quels.`
                    : "Un client a reçu un historique entre l'analyse et l'écriture : il est resté tel quel."}
                </p>
              )}
            </div>
          )}

          {summary.parents.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-800">Les clients qui ont le plus de sites dans le fichier</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="pb-2 pr-3 font-medium">Client</th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">Sites</th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">{done ? "Créés" : "À créer"}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{done ? "Clients rattachés" : "Clients à rattacher"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.parents.map((p) => (
                      <tr key={p.name} className="border-b border-slate-100">
                        <td className="py-2 pr-3 text-slate-800">{p.name}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-900">{p.sites}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{p.create}</td>
                        <td className="py-2 text-right tabular-nums text-slate-600">{p.attach}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2">
            {SECTIONS.filter((s) => counts[s.key] > 0).map((section) => (
              <Examples
                key={section.key}
                title={done ? section.done : section.analyse}
                count={counts[section.key]}
                examples={summary.examples[section.key]}
                tone={section.tone}
                quoteDetail={section.key === "attach"}
              />
            ))}
          </div>

          {counts.missingParent > 0 && !done && (
            <p className="mt-3 text-xs text-slate-500">
              Un client parent introuvable doit d&apos;abord exister (actif) dans le logiciel : créez-le ou importez-le, puis relancez l&apos;analyse.
            </p>
          )}

          {!done && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {toWrite === 0 ? (
                <p className="text-sm text-slate-600">Rien à écrire : chaque site du fichier est déjà rattaché à son client.</p>
              ) : confirming ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">{confirmText(counts.create, summary.completed, counts.attach)}</p>
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
                      {busy ? "Rattachement…" : "Confirmer le rattachement"}
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
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Rattacher les sites
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
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
      {hint && <dd className={`text-xs ${flagged ? "text-amber-700" : "text-slate-500"}`}>{hint}</dd>}
    </div>
  );
}

function Examples({
  title,
  count,
  examples,
  tone,
  quoteDetail,
}: {
  title: string;
  count: number;
  examples: SiteImportExample[];
  tone: keyof typeof TONE_BADGES;
  quoteDetail: boolean;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 open:bg-slate-50/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
        <span>{title}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ${TONE_BADGES[tone]}`}>{count}</span>
      </summary>
      <div className="overflow-x-auto px-4 pb-3">
        {count > examples.length && (
          <p className="mb-1.5 text-xs text-slate-500">Les {examples.length} premiers exemples sur {count}.</p>
        )}
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="pb-1.5 pr-3 font-medium">Ligne</th>
              <th scope="col" className="pb-1.5 pr-3 font-medium">Site</th>
              <th scope="col" className="pb-1.5 pr-3 font-medium">Client du fichier</th>
              <th scope="col" className="pb-1.5 font-medium">{quoteDetail ? "Client rattaché" : "Détail"}</th>
            </tr>
          </thead>
          <tbody>
            {examples.map((e) => (
              <tr key={`${e.line}-${e.site}`} className="border-b border-slate-100 align-top last:border-0">
                <td className="py-1.5 pr-3 tabular-nums text-slate-500">{e.line}</td>
                <td className="py-1.5 pr-3 text-slate-800">{e.site || "—"}</td>
                <td className="py-1.5 pr-3 text-slate-600">{e.client || "—"}</td>
                <td className="py-1.5 text-slate-600">{e.detail ? (quoteDetail ? `« ${e.detail} »` : e.detail) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
