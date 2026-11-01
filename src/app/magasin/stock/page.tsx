import Link from "next/link";
import { History } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { knownLocations } from "@/lib/stock";
import { labDayOf } from "@/lib/lab-time";
import { loadAchatSettings } from "@/lib/achat-settings";
import { loadStockOverview } from "@/lib/stock-overview";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockManager } from "@/components/magasin/StockManager";

export const metadata = { title: "Stock" };

export default async function StockPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("MAGASINIER", "ADMIN");
  const settings = await loadAchatSettings();
  const now = new Date();
  const rows = await loadStockOverview({ expiryWarningDays: settings.expiryWarningDays, now });

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Stock"
        subtitle="Le niveau de chaque article n'est modifié que par un mouvement — l'historique explique toujours le chiffre."
      />
      <p className="mb-4 text-sm">
        <Link
          href="/magasin/stock/journal"
          className="inline-flex items-center gap-1.5 rounded font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Journal des mouvements de tous les articles (et export Excel)
        </Link>
      </p>
      <StockManager
        initialItems={rows}
        locations={knownLocations(rows)}
        today={labDayOf(now)}
        expiryWarningDays={settings.expiryWarningDays}
      />
    </div>
  );
}
