"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Search, Unlink } from "lucide-react";

/**
 * The old software's clients linked to this fiche (lot 5B, HA5): listed for
 * the fiche's roles; added (by the old software's client number) or
 * withdrawn (« Ne pas reprendre ») by the administrator only — the route
 * (PUT /api/admin/historique/liens) refuses any other role. Withdrawing
 * takes that client's samples out of the history; each decision is
 * journalled.
 *
 * « Rattacher » never acts on the number alone: the number is looked up
 * first (GET /api/admin/historique/liens) and the administrator sees its
 * name in the old software, the fiche that holds it now and the samples it
 * brought, then confirms. Taking it from another fiche is a separate,
 * explicit confirmation (`replace`); the route refuses it otherwise (409) —
 * a mistyped number never moves another client's history.
 */

type LinkRow = { legacyClientId: number; legacyName: string; matchedBy: string; siteName: string | null; createdAt: string };

type Lookup = {
  legacyClientId: number;
  link: { legacyName: string; clientId: string | null; clientName: string | null; clientArchived: boolean; siteName: string | null; matchedBy: string } | null;
  samples: number;
};

const SOURCE_LABELS: Record<string, string> = { ICE: "par l'ICE", NOM: "par le nom", MAIN: "à la main" };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

export function LegacyLinksManager({ clientId, canManage, links }: { clientId: string; canManage: boolean; links: LinkRow[] }) {
  const router = useRouter();
  const [legacyClientId, setLegacyClientId] = useState("");
  const [busy, setBusy] = useState<number | "add" | "lookup" | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function find(id: number) {
    setBusy("lookup");
    setError("");
    setMessage("");
    setLookup(null);
    try {
      const response = await fetch(`/api/admin/historique/liens?legacyClientId=${id}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Recherche impossible.");
      setLookup(data as Lookup);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: number, target: string | null, options: { replace?: boolean } = {}) {
    setBusy(target === null ? id : "add");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/historique/liens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legacyClientId: id,
          clientId: target,
          // « Retirer » acts on this fiche's own link only; « Déplacer » only once the lookup was seen.
          ...(target === null ? { expectedClientId: clientId } : {}),
          ...(options.replace ? { replace: true } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "La correspondance n'a pas été enregistrée.");
      const removed = typeof data.removed === "number" ? data.removed : 0;
      const moved = typeof data.moved === "number" ? data.moved : 0;
      setMessage(
        target === null
          ? `Client n° ${id} de l'ancien logiciel retiré${removed > 0 ? ` : ${plural(removed, "échantillon retiré", "échantillons retirés")} de l'historique` : ""}.`
          : `Client n° ${id} de l'ancien logiciel rattaché${moved > 0 ? ` : ${plural(moved, "échantillon déplacé", "échantillons déplacés")}` : ""}. Ses autres échantillons arriveront au prochain import des mois.`
      );
      setLegacyClientId("");
      setLookup(null);
      setConfirming(null);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const trimmed = legacyClientId.trim();
  const typed = /^\d{1,10}$/.test(trimmed) ? Number(trimmed) : null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Fiches de l&apos;ancien logiciel rattachées</h3>
      {links.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Aucune.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {links.map((link) => (
            <li key={link.legacyClientId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-800">{link.legacyName}</p>
                <p className="text-xs text-slate-500">
                  n° {link.legacyClientId} · rattachée {SOURCE_LABELS[link.matchedBy] ?? ""}
                  {link.siteName ? ` · site « ${link.siteName} »` : ""}
                </p>
              </div>
              {canManage &&
                (confirming === link.legacyClientId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-800">Ses échantillons quitteront l&apos;historique de ce client.</span>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      disabled={busy !== null}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(link.legacyClientId, null)}
                      disabled={busy !== null}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                      {busy === link.legacyClientId ? "Retrait…" : "Confirmer le retrait"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(link.legacyClientId)}
                    disabled={busy !== null}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                    Retirer
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed !== null) find(typed);
          }}
        >
          <div>
            <label htmlFor="legacy-client-id" className="block text-xs font-medium text-slate-600">
              N° du client dans l&apos;ancien logiciel
            </label>
            <input
              id="legacy-client-id"
              inputMode="numeric"
              value={legacyClientId}
              onChange={(event) => {
                setLegacyClientId(event.target.value);
                setLookup(null);
              }}
              className="input-field mt-1 w-40 px-3"
              placeholder="ex. 2303"
            />
          </div>
          <button
            type="submit"
            disabled={typed === null || busy !== null}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {busy === "lookup" ? "Recherche…" : "Vérifier ce numéro"}
          </button>
          <p className="w-full text-xs text-slate-500">
            Le numéro figure dans « Importer l&apos;historique de l&apos;ancien logiciel » (clients ambigus ou introuvables). Rien n&apos;est
            rattaché avant votre confirmation.
          </p>
        </form>
      )}
      {canManage && lookup && lookup.legacyClientId === typed && (
        <LookupPanel
          lookup={lookup}
          clientId={clientId}
          busy={busy !== null}
          onCancel={() => setLookup(null)}
          onConfirm={(replace) => decide(lookup.legacyClientId, clientId, { replace })}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
    </div>
  );
}

/** What the number names now, and the confirmation that fits it. */
function LookupPanel({
  lookup,
  clientId,
  busy,
  onCancel,
  onConfirm,
}: {
  lookup: Lookup;
  clientId: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (replace: boolean) => void;
}) {
  const { link, samples, legacyClientId } = lookup;
  const held = link !== null && link.clientId !== null;
  const here = held && link.clientId === clientId;
  const elsewhere = held && !here;
  const name = link ? `« ${link.legacyName} »` : `Le client n° ${legacyClientId}`;
  let text: string;
  if (!link) {
    text = `${name} de l'ancien logiciel n'a encore aucune correspondance (aucun échantillon repris) : son nom n'est connu que du fichier clients.csv — vérifiez-le dans « Importer l'historique » (clients ambigus ou introuvables) avant de confirmer.`;
  } else if (here) {
    text = `${name} (n° ${legacyClientId}) est déjà rattaché à cette fiche.`;
  } else if (elsewhere) {
    text = `${name} (n° ${legacyClientId}) est rattaché à la fiche « ${link.clientName ?? "?"} »${link.clientArchived ? " (archivée)" : ""}, ${
      SOURCE_LABELS[link.matchedBy] ?? ""
    } : ${plural(samples, "échantillon repris", "échantillons repris")}. Le rattacher ici les déplacera sur cette fiche et les retirera de l'autre.`;
  } else {
    text = `${name} (n° ${legacyClientId}) est marqué « Ne pas reprendre ». Le rattacher ici fera arriver ses échantillons au prochain import des mois.`;
  }
  return (
    <div
      role="status"
      className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${elsewhere ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800"}`}
    >
      <p>{text}</p>
      {!here && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(elsewhere)}
            disabled={busy}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50 ${
              elsewhere ? "bg-amber-600 hover:bg-amber-700" : "bg-brand hover:bg-brand-dark"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? "Rattachement…" : elsewhere ? `Déplacer sur cette fiche (${plural(samples, "échantillon", "échantillons")})` : "Confirmer le rattachement"}
          </button>
        </div>
      )}
    </div>
  );
}
