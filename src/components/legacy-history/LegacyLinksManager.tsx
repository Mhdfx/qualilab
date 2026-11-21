"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Unlink } from "lucide-react";

/**
 * The old software's clients linked to this fiche (lot 5B, HA5): listed for
 * the fiche's roles; added (by the old software's client number) or
 * withdrawn (« Ne pas reprendre ») by the administrator only — the route
 * (PUT /api/admin/historique/liens) refuses any other role. Withdrawing
 * takes that client's samples out of the history; each decision is
 * journalled.
 */

type LinkRow = { legacyClientId: number; legacyName: string; matchedBy: string; siteName: string | null; createdAt: string };

const SOURCE_LABELS: Record<string, string> = { ICE: "par l'ICE", NOM: "par le nom", MAIN: "à la main" };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

export function LegacyLinksManager({ clientId, canManage, links }: { clientId: string; canManage: boolean; links: LinkRow[] }) {
  const router = useRouter();
  const [legacyClientId, setLegacyClientId] = useState("");
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function decide(id: number, target: string | null) {
    setBusy(target === null ? id : "add");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/historique/liens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyClientId: id, clientId: target }),
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
            if (typed !== null) decide(typed, clientId);
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
              onChange={(event) => setLegacyClientId(event.target.value)}
              className="input-field mt-1 w-40 px-3"
              placeholder="ex. 2303"
            />
          </div>
          <button
            type="submit"
            disabled={typed === null || busy !== null}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {busy === "add" ? "Rattachement…" : "Rattacher à ce client"}
          </button>
          <p className="w-full text-xs text-slate-500">
            Le numéro figure dans « Importer l&apos;historique de l&apos;ancien logiciel » (clients ambigus ou introuvables).
          </p>
        </form>
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
