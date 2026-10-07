"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CheckCircle2, FileText, Thermometer } from "lucide-react";
import type {
  AirMethod,
  Cadre,
  Family,
  LineKind,
  SampleStatus,
  SurfaceState,
} from "@/generated/prisma/enums";
import {
  CADRE_CHOICES,
  CADRE_LABELS,
  LINE_KIND_LABELS,
  SAMPLER_KIND_LABELS,
  formatCadre,
  formatDateTime,
} from "@/lib/labels";
import { SERIE_STATUS_LABELS, type SerieProgress, type SerieStatus } from "@/lib/series";
import type { LineFamily } from "@/lib/nature-family";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LegalTimeHint } from "@/components/LegalTimeHint";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fromLocalInput, lineDesignation, toLocalInput } from "./visit-types";
import { familiesLabel, groupByLine, sampleFamily } from "./visit-samples";

type VisitSample = {
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
  /** The V2 / V4 fields: optional so that a payload not selecting them
   *  still reads, null on the samples entered before. */
  surfaceAreaCm2?: number | null;
  surfaceState?: SurfaceState | null;
  airMethod?: AirMethod | null;
  nature: { label: string; family?: Family | null };
  parameters: { parameter: { id: string; name: string } }[];
};

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
  cadre: Cadre;
  /** The precision of « Autre » (« Autre — texte »). */
  cadreNote?: string | null;
  receivedAt: string | null;
  clientReference: string | null;
  startedAt: string;
  endedAt: string | null;
  arrivedAt: string | null;
  coolerTemperature: number | null;
  analysesMicro: boolean;
  analysesChimie: boolean;
  notes: string | null;
  status: SerieStatus;
  progress: SerieProgress;
  samples: VisitSample[];
};

const CADRE_NOTE_MAX = 191;

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

const decimal = (value: number) => String(value).replace(".", ",");

/** The analyses asked for one sample, or what happens when none was ticked (V6). */
function analysesText(sample: VisitSample) {
  const names = sample.parameters.map((p) => p.parameter.name);
  return names.length > 0 ? names.join(", ") : "Aucune analyse demandée : le laboratoire les fixera.";
}

