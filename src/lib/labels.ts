import type {
  AirMethod,
  Cadre,
  Family,
  InvoiceStatus,
  ProgrammePriority,
  SampleStatus,
  SampleType,
  SurfaceState,
} from "@/generated/prisma/client";
import { labTimeZone } from "./lab-time";

export const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  ALIMENTAIRE: "Alimentaire",
  EAU: "Eau",
  AMBIANCE: "Ambiance",
};

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  PRELEVE: "Prélevé",
  RECU: "Reçu",
  /** The programme d'analyse is confirmed, the bench may start (PROGRAMME.md). */
  PROGRAMME: "Programmé",
  EN_ANALYSE: "En analyse",
  RESULTATS_SAISIS: "Résultats saisis",
  VALIDE: "Validé",
  RAPPORT_ENVOYE: "Rapport envoyé",
  ANNULE: "Annulé",
};

/** PROGRAMME.md §3 — the priority the responsable des paramètres gives a line. */
export const PROGRAMME_PRIORITY_LABELS: Record<ProgrammePriority, string> = {
  NORMALE: "Normale",
  URGENTE: "Urgente",
};

// ---- Phase 9 · chantier 1 — the série and its lines ------------------------

export const SERIE_KIND_LABELS = {
  VISITE: "Visite",
  DEPOT: "Dépôt au laboratoire",
} as const;

export const SAMPLER_KIND_LABELS = {
  QUALILAB: "Technicien Qualilab",
  CLIENT: "Prélèvement effectué par le client",
  /** No longer offered nor accepted on a new série (RETOUR-LABO-06-10.md §5,
   * V1): kept so the old séries still print who sampled them. */
  SERVICE_VETERINAIRE: "Prélèvement effectué par le service vétérinaire",
  AUTRE: "Autre",
} as const;

/** The série's cadre, chosen by the préleveur or at the counter — never
 * deduced from who sampled (RETOUR-LABO-06-10.md §5, V1). */
export const CADRE_LABELS = {
  AUTRE: "Autre",
  DEVIS_VALIDE: "Devis validé",
  BON_COMMANDE: "BC",
  CONVENTION: "Convention",
} as const satisfies Record<Cadre, string>;

/** The four buttons, in the order the laboratory listed them; none is preselected. */
export const CADRE_CHOICES: readonly Cadre[] = ["AUTRE", "DEVIS_VALIDE", "BON_COMMANDE", "CONVENTION"];

/** « Autre — texte » when « Autre » carries a precision, the label alone otherwise. */
export function formatCadre(cadre: Cadre, cadreNote?: string | null): string {
  const note = cadreNote?.trim();
  return cadre === "AUTRE" && note ? `${CADRE_LABELS.AUTRE} — ${note}` : CADRE_LABELS[cadre];
}

/** « État de la surface » of a SURFACE line (RETOUR-LABO-06-10.md §5, V2). */
export const SURFACE_STATE_LABELS = {
  ASEPTIQUE: "Aseptique",
  EN_COURS_DE_TRAVAIL: "En cours de travail",
  NETTOYE: "Nettoyé",
} as const satisfies Record<SurfaceState, string>;

export const SURFACE_STATE_CHOICES: readonly SurfaceState[] = ["ASEPTIQUE", "EN_COURS_DE_TRAVAIL", "NETTOYE"];

/** The state as printed after a designation: « Planche verte — surface nettoyée ». */
export const SURFACE_STATE_PHRASES = {
  ASEPTIQUE: "surface aseptique",
  EN_COURS_DE_TRAVAIL: "en cours de travail",
  NETTOYE: "surface nettoyée",
} as const satisfies Record<SurfaceState, string>;

/** « Planche verte — surface nettoyée »; the designation alone on a line
 * entered before the state existed. */
export function withSurfaceState(designation: string, state?: SurfaceState | null): string {
  return state ? `${designation} — ${SURFACE_STATE_PHRASES[state]}` : designation;
}

/** « Méthode de prélèvement » of an AIR line (RETOUR-LABO-06-10.md §5, V4). */
export const AIR_METHOD_LABELS = {
  BOITE_EXPOSEE_30MIN: "Boîte exposée 30 min",
  BIOCOLLECTEUR: "Biocollecteur",
} as const satisfies Record<AirMethod, string>;

export const AIR_METHOD_CHOICES: readonly AirMethod[] = ["BOITE_EXPOSEE_30MIN", "BIOCOLLECTEUR"];

/** The two boxes of each sample, and the groups of the analyses proposed
 * (`AnalysisParameter.family` — RETOUR-LABO-06-10.md §5, V3). */
export const ANALYSIS_FAMILY_LABELS = {
  MICRO: "Analyses microbiologiques",
  CHIMIE: "Analyses physico-chimiques",
  AUTRE: "Autres analyses",
} as const satisfies Record<Family, string>;

