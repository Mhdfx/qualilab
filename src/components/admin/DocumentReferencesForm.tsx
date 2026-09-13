"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileBadge } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/document-types";

/**
 * The cartouche of every printed document: Réf « PG04/EN01 », version,
 * dates. The quality manager keeps it here; the PDFs read it at print time.
 */

export type DocumentRow = {
  docType: DocType;
  reference: string;
  version: string;
  /** « AAAA-MM-JJ » for the date inputs, empty when unknown. */
  createdOn: string;
  updatedOn: string;
};

export function DocumentReferencesForm({ initial }: { initial: DocumentRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<DocumentRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function update(docType: DocType, patch: Partial<DocumentRow>) {
    setRows((current) => current.map((row) => (row.docType === docType ? { ...row, ...patch } : row)));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <FileBadge className="h-4 w-4 text-brand" aria-hidden="true" />
          Cartouches des documents
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Référence « PGxx/ENxx », version et dates imprimées en tête de chaque
          document, comme sur les formulaires papier. Une nouvelle version d&apos;un
          formulaire se déclare ici — le PDF suivant la porte.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 font-medium">Document</th>
                <th className="pb-2 pr-3 font-medium">Référence</th>
                <th className="pb-2 pr-3 font-medium">Version</th>
                <th className="pb-2 pr-3 font-medium">Créé le</th>
                <th className="pb-2 font-medium">Mis à jour le</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.docType} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">{DOC_TYPE_LABELS[row.docType]}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={row.reference}
                      onChange={(e) => update(row.docType, { reference: e.target.value })}
                      placeholder="PG04/EN01"
                      aria-label={`Référence — ${DOC_TYPE_LABELS[row.docType]}`}
                      className="input-field w-32 px-3 font-mono"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={row.version}
                      onChange={(e) => update(row.docType, { version: e.target.value })}
                      placeholder="F"
                      aria-label={`Version — ${DOC_TYPE_LABELS[row.docType]}`}
                      className="input-field w-16 px-3 font-mono"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="date"
                      value={row.createdOn}
                      onChange={(e) => update(row.docType, { createdOn: e.target.value })}
                      aria-label={`Créé le — ${DOC_TYPE_LABELS[row.docType]}`}
                      className="input-field w-40 px-3"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="date"
                      value={row.updatedOn}
                      onChange={(e) => update(row.docType, { updatedOn: e.target.value })}
                      aria-label={`Mis à jour le — ${DOC_TYPE_LABELS[row.docType]}`}
                      className="input-field w-40 px-3"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Cartouches enregistrés — les prochains documents les portent.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer les cartouches"}
        </button>
      </Card>
    </form>
  );
}
