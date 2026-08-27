"use client";

import { useCallback, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Truck } from "lucide-react";
import { Card } from "@/components/ui/Card";

/** Suppliers and their payment conventions — the source of the due dates. */

export type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ice: string | null;
  paymentTermDays: number;
  notes: string | null;
  archived: boolean;
  unpaidInvoices: number;
};

const inputClass = "input-field px-3 text-sm" as const;

export function SuppliersManager({ initialSuppliers }: { initialSuppliers: SupplierRow[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/suppliers?archived=true");
    if (response.ok) setSuppliers(await response.json());
  }, []);

  async function toggleArchive(supplier: SupplierRow) {
    setError("");
    const response = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !supplier.archived }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Action impossible.");
      return;
    }
    reload();
  }

  const active = suppliers.filter((supplier) => !supplier.archived);
  const archived = suppliers.filter((supplier) => supplier.archived);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {active.length} fournisseur{active.length > 1 ? "s" : ""} actif
          {active.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Truck className="h-4 w-4" aria-hidden="true" />
          {creating ? "Fermer" : "Nouveau fournisseur"}
        </button>
      </div>

      {creating && (
        <SupplierForm
          onDone={() => {
            setCreating(false);
            reload();
          }}
          onError={setError}
        />
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {active.length === 0 && !creating ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Aucun fournisseur — créez le premier pour suivre ses factures.
        </Card>
      ) : (
        <ul className="space-y-3">
          {active.map((supplier) => (
            <li key={supplier.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{supplier.name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Paiement à{" "}
                      {supplier.paymentTermDays === 0
                        ? "réception (comptant)"
                        : `${supplier.paymentTermDays} jours`}
                      {supplier.contact && ` · ${supplier.contact}`}
                      {supplier.phone && ` · ${supplier.phone}`}
                      {supplier.unpaidInvoices > 0 &&
                        ` · ${supplier.unpaidInvoices} facture${supplier.unpaidInvoices > 1 ? "s" : ""} à payer`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === supplier.id ? null : supplier.id)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleArchive(supplier)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archiver
                    </button>
                  </div>
                </div>
                {editing === supplier.id && (
                  <div className="mt-3">
                    <SupplierForm
                      supplier={supplier}
                      onDone={() => {
                        setEditing(null);
                        reload();
                      }}
                      onError={setError}
                    />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-slate-500">
            Fournisseurs archivés ({archived.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {archived.map((supplier) => (
              <li
                key={supplier.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500"
              >
                <span>{supplier.name}</span>
                <button
                  type="button"
                  onClick={() => toggleArchive(supplier)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-brand transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SupplierForm({
  supplier,
  onDone,
  onError,
}: {
  supplier?: SupplierRow;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    name: supplier?.name ?? "",
    contact: supplier?.contact ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    address: supplier?.address ?? "",
    ice: supplier?.ice ?? "",
    paymentTermDays: supplier ? String(supplier.paymentTermDays) : "30",
    notes: supplier?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set(field: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(
        supplier ? `/api/suppliers/${supplier.id}` : "/api/suppliers",
        {
          method: supplier ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onDone();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof typeof values; label: string; placeholder?: string }[] = [
    { key: "name", label: "Nom du fournisseur" },
    { key: "contact", label: "Contact" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Téléphone" },
    { key: "address", label: "Adresse" },
    { key: "ice", label: "ICE" },
    { key: "paymentTermDays", label: "Délai de paiement (jours)", placeholder: "30 · 0 = comptant" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <Card className="mb-4 border-l-4 border-brand p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="font-medium text-slate-700">{field.label}</span>
            <input
              value={values[field.key]}
              onChange={set(field.key)}
              placeholder={field.placeholder}
              inputMode={field.key === "paymentTermDays" ? "numeric" : undefined}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : supplier ? "Enregistrer" : "Créer le fournisseur"}
      </button>
    </Card>
  );
}
