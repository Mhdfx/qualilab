import { LayoutDashboard, PlusCircle, ClipboardList, User } from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * The préleveur's menu. « Mes visites » is the whole history (« Voir plus »,
 * search, status on the dashboard), so there is no separate « Historique ».
 */
export const preleveurNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/preleveur", icon: LayoutDashboard },
      {
        label: "Nouvelle visite",
        href: "/preleveur/nouvelle-visite",
        icon: PlusCircle,
      },
      { label: "Mes visites", href: "/preleveur#visites", icon: ClipboardList },
    ],
  },
  {
    title: "Compte",
    items: [{ label: "Mon compte", href: "/compte", icon: User }],
  },
];
