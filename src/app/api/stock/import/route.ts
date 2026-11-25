import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseIsoDay } from "@/lib/date-only";
import { labDayOf } from "@/lib/lab-time";
import { parseArticleSheet, splitKnown, type SheetRow } from "@/lib/stock-import";
import { readImportWorkbook } from "@/lib/stock-import-file";
import { detectStockFormat, parseStockWorkbook, planWrites, type StockImportFormat } from "@/lib/stock-workbook-import";
import { StockImportConflict, planFromDatabase, workbookReport, writeWorkbookPlan } from "@/lib/stock-import-server";

/**
 * Import of the laboratory's stock file (MAGASINIER, ADMIN), two formats:
 *
 * - `format=par-article` (lot 6A, RETOUR-LABO-25-11.md M10–M12) — the
 *   laboratory's real file, one tab per article (« Consommable labo »):
 *   `mode=analyse` says, per article, « à créer » / « déjà importé (k
 *   mouvements nouveaux) » / « suivi à la main — non touché », its movements
 *   and the level they lead to; `mode=commit` writes them (dated, with their
 *   bon de commande, lot, expiry, price and levels), then the level of the
 *   file (`STOCK_IMPORT_LEVEL_FROM_FILE`). **Idempotent**: a row already
 *   imported is skipped — a second import of the same file writes nothing.
 * - `format=registre` (lot 3D, M8) — the single register: one article per
 *   « Libellé », its opening stock as one entry dated today; « créer
 *   seulement ».
 * - `format=auto` (default): `detectStockFormat` (M11); the answer says which.
 *
 * Journalled (STOCK_IMPORTED, with the format) when something is written;
 * 409 when the stock moved between the analysis and the import.
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
  const asked = String(form.get("format") ?? "auto");
  if (!["auto", "par-article", "registre"].includes(asked)) {
    return NextResponse.json({ error: "Format inconnu." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choisissez le fichier de la fiche de stock." }, { status: 400 });
  }
  const read = await readImportWorkbook(file, { sheets: "all" });
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const detected = detectStockFormat(read.sheets);
  const format: StockImportFormat = asked === "auto" ? detected : (asked as StockImportFormat);

  if (format === "par-article") return importWorkbook(read.sheets, { file, commit, detected, actorId: session.id });
  return importRegister(read.sheets[0]?.rows ?? [], { file, commit, detected, actorId: session.id });
}

type Context = { file: File; commit: boolean; detected: StockImportFormat; actorId: string };

/** Lot 6A — one tab per article. */
async function importWorkbook(sheets: Parameters<typeof parseStockWorkbook>[0], context: Context) {
  const today = labDayOf(new Date());
  const parsed = parseStockWorkbook(sheets, { today });
  if (parsed.articles.length === 0) {
    return NextResponse.json(
      { error: "Aucun tableau de stock trouvé : chaque onglet doit porter un en-tête « Date », « Libellé », « Entrée »." },
      { status: 400 }
    );
  }
  const plan = await planFromDatabase(parsed, today);
  const base = { format: "par-article" as const, detected: context.detected, file: context.file.name.slice(0, 191), ...workbookReport(parsed, plan) };
  if (!context.commit) return NextResponse.json({ mode: "analyse", ...base, written: null });

  if (!planWrites(plan)) {
    return NextResponse.json({ mode: "commit", ...base, written: { articlesCreated: 0, articlesResumed: 0, movements: 0, adjustments: 0 } });
  }
  let written;
  try {
    written = await writeWorkbookPlan(plan, { actorId: context.actorId, fileName: context.file.name });
  } catch (error) {
    if (error instanceof StockImportConflict || (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Le stock a changé pendant l'import (un article créé ou modifié par ailleurs) — relancez l'analyse : ce qui est déjà importé sera sauté." },
        { status: 409 }
      );
    }
    throw error;
  }

  await logAudit({
    actorId: context.actorId,
    action: "STOCK_IMPORTED",
    entity: "StockItem",
    metadata: {
      format: "par-article",
      file: context.file.name.slice(0, 191),
      sheets: parsed.sheets,
      articlesCreated: written.articlesCreated,
      articlesResumed: written.articlesResumed,
      movements: written.movements,
      adjustments: written.adjustments,
      skipped: plan.totals.skipped,
      refused: plan.totals.refused,
      untouched: plan.totals.untouched,
      warnings: parsed.warnings.length,
    },
  });
  return NextResponse.json({ mode: "commit", ...base, written });
}

/** Lot 3D — the single register (unchanged). */
async function importRegister(rows: SheetRow[], context: Context) {
  const { file, commit } = context;
  const parsed = parseArticleSheet(rows);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const known = await prisma.stockItem.findMany({ select: { name: true } });
  const { toCreate, alreadyKnown } = splitKnown(parsed.drafts, (draft) => draft.item.name, known.map((item) => item.name));
  const report = {
    format: "registre" as const,
    detected: context.detected,
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
              createdById: context.actorId,
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
    actorId: context.actorId,
    action: "STOCK_IMPORTED",
    entity: "StockItem",
    metadata: {
      format: "registre",
      file: file.name.slice(0, 191),
      created: toCreate.length,
      withOpeningStock: toCreate.filter((draft) => draft.opening > 0).length,
      alreadyKnown: alreadyKnown.length,
      invalid: parsed.invalid.length,
    },
  });

  return NextResponse.json({ ...report, created: toCreate.length });
}
