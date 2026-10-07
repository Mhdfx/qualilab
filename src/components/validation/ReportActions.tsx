"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileDown, History, PencilLine, X } from "lucide-react";
import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { canReopen } from "@/lib/report-amendment";

/**
 * The actions on an issued report (AMENDEMENT.md §4), on the validation page
 * and in the search: « Duplicata (PDF) », « Versions du rapport » and, for
 * the administrator, « Rouvrir pour amendement » with its mandatory reason.
 * The API decides again; this only hides what a role cannot do.
 */
export function ReportActions({
  sampleId,
  role,
  status,
  number,
  amendmentPending,
  compact = false,
}: {
  sampleId: string;
  role: Role;
  status: SampleStatus;
  /** The printed number of the version in force (« RAP-2026-00001-A1 »). */
  number: string;
  amendmentPending: boolean;
  /** One line of small links, for a table row. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState<"versions" | "reopen" | null>(null);
  const reopenable = !amendmentPending && canReopen(status, role);

  const link = compact
    ? "inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    : "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

  return (
    <div className={compact ? "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" : "space-y-2.5"}>
      <a href={`/api/samples/${sampleId}/report?duplicata=1`} target="_blank" rel="noopener noreferrer" className={link}>
        <Copy className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        Duplicata (PDF)
      </a>
      <button type="button" onClick={() => setOpen("versions")} className={link}>
        <History className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        Versions du rapport
      </button>
      {reopenable && (
        <button
          type="button"
          onClick={() => setOpen("reopen")}
          className={
            compact
              ? "inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              : "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          }
        >
          <PencilLine className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
          Rouvrir pour amendement
        </button>
      )}
      {amendmentPending && !compact && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Amendement en cours : le rapport {number} reste la version en vigueur jusqu&apos;à la nouvelle approbation.
        </p>
      )}

      {open === "versions" && <VersionsDialog sampleId={sampleId} onClose={() => setOpen(null)} />}
      {open === "reopen" && <ReopenDialog sampleId={sampleId} number={number} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type VersionRow = {
  version: number;
  number: string;
  issuedAt: string;
  note: string | null;
  issuedBy: string | null;
  label: string | null;
  current: boolean;
  url: string;
};

type VersionsPayload = {
  number: string;
  amendmentPending: boolean;
  pendingNote: string | null;
  nextNumber: string | null;
  versions: VersionRow[];
};

/** « Versions du rapport »: number, date, reason, PDF — newest first. */
function VersionsDialog({ sampleId, onClose }: { sampleId: string; onClose: () => void }) {
  const [payload, setPayload] = useState<VersionsPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/samples/${sampleId}/report/versions`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!live) return;
        if (!response.ok) setError(data.error ?? "Les versions du rapport n'ont pas pu être chargées.");
        else setPayload(data as VersionsPayload);
      })
      .catch(() => live && setError("Une erreur réseau est survenue. Réessayez."));
    return () => {
      live = false;
    };
  }, [sampleId]);

  return (
    <Dialog title="Versions du rapport" onClose={onClose}>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!error && !payload && <p className="text-sm text-slate-500">Chargement…</p>}
      {payload && (
        <>
          {payload.amendmentPending && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              <b>Amendement en cours</b>
              {payload.nextNumber && <> — le rapport {payload.nextNumber} sera émis à l&apos;approbation</>}.
              {payload.pendingNote && <span className="mt-0.5 block">Motif : {payload.pendingNote}</span>}
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {payload.versions.map((v) => (
              <li key={v.version} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold text-slate-900">{v.number}</span>
                    {v.current ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        En vigueur
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        Remplacée
                      </span>
                    )}
                    {v.label && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">{v.label}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Émis le {formatDate(v.issuedAt)}
                    {v.issuedBy ? ` · approuvé par ${v.issuedBy}` : ""}
                  </p>
                  {v.note && <p className="mt-0.5 text-xs text-slate-600">Motif de l&apos;amendement : {v.note}</p>}
                </div>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-light/60"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

/** « Rouvrir pour amendement »: the reason is mandatory — it is printed on the amended report. */
function ReopenDialog({ sampleId, number, onClose }: { sampleId: string; number: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (reason.trim().length < 3) {
      setError("Indiquez le motif de l'amendement (au moins 3 caractères) : il sera imprimé sur le rapport amendé.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/samples/${sampleId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "La réouverture n'a pas pu être enregistrée.");
        return;
      }
      onClose();
      // The double validation starts again on the validation page.
      router.push(`/validation/${sampleId}`);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Rouvrir pour amendement — ${number}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-slate-600">
          L&apos;échantillon revient à « Résultats saisis » : la validation technique et l&apos;approbation sont
          effacées, les résultats et la fiche peuvent être corrigés. Le rapport {number} reste en vigueur jusqu&apos;à la
          nouvelle approbation, qui émettra le rapport amendé et l&apos;enverra au client.
        </p>
        <label htmlFor="amendmentReason" className="mt-3 block text-sm font-medium text-slate-700">
          Motif de l&apos;amendement <span className="text-rose-600">*</span>
        </label>
        <textarea
          id="amendmentReason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
          rows={3}
          required
          // AMENDMENT_NOTE_MAX (report-dispatch.ts) — printed on the one-page report.
          maxLength={500}
          placeholder="Ex. : erreur de transcription du N° de lot."
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <p className="mt-1 text-xs text-slate-500">Imprimé sous « Rapport amendé » et repris dans le journal.</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-rose-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:opacity-60"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {busy ? "Réouverture…" : "Rouvrir pour amendement"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Annuler
          </button>
        </div>
      </form>
    </Dialog>
  );
}
