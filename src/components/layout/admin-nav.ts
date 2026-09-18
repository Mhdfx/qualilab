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
  Gauge,
  Boxes,
  Inbox,
  Microscope,
  Wallet,
  ListChecks,
  Tags,
  BookOpen,
} from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * The administrator is admitted to every space (each space layout allows
 * ADMIN) and this is the only menu an administrator ever sees (see
 * nav-for-role.ts), so every space root must be reachable from here.
 */
export const adminNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
      { label: "Prélèvements", href: "/admin#prelevements", icon: FlaskConical },
      { label: "Factures", href: "/admin/factures", icon: FileText },
    ],
  },
  {
    title: "Circuit des échantillons",
    items: [
      { label: "Réception", href: "/reception", icon: Inbox },
      { label: "Analyses", href: "/technicien", icon: Microscope },
      { label: "Approbations", href: "/validation", icon: ShieldCheck },
    ],
  },
  {
    title: "Gestion",
    items: [
      { label: "Clients", href: "/commercial", icon: Building2 },
      { label: "Comptabilité", href: "/comptabilite", icon: Wallet },
      { label: "Utilisateurs", href: "/admin/utilisateurs", icon: UserCog },
    ],
  },
  {
    title: "Système",
    items: [
      { label: "Paramètres d'analyse", href: "/admin/parametres", icon: Settings },
      { label: "Profils d'analyses", href: "/admin/profils", icon: ListChecks },
      { label: "Types de produits & critères", href: "/admin/types-produits", icon: Tags },
      { label: "Normes", href: "/admin/normes", icon: BookOpen },
      { label: "Système Qualité", href: "/qualite", icon: Gauge },
      { label: "Achat & Stock", href: "/magasin", icon: Boxes },
      { label: "Catalogue", href: "/admin/catalogue", icon: Users },
      { label: "Réglages du circuit", href: "/admin/reglages", icon: SlidersHorizontal },
      { label: "Import de données", href: "/admin/import", icon: FileUp },
      { label: "Entreprise", href: "/admin/entreprise", icon: Building2 },
      { label: "Documents qualité", href: "/admin/documents", icon: FileText },
      { label: "Journal d'audit", href: "/admin/journal", icon: BarChart3 },
    ],
  },
];
