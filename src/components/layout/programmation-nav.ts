import { LayoutDashboard, ClipboardList, Search, FileText } from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * The responsable des paramètres' menu (PROGRAMME.md §2): the lines to
 * programme, the search every laboratory role has, and the bench sheet —
 * everything a technician reads, plus the programme. No approval, no
 * validation, no configuration.
 */
export const programmationNav: NavSection[] = [
  {
    title: "Menu principal",
    items: [
      { label: "Tableau de bord", href: "/programmation", icon: LayoutDashboard },
      { label: "À programmer", href: "/programmation#file", icon: ClipboardList },
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
