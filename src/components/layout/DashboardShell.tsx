"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import type { NavSection } from "./nav-types";

type DashboardShellProps = {
  children: React.ReactNode;
  userName: string;
  roleLabel: string;
  navSections: NavSection[];
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DashboardShell({
  children,
  userName,
  roleLabel,
  navSections,
}: DashboardShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const firstName = userName.split(" ")[0];
  const initials = getInitials(userName);

  return (
    <div className="app-bg flex min-h-screen">
      <div className="hidden lg:block">
        <div className="fixed inset-y-0 left-0 z-30">
          <Sidebar sections={navSections} roleLabel={roleLabel} />
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 z-50 w-[min(100vw-2rem,16rem)] shadow-2xl">
            <Sidebar
              sections={navSections}
              roleLabel={roleLabel}
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <header className="safe-top sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="shrink-0 rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 lg:hidden">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-brand">
                {roleLabel}
              </p>
              <p className="truncate text-sm font-medium text-slate-800">{firstName}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-3 md:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-accent text-xs font-bold text-white shadow-sm">
                {initials}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-800">{userName}</p>
                <p className="text-xs text-slate-400">Qualilab International</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:px-4"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        <main className="safe-bottom flex-1 p-3 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
