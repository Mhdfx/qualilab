"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FlaskConical,
  Hash,
  MapPin,
  Plus,
  Thermometer,
  User,
} from "lucide-react";
import type { LineKind, SampleType, SamplerKind } from "@/generated/prisma/enums";
import { CADRE_LABELS, LINE_KIND_LABELS, formatDateTime } from "@/lib/labels";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { LineEditor } from "./LineEditor";
import {
  emptyLine,
  fromLocalInput,
  lineDesignation,
  mergeSuggestions,
  natureForKind,
  toLocalInput,
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

type Preleveur = { id: string; name: string };

/**
 * The protocole de prélèvement, as the préleveur fills it on site — laid
 * out like the paper sheet (WORKFLOW.md §13): the header in the paper's
 * order, one line per sample with the line's type first, the two
 * « Analyses à effectuer » boxes at the foot, a recap before the single
 * save. Everything the paper carries has a field here; what is not known
 * on site (end, arrival, temperature) stays optional and can be completed
 * on the visit page.
 */
export function VisitForm({ me }: { me: Preleveur }) {
  const router = useRouter();
  const isMounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [natures, setNatures] = useState<NatureOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [preleveurs, setPreleveurs] = useState<Preleveur[]>([me]);
  const [parametersByType, setParametersByType] = useState<Partial<Record<SampleType, ParameterOption[]>>>({});
  const [loadingTypes, setLoadingTypes] = useState<Set<SampleType>>(new Set());
  const requestedTypes = useRef<Set<SampleType>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedSerie | null>(null);

  // ---- the header, in the paper's order --------------------------------------
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [newSiteName, setNewSiteName] = useState<string | null>(null);
  const [creatingSite, setCreatingSite] = useState(false);
  const [interlocutor, setInterlocutor] = useState("");
  const [startedAt, setStartedAt] = useState(() => toLocalInput(new Date()));
  const [endedAt, setEndedAt] = useState("");
  const [samplerKind, setSamplerKind] = useState<SamplerKind>("QUALILAB");
  const [samplerUserId, setSamplerUserId] = useState(me.id);
  const [samplerName, setSamplerName] = useState("");
  const [arrivedAt, setArrivedAt] = useState("");
  const [cooler, setCooler] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  // The two boxes at the foot: null = follow the lines, boolean = the préleveur's own tick.
  const [analysesChoice, setAnalysesChoice] = useState<{ micro: boolean | null; chimie: boolean | null }>({ micro: null, chimie: null });
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
      fetch("/api/preleveurs").then((r) => r.json()),
    ]).then(([n, c, p]: [NatureOption[], ClientOption[], Preleveur[]]) => {
      setNatures(n);
      setClients(c);
      if (Array.isArray(p) && p.length > 0) setPreleveurs(p);
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
  const cadre = samplerKind === "SERVICE_VETERINAIRE" ? "OFFICIEL" : "AUTOCONTROLE";

  const placeSuggestions = useMemo(
    () => mergeSuggestions(memory.places, lines.map((l) => l.lieu)),
    [memory.places, lines]
  );
  const productSuggestions = useMemo(
    () => mergeSuggestions(memory.products, lines.map((l) => l.produit)),
    [memory.products, lines]
  );

  // The boxes follow the lines' natures until the préleveur ticks them by hand.
  const derived = useMemo(() => {
    const families = new Set(lines.map((l) => natures.find((n) => n.id === l.natureId)?.family));
    return { micro: families.has("MICRO"), chimie: families.has("CHIMIE") };
  }, [lines, natures]);
  const analysesMicro = analysesChoice.micro ?? derived.micro;
  const analysesChimie = analysesChoice.chimie ?? derived.chimie;

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function changeNature(key: string, natureId: string) {
    const nature = natures.find((n) => n.id === natureId);
    ensureParameters(nature?.legacyType);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const previous = natures.find((n) => n.id === l.natureId);
        return {
          ...l,
          natureId,
          // The parameter list depends on the domain: start again when it changes.
          parameterIds: previous?.legacyType === nature?.legacyType ? l.parameterIds : [],
        };
      })
    );
  }

  /** The line's type comes first; the nature follows it (still changeable). */
  function changeKind(key: string, kind: LineKind) {
    const line = lines.find((l) => l.key === key);
    const current = natures.find((n) => n.id === line?.natureId);
    const target = natureForKind(natures, kind, current);
    ensureParameters(target?.legacyType);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const sameDomain = current?.legacyType === target?.legacyType;
        return {
          ...l,
          lineKind: kind,
          natureId: target?.id ?? l.natureId,
          parameterIds: sameDomain ? l.parameterIds : [],
          quantityUnit: kind === "EAU" ? "L" : l.quantityUnit === "L" ? "UNITE" : l.quantityUnit,
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

  async function createSite() {
    const name = (newSiteName ?? "").trim();
    if (!clientId || !name) return setStepError("Indiquez le nom du site.");
    setCreatingSite(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) return setStepError(data.error ?? "Impossible de créer le site.");
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, sites: [...(c.sites ?? []), { id: data.id, name: data.name }] } : c))
      );
      setSiteId(data.id);
      setNewSiteName(null);
    } catch {
      setStepError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setCreatingSite(false);
    }
  }

  function setStepError(message: string, line: number | null = null) {
    setError(message);
    setErrorLine(line);
    return false;
  }

  function validateStep1() {
    if (!clientId) return setStepError("Choisissez le client.");
    if (samplerKind === "QUALILAB" && !samplerUserId) return setStepError("Indiquez qui a effectué le prélèvement.");
    if (samplerKind !== "QUALILAB" && !samplerName.trim()) return setStepError("Indiquez qui a effectué le prélèvement.");
    if (endedAt && startedAt && new Date(endedAt) < new Date(startedAt)) return setStepError("L'heure de fin précède le début du prélèvement.");
    if (arrivedAt && endedAt && new Date(arrivedAt) < new Date(endedAt)) return setStepError("L'arrivée au laboratoire précède la fin du prélèvement.");
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
          samplerUserId: samplerKind === "QUALILAB" ? samplerUserId : undefined,
          samplerName: samplerKind === "QUALILAB" ? undefined : samplerName,
          startedAt: fromLocalInput(startedAt) ?? undefined,
          endedAt: fromLocalInput(endedAt) ?? undefined,
          arrivedAt: fromLocalInput(arrivedAt) ?? undefined,
          coolerTemperature: cooler || undefined,
          analysesMicro,
          analysesChimie,
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

  const samplerLabel =
    samplerKind === "QUALILAB"
      ? preleveurs.find((p) => p.id === samplerUserId)?.name ?? me.name
      : `${samplerKind === "SERVICE_VETERINAIRE" ? "Service vétérinaire" : "Autre"} — ${samplerName}`;

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
              Ouvrir la visite (protocole PDF, arrivée)
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">La visite</h2>
              <div className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500">
                <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                N° de série : <span className="font-mono font-semibold text-slate-700">attribué à l&apos;enregistrement</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="section-title mb-2">
                    <Building2 className="h-4 w-4" />
                    Client
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setSiteId("");
                      setNewSiteName(null);
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
                <div>
                  <label className="section-title mb-2">
                    <MapPin className="h-4 w-4" />
                    Site de prélèvement
                  </label>
                  {newSiteName === null ? (
                    <select
                      value={siteId}
                      disabled={!clientId}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setNewSiteName("");
                        } else {
                          setSiteId(e.target.value);
                        }
                      }}
                      className="input-field px-4"
                    >
                      <option value="">Siège (adresse du client)</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                      <option value="__new__">+ Nouveau site…</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSiteName}
                        onChange={(e) => setNewSiteName(e.target.value)}
                        placeholder="Nom du site (ex. : Cuisine centrale)"
                        className="input-field px-4"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={createSite}
                        disabled={creatingSite}
                        className="inline-flex shrink-0 items-center rounded-xl bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {creatingSite ? "…" : "Créer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewSiteName(null)}
                        className="inline-flex shrink-0 items-center rounded-xl border border-slate-300 px-3 text-sm text-slate-600"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
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
                  <p className="section-title mb-2">
                    <ClipboardList className="h-4 w-4" />
                    Cadre
                  </p>
                  <div className="input-field flex items-center px-4 text-slate-700">{CADRE_LABELS[cadre]}</div>
                  <p className="mt-1 text-xs text-slate-500">Déduit de qui prélève ; la réception peut le changer.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Prélevé le … à …
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
                <div>
                  <label className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Heure de fin
                  </label>
                  {isMounted ? (
                    <input
                      type="datetime-local"
                      value={endedAt}
                      onChange={(e) => setEndedAt(e.target.value)}
                      className="input-field px-4"
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                  <p className="mt-1 text-xs text-slate-500">Facultatif sur place ; complétable ensuite.</p>
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
                      {k === "QUALILAB" ? "Qualilab" : k === "SERVICE_VETERINAIRE" ? "Service vétérinaire" : "Autre"}
                    </button>
                  ))}
                </div>
                {samplerKind === "QUALILAB" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={samplerUserId}
                      onChange={(e) => setSamplerUserId(e.target.value)}
                      aria-label="Préleveur"
                      className="input-field max-w-xs px-4"
                    >
                      {preleveurs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.id === me.id ? " (moi)" : ""}</option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">Fonction : Préleveur</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={samplerName}
                    onChange={(e) => setSamplerName(e.target.value)}
                    placeholder="Nom de la personne ayant prélevé"
                    className="input-field mt-2 px-4"
                  />
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Arrivé au laboratoire le … à …
                  </label>
                  {isMounted ? (
                    <input
                      type="datetime-local"
                      value={arrivedAt}
                      onChange={(e) => setArrivedAt(e.target.value)}
                      className="input-field px-4"
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <label className="section-title mb-2">
                    <Thermometer className="h-4 w-4" />
                    Température à l&apos;arrivée (°C)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cooler}
                    onChange={(e) => setCooler(e.target.value)}
                    placeholder="Ex. : 1"
                    className="input-field px-4"
                  />
                  <p className="mt-1 text-xs text-slate-500">Glacière à l&apos;arrivée ; la réception la reprend.</p>
                </div>
              </div>

              <div>
                <label className="section-title mb-2">
                  <ClipboardList className="h-4 w-4" />
                  N° de factures / référence client
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
                  onKindChange={(kind) => changeKind(line.key, kind)}
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
            <p className="section-title mb-2">
              <FlaskConical className="h-4 w-4" />
              Analyses à effectuer
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { key: "micro", label: "Analyses microbiologiques", checked: analysesMicro },
                  { key: "chimie", label: "Analyses physico-chimiques", checked: analysesChimie },
                ] as const
              ).map((box) => (
                <label
                  key={box.key}
                  className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-medium transition ${
                    box.checked ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20" : "border-slate-200 text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={box.checked}
                    onChange={(e) => setAnalysesChoice((c) => ({ ...c, [box.key]: e.target.checked }))}
                    className="h-4 w-4 accent-brand"
                  />
                  {box.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Cochées d&apos;après les lignes ; une case cochée sans ligne correspondante est signalée à la réception.
            </p>
          </Card>

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
              <Row label="Site de prélèvement" value={selectedSite?.name ?? "Siège"} />
              <Row label="Cadre" value={CADRE_LABELS[cadre]} />
              {interlocutor && <Row label="Interlocuteur" value={interlocutor} />}
              <Row label="Prélevé le" value={isMounted && startedAt ? formatDateTime(new Date(startedAt)) : "—"} />
              <Row label="Heure de fin" value={isMounted && endedAt ? formatDateTime(new Date(endedAt)) : "—"} />
              <Row label="Prélèvement effectué par" value={samplerLabel} />
              <Row label="Arrivée au laboratoire" value={isMounted && arrivedAt ? formatDateTime(new Date(arrivedAt)) : "—"} />
              <Row label="T° à l'arrivée" value={cooler ? `${cooler} °C` : "—"} />
              {clientReference && <Row label="N° de factures" value={clientReference} />}
              <Row
                label="Analyses à effectuer"
                value={[analysesMicro ? "microbiologiques" : "", analysesChimie ? "physico-chimiques" : ""].filter(Boolean).join(" · ") || "—"}
              />
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
