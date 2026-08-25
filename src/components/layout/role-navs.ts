import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  FlaskConical,
  ShieldCheck,
  FileCheck2,
  Building2,
  FileText,
  Wallet,
  History,
  BarChart3,
} from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * Navigation per role. Items for screens that arrive in a later phase are
 * listed as disabled so each profile can see where its workflow is heading.
 */

export const receptionNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/reception", icon: LayoutDashboard },
      { label: "À réceptionner", href: "/reception#file", icon: Inbox },
    ],
  },
  {
    title: "À venir",
    items: [
      { label: "Historique des réceptions", icon: History, disabled: true, badge: "Phase 2" },
    ],
  },
];

export const technicienNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/technicien", icon: LayoutDashboard },
      { label: "Mes analyses", href: "/technicien#analyses", icon: FlaskConical },
    ],
  },
  {
    title: "À venir",
    items: [
      { label: "Saisie des résultats", icon: ClipboardCheck, disabled: true, badge: "Phase 2" },
      { label: "Feuille de paillasse", icon: FileText, disabled: true, badge: "Phase 2" },
    ],
  },
];

export const validationNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/validation", icon: LayoutDashboard },
      { label: "À valider", href: "/validation#file", icon: ShieldCheck },
    ],
  },
  {
    title: "À venir",
    items: [
      { label: "Rapports validés", icon: FileCheck2, disabled: true, badge: "Phase 3" },
    ],
  },
];

export const commercialNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/commercial", icon: LayoutDashboard },
      { label: "Clients", href: "/commercial#clients", icon: Building2 },
    ],
  },
  {
    title: "À venir",
    items: [
      { label: "Fiche client 360°", icon: BarChart3, disabled: true, badge: "Phase 4" },
      { label: "Renvoi de rapport", icon: FileCheck2, disabled: true, badge: "Phase 3" },
    ],
  },
];

export const comptabiliteNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/comptabilite", icon: LayoutDashboard },
      { label: "Factures", href: "/comptabilite#factures", icon: FileText },
    ],
  },
  {
    title: "À venir",
    items: [
      { label: "Suivi des paiements", icon: Wallet, disabled: true, badge: "Phase 4" },
    ],
  },
];
