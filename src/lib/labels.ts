import type { InvoiceStatus, SampleStatus, SampleType } from "@/generated/prisma/client";

export const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  ALIMENTAIRE: "Alimentaire",
  EAU: "Eau",
  AMBIANCE: "Ambiance",
};

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  PRELEVE: "Prélevé",
  RECU: "Reçu",
  EN_ANALYSE: "En analyse",
  RESULTATS_SAISIS: "Résultats saisis",
  VALIDE: "Validé",
  RAPPORT_ENVOYE: "Rapport envoyé",
};

/**
 * The laboratory's wall clock. Fixed on purpose: server and browser must
 * format a timestamp identically or hydration mismatches. The container's TZ
 * (docker-compose.yml) is set to the same zone so that day cut-offs — "reçus
 * aujourd'hui", the bench sheet — land on the same day as the printed times.
 */
export const LAB_TIME_ZONE = "Africa/Casablanca";

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: LAB_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: LAB_TIME_ZONE,
  }).format(
    new Date(date)
  );
}

/** Short "jour/mois heure:minute" — the lab's own zone, client-safe. */
export function formatDayTime(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  }).format(typeof date === "string" ? new Date(date) : date);
}

/** Numeric "jj/mm/aaaa" — the lab's own zone, client-safe. */
export function formatDayShort(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  }).format(typeof date === "string" ? new Date(date) : date);
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  EN_ATTENTE: "En attente",
  PAYEE: "Payée",
};

export const CURRENCY = "DH";

export function formatCurrency(amount: number) {
  const value = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${value} ${CURRENCY}`;
}
