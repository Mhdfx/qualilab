"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  FlaskConical,
  Hash,
  MapPin,
  Plus,
  Thermometer,
  User,
} from "lucide-react";
import type {
  AirMethod,
  Cadre,
  Family,
  LineKind,
  SampleType,
  SamplerKind,
  SurfaceState,
} from "@/generated/prisma/enums";
import {
  ANALYSIS_FAMILY_LABELS,
  CADRE_CHOICES,
  CADRE_LABELS,
  LINE_KIND_LABELS,
  formatCadre,
  formatDateTime,
} from "@/lib/labels";
import { SERIE_MESSAGES, sampleLineMessage } from "@/lib/serie-input";
import { LegalTimeHint } from "@/components/LegalTimeHint";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { LineEditor } from "./LineEditor";
import {
  duplicateDraft,
  emptyLine,
  fromLocalInput,
  lineCategory,
  lineDesignation,
  lineDraftError,
  lineFamilies,
  linePayload,
  localInputDate,
  mergeSuggestions,
  serieAnalyses,
  toLocalInput,
  type ClientMemory,
  type ClientOption,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
  type ProfileOption,
} from "./visit-types";
import { familiesLabel, groupByLine, sampleHeading } from "./visit-samples";

const subscribeNoop = () => () => {};

/** The série as `POST /api/series` returns it to the préleveur (no N° de contrôle). */
type CreatedSerie = {
  id: string;
  serialNumber: string;
  client: { name: string };
  site: { name: string } | null;
  startedAt: string;
  samples: {
    code: string;
    lineNumber: number;
    lineKind: LineKind;
    produit: string | null;
    surfaceLabel: string | null;
    personName: string | null;
    lieu: string;
    /** Absent from a payload that predates V2 / V4: the designation reads as before. */
    surfaceState?: SurfaceState | null;
    airMethod?: AirMethod | null;
    nature?: { family?: Family | null } | null;
  }[];
};

type Preleveur = { id: string; name: string };

/** « Prélèvement effectué par » on a visit: « Service vétérinaire » is
 * entered « Autre » + name since 07/10 (RETOUR-LABO-06-10.md §5, V1). */
const SAMPLER_CHOICES = [
  { kind: "QUALILAB", label: "Qualilab" },
  { kind: "AUTRE", label: "Autre" },
] as const satisfies readonly { kind: SamplerKind; label: string }[];

const CADRE_NOTE_MAX = 191;

/** The id of the card of « Échantillon N », to bring an error into view. */
const sampleAnchor = (lineNumber: number) => `visit-sample-${lineNumber}`;

/** Scrolls a field the préleveur must fix into view (after the next paint,
 * so that a card shown again by « Modifier » exists). */
function reveal(id: string) {
  requestAnimationFrame(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  });
}

const CHIP_ON = "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20";
const CHIP_OFF = "border-slate-200 text-slate-600 hover:border-slate-300";
const CHIP =
  "min-h-[44px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * The protocole de prélèvement, as the préleveur fills it on site — laid
 * out like the paper sheet (WORKFLOW.md §13): the header in the paper's
 * order, one card per sample (« Échantillon N ») with its type first and
 * its two families of analyses, the série's « Analyses à effectuer »
 * computed at the foot, a recap before the single save. What is not known
 * on site (end, arrival, temperature) stays optional and can be completed
 * on the visit page.
 *
 * RETOUR-LABO-06-10.md §5: the cadre is a required choice (V1), the nature
 * of each sample follows its type × its ticked families (V3) — both ticked
 * give two samples at the laboratory —, and the analyses are optional (V6):
 * the programme sheet fixes them.
 */
