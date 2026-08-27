import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { isLowStock } from "@/lib/stock";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  StockManager,
  type StockItemRow,
} from "@/components/magasin/StockManager";

export const metadata = { title: "Stock" };

export default async function StockPage() {
  const items = await prisma.stockItem.findMany({
    where: { archived: false },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const rows: StockItemRow[] = items.map((item) => {
    const quantity = toMoney(item.quantity);
    const minQuantity = toMoney(item.minQuantity);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity,
      minQuantity,
      low: isLowStock(quantity, minQuantity),
      archived: item.archived,
    };
  });

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Stock"
        subtitle="Le niveau de chaque article n'est modifié que par un mouvement — l'historique explique toujours le chiffre."
      />
      <StockManager initialItems={rows} />
    </div>
  );
}
