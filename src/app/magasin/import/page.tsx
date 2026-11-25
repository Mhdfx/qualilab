import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { MagasinImport } from "@/components/magasin/MagasinImport";
import { PurchaseJournalImport } from "@/components/magasin/PurchaseJournalImport";

export const metadata = { title: "Import des listes" };

/**
 * The imports of the magasin (lot 3D, RETOUR-LABO-28-10.md M8): the
 * articles from the laboratory's « Fiche de stock » — since lot 6A
 * (RETOUR-LABO-25-11.md M14) its real file too, one tab per article, with
 * every row as a dated movement —, the suppliers from its « Journal Achat »
 * and, since lot 6B (M17), that journal's invoices themselves — analyse,
 * then import.
 */
export default async function MagasinImportPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("MAGASINIER", "ADMIN");
  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Import des listes"
        subtitle="Vos classeurs, dans leurs colonnes : analysez le fichier, vérifiez, puis importez — rien n'est écrit avant votre confirmation."
      />
      <div className="max-w-4xl space-y-8">
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Articles et mouvements de stock (« Fiche de stock »)</h2>
          <MagasinImport
            kind="articles"
            endpoint="/api/stock/import"
            formats
            help="Une feuille par article (votre fichier « Consommable labo ») : chaque onglet est un article (deux tableaux dans un onglet = deux articles), « Libellé » est le bon de commande ; chaque ligne devient un mouvement daté, avec son bon de commande, son lot, son expiration et son prix — l'unité vient de « Entrée/… » (C500 = carton de 500). Les quantités sont rapprochées des prix, et un fichier réimporté n'écrit que ses lignes nouvelles. Registre unique (modèle du 28/10) : un article par libellé, son stock d'ouverture daté d'aujourd'hui."
          />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Fournisseurs (« Journal Achat »)</h2>
          <MagasinImport
            kind="fournisseurs"
            endpoint="/api/suppliers/import"
            help="Colonnes lues : Fournisseurs, Délai de paiement (et, si vous les ajoutez : ICE, Contact, Téléphone, Email, Adresse, Soumis à la retenue). Un fournisseur par nom, sans ses factures — pour reprendre aussi les factures du journal, utilisez l'import ci-dessous (il crée les fournisseurs qui manquent)."
          />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Factures fournisseurs (« Journal Achat »)</h2>
          <PurchaseJournalImport />
        </section>
      </div>
    </div>
  );
}
