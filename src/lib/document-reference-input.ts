import { isoDayOf, parseIsoDay } from "./date-only";
import { DOC_TYPES, DOC_TYPE_LABELS, type DocType, type DocumentRef } from "./document-types";

/**
 * The cartouches as /admin/documents edits them, and the check of a save.
 * Pure, so the round trip « read → date input → save » is tested without a
 * database: the form re-sends every row on each save, and a date that slid
 * by one day on the way would rewrite the « Dernière mise à jour » of every
 * printed form.
 */

/** One row of the form: « AAAA-MM-JJ » for the date inputs, empty when unknown. */
export type DocumentRow = {
  docType: DocType;
  reference: string;
  version: string;
  createdOn: string;
  updatedOn: string;
};

/** A stored cartouche → the form's row. The dates are calendar dates (`@db.Date`): read in UTC. */
export function documentRowOf(ref: DocumentRef): DocumentRow {
  return {
    docType: ref.docType,
    reference: ref.reference,
    version: ref.version,
    createdOn: ref.createdOn ? isoDayOf(ref.createdOn) : "",
    updatedOn: ref.updatedOn ? isoDayOf(ref.updatedOn) : "",
  };
}

export type DocumentReferenceItem = {
  docType: DocType;
  reference: string;
  version: string;
  createdOn: Date | null;
  updatedOn: Date | null;
};

/**
 * « AAAA-MM-JJ » → the UTC midnight of that day, which the database adapter
 * stores as that very DATE. A longer ISO string (a row sent back as the GET
 * returned it) is read by its day. Never `new Date("AAAA-MM-JJT00:00:00")`:
 * local midnight is the previous UTC day on a runtime ahead of UTC.
 */
function parseDay(value: unknown, label: string): Date | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  const day = typeof value === "string" ? parseIsoDay(value.slice(0, 10)) : null;
  return day ?? { error: `${label} : date invalide.` };
}

export type DocumentReferencesCheck = { ok: true; items: DocumentReferenceItem[] } | { ok: false; error: string };

/** The body of PUT /api/admin/documents: `{ items: DocumentRow[] }`. */
export function validateDocumentReferences(body: unknown): DocumentReferencesCheck {
  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Aucun document à enregistrer." };

  const items: DocumentReferenceItem[] = [];
  for (const entry of raw as (Record<string, unknown> | null)[]) {
    const docType = String(entry?.docType ?? "") as DocType;
    if (!DOC_TYPES.includes(docType)) return { ok: false, error: "Type de document inconnu." };
    if (items.some((item) => item.docType === docType)) {
      return { ok: false, error: `${DOC_TYPE_LABELS[docType]} : document envoyé deux fois.` };
    }
    const name = DOC_TYPE_LABELS[docType];
    const reference = typeof entry?.reference === "string" ? entry.reference.trim() : "";
    const version = typeof entry?.version === "string" ? entry.version.trim() : "";
    if (reference.length > 40 || version.length > 10) {
      return { ok: false, error: `${name} : référence (40) ou version (10) trop longue.` };
    }
    // Both empty = « not filled yet »; a reference without version is a half-cartouche.
    if ((reference && !version) || (!reference && version)) {
      return { ok: false, error: `${name} : indiquez la référence et la version.` };
    }
    const createdOn = parseDay(entry?.createdOn, `${name} · date de création`);
    if (createdOn && "error" in createdOn) return { ok: false, error: createdOn.error };
    const updatedOn = parseDay(entry?.updatedOn, `${name} · dernière mise à jour`);
    if (updatedOn && "error" in updatedOn) return { ok: false, error: updatedOn.error };
    if (createdOn && updatedOn && updatedOn < createdOn) {
      return { ok: false, error: `${name} : la dernière mise à jour précède la création.` };
    }
    items.push({ docType, reference, version, createdOn, updatedOn });
  }
  return { ok: true, items };
}
