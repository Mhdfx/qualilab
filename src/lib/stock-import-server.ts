import "server-only";
import { prisma } from "./prisma";
import { toMoney } from "./money";
import { isoDayOf } from "./date-only";
import { labDayOf } from "./lab-time";
import { headerKey } from "./stock-import";
import {
  ARTICLE_STATUS_LABELS,
  PRICE_CHECK_LABELS,
  dayDate,
  planStockWorkbook,
  workbookKeys,
  type ArticlePlan,
  type ExistingArticle,
  type ImportedMovement,
  type StockWorkbook,
  type WorkbookPlan,
} from "./stock-workbook-import";

/**
 * Lot 6A, M12 (RETOUR-LABO-25-11.md §5) — the stock workbook against the
 * database: what is known of the file's articles (their level, whether a
 * movement was typed by hand, their latest day), which rows are already
 * imported, and the writing of the plan. The decisions are
 * `planStockWorkbook`'s (pure, tested); this module only reads and writes.
 */

const KEY_CHUNK = 1_000;
const ARTICLES_PER_TRANSACTION = 50;

/** Thrown inside a transaction when an article moved between the plan and its writing. */
export class StockImportConflict extends Error {}

export async function planFromDatabase(parsed: StockWorkbook, today: string): Promise<WorkbookPlan> {
  const wanted = new Set(parsed.articles.map((article) => article.key));
  const items = (await prisma.stockItem.findMany({ select: { id: true, name: true, quantity: true, archived: true } })).filter((item) =>
    wanted.has(headerKey(item.name))
  );
  const ids = items.map((item) => item.id);
  const [hand, dated, undated] = ids.length
    ? await Promise.all([
        prisma.stockMovement.groupBy({ by: ["itemId"], where: { itemId: { in: ids }, importKey: null }, _count: { _all: true } }),
        prisma.stockMovement.groupBy({ by: ["itemId"], where: { itemId: { in: ids }, movementDate: { not: null } }, _max: { movementDate: true } }),
        prisma.stockMovement.groupBy({ by: ["itemId"], where: { itemId: { in: ids }, movementDate: null }, _max: { createdAt: true } }),
      ])
    : [[], [], []];
  const handBy = new Map(hand.map((row) => [row.itemId, row._count._all]));
  const lastDay = new Map<string, string>();
  for (const row of dated) if (row._max.movementDate) lastDay.set(row.itemId, isoDayOf(row._max.movementDate));
  for (const row of undated) {
    if (!row._max.createdAt) continue;
    const day = labDayOf(row._max.createdAt);
    if (!lastDay.has(row.itemId) || day > (lastDay.get(row.itemId) as string)) lastDay.set(row.itemId, day);
  }
  const existing = new Map<string, ExistingArticle>(
    items.map((item) => [
      headerKey(item.name),
      {
        id: item.id,
        name: item.name,
        quantity: toMoney(item.quantity),
        archived: item.archived,
        handMovements: handBy.get(item.id) ?? 0,
        lastDay: lastDay.get(item.id) ?? null,
      },
    ])
  );

  // What was written for each row already imported — an edited row is then reported, not re-imported.
  const keys = workbookKeys(parsed);
  const imported = new Map<string, ImportedMovement>();
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const found = await prisma.stockMovement.findMany({
      where: { importKey: { in: keys.slice(i, i + KEY_CHUNK) } },
      select: { importKey: true, type: true, quantity: true, lot: true, expiryDate: true, unitPriceHT: true },
    });
    for (const row of found) {
      if (!row.importKey) continue;
      imported.set(row.importKey, {
        type: row.type,
        quantity: toMoney(row.quantity),
        lot: row.lot,
        expiryDay: row.expiryDate ? isoDayOf(row.expiryDate) : null,
        unitPriceHT: row.unitPriceHT === null ? null : toMoney(row.unitPriceHT),
      });
    }
  }
  return planStockWorkbook(parsed, existing, imported, today);
}

const writes = (plan: ArticlePlan) => plan.status === "a-creer" || (plan.status === "reprise" && (plan.movements.length > 0 || plan.adjustment !== null));

/** What the commit writes, article by article (the analysis shows the same figures). */
export type WrittenCounts = { articlesCreated: number; articlesResumed: number; movements: number; adjustments: number };

export const emptyCounts = (): WrittenCounts => ({ articlesCreated: 0, articlesResumed: 0, movements: 0, adjustments: 0 });

/** Whether anything was written. */
export const wroteSomething = (counts: WrittenCounts) => counts.articlesCreated + counts.articlesResumed + counts.movements + counts.adjustments > 0;

/**
 * Writes the plan: per article, the article (created, or its level moved
 * from the planned level — guarded, like a typed movement), its movements in
 * date order with their levels, then the adjustment. One transaction per 50
 * articles; a conflict (an article created or moved meanwhile, a row
 * imported meanwhile) stops the import — what is written stays, and the
 * next analysis skips it. `counts` (the caller's) holds what the committed
 * transactions wrote, so that a stop partway is still journalled.
 */
