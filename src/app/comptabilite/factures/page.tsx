import { requireRole } from "@/lib/auth";
import { FacturesList } from "@/components/FacturesList";

/**
 * The comptable's invoice list.
 *
 * Invoicing is the comptable's job, so it lives in their space too — the same
 * screens the admin sees, from the shared components.
 */
export default async function ComptaFacturesPage() {
  await requireRole("COMPTABLE", "ADMIN");
  return <FacturesList />;
}
