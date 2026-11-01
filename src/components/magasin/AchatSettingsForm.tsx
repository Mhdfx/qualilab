"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  WITHHOLDING_BASE_LABELS,
  WITHHOLDING_SCOPE_LABELS,
  type WithholdingBaseCode,
  type WithholdingScopeCode,
  type WithholdingSettings,
} from "@/lib/withholding";

/**
 * The Achat & Stock settings form (lot 3D). Read-only for the magasinier;
 * the administrator saves them (journalled). No rate of the retenue is
 * proposed by the code: empty until the accountant gives them (R-24).
 */

type Settings = { expiryWarningDays: number; defaultVatRate: number; withholding: WithholdingSettings };

const inputClass = "input-field px-3 text-sm" as const;
const text = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

export function AchatSettingsForm({
  initial,
  editable,
  partialPayments,
  paymentRequiresCertificate,
}: {
  initial: Settings;
  editable: boolean;
  partialPayments: boolean;
  paymentRequiresCertificate: boolean;
}) {
  const [values, setValues] = useState({
    expiryWarningDays: String(initial.expiryWarningDays),
    defaultVatRate: text(initial.defaultVatRate),
    withholdingScope: initial.withholding.scope,
    withholdingBase: initial.withholding.base,
    withholdingRateWithCertificate: text(initial.withholding.rateWithCertificate),
    withholdingRateWithoutCertificate: text(initial.withholding.rateWithoutCertificate),
    taxCertificateValidityMonths: String(initial.withholding.certificateValidityMonths),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/stock/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      {!editable && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Ces réglages sont modifiés par l&apos;administrateur.
        </p>
      )}
      <fieldset disabled={!editable} className="space-y-5">
        <Card className="p-5">
          <h2 className="section-title">Stock</h2>
          <label className="mt-3 block max-w-xs text-sm">
            <span className="font-medium text-slate-700">Alerte « expire bientôt » (jours avant la péremption)</span>
            <input value={values.expiryWarningDays} onChange={set("expiryWarningDays")} inputMode="numeric" className={`mt-1 ${inputClass}`} />
          </label>
        </Card>

        <Card className="p-5">
          <h2 className="section-title">Factures fournisseurs</h2>
          <label className="mt-3 block max-w-xs text-sm">
            <span className="font-medium text-slate-700">Taux de TVA proposé (%)</span>
            <input value={values.defaultVatRate} onChange={set("defaultVatRate")} inputMode="decimal" className={`mt-1 ${inputClass}`} />
          </label>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              Paiements partiels : {partialPayments ? "acceptés" : "non — un paiement règle tout le reste"} (à confirmer par le laboratoire).
            </li>
            <li>
              Facture sans attestation fiscale valide :{" "}
              {paymentRequiresCertificate ? "paiement refusé tant que l'attestation n'est pas enregistrée" : "avertissement, paiement possible"} (à
              confirmer par le comptable).
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="section-title">Retenue à la source et attestation de régularité fiscale</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">S&apos;applique à</span>
              <select value={values.withholdingScope} onChange={set("withholdingScope")} className={`mt-1 ${inputClass} bg-white`}>
                {(Object.keys(WITHHOLDING_SCOPE_LABELS) as WithholdingScopeCode[]).map((scope) => (
                  <option key={scope} value={scope}>
                    {WITHHOLDING_SCOPE_LABELS[scope]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Base de calcul</span>
              <select value={values.withholdingBase} onChange={set("withholdingBase")} className={`mt-1 ${inputClass} bg-white`}>
                {(Object.keys(WITHHOLDING_BASE_LABELS) as WithholdingBaseCode[]).map((base) => (
                  <option key={base} value={base}>
                    {WITHHOLDING_BASE_LABELS[base]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Taux avec attestation valide (%)</span>
              <input value={values.withholdingRateWithCertificate} onChange={set("withholdingRateWithCertificate")} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="Vide = aucune retenue" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Taux sans attestation valide (%)</span>
              <input value={values.withholdingRateWithoutCertificate} onChange={set("withholdingRateWithoutCertificate")} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="Vide = aucune retenue" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Validité d&apos;une attestation (mois)</span>
              <input value={values.taxCertificateValidityMonths} onChange={set("taxCertificateValidityMonths")} inputMode="numeric" className={`mt-1 ${inputClass}`} />
              <span className="mt-1 block text-xs text-slate-500">Sert quand la fin de validité n&apos;est pas saisie.</span>
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Le taux est proposé sur chaque nouvelle facture (modifiable) : net à payer = TTC − retenue. Les retenues du mois sont dans l&apos;export
            du journal des achats (feuille « Retenues à la source »).
          </p>
        </Card>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Réglages enregistrés.
        </p>
      )}
      {editable && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer les réglages"}
        </button>
      )}
    </div>
  );
}
