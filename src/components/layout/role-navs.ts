import {
  LayoutDashboard,
  Inbox,
  FlaskConical,
  ShieldCheck,
  Stamp,
  Building2,
  FileText,
  Wallet,
  History,
  BarChart3,
  Boxes,
  Truck,
  ReceiptText,
  Gauge,
  Thermometer,
  Award,
  PackagePlus,
  Search,
} from "lucide-react";
import { viewHref } from "@/lib/dashboard-view";
import type { BenchView, ValidationView } from "@/lib/circuit-views";
import type { NavSection } from "./nav-types";

/**
 * Navigation per role space, assembled per ROLE by nav-for-role.ts (a role
 * with several spaces gets them merged into one menu). Items for screens
 * that arrive in a later phase are listed as disabled so each profile can see
 * where its workflow is heading.
 */

export const receptionNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/reception", icon: LayoutDashboard },
      { label: "À réceptionner", href: "/reception#file", icon: Inbox },
      { label: "Nouveau dépôt", href: "/reception/nouveau-depot", icon: PackagePlus },
      { label: "Historique des réceptions", href: "/reception/historique", icon: History },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
];

/** A list of the bench, opened on its own view (`?vue=`, like the dashboard's tiles). */
function benchStep(view: BenchView): string {
  return viewHref("/technicien", view, "analyses");
}

/**
 * The technician's menu. « À prendre » is the shared list of the prise en
 * charge libre (PROGRAMME.md §10), « Mes analyses » what they took. Both
 * are shortcuts into the dashboard: only « Tableau de bord » lights on it
 * (`activeHref`).
 */
export const technicienNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/technicien", icon: LayoutDashboard },
      { label: "À prendre", href: benchStep("a_prendre"), icon: Inbox },
      { label: "Mes analyses", href: "/technicien#analyses", icon: FlaskConical },
      { label: "Relevés de température", href: "/technicien/temperatures", icon: Thermometer },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "Feuille de paillasse", href: "/api/bench-sheet", icon: FileText },
    ],
  },
];

export const validationNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/validation", icon: LayoutDashboard },
      { label: "À valider", href: "/validation#file", icon: ShieldCheck },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
];

/** A step of the validation queue, opened on its own view (`?vue=`, like the dashboard's tiles). */
function validationStep(view: ValidationView): string {
  return viewHref("/validation", view, "file");
}

/**
 * The Direction's menu (12/10): the validation queue with its two steps —
 * the Direction signs both, never both on one sample — and the search.
 * The quality system is added by nav-for-role.ts, as for the validateur.
 */
export const directionNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/validation", icon: LayoutDashboard },
      { label: "Validation technique", href: validationStep("a_valider"), icon: ShieldCheck },
      { label: "Validation administrative", href: validationStep("attente_admin"), icon: Stamp },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
];

export const commercialNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/commercial", icon: LayoutDashboard },
      { label: "Clients", href: "/commercial#clients", icon: Building2 },
      { label: "Nouveau client", href: "/commercial/nouveau", icon: BarChart3 },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
];

export const comptabiliteNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/comptabilite", icon: LayoutDashboard },
      { label: "Factures", href: "/comptabilite/factures", icon: FileText },
      { label: "Nouvelle facture", href: "/comptabilite/factures/nouvelle", icon: Wallet },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
];

export const magasinNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/magasin", icon: LayoutDashboard },
      { label: "Stock", href: "/magasin/stock", icon: Boxes },
      { label: "Fournisseurs", href: "/magasin/fournisseurs", icon: Truck },
      { label: "Factures fournisseurs", href: "/magasin/factures", icon: ReceiptText },
    ],
  },
];

/**
 * The quality system is never a sidebar of its own: it is a block inside the
 * validateur menu (next to « Tableau de bord » of validation, hence the
 * distinct label) and one link inside the administrator menu.
 */
export const qualiteNav: NavSection[] = [
  {
    title: "Système qualité",
    items: [
      { label: "Vue d'ensemble", href: "/qualite", icon: LayoutDashboard },
      { label: "Métrologie", href: "/qualite/metrologie", icon: Gauge },
      { label: "Températures", href: "/qualite/temperatures", icon: Thermometer },
      { label: "EIL", href: "/qualite/eil", icon: Award },
    ],
  },
];
