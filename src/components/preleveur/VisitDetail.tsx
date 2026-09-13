"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CheckCircle2, FileText, Thermometer } from "lucide-react";
import type { LineKind, SampleStatus } from "@/generated/prisma/enums";
import { LINE_KIND_LABELS, SAMPLER_KIND_LABELS, formatDateTime } from "@/lib/labels";
import { SERIE_STATUS_LABELS, type SerieProgress, type SerieStatus } from "@/lib/series";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fromLocalInput, lineDesignation, toLocalInput } from "./visit-types";

export type VisitData = {
  id: string;
  serialNumber: string;
  kind: "VISITE" | "DEPOT";
  client: { id: string; name: string };
  site: { id: string; name: string } | null;
  interlocutor: string | null;
  samplerKind: keyof typeof SAMPLER_KIND_LABELS;
  samplerUser: { id: string; name: string } | null;
  samplerName: string | null;
  clientReference: string | null;
  startedAt: string;
  endedAt: string | null;
  arrivedAt: string | null;
  coolerTemperature: number | null;
  notes: string | null;
  status: SerieStatus;
  progress: SerieProgress;
  samples: {
    id: string;
    code: string;
    lineNumber: number;
    lineKind: LineKind;
    status: SampleStatus;
    lieu: string;
    produit: string | null;
    surfaceLabel: string | null;
    personName: string | null;
    numeroLot: string | null;
    unitCount: number;
    productTemperature: number | null;
    nature: { label: string };
    parameters: { parameter: { id: string; name: string } }[];
  }[];
};

/** Shrinks a phone photo to a data URI the API accepts (≤ 1.5 MB). */
async function fileToDataUri(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function VisitDetail({ visit: initial }: { visit: VisitData }) {
  const router = useRouter();
  const [visit, setVisit] = useState(initial);
  const [endedAt, setEndedAt] = useState(initial.endedAt ? toLocalInput(new Date(initial.endedAt)) : "");
  const [arrivedAt, setArrivedAt] = useState(initial.arrivedAt ? toLocalInput(new Date(initial.arrivedAt)) : "");
  const [cooler, setCooler] = useState(initial.coolerTemperature === null ? "" : String(initial.coolerTemperature));
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        endedAt: fromLocalInput(endedAt),
        arrivedAt: fromLocalInput(arrivedAt),
        coolerTemperature: cooler,
      };
      if (photo) body.signedProtocolData = photo;
      const res = await fetch(`/api/series/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setVisit((v) => ({ ...v, ...data }));
      if (photo) setHasPhoto(true);
      setPhoto(null);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const closed = Boolean(visit.arrivedAt);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/preleveur"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mes visites
      </Link>
      <PageHeader
        badge={SERIE_STATUS_LABELS[visit.status]}
        title={`Visite ${visit.serialNumber}`}
        subtitle={`${visit.client.name}${visit.site ? ` · ${visit.site.name}` : ""}`}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">La visite</h2>
              <Link
                href={`/api/series/${visit.id}/document`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-brand transition hover:bg-brand-light/60"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Protocole (PDF)
              </Link>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Prélevé par">
                {visit.samplerKind === "QUALILAB" ? visit.samplerUser?.name ?? "—" : SAMPLER_KIND_LABELS[visit.samplerKind]}
              </Info>
              <Info label="Interlocuteur">{visit.interlocutor ?? "—"}</Info>
              <Info label="Début">{formatDateTime(visit.startedAt)}</Info>
              <Info label="Fin">{visit.endedAt ? formatDateTime(visit.endedAt) : "—"}</Info>
              <Info label="Arrivée au laboratoire">{visit.arrivedAt ? formatDateTime(visit.arrivedAt) : "—"}</Info>
              <Info label="T° à l'arrivée">
                {visit.coolerTemperature === null ? "—" : `${String(visit.coolerTemperature).replace(".", ",")} °C`}
              </Info>
              {visit.clientReference && <Info label="Référence client">{visit.clientReference}</Info>}
            </dl>
            {visit.notes && <p className="mt-3 text-sm text-slate-600">{visit.notes}</p>}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Échantillons ({visit.samples.length})
            </h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {visit.samples.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      Ligne {s.lineNumber} · {s.nature.label}
                    </p>
                    <p className="font-medium text-slate-900">{lineDesignation(s)}</p>
                    <p className="text-xs text-slate-500">
                      {LINE_KIND_LABELS[s.lineKind]} · {s.lieu}
                      {s.numeroLot ? ` · lot ${s.numeroLot}` : ""}
                      {s.unitCount > 1 ? ` · n = ${s.unitCount}` : ""}
                      {s.productTemperature !== null ? ` · ${String(s.productTemperature).replace(".", ",")} °C` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {s.parameters.map((p) => p.parameter.name).join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Thermometer className="h-4 w-4" aria-hidden="true" />
              Arrivée au laboratoire
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              À compléter au retour : la réception s&apos;appuie sur ces heures et sur la température de la glacière.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="endedAt" className="mb-1.5 block text-sm font-semibold text-slate-700">Fin du prélèvement</label>
                <input id="endedAt" type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} className="input-field px-3" />
              </div>
              <div>
                <label htmlFor="arrivedAt" className="mb-1.5 block text-sm font-semibold text-slate-700">Arrivée au laboratoire</label>
                <input id="arrivedAt" type="datetime-local" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} className="input-field px-3" />
              </div>
              <div>
                <label htmlFor="cooler" className="mb-1.5 block text-sm font-semibold text-slate-700">Température à l&apos;arrivée (°C)</label>
                <input id="cooler" type="text" inputMode="decimal" value={cooler} onChange={(e) => setCooler(e.target.value)} placeholder="Ex. : 1" className="input-field px-4" />
              </div>
              <div>
                <label htmlFor="photo" className="mb-1.5 block text-sm font-semibold text-slate-700">Photo du protocole signé</label>
                <label className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand">
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  {photo ? "Photo prête à envoyer" : hasPhoto ? "Remplacer la photo" : "Prendre / choisir une photo"}
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setPhoto(await fileToDataUri(file));
                      } catch {
                        setError("Photo illisible.");
                      }
                    }}
                  />
                </label>
                {(hasPhoto || photo) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {photo ? "Nouvelle photo sélectionnée" : "Protocole signé joint à la visite"}
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">{error}</p>
              )}
              {saved && !error && (
                <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">Enregistré.</p>
              )}
              <PrimaryButton type="button" onClick={save} disabled={busy} className="w-full min-h-[48px]">
                {busy ? "Enregistrement…" : closed ? "Mettre à jour" : "Enregistrer l'arrivée"}
              </PrimaryButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{children}</dd>
    </div>
  );
}
