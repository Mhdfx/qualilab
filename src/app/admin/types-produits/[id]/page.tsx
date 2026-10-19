import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadFamilyDetail } from "@/lib/family-catalogue";
import { FamilyDetailView } from "@/components/admin/FamilyDetailView";

export const metadata = { title: "Critères d'une famille" };

export default async function ProductTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("ADMIN");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const data = await loadFamilyDetail(id, query);
  if (!data) notFound();

  return (
    <FamilyDetailView
      data={data}
      basePath="/admin/types-produits"
      backLabel="Familles de produits"
      badge="Configuration"
      administrator
    />
  );
}
