import { FlaskConical, LayoutDashboard, UserRound } from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * The client portal's menu (PORTAIL.md §2): its own three screens and
 * nothing of the laboratory — no search, no bench sheet, no invoice.
 */
export const portailNav: NavSection[] = [
  {
    title: "Espace client",
    items: [
      { label: "Tableau de bord", href: "/portail", icon: LayoutDashboard },
      { label: "Mes échantillons", href: "/portail/echantillons", icon: FlaskConical },
      { label: "Mon compte", href: "/portail/compte", icon: UserRound },
    ],
  },
];
