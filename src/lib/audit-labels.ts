import type { AuditAction } from "./audit";

/**
 * Plain French for every action the journal records (/admin/journal) — the
 * one source for the entries' wording and for the « Action » filter.
 *
 * Pure and client-safe. A code written by `logAudit()` that is missing here
 * shows up raw in the journal: `audit-labels.test.ts` scans the sources for
 * the codes passed to `logAudit()` and fails on an unlabelled one.
 */

/**
 * FACTURATION.md, AMENDEMENT.md, PORTAIL.md — typed against `AUDIT_ACTIONS`,
 * so a new action of those slices cannot reach the journal unlabelled.
 */
const SLICE_ACTION_LABELS = {
  INVOICE_DRAFT_CREATED: "Brouillon de facture enregistré",
  INVOICE_DRAFT_UPDATED: "Brouillon de facture modifié",
  INVOICE_DRAFT_DELETED: "Brouillon de facture supprimé",
  INVOICE_ISSUED: "Facture émise",
  INVOICE_CANCELLED: "Facture annulée",
  CREDIT_NOTE_ISSUED: "Avoir émis",
  PAYMENT_RECORDED: "Règlement enregistré",
  PAYMENT_DELETED: "Règlement supprimé",
  REPORT_REOPENED: "Rapport rouvert pour amendement",
  REPORT_AMENDED: "Rapport amendé validé",
  REPORT_DUPLICATE: "Duplicata de rapport édité",
  PORTAL_LOGIN: "Connexion au portail client",
} satisfies Record<AuditAction, string>;

