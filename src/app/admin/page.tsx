import { requireRole } from "@/lib/auth";
import { DirectionStats } from "@/components/admin/DirectionStats";
import { AdminDashboard } from "@/components/AdminDashboard";
import type { SampleRow } from "@/components/SampleTable";
import { adminFirstSamples, asJson, loadSampleStats } from "@/lib/dashboard-first-page";

export const metadata = { title: "Direction" };

export default async function AdminPage() {
  await requireRole("ADMIN");
  // The figures and the 50 newest samples come with the page (lot
  // performance P2-7) — what `/api/samples/stats` and `/api/samples?limit=50`
  // answer the administrator; the dashboard asks again only for a search.
  const [totals, first] = await Promise.all([loadSampleStats(), adminFirstSamples()]);

  return (
    <div>
      <DirectionStats />
      <AdminDashboard initialTotals={totals} initialSamples={asJson(first.items) as SampleRow[]} />
    </div>
  );
}
