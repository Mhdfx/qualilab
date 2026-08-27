"use client";

import { useCallback, useState } from "react";
import { useEffect } from "react";
import {
  Archive,
  BadgeCheck,
  ClipboardCheck,
  Gauge,
  History,
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CalibrationState } from "@/lib/quality";

/**
 * The metrology register: each equipment, its calibration schedule, its
 * records. The due badges come computed from the API so every screen
 * judges the schedule identically.
 */

export type EquipmentRow = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  calibrationFrequencyMonths: number | null;
  lastCalibratedAt: string | null;
  tempMin: number | null;
  tempMax: number | null;
  archived: boolean;
  calibration: { state: CalibrationState; dueDate: string | null };
};

type CalibrationRow = {
  id: string;
  performedAt: string;
  provider: string | null;
  certificate: string | null;
  result: "CONFORME" | "NON_CONFORME";
  notes: string | null;
  createdBy: { name: string } | null;
};

const inputClass = "input-field px-3 text-sm" as const;

const STATE_BADGES: Record<CalibrationState, { label: string; className: string } | null> = {
  OK: null,
  BIENTOT: { label: "étalonnage bientôt", className: "bg-amber-100 text-amber-800 ring-amber-200" },
  RETARD: { label: "étalonnage en retard", className: "bg-rose-100 text-rose-700 ring-rose-200" },
  JAMAIS: { label: "jamais étalonné", className: "bg-rose-100 text-rose-700 ring-rose-200" },
};