export const ACTION_LABELS: Readonly<Record<string, string>> = {
  ...SLICE_ACTION_LABELS,
  SAMPLE_CREATED: "Échantillon créé",
  SERIE_CREATED: "Visite enregistrée",
  DEPOT_CREATED: "Dépôt enregistré",
  SERIE_UPDATED: "Visite complétée",
  SAMPLE_RECEIVED: "Échantillon réceptionné",
  SERIE_RECEIVED: "Série réceptionnée",
  SERIE_PHOTO_VIEWED: "Photo du protocole signé consultée",
  SAMPLE_CANCELLED: "Échantillon annulé",
  SAMPLE_AWAITING_CLIENT: "Échantillon en attente de l'avis du client",
  CLIENT_CONSULTED: "Accord du client enregistré",
  SAMPLES_EXPORTED: "Synthèse des analyses exportée (Excel)",
  DESTRUCTION_NOTIFIED: "Client informé d'une destruction",
  // Whatever the outcome (sent, simulated, failed, nobody to write to): the metadata's `status` says it.
  NOT_RECEIVED_NOTIFIED: "Avis « échantillon non reçu » au client",
  REGULATION_CREATED: "Réglementation créée",
  REGULATION_UPDATED: "Réglementation modifiée",
  SAMPLE_REGULATION_SET: "Réglementation choisie pour un échantillon",
  SAMPLE_REACTIVATED: "Échantillon réactivé",
  SAMPLE_INTAKE_CORRECTED: "Fiche d'échantillon corrigée",
  PROFILE_CREATED: "Profil d'analyses créé",
  PROFILE_UPDATED: "Profil d'analyses modifié",
  SITE_CREATED: "Site créé",
  SITE_UPDATED: "Site modifié",
  DOCUMENT_REFERENCE_UPDATED: "Cartouche de document modifiée",
  SAMPLE_PROGRAMMED: "Programme d'analyse confirmé",
  SAMPLE_PROGRAMME_UPDATED: "Programme d'analyse modifié",
  // Prise en charge libre (13/10): the bench take and give-back — not the
  // reception's « Libérer » (SAMPLE_RELEASED).
  SAMPLE_TAKEN: "Échantillon pris en charge",
  SAMPLE_UNTAKEN: "Échantillon remis dans « À prendre »",
  SAMPLE_ANALYSIS_STARTED: "Analyse démarrée",
  RESULTS_SAVED: "Résultats enregistrés",
  RESULTS_SUBMITTED: "Résultats soumis à validation",
  SAMPLE_VALIDATED_TECHNICAL: "Validation technique",
  SAMPLE_APPROVED: "Validation administrative",
  SAMPLE_REJECTED: "Échantillon renvoyé au technicien",
  REPORT_SENT: "Rapport envoyé",
  REPORT_DOWNLOADED: "Rapport téléchargé",
  CONTAMINATION_ALERT_SENT: "Alerte de contamination envoyée",
  INVOICES_EXPORTED: "Export du journal des ventes",
  // Entries written before FACTURATION.md (kept readable in the journal).
  INVOICE_CREATED: "Facture émise (ancien circuit)",
  INVOICE_DOWNLOADED: "Facture téléchargée",
  INVOICE_PAID: "Facture encaissée (ancien circuit)",
  INVOICE_REOPENED: "Facture rouverte (ancien circuit)",
  PURCHASE_INVOICE_PAID: "Facture fournisseur payée",
  PURCHASE_INVOICE_REOPENED: "Facture fournisseur rouverte",
  CLIENT_CREATED: "Client créé",
  CLIENT_UPDATED: "Client modifié",
  CLIENT_ARCHIVED: "Client archivé",
  CLIENT_RESTORED: "Client réactivé",
  CLIENT_MERGED: "Clients en double fusionnés",
  CLIENT_ATTACHED_AS_SITE: "Client rattaché comme site d'un autre client",
  CLIENT_BILLED_FOR_SET: "Client facturé lié à un client principal",
  CLIENT_BILLED_FOR_CLEARED: "Lien de client facturé retiré",
  SITE_BILLING_CHANGED: "« Facturé à » d'un site modifié",
  PARAMETER_CREATED: "Paramètre créé",
  PARAMETER_UPDATED: "Paramètre modifié",
  CRITERIA_IMPORTED: "Critères importés",
  CLIENT_MEMORY_IMPORTED: "Mémoire client importée",
  LEGACY_CATALOGUE_IMPORTED: "Catalogue de l'ancien logiciel importé",
  LEGACY_CATALOGUE_REPRISE: "Famille reprise de l'ancien logiciel (type d'analyse, critères)",
  DEMO_DATA_PURGED: "Données de démonstration supprimées",
  COUNTER_SET: "Compteur de numérotation modifié",
  PRODUCT_TYPE_CREATED: "Famille de produits créée",
  PRODUCT_TYPE_UPDATED: "Famille de produits modifiée",
  CRITERIA_UPDATED: "Critères modifiés",
  NORM_UPDATED: "Norme modifiée",
  CONCLUSION_SCALE_UPDATED: "Échelle de conclusion modifiée",
  SAMPLE_RELEASED: "Échantillon débloqué pour l'analyse",
  CLIENTS_IMPORTED: "Clients de l'ancien logiciel importés",
  SITES_IMPORTED: "Sites de l'ancien logiciel rattachés",
  COMPANY_UPDATED: "Coordonnées du laboratoire modifiées",
  LAB_SETTINGS_UPDATED: "Réglages du laboratoire modifiés",
  SERVICE_UPDATED: "Prestation du catalogue modifiée",
  USER_CREATED: "Utilisateur créé",
  USER_ROLE_CHANGED: "Rôle d'un utilisateur modifié",
  USER_PASSWORD_RESET: "Mot de passe réinitialisé",
  USER_PASSWORD_CHANGED: "Mot de passe modifié par l'utilisateur",
  // Q81 (RETOUR-LABO-19-10.md H1): creation or reset by the administrator.
  USER_PASSWORD_CHANGE_REQUIRED: "Changement de mot de passe exigé",
  USER_CLIENT_CHANGED: "Client d'un compte portail modifié",
  // Lot 1b (RETOUR-LABO-16-10.md D5): « Technicien de QUALILAB 'I.NOM' ».
  USER_DOCUMENT_NAME_CHANGED: "Dénomination sur les documents modifiée",
  USER_DISABLED: "Compte désactivé",
  USER_ENABLED: "Compte réactivé",
  EQUIPMENT_CREATED: "Équipement créé",
  EQUIPMENT_UPDATED: "Équipement modifié",
  EQUIPMENT_ARCHIVED: "Équipement archivé",
  EQUIPMENT_RESTORED: "Équipement réactivé",
  TEMPERATURE_RECORDED: "Température relevée",
  TEMPERATURE_OUT_OF_RANGE: "Température hors limites relevée",
  CALIBRATION_RECORDED: "Étalonnage enregistré",
  EIL_CREATED: "Campagne EIL créée",
  EIL_UPDATED: "Campagne EIL modifiée",
  SUPPLIER_CREATED: "Fournisseur créé",
  SUPPLIER_UPDATED: "Fournisseur modifié",
  SUPPLIER_ARCHIVED: "Fournisseur archivé",
  SUPPLIER_RESTORED: "Fournisseur réactivé",
  PURCHASE_INVOICE_CREATED: "Facture fournisseur enregistrée",
  STOCK_ITEM_CREATED: "Article de stock créé",
  STOCK_ITEM_UPDATED: "Article de stock modifié",
  STOCK_ITEM_ARCHIVED: "Article de stock archivé",
  STOCK_ITEM_RESTORED: "Article de stock réactivé",
  STOCK_MOVEMENT: "Mouvement de stock",
};

/** The French wording of an action; an unknown code is shown as it was written. */
export function actionLabel(action: string): string {
  return Object.prototype.hasOwnProperty.call(ACTION_LABELS, action) ? ACTION_LABELS[action] : action;
}

/** The « Action » filter's choices, in alphabetical order of their wording. */
export function actionChoices(): { value: string; label: string }[] {
  return Object.entries(ACTION_LABELS)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
