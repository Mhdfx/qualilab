"use client";

import { useCallback, useState } from "react";
import { Award, Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EIL_STATUSES, type EilStatusValue } from "@/lib/quality-validation";

/** EIL campaigns — the proficiency-testing register an auditor asks for. */

export type EilRow = {
  id: string;
  name: string;
  organizer: string | null;
  scope: string | null;
  startDate: string | null;
  resultDate: string | null;
  status: EilStatusValue;
  outcome: string | null;
  satisfactory: boolean | null;
  notes: string | null;
};

const STATUS_LABELS: Record<EilStatusValue, string> = {
  PREVUE: "Prévue",
  EN_COURS: "En cours",
  RESULTATS_RECUS: "Résultats reçus",
  CLOTUREE: "Clôturée",
};

const STATUS_BADGES: Record<EilStatusValue, string> = {
  PREVUE: "bg-slate-100 text-slate-600 ring-slate-200",
  EN_COURS: "bg-blue-50 text-blue-700 ring-blue-200",
  RESULTATS_RECUS: "bg-violet-50 text-violet-700 ring-violet-200",
  CLOTUREE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const inputClass = "input-field px-3 text-sm" as const;

export function EilManager({ initialCampaigns }: { initialCampaigns: EilRow[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/eil");
    if (response.ok) setCampaigns(await response.json());
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {campaigns.length} campagne{campaigns.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Award className="h-4 w-4" aria-hidden="true" />
          {creating ? "Fermer" : "Nouvelle campagne"}
        </button>
      </div>

      {creating && (
        <EilForm
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

      {campaigns.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Aucune campagne EIL — enregistrez la première (BIPEA, LNCM…).
        </Card>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                      {campaign.name}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_BADGES[campaign.status]}`}>
                        {STATUS_LABELS[campaign.status]}
                      </span>
                      {campaign.satisfactory !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                            campaign.satisfactory
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-rose-50 text-rose-700 ring-rose-200"
                          }`}
                        >
                          {campaign.satisfactory ? "satisfaisant" : "non satisfaisant"}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {campaign.organizer ?? "Organisme non renseigné"}
                      {campaign.scope && ` · ${campaign.scope}`}
                      {campaign.startDate &&
                        ` · début ${new Date(campaign.startDate).toLocaleDateString("fr-FR")}`}
                      {campaign.outcome && ` · ${campaign.outcome}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === campaign.id ? null : campaign.id)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Mettre à jour
                  </button>
                </div>
                {editing === campaign.id && (
                  <div className="mt-3">
                    <EilForm
                      campaign={campaign}
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
    </div>
  );
}

function EilForm({
  campaign,
  onDone,
  onError,
}: {
  campaign?: EilRow;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    name: campaign?.name ?? "",
    organizer: campaign?.organizer ?? "",
    scope: campaign?.scope ?? "",
    startDate: campaign?.startDate?.slice(0, 10) ?? "",
    resultDate: campaign?.resultDate?.slice(0, 10) ?? "",
    status: campaign?.status ?? ("PREVUE" as EilStatusValue),
    outcome: campaign?.outcome ?? "",
    notes: campaign?.notes ?? "",
  });
  const [satisfactory, setSatisfactory] = useState<boolean | null>(
    campaign?.satisfactory ?? null
  );
  const [saving, setSaving] = useState(false);

  function set(field: keyof typeof values) {
    return (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(
        campaign ? `/api/eil/${campaign.id}` : "/api/eil",
        {
          method: campaign ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, satisfactory }),
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

  return (
    <Card className="mb-4 border-l-4 border-brand p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Campagne</span>
          <input value={values.name} onChange={set("name")} className={`mt-1 ${inputClass}`} placeholder="BIPEA microbiologie S2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Organisme</span>
          <input value={values.organizer} onChange={set("organizer")} className={`mt-1 ${inputClass}`} placeholder="BIPEA, LNCM…" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Portée</span>
          <input value={values.scope} onChange={set("scope")} className={`mt-1 ${inputClass}`} placeholder="E. coli / produits laitiers" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Statut</span>
          <select value={values.status} onChange={set("status")} className={`mt-1 ${inputClass} bg-white`}>
            {EIL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Début</span>
          <input type="date" value={values.startDate} onChange={set("startDate")} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Résultats le</span>
          <input type="date" value={values.resultDate} onChange={set("resultDate")} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Performance</span>
          <input value={values.outcome} onChange={set("outcome")} className={`mt-1 ${inputClass}`} placeholder="z-score 0,8" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Verdict</span>
          <select
            value={satisfactory === null ? "" : satisfactory ? "oui" : "non"}
            onChange={(event) =>
              setSatisfactory(
                event.target.value === "" ? null : event.target.value === "oui"
              )
            }
            className={`mt-1 ${inputClass} bg-white`}
          >
            <option value="">En attente</option>
            <option value="oui">Satisfaisant</option>
            <option value="non">Non satisfaisant</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : campaign ? "Enregistrer" : "Créer la campagne"}
      </button>
    </Card>
  );
}
