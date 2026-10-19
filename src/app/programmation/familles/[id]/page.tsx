import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadFamilyDetail } from "@/lib/family-catalogue";
import { FamilyDetailView } from "@/components/admin/FamilyDetailView";

export const metadata = { title: "Critères d'une famille" };

/** One family's header, regulation and criteria, for the responsable des paramètres (RETOUR-LABO-16-10.md F4). */
export default async function FamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("PROGRAMMATEUR", "ADMIN");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const data = await loadFamilyDetail(id, query);
  if (!data) notFound();

  return (
    <FamilyDetailView
      data={data}
      basePath="/programmation/familles"
      backLabel="Familles & critères"
      badge="Familles & critères"
      administrator={session.role === "ADMIN"}
    />
  );
}
