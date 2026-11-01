import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseIsoDay } from "@/lib/date-only";
import { labDayOf } from "@/lib/lab-time";
import { parseArticleSheet, splitKnown } from "@/lib/stock-import";
import { readImportFile } from "@/lib/stock-import-file";

/**
 * Import of the articles from the laboratory's « Fiche de stock » workbook
 * (lot 3D, RETOUR-LABO-28-10.md M8) — « créer seulement »:
 *
 *  mode=analyse → what the file holds and what WOULD be created (l'essai);
 *  mode=commit  → the import, in one transaction: each new article, and its
 *                 opening stock as one entry movement (« Stock d'ouverture »)
 *                 dated today, its levels 0 → opening written like any
 *                 movement's.
 *
 * An article already known by its name is reported, never touched — its
 * level belongs to its movements. Journalled (STOCK_IMPORTED).
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
    return NextResponse.json({ error: "Choisissez le fichier de la fiche de stock." }, { status: 400 });
  }
  const read = await readImportFile(file);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const parsed = parseArticleSheet(read.rows);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const known = await prisma.stockItem.findMany({ select: { name: true } });
  const { toCreate, alreadyKnown } = splitKnown(parsed.drafts, (draft) => draft.item.name, known.map((item) => item.name));
  const report = {
    mode: commit ? "commit" : "analyse",
    rows: parsed.rows,
    toCreate: toCreate.map((draft) => ({
      line: draft.line,
      name: draft.item.name,
      unit: draft.item.unit,
      location: draft.item.location,
      opening: draft.opening,
      lot: draft.lot,
      expiryDay: draft.expiryDay,
      unitPriceHT: draft.unitPriceHT,
    })),
    alreadyKnown: alreadyKnown.map((draft) => ({ line: draft.line, name: draft.item.name })),
    invalid: parsed.invalid,
    created: 0,
  };
  if (!commit) return NextResponse.json(report);
  if (toCreate.length === 0) {
    return NextResponse.json({ error: "Aucun article à créer — vérifiez le fichier." }, { status: 400 });
  }

  const today = parseIsoDay(labDayOf(new Date())) as Date;
  try {
    await prisma.$transaction(async (tx) => {
      for (const draft of toCreate) {
        const item = await tx.stockItem.create({ data: { ...draft.item, quantity: draft.opening } });
        if (draft.opening > 0) {
          await tx.stockMovement.create({
            data: {
              itemId: item.id,
              type: "ENTREE",
              quantity: draft.opening,
              lot: draft.lot,
              expiryDate: draft.expiryDay ? parseIsoDay(draft.expiryDay) : null,
              note: `Stock d'ouverture (import de « ${file.name.slice(0, 120)} »)`,
              movementDate: today,
              levelBefore: 0,
              levelAfter: draft.opening,
              unitPriceHT: draft.unitPriceHT,
              createdById: session.id,
            },
          });
        }
      }
    }, { timeout: 60_000 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Un article du fichier vient d'être créé par ailleurs — relancez l'analyse." }, { status: 409 });
    }
    throw error;
  }

  await logAudit({
    actorId: session.id,
    action: "STOCK_IMPORTED",
    entity: "StockItem",
    metadata: {
      file: file.name.slice(0, 191),
      created: toCreate.length,
      withOpeningStock: toCreate.filter((draft) => draft.opening > 0).length,
      alreadyKnown: alreadyKnown.length,
      invalid: parsed.invalid.length,
    },
  });

  return NextResponse.json({ ...report, created: toCreate.length });
}
