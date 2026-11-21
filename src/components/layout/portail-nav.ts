import { FlaskConical, History, LayoutDashboard, UserRound } from "lucide-react";
import type { NavSection } from "./nav-types";

/**
 * The client portal's menu (PORTAIL.md §2): its own three screens and
 * nothing of the laboratory — no search, no bench sheet, no invoice.
 */
export const portailNav: NavSection[] = [
  {
    title: "Espace client",
    items: [
      { label: "Tableau de bord", href: "/portail", icon: LayoutDashboard },
      { label: "Mes échantillons", href: "/portail/echantillons", icon: FlaskConical },
      { label: "Mon compte", href: "/portail/compte", icon: UserRound },
    ],
  },
];

/**
 * Lot 5B, HA4 (RETOUR-LABO-20-11.md §6): the menu of a client that has a
 * history of the old software (and `LEGACY_HISTORY_ON_PORTAL` on) — the
 * screen after « Mes échantillons », never mixed with it.
 */
export const portailNavWithHistory: NavSection[] = [
  {
    title: "Espace client",
    items: [
      { label: "Tableau de bord", href: "/portail", icon: LayoutDashboard },
      { label: "Mes échantillons", href: "/portail/echantillons", icon: FlaskConical },
      { label: "Historique (ancien logiciel)", href: "/portail/historique", icon: History },
      { label: "Mon compte", href: "/portail/compte", icon: UserRound },
    ],
  },
];
