"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ClipboardList, Clock, MapPin, Plus, User } from "lucide-react";
import type { SampleType, SamplerKind } from "@/generated/prisma/enums";
import { LINE_KIND_LABELS, formatDateTime } from "@/lib/labels";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { LineEditor } from "./LineEditor";
import {
  emptyLine,
  fromLocalInput,
  kindsFor,
  lineDesignation,
  toLocalInput,
  mergeSuggestions,
  type ClientMemory,
  type ClientOption,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
  type ProfileOption,
} from "./visit-types";

const subscribeNoop = () => () => {};

type CreatedSerie = {
  id: string;
  serialNumber: string;
  client: { name: string };
  site: { name: string } | null;
  startedAt: string;
  samples: { code: string; lineNumber: number; lineKind: LineDraft["lineKind"]; produit: string | null; surfaceLabel: string | null; personName: string | null; lieu: string }[];
};

/**
 * The protocole de prélèvement, as the préleveur fills it on site: a header
 * once, then one line per sample — up to N lines of different natures — and
 * a recap before the single save. Everything the paper form carries has a
 * field here; nothing has to be typed twice.
 */
export function VisitForm() {
  const router = useRouter();
  const isMounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [natures, setNatures] = useState<NatureOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [parametersByType, setParametersByType] = useState<Partial<Record<SampleType, ParameterOption[]>>>({});
  const [loadingTypes, setLoadingTypes] = useState<Set<SampleType>>(new Set());
  const requestedTypes = useRef<Set<SampleType>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedSerie | null>(null);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [interlocutor, setInterlocutor] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [startedAt, setStartedAt] = useState(() => toLocalInput(new Date()));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [samplerKind, setSamplerKind] = useState<SamplerKind>("QUALILAB");
  const [samplerName, setSamplerName] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [memory, setMemory] = useState<ClientMemory>({ places: [], products: [] });

  const ensureParameters = useCallback((type: SampleType | undefined) => {
    if (!type || requestedTypes.current.has(type)) return;
    requestedTypes.current.add(type);
    setLoadingTypes((prev) => new Set(prev).add(type));
    fetch(`/api/parameters?category=${type}`)
      .then((r) => r.json())
      .then((data: ParameterOption[]) => {
        setParametersByType((prev) => ({ ...prev, [type]: data }));
      })
      .finally(() => {
        setLoadingTypes((prev) => {
          const next = new Set(prev);
          next.delete(type);
          return next;
        });
      });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/natures").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]).then(([n, c]: [NatureOption[], ClientOption[]]) => {
      setNatures(n);
      setClients(c);
      setLines((prev) => (prev.length ? prev : [emptyLine(n[0])]));
      ensureParameters(n[0]?.legacyType);
    });
  }, [ensureParameters]);

  // The client's panels and memory: fetched when the client (or site) changes,
  // so a second visit to the same site proposes the same places and products.
  useEffect(() => {
    let cancelled = false;
    fetch(clientId ? `/api/profiles?clientId=${clientId}` : "/api/profiles")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => {
        if (!cancelled) setProfiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    if (!clientId) {
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/clients/${clientId}/memory${siteId ? `?siteId=${siteId}` : ""}`)
      .then((r) => r.json())
      .then((data: { places?: { label: string }[]; products?: { label: string }[] }) => {
        if (cancelled) return;
        setMemory({
          places: (data.places ?? []).map((p) => p.label),
          products: (data.products ?? []).map((p) => p.label),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId, siteId]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const sites = selectedClient?.sites ?? [];
  const selectedSite = sites.find((s) => s.id === siteId);

  const placeSuggestions = useMemo(
    () => mergeSuggestions(memory.places, lines.map((l) => l.lieu)),
    [memory.places, lines]
  );
  const productSuggestions = useMemo(
    () => mergeSuggestions(memory.products, lines.map((l) => l.produit)),
    [memory.products, lines]
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function changeNature(key: string, natureId: string) {
    const nature = natures.find((n) => n.id === natureId);
    ensureParameters(nature?.legacyType);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const kinds = kindsFor(nature);
        return {
          ...l,
          natureId,
          lineKind: kinds.includes(l.lineKind) ? l.lineKind : (nature?.defaultLineKind ?? "ALIMENT"),
          // The parameter list depends on the nature: start again.
          parameterIds: [],
          quantityUnit: nature?.defaultLineKind === "EAU" ? "L" : l.quantityUnit,
        };
      })
    );
  }

  function addLine() {
    const last = lines.at(-1);
    const nature = natures.find((n) => n.id === last?.natureId) ?? natures[0];
    ensureParameters(nature?.legacyType);
    setLines((prev) => [...prev, emptyLine(nature, last)]);
  }

  function duplicateLine(key: string) {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === key);
      if (index < 0) return prev;
      const copy: LineDraft = { ...prev[index], key: emptyLine(undefined).key, numeroLot: "", productionDate: "", expiryDate: "" };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function validateStep1() {
    if (!clientId) return setStepError("Choisissez le client.");
    if (sites.length > 0 && !siteId) return setStepError("Choisissez le site de prélèvement.");
    if (samplerKind !== "QUALILAB" && !samplerName.trim()) return setStepError("Indiquez qui a effectué le prélèvement.");
    for (const [i, line] of lines.entries()) {
      const n = i + 1;
      if (!line.natureId) return setStepError("Choisissez la nature d'analyse.", n);
      if (!line.lieu.trim()) return setStepError("Indiquez le lieu / la section.", n);
      if (line.lineKind === "ALIMENT" && !line.produit.trim()) return setStepError("Indiquez la désignation du produit.", n);
      if (line.lineKind === "SURFACE" && !line.surfaceLabel.trim()) return setStepError("Indiquez la surface prélevée.", n);
      if (line.lineKind === "MAINS" && !line.personName.trim()) return setStepError("Indiquez la personne prélevée.", n);
      if (line.parameterIds.length === 0) return setStepError("Choisissez au moins une analyse.", n);
    }
    setError("");
    setErrorLine(null);
    return true;
  }

  function setStepError(message: string, line: number | null = null) {
    setError(message);
    setErrorLine(line);
    return false;
  }

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          siteId: siteId || undefined,
          interlocutor,
          clientReference,
          samplerKind,
          samplerName: samplerKind === "QUALILAB" ? undefined : samplerName,
          startedAt: fromLocalInput(startedAt) ?? undefined,
          notes,
          lines: lines.map((line) => ({
            ...Object.fromEntries(Object.entries(line).filter(([k]) => k !== "key")),
            handsState: line.handsState || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Impossible d'enregistrer la visite.");
        setErrorLine(typeof data.line === "number" ? data.line : null);
        setStep(1);
        return;
      }
      setCreated(data);
      setStep(3);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (step === 3 && created) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Visite enregistrée</h2>
          <p className="mt-1 text-sm text-slate-500">
            {created.client.name}
            {created.site ? ` · ${created.site.name}` : ""} · {formatDateTime(created.startedAt)}
          </p>
          <div className="mx-auto mt-5 inline-block rounded-2xl bg-brand px-6 py-4 text-white shadow-lg shadow-brand/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">N° de série</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-wide">{created.serialNumber}</p>
          </div>
          <ul className="mx-auto mt-6 max-w-md divide-y divide-slate-100 rounded-xl bg-slate-50 text-left text-sm ring-1 ring-slate-100">
            {created.samples.map((s) => (
              <li key={s.code} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-mono text-xs font-semibold text-brand">{s.code}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{lineDesignation(s)}</span>
                <span className="shrink-0 text-xs text-slate-500">{LINE_KIND_LABELS[s.lineKind]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Les numéros de contrôle sont attribués au laboratoire, à la réception.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <SecondaryButton type="button" onClick={() => router.push("/preleveur")} className="min-h-[48px] flex-1">
              Retour au tableau de bord
            </SecondaryButton>
            <PrimaryButton type="button" onClick={() => router.push(`/preleveur/visites/${created.id}`)} className="min-h-[48px] flex-1">
              Compléter l&apos;arrivée au laboratoire
            </PrimaryButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        badge="Nouvelle visite"
        title={step === 1 ? "Protocole de prélèvement" : "Vérification"}
        subtitle={
          step === 1
            ? "Une visite, un numéro de série, autant de lignes que d'échantillons"
            : "Vérifiez les données avant l'enregistrement"
        }
      />
      <StepIndicator current={step as 1 | 2} />

      {step === 1 && (
        <div className="space-y-5">
          <Card className="p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">La visite</h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={sites.length > 0 ? "" : "sm:col-span-2"}>
                  <label className="section-title mb-2">
                    <Building2 className="h-4 w-4" />
                    Client
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setSiteId("");
                      setMemory({ places: [], products: [] });
                    }}
                    className="input-field px-4"
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {sites.length > 0 && (
                  <div>
                    <label className="section-title mb-2">
                      <MapPin className="h-4 w-4" />
                      Site de prélèvement
                    </label>
                    <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="input-field px-4">
                      <option value="">Sélectionner un site</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="section-title mb-2">
                    <User className="h-4 w-4" />
                    Interlocuteur
                  </label>
                  <input
                    type="text"
                    value={interlocutor}
                    onChange={(e) => setInterlocutor(e.target.value)}
                    placeholder="Personne présente côté client"
                    className="input-field px-4"
                  />
                </div>
                <div>
                  <label className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Début du prélèvement
                  </label>
                  {isMounted ? (
                    <input
                      type="datetime-local"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      className="input-field px-4"
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                </div>
              </div>

              <div>
                <p className="section-title mb-2">
                  <User className="h-4 w-4" />
                  Prélèvement effectué par
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["QUALILAB", "SERVICE_VETERINAIRE", "AUTRE"] as SamplerKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSamplerKind(k)}
                      aria-pressed={samplerKind === k}
                      className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition ${
                        samplerKind === k
                          ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {k === "QUALILAB" ? "Moi (Qualilab)" : k === "SERVICE_VETERINAIRE" ? "Service vétérinaire" : "Autre"}
                    </button>
                  ))}
                </div>
                {samplerKind !== "QUALILAB" && (
                  <input
                    type="text"
                    value={samplerName}
                    onChange={(e) => setSamplerName(e.target.value)}
                    placeholder="Nom de la personne ayant prélevé"
                    className="input-field mt-2 px-4"
                  />
                )}
                {samplerKind === "SERVICE_VETERINAIRE" && (
                  <p className="mt-1 text-xs text-slate-500">Cadre : contrôle officiel.</p>
                )}
              </div>

              <div>
                <label className="section-title mb-2">
                  <ClipboardList className="h-4 w-4" />
                  Référence client (bon de commande)
                </label>
                <input
                  type="text"
                  value={clientReference}
                  onChange={(e) => setClientReference(e.target.value)}
                  placeholder="Facultatif"
                  className="input-field px-4"
                />
              </div>
            </div>
          </Card>

          {lines.map((line, index) => {
            const nature = natures.find((n) => n.id === line.natureId);
            const type = nature?.legacyType;
            return (
              <div key={line.key} className={errorLine === index + 1 ? "rounded-2xl ring-2 ring-rose-300" : ""}>
                <LineEditor
                  index={index}
                  line={line}
                  natures={natures}
                  parameters={type ? (parametersByType[type] ?? []) : []}
                  parametersLoading={type ? loadingTypes.has(type) : false}
                  canRemove={lines.length > 1}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onNatureChange={(id) => changeNature(line.key, id)}
                  onDuplicate={() => duplicateLine(line.key)}
                  onRemove={() => removeLine(line.key)}
                  placeSuggestions={placeSuggestions}
                  productSuggestions={productSuggestions}
                  profiles={profiles.filter((p) => p.natureId === line.natureId)}
                />
              </div>
            );
          })}

          <SecondaryButton type="button" onClick={addLine} className="w-full min-h-[48px]">
            <Plus className="h-4 w-4" />
            Ajouter une ligne
          </SecondaryButton>

          <Card className="p-4 sm:p-6">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Notes de visite (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations générales…"
              className="input-field resize-none px-4"
            />
          </Card>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
              {errorLine ? `Ligne ${errorLine} — ` : ""}
              {error}
            </p>
          )}

          <PrimaryButton
            type="button"
            onClick={() => validateStep1() && setStep(2)}
            className="w-full min-h-[48px] py-3.5 text-sm font-bold tracking-wide"
          >
            Continuer — Vérifier ({lines.length} ligne{lines.length > 1 ? "s" : ""})
          </PrimaryButton>
        </div>
      )}

      {step === 2 && (
        <Card className="p-6 sm:p-8">
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">Récapitulatif</h2>
            <div className="space-y-3 rounded-xl bg-slate-50 p-5 text-sm ring-1 ring-slate-100">
              <Row label="Client" value={selectedClient?.name ?? "—"} />
              {selectedSite && <Row label="Site" value={selectedSite.name} />}
              {samplerKind !== "QUALILAB" && (
                <Row
                  label="Prélèvement effectué par"
                  value={`${samplerKind === "SERVICE_VETERINAIRE" ? "Service vétérinaire" : "Autre"} — ${samplerName}`}
                />
              )}
              {interlocutor && <Row label="Interlocuteur" value={interlocutor} />}
              <Row label="Début" value={isMounted && startedAt ? formatDateTime(new Date(startedAt)) : "—"} />
              {clientReference && <Row label="Référence client" value={clientReference} />}
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {lines.map((line, i) => {
                const nature = natures.find((n) => n.id === line.natureId);
                const type = nature?.legacyType;
                const names = (type ? parametersByType[type] ?? [] : [])
                  .filter((p) => line.parameterIds.includes(p.id))
                  .map((p) => p.name);
                return (
                  <li key={line.key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                          Ligne {i + 1} · {nature?.label}
                        </p>
                        <p className="font-medium text-slate-900">{lineDesignation(line)}</p>
                        <p className="text-xs text-slate-500">
                          {line.lieu}
                          {line.numeroLot ? ` · lot ${line.numeroLot}` : ""}
                          {line.productTemperature ? ` · ${line.productTemperature} °C` : ""}
                          {line.unitCount > 1 ? ` · n = ${line.unitCount}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {LINE_KIND_LABELS[line.lineKind]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {names.map((n) => (
                        <span key={n} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/10">
                          {n}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {notes && <p className="text-sm text-slate-600">{notes}</p>}

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <SecondaryButton type="button" onClick={() => setStep(1)} className="min-h-[48px] flex-1 py-3.5">
                Modifier
              </SecondaryButton>
              <PrimaryButton
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="min-h-[48px] flex-1 py-3.5 text-sm font-bold tracking-wide"
              >
                {loading ? "Enregistrement…" : "Enregistrer la visite"}
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-200/60 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
