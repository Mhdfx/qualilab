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
        label: "Nouvelle visite",
        href: "/preleveur/nouvelle-visite",
        icon: PlusCircle,
      },
      { label: "Mes visites", href: "/preleveur#visites", icon: ClipboardList },
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
