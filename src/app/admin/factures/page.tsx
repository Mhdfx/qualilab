import { requireRole } from "@/lib/auth";
import { FacturesList } from "@/components/FacturesList";

export const metadata = { title: "Factures" };

export default async function FacturesPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("ADMIN");
  return <FacturesList />;
}