export function EquipmentManager({ initialEquipments }: { initialEquipments: EquipmentRow[] }) {
  const [equipments, setEquipments] = useState(initialEquipments);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/equipments");
    if (response.ok) setEquipments(await response.json());
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {equipments.length} équipement{equipments.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Gauge className="h-4 w-4" aria-hidden="true" />
          {creating ? "Fermer" : "Nouvel équipement"}
        </button>
      </div>

      {creating && (
        <EquipmentForm
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

      {equipments.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Aucun équipement — enregistrez le premier pour démarrer le registre.
        </Card>
      ) : (
        <ul className="space-y-3">
          {equipments.map((equipment) => (
            <li key={equipment.id}>
              <EquipmentCard equipment={equipment} onChanged={reload} onError={setError} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EquipmentCard({
  equipment,
  onChanged,
  onError,
}: {
  equipment: EquipmentRow;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [panel, setPanel] = useState<"none" | "calibrate" | "edit" | "history">("none");
  const badge = STATE_BADGES[equipment.calibration.state];

  async function archive() {
    onError("");
    const response = await fetch(`/api/equipments/${equipment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (!response.ok) {
      const data = await response.json();
      onError(data.error ?? "Action impossible.");
      return;
    }
    onChanged();
  }

  return (
    <Card className={`p-4 ${badge ? "border-amber-300" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
            {equipment.name}
            {equipment.code && (
              <span className="font-mono text-xs text-slate-500">{equipment.code}</span>
            )}
            {badge && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge.className}`}>
                {badge.label}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {equipment.location ?? "Sans emplacement"}
            {equipment.calibrationFrequencyMonths
              ? ` · étalonnage tous les ${equipment.calibrationFrequencyMonths} mois${
                  equipment.calibration.dueDate
                    ? ` (prochain : ${new Date(equipment.calibration.dueDate).toLocaleDateString("fr-FR")})`
                    : ""
                }`
              : " · non étalonné"}
            {equipment.tempMin !== null || equipment.tempMax !== null
              ? ` · plage [${equipment.tempMin ?? "—"} ; ${equipment.tempMax ?? "—"}] °C`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PanelButton icon={ClipboardCheck} label="Étalonnage" active={panel === "calibrate"} onClick={() => setPanel(panel === "calibrate" ? "none" : "calibrate")} />
          <PanelButton icon={History} label="Historique" active={panel === "history"} onClick={() => setPanel(panel === "history" ? "none" : "history")} />
          <PanelButton icon={Pencil} label="Modifier" active={panel === "edit"} onClick={() => setPanel(panel === "edit" ? "none" : "edit")} />
          <PanelButton icon={Archive} label="Archiver" active={false} onClick={archive} />
        </div>
      </div>

      {panel === "calibrate" && (
        <CalibrationForm
          equipmentId={equipment.id}
          onDone={() => {
            setPanel("none");
            onChanged();
          }}
          onError={onError}
        />
      )}
      {panel === "edit" && (
        <div className="mt-3">
          <EquipmentForm
            equipment={equipment}
            onDone={() => {
              setPanel("none");
              onChanged();
            }}
            onError={onError}
          />
        </div>
      )}
      {panel === "history" && <CalibrationHistory equipmentId={equipment.id} />}
    </Card>
  );
}

function PanelButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active
          ? "border-brand bg-brand/5 text-brand"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

function EquipmentForm({
  equipment,
  onDone,
  onError,
}: {
  equipment?: EquipmentRow;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    name: equipment?.name ?? "",
    code: equipment?.code ?? "",
    location: equipment?.location ?? "",
    calibrationFrequencyMonths:
      equipment?.calibrationFrequencyMonths?.toString() ?? "",
    tempMin: equipment?.tempMin?.toString() ?? "",
    tempMax: equipment?.tempMax?.toString() ?? "",
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
        equipment ? `/api/equipments/${equipment.id}` : "/api/equipments",
        {
          method: equipment ? "PATCH" : "POST",
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
    { key: "name", label: "Équipement", placeholder: "Étuve 37 °C" },
    { key: "code", label: "Code interne", placeholder: "E-001" },
    { key: "location", label: "Emplacement", placeholder: "Salle micro" },
    { key: "calibrationFrequencyMonths", label: "Étalonnage (mois)", placeholder: "Vide = non étalonné" },
    { key: "tempMin", label: "Temp. min (°C)", placeholder: "Vide = non bornée" },
    { key: "tempMax", label: "Temp. max (°C)", placeholder: "Vide = non bornée" },
  ];

  return (
    <Card className="mb-4 border-l-4 border-brand p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="font-medium text-slate-700">{field.label}</span>
            <input
              value={values[field.key]}
              onChange={set(field.key)}
              placeholder={field.placeholder}
              inputMode={
                ["calibrationFrequencyMonths", "tempMin", "tempMax"].includes(field.key)
                  ? "decimal"
                  : undefined
              }
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
        {saving ? "Enregistrement…" : equipment ? "Enregistrer" : "Créer l'équipement"}
      </button>
    </Card>
  );
}

function CalibrationForm({
  equipmentId,
  onDone,
  onError,
}: {
  equipmentId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [performedAt, setPerformedAt] = useState("");
  const [provider, setProvider] = useState("");
  const [certificate, setCertificate] = useState("");
  const [result, setResult] = useState<"CONFORME" | "NON_CONFORME">("CONFORME");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(`/api/equipments/${equipmentId}/calibrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ performedAt, provider, certificate, result, notes }),
      });
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
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Date</span>
          <input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Organisme</span>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="LNM…" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">N° certificat</span>
          <input value={certificate} onChange={(e) => setCertificate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Résultat</span>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as "CONFORME" | "NON_CONFORME")}
            className={`mt-1 ${inputClass} bg-white`}
          >
            <option value="CONFORME">Conforme</option>
            <option value="NON_CONFORME">Non conforme</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="Facultatif" />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
        {saving ? "Enregistrement…" : "Enregistrer l'étalonnage"}
      </button>
    </div>
  );
}

function CalibrationHistory({ equipmentId }: { equipmentId: string }) {
  const [records, setRecords] = useState<CalibrationRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/equipments/${equipmentId}/calibrations`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [equipmentId]);

  if (records === null) {
    return <p className="mt-3 text-sm text-slate-500">Chargement du registre…</p>;
  }
  if (records.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">Aucun étalonnage enregistré.</p>;
  }

  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {records.map((record) => (
        <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-sm">
          <span className={`font-medium ${record.result === "CONFORME" ? "text-emerald-700" : "text-rose-700"}`}>
            {new Date(record.performedAt).toLocaleDateString("fr-FR")} ·{" "}
            {record.result === "CONFORME" ? "Conforme" : "Non conforme"}
          </span>
          <span className="text-xs text-slate-500">
            {record.provider && `${record.provider} · `}
            {record.certificate && `cert. ${record.certificate} · `}
            {record.createdBy?.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
