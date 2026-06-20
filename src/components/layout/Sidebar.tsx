"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import type { NavSection } from "./nav-types";

type SidebarProps = {
  sections: NavSection[];
  roleLabel: string;
  onNavigate?: () => void;
  onClose?: () => void;
};

function isActive(pathname: string, href: string) {
  const path = href.split("#")[0];
  if (path === "/preleveur" || path === "/admin") {
    return pathname === path && !href.includes("#");
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function Sidebar({ sections, roleLabel, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full flex-col bg-gradient-to-b from-[#1a3a5c] to-[#0f2844] lg:w-64">
      <div className="relative flex items-center justify-between gap-2 border-b border-white/10 px-4 py-5 lg:px-5">
        <div className="min-w-0 flex-1">
          <BrandLogo variant="sidebar" />
          <p className="mt-2.5 text-xs font-medium text-white/60">{roleLabel}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, idx) => (
          <div key={section.title ?? idx} className={idx > 0 ? "mt-6" : ""}>
            {section.title && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href && !item.disabled && isActive(pathname, item.href);

                if (item.disabled || !item.href) {
                  return (
                    <li key={item.label}>
                      <span className="flex min-h-[44px] cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/30">
                        <Icon className="h-4 w-4 shrink-0 opacity-50" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/40">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex min-h-[44px] items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "border-l-[3px] border-white bg-white/12 pl-[9px] pr-3 text-white shadow-sm"
                          : "border-l-[3px] border-transparent px-3 text-white/65 hover:bg-white/8 hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="safe-bottom shrink-0 border-t border-white/10 px-4 py-4 lg:px-5">
        <p className="text-xs font-medium leading-relaxed text-white/50">
          Qualilab International
        </p>
        <p className="mt-0.5 text-[11px] text-white/30">Version démo — LIMS</p>
      </div>
    </aside>
  );
}
