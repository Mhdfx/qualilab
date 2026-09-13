import "server-only";
import { prisma } from "./prisma";
import { DOC_TYPES, emptyReference, type DocType, type DocumentRef } from "./document-types";

/**
 * Reading the cartouches — server side. A missing row never breaks a
 * document: the PDF prints an empty cartouche the admin can fill later.
 */

export async function getDocumentReference(docType: DocType): Promise<DocumentRef> {
  try {
    const row = await prisma.documentReference.findUnique({ where: { docType } });
    return row ? { ...row, docType } : emptyReference(docType);
  } catch (error) {
    console.error("[documents] falling back to an empty cartouche", { docType, error });
    return emptyReference(docType);
  }
}

/** Every known document, in print order, with its row or an empty cartouche. */
export async function listDocumentReferences(): Promise<DocumentRef[]> {
  const rows = await prisma.documentReference.findMany();
  const byType = new Map(rows.map((r) => [r.docType, r]));
  return DOC_TYPES.map((docType) => {
    const row = byType.get(docType);
    return row ? { ...row, docType } : emptyReference(docType);
  });
}
