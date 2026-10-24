"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Split } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { WrappingSelect } from "@/components/ui/WrappingSelect";
import { Dialog } from "@/components/invoices/InvoiceDialogs";
import type { Family } from "@/generated/prisma/enums";
import { SPLIT_STALE_ERROR, type SplitBlockingSample, type SplitGroup, type SplitPreview, type SplitSampleRef } from "@/lib/family-split";
import { SAMPLE_STATUS_LABELS } from "@/lib/labels";

type PreviewGroup = SplitGroup & { name?: { taken: boolean; similar: string[] } };
type Preview = Omit<SplitPreview, "groups"> & { groups: PreviewGroup[] };
type Done = { id: string; name: string; moved: number; sourceActiveBefore: number; sourceActiveAfter: number };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
/** « 1 critère actif », « 39 critères actifs ». */
const activeCriteria = (count: number) => (count > 1 ? `${count} critères actifs` : `${count} critère actif`);
/** The samples listed in a refusal or a warning; the rest are counted. */
const SAMPLES_SHOWN = 15;
/** A confirmation refused because the family changed: the dialog has reloaded the preview itself. */
const STALE_RELOADED = "La famille a changé depuis l'aperçu : voici l'aperçu à jour. Rien n'a été modifié.";
/** « physico-chimie » inside a sentence. */
const DOMAIN_WORDS: Record<Family, string> = { MICRO: "microbiologie", CHIMIE: "physico-chimie", AUTRE: "autres analyses" };

/** A short list of samples: their reference and status, the germs they carry when known. */
function SampleList({ samples }: { samples: readonly (SplitSampleRef & { parameters?: string[] })[] }) {
  return (
    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs">
      {samples.slice(0, SAMPLES_SHOWN).map((sample) => (
        <li key={sample.id}>
          <b className="font-mono">{sample.reference}</b> · {SAMPLE_STATUS_LABELS[sample.status]}
          {sample.parameters?.length ? <> — {sample.parameters.join(", ")}</> : null}
        </li>
      ))}
      {samples.length > SAMPLES_SHOWN && <li>… et {samples.length - SAMPLES_SHOWN} autres.</li>}
    </ul>
  );
}

/**
 * « Scinder par domaine » (administrator) — on the page of a famille de
 * produits whose criteria mix two domains since the old software's import
 * (`src/lib/family-split.ts`). The button opens the server's preview;
 * « Scinder » sends the preview's version back, so a family changed in
 * between is refused rather than split on stale numbers.
 */
