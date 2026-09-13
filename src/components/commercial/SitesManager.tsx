"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Pencil, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type SiteRow = {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  contact: string | null;
  active: boolean;
};

/**
 * A client's sampling sites — the list the préleveur picks from on site
 * (« Siège », « Cuisine centrale », « Usine de Berrechid »). Sites are
 * deactivated, never deleted: séries refer to them.
 */
export function SitesManager({
  clientId,
  initial,
  canEdit,
}: {
  clientId: string;
  initial: SiteRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sites de prélèvement
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(null);
              setError("");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un site
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {creating && (
        <SiteForm
          clientId={clientId}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      {initial.length === 0 && !creating ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
          Aucun site : les visites de ce client se font au siège. Ajoutez ses
          sites pour que le préleveur les choisisse dans une liste.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {initial.map((site) =>
            editing === site.id ? (
              <li key={site.id} className="py-2">
                <SiteForm
                  clientId={clientId}
                  site={site}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    router.refresh();
                  }}
                  onError={setError}
                />
              </li>
            ) : (
              <li key={site.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {site.name}
                    {site.code && <span className="font-mono text-xs text-slate-500">{site.code}</span>}
                    {!site.active && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        inactif
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[site.address, site.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
                    {site.contact ? ` · ${site.contact}` : ""}
                    {site.phone ? ` · ${site.phone}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(site.id);
                      setCreating(false);
                      setError("");
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Modifier
                  </button>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </Card>
  );
}

function SiteForm({
  clientId,
  site,
  onCancel,
  onSaved,
  onError,
}: {
  clientId: string;
  site?: SiteRow;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    name: site?.name ?? "",
    code: site?.code ?? "",
    address: site?.address ?? "",
    city: site?.city ?? "",
    phone: site?.phone ?? "",
    contact: site?.contact ?? "",
    active: site?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(
        site ? `/api/clients/${clientId}/sites/${site.id}` : `/api/clients/${clientId}/sites`,
        {
          method: site ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onSaved();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof values, label: string, placeholder = "") => (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <input
        type="text"
        value={String(values[key])}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={placeholder}
        className="input-field mt-1 px-3"
      />
    </div>
  );

  return (
    <form onSubmit={save} noValidate className="rounded-xl border border-brand/20 bg-brand-light/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("name", "Nom du site *", "Ex. : Cuisine centrale")}
        {field("code", "Code", "Facultatif")}
        {field("address", "Adresse")}
        {field("city", "Ville")}
        {field("contact", "Contact sur place")}
        {field("phone", "Téléphone")}
      </div>
      {site && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
            className="h-4 w-4 accent-brand"
          />
          Site actif (proposé au préleveur)
        </label>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </button>
      </div>
    </form>
  );
}
