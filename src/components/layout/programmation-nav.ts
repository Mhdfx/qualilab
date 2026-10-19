import { LayoutDashboard, ClipboardList, Search, FileText, Tags } from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * The responsable des paramètres' menu (PROGRAMME.md §2) — « Enregistrement
 * des paramètres » in the laboratory's list of 08/10: the lines to
 * programme, the search every laboratory role has, the bench sheet —
 * everything a technician reads, plus the programme — and, since 16/10
 * (Q122 / Q125, RETOUR-LABO-16-10.md F4), the familles de produits and
 * their criteria. No validation; the rest of the configuration (parameters,
 * norms, profiles, regulations) stays the administrator's.
 */
export const programmationNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/programmation", icon: LayoutDashboard },
      { label: "Paramètres à enregistrer", href: "/programmation#file", icon: ClipboardList },
      { label: "Recherche des analyses", href: "/recherche", icon: Search },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { label: "Familles & critères", href: "/programmation/familles", icon: Tags },
    ],
  },
  {
    title: "Documents",
    items: [
      { label: "Feuille de paillasse", href: "/api/bench-sheet", icon: FileText },
    ],
  },
];
