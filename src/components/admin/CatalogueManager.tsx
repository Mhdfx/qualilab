"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X, Power } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/labels";

export type ServiceRow = {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  active: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  ALIMENTAIRE: "Alimentaire",
  EAU: "Eau",
  AMBIANCE: "Ambiance",
  PRESTATION: "Prestations générales",
};

/**
 * The service catalogue: what an analysis costs.
 *
 * These prices fill the invoice lines proposed from validated samples.
 * Deactivating an entry stops it pricing new lines; invoices already issued
 * keep their amounts, which live on the lines themselves.
 */
export function CatalogueManager({ services }: { services: ServiceRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const categories = Object.keys(CATEGORY_LABELS).filter((category) =>
    services.some((service) => service.category === category)
  );

  async function patch(id: string, body: Record<string, unknown>, tag: string) {
    if (busy) return false;
    setBusy(tag);
    setError("");
    try {
      const response = await fetch(`/api/lab-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Modification impossible.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-6">
        {categories.map((category) => (
          <section key={category}>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              {CATEGORY_LABELS[category]}
            </h2>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {services
                  .filter((service) => service.category === category)
                  .map((service) =>
                    editing === service.id ? (
                      <EditRow
                        key={service.id}
                        service={service}
                        busy={!!busy}
                        onSave={async (name, price) => {
                          const ok = await patch(
                            service.id,
                            { name, unitPrice: price },
                            `save-${service.id}`
                          );
                          if (ok) setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <li
                        key={service.id}
                        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                          service.active ? "" : "opacity-60"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">
                            {service.name}
                            {!service.active && (
                              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                désactivée
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-sm tabular-nums text-slate-500">
                            {formatCurrency(service.unitPrice)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              setEditing(service.id);
                              setError("");
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Modifier
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              patch(service.id, { active: !service.active }, `toggle-${service.id}`)
                            }
                            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                              service.active
                                ? "text-slate-600 hover:bg-slate-100"
                                : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            <Power className="h-3.5 w-3.5" aria-hidden="true" />
                            {service.active ? "Désactiver" : "Réactiver"}
                          </button>
                        </div>
                      </li>
                    )
                  )}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}

function EditRow({
  service,
  busy,
  onSave,
  onCancel,
}: {
  service: ServiceRow;
  busy: boolean;
  onSave: (name: string, price: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(String(service.unitPrice));

  return (
    <li className="border-l-4 border-brand bg-brand-light/20 px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor={`name-${service.id}`} className="block text-xs font-medium text-slate-600">
            Libellé
          </label>
          <input
            id={`name-${service.id}`}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="w-36">
          <label htmlFor={`price-${service.id}`} className="block text-xs font-medium text-slate-600">
            Prix HT (DH)
          </label>
          <input
            id={`price-${service.id}`}
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2.5 text-right text-sm tabular-nums text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(name, price)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Enregistrer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </button>
      </div>
    </li>
  );
}
