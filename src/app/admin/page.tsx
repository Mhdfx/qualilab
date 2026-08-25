import { requireRole } from "@/lib/auth";
import { DirectionStats } from "@/components/admin/DirectionStats";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPage() {
  await requireRole("ADMIN");

  return (
    <div>
      <DirectionStats />
      <AdminDashboard />
    </div>
  );
}
