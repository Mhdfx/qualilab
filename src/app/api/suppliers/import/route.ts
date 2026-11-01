import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseSupplierSheet, splitKnown } from "@/lib/stock-import";
import { readImportFile } from "@/lib/stock-import-file";

/**
 * Import of the suppliers from the laboratory's « Journal Achat » workbook
 * (lot 3D, RETOUR-LABO-28-10.md M8) — « créer seulement »: one supplier per
 * distinct name of the « Fournisseurs » column, with its « Délai de
 * paiement ». `mode=analyse` reports what would be created (l'essai),
 * `mode=commit` creates them in one transaction. A supplier already known
 * by its name is reported, never changed. Journalled (SUPPLIERS_IMPORTED).
 */
export async function POST(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  const commit = form.get("mode") === "commit";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choisissez le fichier des fournisseurs." }, { status: 400 });
  }
  const read = await readImportFile(file);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const parsed = parseSupplierSheet(read.rows);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const known = await prisma.supplier.findMany({ select: { name: true } });
  const { toCreate, alreadyKnown } = splitKnown(parsed.drafts, (draft) => draft.supplier.name, known.map((supplier) => supplier.name));
  const report = {
    mode: commit ? "commit" : "analyse",
    rows: parsed.rows,
    toCreate: toCreate.map((draft) => ({
      line: draft.line,
      name: draft.supplier.name,
      paymentTermDays: draft.supplier.paymentTermDays,
      ice: draft.supplier.ice,
      withholdingSubject: draft.supplier.withholdingSubject,
    })),
    alreadyKnown: alreadyKnown.map((draft) => ({ line: draft.line, name: draft.supplier.name })),
    invalid: parsed.invalid,
    created: 0,
  };
  if (!commit) return NextResponse.json(report);
  if (toCreate.length === 0) {
    return NextResponse.json({ error: "Aucun fournisseur à créer — vérifiez le fichier." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const draft of toCreate) await tx.supplier.create({ data: draft.supplier });
    }, { timeout: 60_000 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Un fournisseur du fichier vient d'être créé par ailleurs — relancez l'analyse." }, { status: 409 });
    }
    throw error;
  }

  await logAudit({
    actorId: session.id,
    action: "SUPPLIERS_IMPORTED",
    entity: "Supplier",
    metadata: { file: file.name.slice(0, 191), created: toCreate.length, alreadyKnown: alreadyKnown.length, invalid: parsed.invalid.length },
  });

  return NextResponse.json({ ...report, created: toCreate.length });
}