/** The short names of the families, on the admin screens (parameters,
 * product types, criteria) where a column or a filter names them. */
export const FAMILY_SHORT_LABELS = {
  MICRO: "Microbiologie",
  CHIMIE: "Physico-chimie",
  AUTRE: "Autre",
} as const satisfies Record<Family, string>;

export const LINE_KIND_LABELS = {
  ALIMENT: "Produit alimentaire",
  SURFACE: "Surface",
  MAINS: "Mains du personnel",
  EAU: "Eau",
  AIR: "Air",
  AUTRE: "Autre",
} as const;

export const QUANTITY_UNIT_LABELS = {
  UNITE: "unité(s)",
  G: "g",
  ML: "mL",
  L: "L",
} as const;

export const HANDS_STATE_LABELS = {
  LAVEES: "Mains lavées",
  NON_LAVEES: "Mains non lavées",
} as const;

export const NON_CONFORMITY_REASON_LABELS = {
  CHAINE_FROID: "Rupture de la chaîne du froid",
  TEMPERATURE_MANQUANTE: "Température à l'arrivée non relevée",
  QUANTITE_INSUFFISANTE: "Quantité insuffisante",
  EMBALLAGE: "Emballage ou contenant non conforme",
  DELAI: "Délai de transport dépassé",
  IDENTIFICATION: "Identification incomplète",
  AUTRE: "Autre motif",
} as const;

export const CANCEL_REASON_LABELS = {
  NON_EXPLOITABLE: "Échantillon non exploitable",
  QUANTITE_INSUFFISANTE: "Quantité insuffisante",
  DOUBLON: "Doublon",
  ANNULATION_CLIENT: "Annulation par le client",
  /** Only set by the reception's « Détruire » (RETOUR-LABO-29-09.md, slice E). */
  DETRUIT_A_RECEPTION: "Détruit à réception",
  AUTRE: "Autre",
} as const;

/**
 * The laboratory's wall clock. Fixed on purpose: server and browser must
 * format a timestamp identically or hydration mismatches. The container's TZ
 * (docker-compose.yml) is set to the same zone so that day cut-offs — "reçus
 * aujourd'hui", the bench sheet — land on the same day as the printed times.
 *
 * Since Morocco's return to plain UTC (20/09/2026) the zone is resolved per
 * instant by `labTimeZone` (lab-time.ts), so a browser whose time-zone data
 * predates the change still prints the laboratory's time.
 */
export const LAB_TIME_ZONE = "Africa/Casablanca";

const asDate = (date: Date | string) => (typeof date === "string" ? new Date(date) : date);

export function formatDateTime(date: Date | string) {
  const d = asDate(date);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: labTimeZone(d),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatDate(date: Date | string) {
  const d = asDate(date);
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: labTimeZone(d),
  }).format(d);
}

/** Short "jour/mois heure:minute" — the lab's own zone, client-safe. */
export function formatDayTime(date: Date | string) {
  const d = asDate(date);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: labTimeZone(d),
  }).format(d);
}

/**
 * "AAAA-MM-JJ" in the laboratory's zone — for file names and date inputs.
 * Never derive this from `toISOString()`: a local midnight is the previous
 * day in UTC, so the stamp would be one day behind for the whole day.
 */
export function formatIsoDay(date: Date | string) {
  const d = asDate(date);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: labTimeZone(d),
  }).format(d);
}

/** Numeric "jj/mm/aaaa" — the lab's own zone, client-safe. */
export function formatDayShort(date: Date | string) {
  const d = asDate(date);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: labTimeZone(d),
  }).format(d);
}

/**
 * The refusal of a time ahead of the clock, with the legal time it was
 * compared to: a device that missed Morocco's return to GMT (20/09/2026)
 * shows one hour more, and its user retypes that hour in good faith.
 */
export function futureMessage(what: string): string {
  const legal = formatDayTime(new Date()).slice(-5);
  return `${what} est dans le futur : il est ${legal} (heure légale du Maroc, GMT depuis le 20/09/2026). Un appareil non mis à jour affiche une heure de plus — gardez l'heure proposée.`;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  EN_ATTENTE: "En attente",
  PAYEE: "Payée",
};

export const CURRENCY = "DH";

/**
 * A plain number in French: comma for the decimal mark, thin space for the
 * thousands. Used wherever a figure is shown outside a currency — a
 * temperature, a VAT rate — so the whole interface reads the same way.
 */
export function formatDecimal(value: number | string, maxDigits = 1) {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: maxDigits }).format(parsed);
}

export function formatCurrency(amount: number) {
  const value = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${value} ${CURRENCY}`;
}
