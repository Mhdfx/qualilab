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

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(date)
  );
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
