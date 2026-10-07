"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Eye, GitMerge, MapPin, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ClientPicker, type PickedClient } from "./ClientPicker";
import {
  attachSummary,
  mergeSummary,
  type AttachCounts,
  type MergeCounts,
  type TransferSummary,
} from "./client-actions-logic";

type Mode = "merge" | "attach";

type Preview = {
  summary: TransferSummary;
  warnings: string[];
};

/**
 * « Actions sur la fiche » (CLIENTS-FUSION.md §2–3, ADMIN): merge this client
 * into another one, or attach it as a site of another one. Always in two
 * steps — « Voir l'aperçu » writes nothing and says, in plain French, what
 * will move; only then the confirmation, which archives this fiche.
 */
export function ClientMergeActions({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [target, setTarget] = useState<PickedClient | null>(null);
  // Attach: "" = a site named below (new, or A's site of the same name).
  const [existingSiteId, setExistingSiteId] = useState("");
  const [siteName, setSiteName] = useState(clientName);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  function reset(next: Mode | null) {
    setMode(next);
    setTarget(null);
    setExistingSiteId("");
    setSiteName(clientName);
    setPreview(null);
    setError("");
  }

  /** Any change to the choice invalidates the preview. */
  function changed() {
    setPreview(null);
    setError("");
  }

  function body(kind: "preview" | "commit") {
    if (mode === "merge") return { targetId: target?.id, mode: kind };
    return existingSiteId
      ? { parentId: target?.id, existingSiteId, mode: kind }
      : { parentId: target?.id, siteName: siteName.trim() || clientName, mode: kind };
  }

  async function send(kind: "preview" | "commit") {
    if (!mode || !target || busy) return;
    if (mode === "attach" && !existingSiteId && !siteName.trim()) {
      setError("Indiquez le nom du site.");
      return;
    }
    setBusy(kind);
    setError("");
    try {
      const response = await fetch(
        `/api/clients/${clientId}/${mode === "merge" ? "merge" : "attach-as-site"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body(kind)),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPreview(null);
        setError(data.error ?? (kind === "preview" ? "Aperçu impossible." : "L'opération a échoué."));
        return;
      }
      if (kind === "commit") {
        router.push(`/commercial/${target.id}`);
        router.refresh();
        return;
      }
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      const summary =
        mode === "merge"
          ? mergeSummary((data.counts ?? {}) as Partial<MergeCounts>, clientName, target.name)
          : attachSummary((data.counts ?? {}) as Partial<AttachCounts>, clientName, target.name, {
              name: data.site?.name ?? (existingSiteId ? target.sites.find((s) => s.id === existingSiteId)?.name ?? "" : siteName.trim() || clientName),
              created: Boolean(data.site?.created),
            });
      setPreview({ summary, warnings });
      // Screen readers and keyboards land on the preview, not back at the top.
      setTimeout(() => previewRef.current?.focus(), 0);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const tabClass = (active: boolean) =>
    `inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      active
        ? "border-brand bg-brand text-white"
        : "border-slate-300 text-slate-700 hover:border-brand hover:text-brand"
    }`;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Actions sur la fiche</h2>
      <p className="mt-1 text-sm text-slate-500">
        Fiche en double, ou point de vente enregistré comme client : regroupez-la
        avec la bonne fiche. Rien n&apos;est supprimé, cette fiche est archivée.
      </p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Opération">
        <button
          type="button"
          aria-pressed={mode === "merge"}
          onClick={() => reset(mode === "merge" ? null : "merge")}
          className={tabClass(mode === "merge")}
        >
          <GitMerge className="h-4 w-4" aria-hidden="true" />
          Fusionner avec…
        </button>
        <button
          type="button"
          aria-pressed={mode === "attach"}
          onClick={() => reset(mode === "attach" ? null : "attach")}
          className={tabClass(mode === "attach")}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Rattacher comme site de…
        </button>
      </div>

      {mode && (
        <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-sm text-slate-600">
            {mode === "merge"
              ? `Même société sous deux fiches : tout ce qui concerne « ${clientName} » (séries, échantillons, factures, sites, adresses, mémoire) passe à la fiche choisie.`
              : `« ${clientName} » devient un site de la fiche choisie : ses séries et échantillons passent sur ce site, ses factures restent à son nom.`}
          </p>

          <ClientPicker
            label={mode === "merge" ? "Fiche à garder" : "Client principal"}
            excludeIds={[clientId]}
            selected={target}
            disabled={busy !== null}
            onSelect={(client) => {
              setTarget(client);
              setExistingSiteId("");
              changed();
            }}
          />

          {mode === "attach" && target && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Site de « {target.name} »</legend>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="attach-site"
                  checked={existingSiteId === ""}
                  onChange={() => {
                    setExistingSiteId("");
                    changed();
                  }}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  Un site nommé
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Créé s&apos;il n&apos;existe pas ; un site du même nom chez ce client est réutilisé.
                  </span>
                </span>
              </label>
              {existingSiteId === "" && (
                <div className="pl-6">
                  <label htmlFor="attach-site-name" className="sr-only">
                    Nom du site
                  </label>
                  <input
                    id="attach-site-name"
                    type="text"
                    value={siteName}
                    onChange={(event) => {
                      setSiteName(event.target.value);
                      changed();
                    }}
                    className="input-field px-3"
                  />
                </div>
              )}
              {target.sites.map((site) => (
                <label key={site.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="attach-site"
                    checked={existingSiteId === site.id}
                    onChange={() => {
                      setExistingSiteId(site.id);
                      changed();
                    }}
                    className="h-4 w-4 accent-brand"
                  />
                  Site existant : {site.name}
                </label>
              ))}
            </fieldset>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          {!preview && (
            <button
              type="button"
              onClick={() => send("preview")}
              disabled={!target || busy !== null}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {busy === "preview" ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              {busy === "preview" ? "Calcul de l'aperçu…" : "Voir l'aperçu"}
            </button>
          )}

          {preview && target && (
            <div
              ref={previewRef}
              tabIndex={-1}
              aria-labelledby="merge-preview-title"
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <h3 id="merge-preview-title" className="text-sm font-semibold text-slate-800">
                Aperçu — rien n&apos;est encore modifié
              </h3>
              <p className="text-sm font-medium text-slate-900">{preview.summary.headline}</p>
              {preview.summary.details.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {preview.summary.details.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {preview.warnings.length > 0 && (
                <ul className="space-y-1.5">
                  {preview.warnings.map((warning) => (
                    <li
                      key={warning}
                      className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {warning}
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                {preview.summary.stays.map((line) => (
                  <p key={line} className="first:font-semibold">
                    {line}
                  </p>
                ))}
                <p className="mt-1">Cette opération ne se défait pas depuis l&apos;application.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => send("commit")}
                  disabled={busy !== null}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {busy === "commit" ? (
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy === "commit"
                    ? "Opération en cours…"
                    : mode === "merge"
                      ? `Fusionner dans « ${target.name} »`
                      : `Rattacher à « ${target.name} »`}
                </button>
                <button
                  type="button"
                  onClick={() => reset(null)}
                  disabled={busy !== null}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
