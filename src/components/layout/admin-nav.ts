import {
  LayoutDashboard,
  FlaskConical,
  FileText,
  Users,
  Building2,
  UserCog,
  Settings,
  SlidersHorizontal,
  FileUp,
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
      { label: "Utilisateurs", href: "/admin/utilisateurs", icon: UserCog },
    ],
  },
  {
    title: "Système",
    items: [
      { label: "Paramètres d'analyse", href: "/admin/parametres", icon: Settings },
      { label: "Catalogue", href: "/admin/catalogue", icon: Users },
      { label: "Réglages du circuit", href: "/admin/reglages", icon: SlidersHorizontal },
      { label: "Import de données", href: "/admin/import", icon: FileUp },
      { label: "Entreprise", href: "/admin/entreprise", icon: Building2 },
      { label: "Journal d'audit", href: "/admin/journal", icon: BarChart3 },
    ],
  },
];
