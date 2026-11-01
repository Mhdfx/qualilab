import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { labDayOf } from "@/lib/lab-time";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockJournalView } from "@/components/magasin/StockJournalView";
import { STOCK_JOURNAL_ORDER_DESC, STOCK_JOURNAL_SELECT } from "@/lib/stock-journal-query";
import { stockJournalFilters, stockJournalRows, stockJournalWhere, type StockJournalFilters } from "@/lib/stock-journal";

export const metadata = { title: "Journal du stock" };

/**
 * Le journal des mouvements de stock (lot 3D, RETOUR-LABO-28-10.md M3): one
 * register for every article, newest first, in the template « Fiche de
 * stock »'s columns; filters by period, article and type; the Excel export
 * of what is filtered.
 */
export default async function StockJournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("MAGASINIER", "ADMIN");
  const query = await searchParams;
  const text = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  const parsed = stockJournalFilters({ du: text("du"), au: text("au"), article: text("article"), type: text("type") });
  const filters: StockJournalFilters = parsed.ok ? parsed.filters : { fromDay: null, toDay: null, itemId: null, type: null };

  const [movements, items] = await Promise.all([
    prisma.stockMovement.findMany({
      where: stockJournalWhere(filters),
      orderBy: STOCK_JOURNAL_ORDER_DESC,
      take: DEFAULT_PAGE_SIZE + 1,
      select: STOCK_JOURNAL_SELECT,
    }),
    prisma.stockItem.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, archived: true } }),
  ]);
  const hasMore = movements.length > DEFAULT_PAGE_SIZE;
  const shown = hasMore ? movements.slice(0, DEFAULT_PAGE_SIZE) : movements;

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Journal du stock"
        subtitle="Les mouvements de tous les articles, par date — le registre de votre fiche de stock, exportable en Excel."
      />
      <StockJournalView
        initialRows={stockJournalRows(shown, labDayOf)}
        initialCursor={hasMore ? (shown.at(-1)?.id ?? null) : null}
        initialFilters={{
          du: filters.fromDay ?? "",
          au: filters.toDay ?? "",
          article: filters.itemId ?? "",
          type: filters.type ?? "",
        }}
        initialError={parsed.ok ? "" : parsed.error}
        items={items}
        today={labDayOf(new Date())}
      />
    </div>
  );
}
