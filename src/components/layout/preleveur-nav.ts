import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  User,
  History,
} from "lucide-react";
import type { NavSection } from "./nav-types";

export const preleveurNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/preleveur", icon: LayoutDashboard },
      {
        label: "Nouveau prélèvement",
        href: "/preleveur/nouveau",
        icon: PlusCircle,
      },
      { label: "Mes prélèvements", href: "/preleveur#prelevements", icon: ClipboardList },
    ],
  },
  {
    title: "À venir",
    items: [
      { label: "Historique", icon: History, disabled: true, badge: "Bientôt" },
      { label: "Mon profil", icon: User, disabled: true, badge: "Bientôt" },
    ],
  },
];
