"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Pencil, Plus, X, Bell, BellOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SAMPLE_TYPE_LABELS } from "@/lib/labels";
import type { SampleType } from "@/generated/prisma/client";

export type ParameterRow = {
  id: string;
  name: string;
  category: SampleType;
  unit: string | null;
  threshold: string | null;
  limitValue: number | null;
  alertOnExceed: boolean;
};

const DOMAINS: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

/**
 * The laboratory's analysis parameters.
 *
 * This screen is where the real norms are entered. A limit here decides
 * whether a result is declared conform, and the "sensitive" flag decides which
 * germs raise a contamination alert — so the screen says that plainly rather
 * than presenting the fields as neutral settings.
 */
export function ParametersManager({ parameters }: { parameters: ParameterRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState<SampleType | null>(null);
  const [error, setError] = useState("");

  const provisional = parameters.filter((p) => p.alertOnExceed).length;

  return (
    <div>
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <b>Les limites actuelles sont provisoires.</b> Elles suivent les
            normes marocaines usuelles en attendant les valeurs officielles du
            laboratoire. Les modifier ici suffit — aucune intervention technique
            n&apos;est nécessaire. {provisional} paramètre
            {provisional > 1 ? "s" : ""} déclenche
            {provisional > 1 ? "nt" : ""} une alerte de contamination.
          </span>
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-6">
        {DOMAINS.map((domain) => {
          const rows = parameters.filter((p) => p.category === domain);
          return (
            <section key={domain}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  {SAMPLE_TYPE_LABELS[domain]}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(domain);
                    setEditing(null);
                    setError("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Ajouter
                </button>
              </div>

              <Card className="overflow-hidden">
                {creating === domain && (
                  <ParameterForm
                    category={domain}
                    onCancel={() => setCreating(null)}
                    onSaved={() => {
                      setCreating(null);
                      router.refresh();
                    }}
                    onError={setError}
                  />
                )}

                {rows.length === 0 && creating !== domain ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    Aucun paramètre pour ce domaine.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map((row) =>
                      editing === row.id ? (
                        <li key={row.id}>
                          <ParameterForm
                            category={domain}
                            parameter={row}
                            onCancel={() => setEditing(null)}
                            onSaved={() => {
                              setEditing(null);
                              router.refresh();
                            }}
                            onError={setError}
                          />
                        </li>
                      ) : (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                              {row.name}
                              {row.alertOnExceed ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                                  <Bell className="h-3 w-3" aria-hidden="true" />
                                  alerte
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              {row.unit ?? "unité non définie"} · seuil{" "}
                              {row.threshold ?? "—"} · limite{" "}
                              {row.limitValue !== null ? (
                                <span className="font-mono font-medium text-slate-700">
                                  {row.limitValue}
                                </span>
                              ) : (
                                <span className="text-amber-700">non définie</span>
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setEditing(row.id);
                              setCreating(null);
                              setError("");
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Modifier
                          </button>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ParameterForm({
  category,
  parameter,
  onCancel,
  onSaved,
  onError,
}: {
  category: SampleType;
  parameter?: ParameterRow;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(parameter?.name ?? "");
  const [unit, setUnit] = useState(parameter?.unit ?? "");
  const [threshold, setThreshold] = useState(parameter?.threshold ?? "");
  const [limitValue, setLimitValue] = useState(
    parameter?.limitValue !== null && parameter?.limitValue !== undefined
      ? String(parameter.limitValue)
      : ""
  );
  const [alertOnExceed, setAlertOnExceed] = useState(parameter?.alertOnExceed ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");

    try {
      const response = await fetch(
        parameter ? `/api/parameters/${parameter.id}` : "/api/parameters",
        {
          method: parameter ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            unit,
            threshold,
            limitValue,
            alertOnExceed,
          }),
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

  return (
    <div className="border-l-4 border-brand bg-brand-light/20 px-4 py-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          id="p-name"
          label="Paramètre"
          value={name}
          onChange={setName}
          disabled={!!parameter}
          hint={parameter ? "Le nom ne se modifie pas" : undefined}
        />
        <Field id="p-unit" label="Unité" value={unit} onChange={setUnit} placeholder="UFC/g" />
        <Field
          id="p-threshold"
          label="Seuil affiché"
          value={threshold}
          onChange={setThreshold}
          placeholder="1.10² UFC/g"
          hint="Tel qu'il apparaît sur le rapport"
        />
        <Field
          id="p-limit"
          label="Limite (nombre)"
          value={limitValue}
          onChange={setLimitValue}
          placeholder="100"
          inputMode="decimal"
          hint="Sert au calcul de conformité"
        />
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
        <input
          type="checkbox"
          checked={alertOnExceed}
          onChange={(event) => setAlertOnExceed(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium text-slate-800">
            {alertOnExceed ? (
              <Bell className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            )}
            Paramètre sensible
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Un dépassement de la limite déclenche une alerte de contamination
            au client après approbation. Nécessite une limite.
          </span>
        </span>
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  inputMode?: "decimal";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-100 disabled:text-slate-500"
      />
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
