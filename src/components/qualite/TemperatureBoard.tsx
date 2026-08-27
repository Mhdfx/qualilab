"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Thermometer } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The daily readings board: one card per monitored equipment, quick entry,
 * immediate in/out-of-range verdict. The verdict comes from the server —
 * the same isOutOfRange() that stores it.
 */

export type MonitoredEquipment = {
  id: string;
  name: string;
  location: string | null;
  tempMin: number | null;
  tempMax: number | null;
  lastReading: { value: number; readAt: string; outOfRange: boolean } | null;
};

type Reading = {
  id: string;
  value: number;
  readAt: string;
  outOfRange: boolean;
  note: string | null;
  createdBy: { name: string } | null;
};

export function TemperatureBoard({ equipments }: { equipments: MonitoredEquipment[] }) {
  const [error, setError] = useState("");

  if (equipments.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        Aucun équipement sous surveillance de température — définissez des
        bornes (min/max) sur un équipement dans le registre métrologie.
      </Card>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {equipments.map((equipment) => (
          <EquipmentTempCard key={equipment.id} equipment={equipment} onError={setError} />
        ))}
      </div>
    </div>
  );
}

function EquipmentTempCard({
  equipment,
  onError,
}: {
  equipment: MonitoredEquipment;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [flash, setFlash] = useState<null | { outOfRange: boolean; value: number }>(null);

  async function save() {
    if (saving || !value.trim()) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/temperatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId: equipment.id, value, note }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Relevé impossible.");
        return;
      }
      setFlash({ outOfRange: data.outOfRange, value: data.value });
      setValue("");
      setNote("");
      router.refresh();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const last = flash
    ? { value: flash.value, outOfRange: flash.outOfRange, readAt: new Date().toISOString() }
    : equipment.lastReading;

  return (
    <Card className={`p-4 ${last?.outOfRange ? "border-rose-300" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{equipment.name}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {equipment.location ?? "Sans emplacement"} · plage [
            {equipment.tempMin ?? "—"} ; {equipment.tempMax ?? "—"}] °C
          </p>
        </div>
        {last ? (
          <div className="shrink-0 text-right">
            <p
              className={`text-2xl font-bold tabular-nums ${
                last.outOfRange ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {last.value} °C
            </p>
            <p className="text-xs text-slate-500">
              {last.outOfRange ? "HORS PLAGE — " : ""}
              {new Date(last.readAt).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : (
          <p className="shrink-0 text-sm italic text-slate-400">Aucun relevé</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Relevé (°C)</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
            placeholder="4,2"
            className="input-field mt-1 w-28 px-3 text-sm"
          />
        </label>
        <label className="block flex-1 text-sm">
          <span className="font-medium text-slate-700">Note</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Facultatif"
            className="input-field mt-1 px-3 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || !value.trim()}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <Thermometer className="h-4 w-4" aria-hidden="true" />
          {saving ? "…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((current) => !current)}
          aria-pressed={showHistory}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Historique
        </button>
      </div>

      {showHistory && <ReadingHistory equipmentId={equipment.id} refreshKey={flash?.value} />}
    </Card>
  );
}

function ReadingHistory({
  equipmentId,
  refreshKey,
}: {
  equipmentId: string;
  refreshKey?: number;
}) {
  const [readings, setReadings] = useState<Reading[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/temperatures?equipmentId=${equipmentId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!cancelled) setReadings(data);
      })
      .catch(() => {
        if (!cancelled) setReadings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [equipmentId, refreshKey]);

  if (readings === null) {
    return <p className="mt-3 text-sm text-slate-500">Chargement…</p>;
  }
  if (readings.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">Aucun relevé enregistré.</p>;
  }

  return (
    <ul className="mt-3 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
      {readings.map((reading) => (
        <li key={reading.id} className="flex items-center justify-between gap-2 px-3.5 py-2 text-sm">
          <span className={`font-semibold tabular-nums ${reading.outOfRange ? "text-rose-600" : "text-slate-700"}`}>
            {reading.value} °C{reading.outOfRange ? " — hors plage" : ""}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(reading.readAt).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {reading.createdBy && ` · ${reading.createdBy.name}`}
            {reading.note && ` · ${reading.note}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
