import { requireRole } from "@/lib/auth";
import { DirectionStats } from "@/components/admin/DirectionStats";
import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata = { title: "Direction" };

export default async function AdminPage() {
  await requireRole("ADMIN");

  return (
    <div>
      <DirectionStats />
      <AdminDashboard />
    </div>
  );
}
