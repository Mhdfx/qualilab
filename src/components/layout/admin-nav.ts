import {
  LayoutDashboard,
  FlaskConical,
  FileText,
  Users,
  Building2,
  UserCog,
  Settings,
  BarChart3,
} from "lucide-react";
import type { NavSection } from "./nav-types";

export const adminNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
      { label: "Prélèvements", href: "/admin", icon: FlaskConical },
      { label: "Factures", href: "/admin/factures", icon: FileText },
    ],
  },
  {
    title: "Gestion",
    items: [
      { label: "Préleveurs", icon: Users, disabled: true, badge: "Bientôt" },
      { label: "Clients", icon: Building2, disabled: true, badge: "Bientôt" },
      { label: "Utilisateurs", icon: UserCog, disabled: true, badge: "Bientôt" },
    ],
  },
  {
    title: "Système",
    items: [
      { label: "Statistiques", icon: BarChart3, disabled: true, badge: "Bientôt" },
      { label: "Configuration", icon: Settings, disabled: true, badge: "Bientôt" },
    ],
  },
];
