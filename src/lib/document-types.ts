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

/** The cartouche printed top-right of a document. */
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
