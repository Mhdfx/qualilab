import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { MagasinImport } from "@/components/magasin/MagasinImport";

export const metadata = { title: "Import des listes" };

/**
 * The imports of the magasin (lot 3D, RETOUR-LABO-28-10.md M8): the
 * articles from the laboratory's « Fiche de stock », the suppliers from its
 * « Journal Achat » — analyse, then import; « créer seulement ».
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
          <h2 className="mb-3 text-base font-semibold text-slate-900">Articles et stock d&apos;ouverture (« Fiche de stock »)</h2>
          <MagasinImport
            kind="articles"
            endpoint="/api/stock/import"
            help="Colonnes lues : Libellé, Lot, Expiration, Entrée, Sortie, Stock, Prix (dh/ht), Lieu de stockage (et, si vous les ajoutez : Unité, Catégorie, Seuil). Un article par libellé ; son stock d'ouverture (la colonne « Stock » de sa dernière ligne, sinon entrées − sorties) devient une entrée datée d'aujourd'hui."
          />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Fournisseurs (« Journal Achat »)</h2>
          <MagasinImport
            kind="fournisseurs"
            endpoint="/api/suppliers/import"
            help="Colonnes lues : Fournisseurs, Délai de paiement (et, si vous les ajoutez : ICE, Contact, Téléphone, Email, Adresse, Soumis à la retenue). Un fournisseur par nom ; les factures du journal ne sont pas importées."
          />
        </section>
      </div>
    </div>
  );
}