export function VisitForm({ me }: { me: Preleveur }) {
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

  // ---- the header, in the paper's order --------------------------------------
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [newSiteName, setNewSiteName] = useState<string | null>(null);
  const [creatingSite, setCreatingSite] = useState(false);
  const [interlocutor, setInterlocutor] = useState("");
  const [startedAt, setStartedAt] = useState(() => toLocalInput(new Date()));
  const [endedAt, setEndedAt] = useState("");
  const [samplerKind, setSamplerKind] = useState<SamplerKind>("QUALILAB");
  // One account per person (29/09, point 13): the sampler is always the
  // signed-in account, never a colleague picked from a list.
  const samplerUserId = me.id;
  const [samplerName, setSamplerName] = useState("");
  const [arrivedAt, setArrivedAt] = useState("");
  const [cooler, setCooler] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  // Le cadre est un choix obligatoire, sans présélection ni déduction (V1).
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [cadreNote, setCadreNote] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [memory, setMemory] = useState<ClientMemory>({ places: [], products: [] });

  const ensureParameters = useCallback((type: SampleType | undefined) => {
    if (!type || requestedTypes.current.has(type)) return;
    requestedTypes.current.add(type);
    setLoadingTypes((prev) => new Set(prev).add(type));
    fetch(`/api/parameters?category=${type}`)
      .then((r) => r.json())
      .then((data: ParameterOption[]) => {
        setParametersByType((prev) => ({ ...prev, [type]: Array.isArray(data) ? data : [] }));
      })
      .catch(() => {
        // A failed load can be retried by the next edit of the sample.
        requestedTypes.current.delete(type);
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
      const catalogue = Array.isArray(n) ? n : [];
      setNatures(catalogue);
      setClients(Array.isArray(c) ? c : []);
      const first = emptyLine(catalogue);
      setLines((prev) => (prev.length ? prev : [first]));
      ensureParameters(lineCategory(catalogue, first));
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

  // The série's two boxes follow the samples' families — no hand override.
  const analyses = serieAnalyses(lines);
  // One sample per ticked family once at the laboratory.
  const labSampleCount = lines.reduce((n, line) => n + Math.max(1, lineFamilies(line).length), 0);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /**
   * Every edit of a sample, type and families included (the LineEditor
   * sends consistent patches). The analyses of its category are loaded as
   * soon as the category is known.
   */
  function changeLine(line: LineDraft, patch: Partial<LineDraft>) {
    ensureParameters(lineCategory(natures, { ...line, ...patch }));
    updateLine(line.key, patch);
  }

  /** The next sample continues the previous one (type, families, place). */
  function addLine() {
    const line = emptyLine(natures, lines.at(-1));
    ensureParameters(lineCategory(natures, line));
    setLines((prev) => [...prev, line]);
  }

  function duplicateLine(key: string) {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === key);
      if (index < 0) return prev;
      const copy = duplicateDraft(prev[index], natures);
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
    if (line !== null) reveal(sampleAnchor(line));
    return false;
  }

  function validateStep1() {
    if (!clientId) return setStepError("Choisissez le client.");
    if (!cadre) {
      // The cadre sits at the top of a long form: bring it into view.
      reveal("visit-cadre");
      return setStepError(SERIE_MESSAGES.cadreMissing);
    }
    if (samplerKind === "QUALILAB" && !samplerUserId) return setStepError("Indiquez qui a effectué le prélèvement.");
    if (samplerKind !== "QUALILAB" && !samplerName.trim()) return setStepError("Indiquez qui a effectué le prélèvement.");
    if (endedAt && startedAt && localInputDate(endedAt)! < localInputDate(startedAt)!) return setStepError("L'heure de fin précède le début du prélèvement.");
    if (arrivedAt && endedAt && localInputDate(arrivedAt)! < localInputDate(endedAt)!) return setStepError("L'arrivée au laboratoire précède la fin du prélèvement.");
    for (const [i, line] of lines.entries()) {
      // Families, place, designation, surface state, air method — no analysis
      // is required any more: the programme sheet fixes them (V6).
      const problem = lineDraftError(line, natures);
      if (problem) return setStepError(sampleLineMessage(i + 1, problem), i + 1);
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
          cadre,
          cadreNote: cadre === "AUTRE" ? cadreNote.trim() || undefined : undefined,
          startedAt: fromLocalInput(startedAt) ?? undefined,
          endedAt: fromLocalInput(endedAt) ?? undefined,
          arrivedAt: fromLocalInput(arrivedAt) ?? undefined,
          coolerTemperature: cooler || undefined,
          notes,
          // Each sample's families, state and method; the série's boxes are
          // computed by the server from them.
          lines: lines.map(linePayload),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The API names the sample itself (« Échantillon 2 — … »).
        setStep(1);
        setStepError(data.error ?? "Impossible d'enregistrer la visite.", typeof data.line === "number" ? data.line : null);
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

  const samplerLabel = samplerKind === "QUALILAB" ? me.name : `Autre — ${samplerName}`;
  const cadreMissing = !cadre && error === SERIE_MESSAGES.cadreMissing;

  if (step === 3 && created) {
    const groups = groupByLine(created.samples);
    const hasTwins = groups.some((g) => g.twinned);
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
            {groups.flatMap((group) =>
              group.samples.map((s) => (
                <li key={s.code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="shrink-0 font-mono text-xs font-semibold text-brand">{s.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-500">{sampleHeading(s, group.twinned)}</span>
                    <span className="block truncate text-slate-700">
                      {/* State / method from the answer, else from the sample just sent. */}
                      {lineDesignation({
                        ...s,
                        surfaceState: s.surfaceState ?? lines[s.lineNumber - 1]?.surfaceState,
                        airMethod: s.airMethod ?? lines[s.lineNumber - 1]?.airMethod,
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{LINE_KIND_LABELS[s.lineKind]}</span>
                </li>
              ))
            )}
          </ul>
          {hasTwins && (
            <p className="mx-auto mt-3 max-w-md text-xs text-slate-500">
              Un échantillon coché en microbiologie et en physico-chimie devient deux échantillons au laboratoire, chacun avec son N° de contrôle et son rapport.
            </p>
          )}
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
            ? "Une visite, un numéro de série, tous les échantillons du protocole"
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
                  <label htmlFor="visit-client" className="section-title mb-2">
                    <Building2 className="h-4 w-4" />
                    Client
                  </label>
                  <select
                    id="visit-client"
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
                  <label htmlFor="visit-site" className="section-title mb-2">
                    <MapPin className="h-4 w-4" />
                    Site de prélèvement
                  </label>
                  {newSiteName === null ? (
                    <select
                      id="visit-site"
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
                        id="visit-site"
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
                  <label htmlFor="visit-interlocutor" className="section-title mb-2">
                    <User className="h-4 w-4" />
                    Interlocuteur
                  </label>
                  <input
                    id="visit-interlocutor"
                    type="text"
                    value={interlocutor}
                    onChange={(e) => setInterlocutor(e.target.value)}
                    placeholder="Personne présente côté client"
                    className="input-field px-4"
                  />
                </div>
                <div>
                  <p id="visit-cadre" className="section-title mb-2">
                    <ClipboardList className="h-4 w-4" />
                    Cadre
                    <span className="-ml-1 text-rose-600" aria-hidden="true">*</span>
                    <span className="sr-only">(obligatoire)</span>
                  </p>
                  <div
                    role="group"
                    aria-labelledby="visit-cadre"
                    aria-describedby={cadreMissing ? "visit-cadre-error" : undefined}
                    className={`flex flex-wrap gap-2 rounded-xl ${cadreMissing ? "ring-2 ring-rose-300 ring-offset-2" : ""}`}
                  >
                    {CADRE_CHOICES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCadre(c)}
                        aria-pressed={cadre === c}
                        className={`${CHIP} ${cadre === c ? CHIP_ON : CHIP_OFF}`}
                      >
                        {CADRE_LABELS[c]}
                      </button>
                    ))}
                  </div>
                  {cadreMissing && (
                    <p id="visit-cadre-error" className="mt-1 text-xs text-rose-600">
                      {SERIE_MESSAGES.cadreMissing}
                    </p>
                  )}
                  {cadre === "AUTRE" && (
                    <div className="mt-3">
                      <label htmlFor="visit-cadre-note" className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Préciser (facultatif)
                      </label>
                      <input
                        id="visit-cadre-note"
                        type="text"
                        value={cadreNote}
                        maxLength={CADRE_NOTE_MAX}
                        onChange={(e) => setCadreNote(e.target.value)}
                        placeholder="Ex. : audit interne"
                        className="input-field px-4"
                      />
                    </div>
                  )}
                  {(cadre === "DEVIS_VALIDE" || cadre === "BON_COMMANDE") && (
                    <p className="mt-1 text-xs text-slate-500">
                      Le N° du {cadre === "BON_COMMANDE" ? "BC" : "devis"} se saisit dans « Référence client ».
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="visit-started" className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Prélevé le … à …
                  </label>
                  {isMounted ? (
                    <input
                      id="visit-started"
                      type="datetime-local"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      className="input-field px-4"
                    />
                  ) : (
                    <div className="input-field px-4" aria-hidden="true" />
                  )}
                  <LegalTimeHint />
                </div>
                <div>
                  <label htmlFor="visit-ended" className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Heure de fin
                  </label>
                  {isMounted ? (
                    <input
                      id="visit-ended"
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
                <p id="visit-sampler" className="section-title mb-2">
                  <User className="h-4 w-4" />
                  Prélèvement effectué par
                </p>
                <div role="group" aria-labelledby="visit-sampler" className="flex flex-wrap gap-2">
                  {SAMPLER_CHOICES.map(({ kind: k, label }) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSamplerKind(k)}
                      aria-pressed={samplerKind === k}
                      className={`${CHIP} ${samplerKind === k ? CHIP_ON : CHIP_OFF}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {samplerKind === "QUALILAB" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-800">
                      {me.name}
                    </span>
                    <span className="text-xs text-slate-500">Fonction : Préleveur · votre compte</span>
                  </div>
                ) : (
                  <>
                    <label htmlFor="visit-sampler-name" className="sr-only">
                      Nom de la personne ou du service ayant prélevé
                    </label>
                    <input
                      id="visit-sampler-name"
                      type="text"
                      value={samplerName}
                      onChange={(e) => setSamplerName(e.target.value)}
                      placeholder="Nom de la personne ou du service ayant prélevé"
                      className="input-field mt-2 px-4"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Un prélèvement du service vétérinaire se saisit ici, avec son nom.
                    </p>
                  </>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="visit-arrived" className="section-title mb-2">
                    <Clock className="h-4 w-4" />
                    Arrivé au laboratoire le … à …
                  </label>
                  {isMounted ? (
                    <input
                      id="visit-arrived"
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
                  <label htmlFor="visit-cooler" className="section-title mb-2">
                    <Thermometer className="h-4 w-4" />
                    Température à l&apos;arrivée (°C)
                  </label>
                  <input
                    id="visit-cooler"
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
                <label htmlFor="visit-reference" className="section-title mb-2">
                  <ClipboardList className="h-4 w-4" />
                  Référence client
                </label>
                <input
                  id="visit-reference"
                  type="text"
                  value={clientReference}
                  onChange={(e) => setClientReference(e.target.value)}
                  placeholder="Facultatif — ex. : N° du BC ou du devis"
                  className="input-field px-4"
                />
              </div>
            </div>
          </Card>

          {lines.map((line, index) => {
            const category = lineCategory(natures, line);
            return (
              <div
                key={line.key}
                id={sampleAnchor(index + 1)}
                className={`scroll-mt-4 ${errorLine === index + 1 ? "rounded-2xl ring-2 ring-rose-300" : ""}`}
              >
                <LineEditor
                  index={index}
                  line={line}
                  natures={natures}
                  parameters={category ? (parametersByType[category] ?? []) : []}
                  parametersLoading={category ? loadingTypes.has(category) : false}
                  canRemove={lines.length > 1}
                  onChange={(patch) => changeLine(line, patch)}
                  onDuplicate={() => duplicateLine(line.key)}
                  onRemove={() => removeLine(line.key)}
                  placeSuggestions={placeSuggestions}
                  productSuggestions={productSuggestions}
                  knownPlaces={memory.places}
                  knownProducts={memory.products}
                  profiles={profiles}
                />
              </div>
            );
          })}

          <SecondaryButton type="button" onClick={addLine} className="w-full min-h-[48px]">
            <Plus className="h-4 w-4" />
            Ajouter un échantillon
          </SecondaryButton>

          <Card className="p-4 sm:p-6">
            <p className="section-title mb-2">
              <FlaskConical className="h-4 w-4" />
              Analyses à effectuer
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["MICRO", analyses.analysesMicro],
                  ["CHIMIE", analyses.analysesChimie],
                ] as const
              ).map(([family, on]) => (
                <li
                  key={family}
                  className={`flex min-h-[48px] items-center gap-3 rounded-xl border px-4 text-sm font-medium ${
                    on ? "border-brand/40 bg-brand-light/60 text-brand" : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  {on ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                  )}
                  {ANALYSIS_FAMILY_LABELS[family]}
                  <span className="sr-only">{on ? " : oui" : " : non"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Déduites des échantillons : cochez les familles sur chaque échantillon.
              {labSampleCount > lines.length
                ? ` ${labSampleCount} échantillons au laboratoire (un par famille cochée).`
                : ""}
            </p>
          </Card>

          <Card className="p-4 sm:p-6">
            <label htmlFor="visit-notes" className="mb-2 block text-sm font-semibold text-slate-700">
              Notes de visite (optionnel)
            </label>
            <textarea
              id="visit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations générales…"
              className="input-field resize-none px-4"
            />
          </Card>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
              {error}
            </p>
          )}

          <PrimaryButton
            type="button"
            onClick={() => validateStep1() && setStep(2)}
            className="w-full min-h-[48px] py-3.5 text-sm font-bold tracking-wide"
          >
            Continuer — Vérifier ({lines.length} échantillon{lines.length > 1 ? "s" : ""})
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
              <Row label="Cadre" value={cadre ? formatCadre(cadre, cadreNote) : "—"} />
              {interlocutor && <Row label="Interlocuteur" value={interlocutor} />}
              <Row label="Prélevé le" value={isMounted && startedAt ? formatDateTime(localInputDate(startedAt)!) : "—"} />
              <Row label="Heure de fin" value={isMounted && endedAt ? formatDateTime(localInputDate(endedAt)!) : "—"} />
              <Row label="Prélèvement effectué par" value={samplerLabel} />
              <Row label="Arrivée au laboratoire" value={isMounted && arrivedAt ? formatDateTime(localInputDate(arrivedAt)!) : "—"} />
              <Row label="T° à l'arrivée" value={cooler ? `${cooler} °C` : "—"} />
              {clientReference && <Row label="Référence client" value={clientReference} />}
              <Row
                label="Analyses à effectuer"
                value={
                  [analyses.analysesMicro ? "microbiologiques" : "", analyses.analysesChimie ? "physico-chimiques" : ""]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
              />
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {lines.map((line, i) => {
                const families = lineFamilies(line);
                const category = lineCategory(natures, line);
                const names = (category ? parametersByType[category] ?? [] : [])
                  .filter((p) => line.parameterIds.includes(p.id))
                  .map((p) => p.name);
                return (
                  <li key={line.key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                          Échantillon {i + 1} · {familiesLabel(families)}
                        </p>
                        <p className="font-medium text-slate-900">{lineDesignation(line)}</p>
                        <p className="text-xs text-slate-500">
                          {line.lieu}
                          {line.numeroLot ? ` · lot ${line.numeroLot}` : ""}
                          {line.lineKind === "SURFACE" && line.surfaceAreaCm2 ? ` · ${line.surfaceAreaCm2} cm²` : ""}
                          {line.productTemperature ? ` · ${line.productTemperature} °C` : ""}
                          {line.unitCount > 1 ? ` · n = ${line.unitCount}` : ""}
                        </p>
                        {families.length > 1 && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Deux échantillons au laboratoire : un par famille d&apos;analyses.
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {LINE_KIND_LABELS[line.lineKind]}
                      </span>
                    </div>
                    {names.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {names.map((n) => (
                          <span key={n} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/10">
                            {n}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Aucune analyse cochée : le laboratoire les fixera.</p>
                    )}
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