export async function writeWorkbookPlan(
  plan: WorkbookPlan,
  context: { actorId: string; fileName: string },
  counts: WrittenCounts = emptyCounts()
): Promise<WrittenCounts> {
  const todo = plan.articles.filter(writes);
  const file = context.fileName.slice(0, 120);
  for (let i = 0; i < todo.length; i += ARTICLES_PER_TRANSACTION) {
    const chunk = todo.slice(i, i + ARTICLES_PER_TRANSACTION);
    const done = await prisma.$transaction(
      async (tx) => {
        const local: WrittenCounts = { articlesCreated: 0, articlesResumed: 0, movements: 0, adjustments: 0 };
        for (const article of chunk) {
          let itemId: string;
          if (article.status === "a-creer") {
            const item = await tx.stockItem.create({
              data: { name: article.article.name, unit: article.article.unit, location: article.article.location, quantity: article.levelAfter },
            });
            itemId = item.id;
            local.articlesCreated += 1;
          } else {
            const moved = await tx.stockItem.updateMany({
              where: { id: article.existingId as string, quantity: article.levelNow, archived: false },
              data: { quantity: article.levelAfter },
            });
            if (moved.count === 0) throw new StockImportConflict();
            itemId = article.existingId as string;
            local.articlesResumed += 1;
          }
          if (article.movements.length > 0) {
            await tx.stockMovement.createMany({
              data: article.movements.map((movement) => {
                const flags = [
                  movement.opening ? "stock de départ" : null,
                  ["ok", "sans-prix", "un-prix"].includes(movement.check) ? null : PRICE_CHECK_LABELS[movement.check],
                ].filter(Boolean);
                return {
                  itemId,
                  type: movement.type,
                  quantity: movement.quantity,
                  lot: movement.lot,
                  expiryDate: movement.expiryDay ? dayDate(movement.expiryDay) : null,
                  note: `Fiche de stock importée « ${file} », onglet « ${movement.sheet} », ligne ${movement.line}${flags.length ? ` — ${flags.join(" ; ")}` : ""}`,
                  movementDate: dayDate(movement.day),
                  levelBefore: movement.levelBefore,
                  levelAfter: movement.levelAfter,
                  unitPriceHT: movement.type === "ENTREE" ? movement.unitPriceHT : null,
                  orderReference: movement.orderReference,
                  importKey: movement.importKey,
                  createdById: context.actorId,
                };
              }),
            });
            local.movements += article.movements.length;
          }
          if (article.adjustment) {
            await tx.stockMovement.create({
              data: {
                itemId,
                type: "AJUSTEMENT",
                quantity: article.adjustment.to,
                note: `Niveau de la fiche importée « ${file} » (dernier « Stock » de l'onglet « ${article.article.sheet} », ligne ${article.article.lastStockLine})`,
                movementDate: dayDate(article.adjustment.day),
                levelBefore: article.adjustment.from,
                levelAfter: article.adjustment.to,
                importKey: article.adjustment.importKey,
                createdById: context.actorId,
              },
            });
            local.adjustments += 1;
          }
        }
        return local;
      },
      { timeout: 60_000 }
    );
    counts.articlesCreated += done.articlesCreated;
    counts.articlesResumed += done.articlesResumed;
    counts.movements += done.movements;
    counts.adjustments += done.adjustments;
  }
  return counts;
}

/** The analysis as the screen reads it (prices included: MAGASINIER and ADMIN only). */
export function workbookReport(parsed: StockWorkbook, plan: WorkbookPlan) {
  return {
    sheets: parsed.sheets,
    tables: parsed.tables,
    dataRows: parsed.dataRows,
    totals: plan.totals,
    articles: plan.articles.map((article) => ({
      name: article.article.name,
      sheet: article.article.sheet,
      line: article.article.line,
      unit: article.article.unit,
      location: article.article.location,
      status: article.status,
      statusLabel: ARTICLE_STATUS_LABELS[article.status],
      levelNow: article.levelNow,
      levelAfter: article.levelAfter,
      lastStock: article.article.lastStock,
      adjustment: article.adjustment ? { from: article.adjustment.from, to: article.adjustment.to } : null,
      skipped: article.skipped,
      rows: article.article.movements.length,
      movements: article.movements.map((movement) => ({
        line: movement.line,
        day: movement.day,
        type: movement.type,
        opening: movement.opening,
        quantity: movement.quantity,
        orderReference: movement.orderReference,
        lot: movement.lot,
        expiryDay: movement.expiryDay,
        unitPriceHT: movement.unitPriceHT,
        check: movement.check,
        checkLabel: PRICE_CHECK_LABELS[movement.check],
        levelAfter: movement.levelAfter,
      })),
    })),
    refused: [...parsed.refused, ...plan.articles.flatMap((article) => article.refused)],
    changed: plan.articles.flatMap((article) => article.changed),
    warnings: parsed.warnings,
    ignored: parsed.ignored,
    ignoredCount: parsed.ignoredCount,
    emptySheets: parsed.emptySheets,
  };
}
