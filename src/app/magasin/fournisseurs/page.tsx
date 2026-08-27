import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  SuppliersManager,
  type SupplierRow,
} from "@/components/magasin/SuppliersManager";

export const metadata = { title: "Fournisseurs" };

export default async function FournisseursPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { invoices: { where: { status: "A_PAYER" } } } },
    },
  });

  const rows: SupplierRow[] = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    contact: supplier.contact,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    ice: supplier.ice,
    paymentTermDays: supplier.paymentTermDays,
    notes: supplier.notes,
    archived: supplier.archived,
    unpaidInvoices: supplier._count.invoices,
  }));

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Fournisseurs"
        subtitle="Chaque fournisseur porte sa convention de paiement — elle fixe l'échéance par défaut de ses factures."
      />
      <SuppliersManager initialSuppliers={rows} />
    </div>
  );
}
