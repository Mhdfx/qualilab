/**
 * The quality documents the laboratory prints, each with its cartouche
 * (Réf / version / dates) kept in `DocumentReference`. Pure data so the
 * admin form and the PDF builders share the same list.
 */

export const DOC_TYPES = [
  "PROTOCOLE",
  "BON_RECEPTION",
  "FEUILLE_PAILLASSE",
  "CAHIER_PHYSICO",
  "RAPPORT",
  "ETIQUETTE",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  PROTOCOLE: "Protocole de prélèvement",
  BON_RECEPTION: "Bon de réception",
  FEUILLE_PAILLASSE: "Feuille de paillasse",
  CAHIER_PHYSICO: "Cahier de détermination (physico-chimie)",
  RAPPORT: "Rapport d'analyse",
  ETIQUETTE: "Étiquette d'échantillon",
};

/**
 * Where the LIMS prints each document's cartouche — shown beside its row in
 * /admin/documents, so a version is never edited for a form nothing prints.
 * null = not printed by the LIMS yet (the paper keeps it).
 */
export const DOC_TYPE_PRINTED_ON: Record<DocType, string | null> = {
  PROTOCOLE: "Protocole de prélèvement (PDF de la visite)",
  BON_RECEPTION: "Bon de réception (PDF du dépôt)",
  FEUILLE_PAILLASSE: "Feuille de paillasse (PDF du jour)",
  CAHIER_PHYSICO: null,
  RAPPORT: null,
  ETIQUETTE: null,
};

/** The cartouche printed at the head of every page of a form (cartouche-html.ts). */
export type DocumentRef = {
  docType: DocType;
  reference: string;
  version: string;
  createdOn: Date | null;
  updatedOn: Date | null;
};

/** What a document prints when the laboratory has not filled its cartouche yet. */
export function emptyReference(docType: DocType): DocumentRef {
  return { docType, reference: "", version: "", createdOn: null, updatedOn: null };
}