export function FamilySplitAction({ typeId, basePath }: { typeId: string; basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Split className="h-4 w-4 text-brand" aria-hidden="true" />
            Scinder par domaine
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Si l&apos;import de l&apos;ancien logiciel a réuni ici deux familles de domaines différents (« AUTRES » et
            « AUTRES_ »…), la scission recrée la seconde avec les critères de son domaine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Split className="h-4 w-4" aria-hidden="true" />
          Scinder par domaine
        </button>
      </div>
      {done && (
        <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Famille « {done.name} » créée avec {plural(done.moved, "critère")} ; ici, {activeCriteria(done.sourceActiveBefore)} avant,{" "}
          {done.sourceActiveAfter} après (les autres sont désactivés, pas supprimés). Inscrit au journal.{" "}
          <Link href={`${basePath}/${done.id}`} className="font-semibold underline underline-offset-2 hover:text-emerald-950">
            Ouvrir « {done.name} »
          </Link>
        </p>
      )}
      {open && (
        <FamilySplitDialog
          typeId={typeId}
          onClose={() => setOpen(false)}
          onDone={(result) => {
            setOpen(false);
            setDone(result);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function FamilySplitDialog({ typeId, onClose, onDone }: { typeId: string; onClose: () => void; onDone: (result: Done) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [domain, setDomain] = useState<Family | null>(null);
  const [name, setName] = useState("");
  const [natureId, setNatureId] = useState("");
  const [similar, setSimilar] = useState<string[]>([]);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const firstField = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);
  const ids = useId();

  /** A group's proposals into the form; `keepEdits` keeps what was typed when the same domain comes back. */
  const choose = useCallback((group: PreviewGroup | undefined, keepEdits: boolean) => {
    setDomain(group?.domain ?? null);
    if (!group) return;
    setName((current) => (keepEdits && current ? current : group.proposedName));
    setNatureId((current) => (keepEdits && group.natures.some((n) => n.id === current) ? current : group.natureId ?? ""));
    setSimilar(group.name?.similar ?? []);
    setConfirmSimilar(false);
  }, []);

  /** The server's preview, read — nothing set yet. */
  const fetchPreview = useCallback(async (): Promise<{ data: Preview } | { error: string }> => {
    try {
      const response = await fetch(`/api/product-types/${typeId}/split`);
      const data = (await response.json().catch(() => ({}))) as Preview & { error?: string };
      return response.ok ? { data } : { error: data.error ?? "L'aperçu a échoué." };
    } catch {
      return { error: "Une erreur réseau est survenue. Réessayez." };
    }
  }, [typeId]);

  /** A preview on screen; `keep` = the domain shown, kept with its edits when it is still offered. */
  const show = useCallback(
    (result: { data: Preview } | { error: string }, keep: Family | null) => {
      setBusy(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const { data } = result;
      const same = keep ? data.groups.find((g) => g.domain === keep) : undefined;
      setPreview(data);
      choose(same ?? data.groups.find((g) => !g.refusal) ?? data.groups[0], same !== undefined);
    },
    [choose]
  );

  // The preview once, at opening; a refused confirmation reloads it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchPreview();
      if (!cancelled) show(result, null);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPreview, show]);

  // Into the dialog once the preview is there: the name, else « Fermer ».
  useEffect(() => {
    if (!preview || focused.current) return;
    focused.current = true;
    (firstField.current ?? closeButton.current)?.focus();
  }, [preview]);

  const group = preview?.groups.find((g) => g.domain === domain);
  const shownBlocking = group?.blockingSamples ?? [];
  const refusal = group?.refusal ?? null;
  const proposedChecked = group?.name && name.trim() === group.proposedName ? group.name : null;
  const canSubmit = !!group && !refusal && !busy && name.trim() !== "" && natureId !== "" && !proposedChecked?.taken;
  const natureLabel = group?.natures.find((n) => n.id === natureId)?.label ?? "—";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !preview || !group) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/product-types/${typeId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: group.domain, name, natureId, version: preview.version, confirmSimilar }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<Done> & {
        error?: string;
        similar?: string[];
        blockingSamples?: SplitBlockingSample[];
      };
      if (response.ok) {
        onDone(data as Done);
        return;
      }
      if (data.blockingSamples?.length) {
        // Samples opened since the preview: the new preview shows them with the refusal.
        show(await fetchPreview(), group.domain);
        return;
      }
      setError(data.error ?? "La scission a échoué — rien n'a été modifié.");
      if (data.similar?.length) {
        setSimilar(data.similar);
        setConfirmSimilar(false);
      }
      // The family changed in between: the new numbers replace the old ones,
      // and the message says so — the API's « rouvrez » is already done.
      if (data.error === SPLIT_STALE_ERROR) {
        const fresh = await fetchPreview();
        show(fresh, group.domain);
        if (!("error" in fresh)) setError(STALE_RELOADED);
      }
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Scinder par domaine"
      description="Rien n'est écrit avant « Scinder » : vérifiez l'aperçu."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} noValidate>
        {!preview && busy && <p className="text-sm text-slate-500">Lecture des critères de la famille…</p>}

        {preview && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-700">
              « {preview.source.name} »
              {preview.source.natureLabel ? <> — {preview.source.natureLabel}</> : null} : {activeCriteria(preview.source.activeRows)}
              {preview.source.domain ? <>, dont {preview.source.ownRows} de son domaine.</> : "."}
            </p>

            {preview.refusal && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">{preview.refusal}</p>
            )}

            {preview.groups.length > 1 && (
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-slate-600">Domaine qui sort de la famille</legend>
                <div className="flex flex-wrap gap-2">
                  {preview.groups.map((g) => (
                    <label
                      key={g.domain}
                      className={`inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                        g.domain === domain ? "border-brand bg-brand-light/60 text-brand" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${ids}-domain`}
                        value={g.domain}
                        checked={g.domain === domain}
                        onChange={() => {
                          setError("");
                          choose(g, false);
                        }}
                        className="accent-brand"
                      />
                      {g.label}
                      <span className="text-xs font-normal text-slate-500">{plural(g.rows, "critère")}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {group && (
              <>
                <div>
                  <p className="font-medium text-slate-800">
                    {activeCriteria(group.rows)} « {group.label} » ({plural(group.parameters.length, "germe")}) quitte
                    {group.rows > 1 ? "nt" : ""} « {preview.source.name} ».
                  </p>
                  <details className="mt-1.5 rounded-xl border border-slate-200">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">Voir les germes</summary>
                    <ul className="max-h-48 columns-1 gap-6 overflow-y-auto border-t border-slate-100 px-3 py-2 text-xs text-slate-700 sm:columns-2">
                      {group.parameters.map((parameter) => (
                        <li key={parameter.id} className="break-inside-avoid py-0.5">
                          {parameter.name}
                          {parameter.rows > 1 && <span className="text-slate-500"> · {parameter.rows} versions de norme</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>

                {refusal ? (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                    <p>{refusal}</p>
                    {shownBlocking.length > 0 && <SampleList samples={shownBlocking} />}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${ids}-name`} className="block text-xs font-medium text-slate-600">
                        Nom de la nouvelle famille
                      </label>
                      <input
                        ref={(element) => {
                          firstField.current = element;
                        }}
                        id={`${ids}-name`}
                        type="text"
                        value={name}
                        maxLength={191}
                        onChange={(e) => {
                          setName(e.target.value);
                          setSimilar([]);
                          setConfirmSimilar(false);
                          setError("");
                        }}
                        className="input-field mt-1 px-3"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${ids}-nature`} className="block text-xs font-medium text-slate-600">
                        Type d&apos;analyse
                      </label>
                      <WrappingSelect
                        id={`${ids}-nature`}
                        variant="field"
                        className="mt-1"
                        value={natureId}
                        onChange={(e) => setNatureId(e.target.value)}
                        display={natureLabel}
                      >
                        {group.natures.map((nature) => (
                          <option key={nature.id} value={nature.id}>
                            {nature.label}
                          </option>
                        ))}
                      </WrappingSelect>
                    </div>
                  </div>
                )}

                {!refusal && proposedChecked?.taken && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    Une famille de ce nom existe déjà : choisissez un autre nom.
                  </p>
                )}
                {!refusal && similar.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <p>Noms très proches : {similar.map((s) => `« ${s} »`).join(", ")}.</p>
                    <label className="mt-1.5 flex items-center gap-2">
                      <input type="checkbox" checked={confirmSimilar} onChange={(e) => setConfirmSimilar(e.target.checked)} className="h-4 w-4 accent-brand" />
                      C&apos;est bien une autre famille
                    </label>
                  </div>
                )}

                {!refusal && group.closedSamples.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <p>
                      {group.closedSamples.length > 1
                        ? `${group.closedSamples.length} rapports validés portent ces analyses : un amendement les relirait`
                        : "1 rapport validé porte ces analyses : un amendement le relirait"}{" "}
                      sans critère sur « {preview.source.name} » (ni limites ni verdict pour elles).
                    </p>
                    <SampleList samples={group.closedSamples} />
                  </div>
                )}
                {!refusal && group.openOtherDomain.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <p>
                      {group.openOtherDomain.length > 1
                        ? `${group.openOtherDomain.length} échantillons en cours de ${DOMAIN_WORDS[group.domain]} restent`
                        : `1 échantillon en cours de ${DOMAIN_WORDS[group.domain]} reste`}{" "}
                      sous « {preview.source.name} » : choisissez « {name.trim() || group.proposedName} » à{" "}
                      {group.openOtherDomain.length > 1 ? "leur" : "sa"} programmation.
                    </p>
                    <SampleList samples={group.openOtherDomain} />
                  </div>
                )}

                {!refusal && (
                  <p className="text-xs text-slate-500">
                    La nouvelle famille reprend le client, la réglementation et l&apos;état (active ou non) de « {preview.source.name} ». Les
                    critères y sont copiés, puis désactivés ici — jamais supprimés —, le tout en une fois et inscrit au journal. Les
                    échantillons déjà enregistrés gardent leur famille.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {group && !refusal ? "Annuler" : "Fermer"}
          </button>
          {group && !refusal && (
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {busy && preview ? "Scission…" : `Scinder (${plural(group.rows, "critère")})`}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