/** Type, place, lot, area, temperature — what the line's samples share. */
function lineDetails(sample: VisitSample, withUnits: boolean) {
  return [
    LINE_KIND_LABELS[sample.lineKind],
    sample.lieu,
    sample.numeroLot ? `lot ${sample.numeroLot}` : "",
    sample.lineKind === "SURFACE" && sample.surfaceAreaCm2 ? `${sample.surfaceAreaCm2} cm²` : "",
    withUnits && sample.unitCount > 1 ? `n = ${sample.unitCount}` : "",
    sample.productTemperature !== null ? `${decimal(sample.productTemperature)} °C` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The precision of « Autre » as stored: none on another cadre. */
function storedNote(visit: Pick<VisitData, "cadre" | "cadreNote">) {
  return visit.cadre === "AUTRE" ? (visit.cadreNote ?? "").trim() : "";
}

export function VisitDetail({ visit: initial }: { visit: VisitData }) {
  const router = useRouter();
  const [visit, setVisit] = useState(initial);
  const [endedAt, setEndedAt] = useState(initial.endedAt ? toLocalInput(new Date(initial.endedAt)) : "");
  const [arrivedAt, setArrivedAt] = useState(initial.arrivedAt ? toLocalInput(new Date(initial.arrivedAt)) : "");
  const [cooler, setCooler] = useState(initial.coolerTemperature === null ? "" : String(initial.coolerTemperature));
  const [cadre, setCadre] = useState<Cadre>(initial.cadre);
  const [cadreNote, setCadreNote] = useState(storedNote(initial));
  // Une fois la série réceptionnée, le cadre appartient au laboratoire.
  const cadreLocked = Boolean(visit.receivedAt);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const note = cadre === "AUTRE" ? cadreNote.trim() : "";
    const cadreChanged = cadre !== visit.cadre;
    const noteChanged = note !== storedNote(visit);
    try {
      const body: Record<string, unknown> = {
        endedAt: fromLocalInput(endedAt),
        arrivedAt: fromLocalInput(arrivedAt),
        coolerTemperature: cooler,
        // Envoyés seulement s'ils changent : une série réceptionnée refuserait
        // l'écriture et le reste du panneau serait perdu avec elle.
        ...(cadreChanged ? { cadre } : {}),
        ...(cadreChanged || noteChanged ? { cadreNote: note || null } : {}),
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
      setVisit((v) => ({
        ...v,
        ...data,
        cadre: data.cadre ?? cadre,
        // The answer may not carry the precision: what was sent is what is stored.
        cadreNote: data.cadreNote !== undefined ? data.cadreNote : cadreChanged || noteChanged ? note || null : v.cadreNote,
        // Keep what the answer leaves out of each sample (state, method…).
        samples: Array.isArray(data.samples)
          ? (data.samples as VisitSample[]).map((s) => ({ ...v.samples.find((o) => o.id === s.id), ...s }))
          : v.samples,
      }));
      setCadreNote(note);
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
  const groups = groupByLine(visit.samples);
  const sampler =
    visit.samplerKind === "QUALILAB"
      ? visit.samplerUser?.name ?? "—"
      : `${SAMPLER_KIND_LABELS[visit.samplerKind]}${visit.samplerName ? ` — ${visit.samplerName}` : ""}`;

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
              <a
                href={`/api/series/${visit.id}/document`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-brand transition hover:bg-brand-light/60"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Protocole (PDF)
              </a>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Prélevé par">{sampler}</Info>
              <Info label="Cadre">{formatCadre(visit.cadre, visit.cadreNote)}</Info>
              <Info label="Interlocuteur">{visit.interlocutor ?? "—"}</Info>
              <Info label="Référence client">{visit.clientReference ?? "—"}</Info>
              <Info label="Début">{formatDateTime(visit.startedAt)}</Info>
              <Info label="Fin">{visit.endedAt ? formatDateTime(visit.endedAt) : "—"}</Info>
              <Info label="Arrivée au laboratoire">{visit.arrivedAt ? formatDateTime(visit.arrivedAt) : "—"}</Info>
              <Info label="T° à l'arrivée">
                {visit.coolerTemperature === null ? "—" : `${decimal(visit.coolerTemperature)} °C`}
              </Info>
              <Info label="Analyses à effectuer">
                {[visit.analysesMicro ? "microbiologiques" : "", visit.analysesChimie ? "physico-chimiques" : ""]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </Info>
            </dl>
            {visit.notes && <p className="mt-3 text-sm text-slate-600">{visit.notes}</p>}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Échantillons ({groups.length})
              {visit.samples.length > groups.length && (
                <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                  · {visit.samples.length} au laboratoire
                </span>
              )}
            </h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {groups.map((group) => {
                const first = group.samples[0];
                if (!group.twinned) {
                  return (
                    <li key={group.lineNumber} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                          Échantillon {group.lineNumber} · {first.nature.label}
                        </p>
                        <p className="font-medium text-slate-900">{lineDesignation(first)}</p>
                        <p className="text-xs text-slate-500">{lineDetails(first, true)}</p>
                        <p className="mt-1 text-xs text-slate-500">{analysesText(first)}</p>
                      </div>
                      <StatusBadge status={first.status} />
                    </li>
                  );
                }
                const families = group.samples
                  .map(sampleFamily)
                  .filter((f, i, all): f is LineFamily => f !== null && all.indexOf(f) === i);
                return (
                  <li key={group.lineNumber} className="py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      Échantillon {group.lineNumber} · {familiesLabel(families)}
                    </p>
                    <p className="font-medium text-slate-900">{lineDesignation(first)}</p>
                    <p className="text-xs text-slate-500">{lineDetails(first, false)}</p>
                    <ul className="mt-2 space-y-2" aria-label={`Échantillon ${group.lineNumber} au laboratoire`}>
                      {group.samples.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              {s.nature.label}
                              {s.unitCount > 1 ? (
                                <span className="font-normal text-slate-500"> · n = {s.unitCount}</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">{analysesText(s)}</p>
                          </div>
                          <StatusBadge status={s.status} />
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
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
                <LegalTimeHint />
              </div>
              <div>
                <p id="visit-cadre" className="mb-1.5 block text-sm font-semibold text-slate-700">Cadre</p>
                <div role="group" aria-labelledby="visit-cadre" className="flex flex-wrap gap-2">
                  {CADRE_CHOICES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadre(c)}
                      disabled={cadreLocked}
                      aria-pressed={cadre === c}
                      className={`min-h-[44px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        cadre === c
                          ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      } ${cadreLocked ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {CADRE_LABELS[c]}
                    </button>
                  ))}
                </div>
                {cadre === "AUTRE" && (
                  <div className="mt-3">
                    <label htmlFor="cadreNote" className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Préciser (facultatif)
                    </label>
                    <input
                      id="cadreNote"
                      type="text"
                      value={cadreNote}
                      maxLength={CADRE_NOTE_MAX}
                      disabled={cadreLocked}
                      onChange={(e) => setCadreNote(e.target.value)}
                      placeholder="Ex. : audit interne"
                      className="input-field px-4 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {cadreLocked
                    ? "La série est réceptionnée : le laboratoire seul peut encore changer le cadre."
                    : "Modifiable tant que le laboratoire n'a pas réceptionné la série."}
                </p>
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
