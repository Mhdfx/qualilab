import {
  LayoutDashboard,
  FlaskConical,
  FileText,
  Users,
  Building2,
  UserCog,
  Settings,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import type { NavSection } from "./nav-types";

export const adminNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
      { label: "Prélèvements", href: "/admin", icon: FlaskConical },
      { label: "Approbations", href: "/validation", icon: ShieldCheck },
      { label: "Factures", href: "/admin/factures", icon: FileText },
    ],
  },
  {
    title: "Gestion",
    items: [
      { label: "Clients", href: "/commercial", icon: Building2 },
      { label: "Utilisateurs", icon: UserCog, disabled: true, badge: "Bientôt" },
    ],
  },
  {
    title: "Système",
    items: [
      { label: "Paramètres d'analyse", href: "/admin/parametres", icon: Settings },
      { label: "Journal d'audit", href: "/admin/journal", icon: BarChart3 },
      { label: "Catalogue", icon: Users, disabled: true, badge: "Bientôt" },
    ],
  },
];
