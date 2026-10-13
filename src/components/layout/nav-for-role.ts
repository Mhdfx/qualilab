import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { NavSection } from "./nav-types";
import { adminNav } from "./admin-nav";
import { preleveurNav } from "./preleveur-nav";
import { programmationNav } from "./programmation-nav";
import { portailNav } from "./portail-nav";
import {
  receptionNav,
  technicienNav,
  validationNav,
  directionNav,
  commercialNav,
  comptabiliteNav,
  magasinNav,
  qualiteNav,
} from "./role-navs";

/** The quality system as one block of a validation menu (validateur, Direction). */
const QUALITY_SECTION: NavSection = {
  title: "Système qualité",
  items: qualiteNav.flatMap((section) => section.items),
};

/**
 * The sidebar depends on WHO is signed in, never on which URL segment is
 * being rendered. An administrator keeps the administration menu while
 * working inside /reception; a validateur (or the Direction) sees validation
 * and the quality system as one menu whether the page lives under
 * /validation or /qualite.
 *
 * No JSX here so vitest (node environment) can import it directly. RoleShell
 * calls it on the client: nav items carry Lucide components, which cannot
 * cross the server/client boundary as props.
 */
const NAVS: Record<Role, NavSection[]> = {
  ADMIN: adminNav,
  PRELEVEUR: preleveurNav,
  RECEPTIONNISTE: receptionNav,
  PROGRAMMATEUR: programmationNav,
  TECHNICIEN: technicienNav,
  VALIDATEUR: [...validationNav, QUALITY_SECTION],
  // Everything the validateur opens, with the queue's two steps by name;
  // none of the administration (12/10).
  DIRECTION: [...directionNav, QUALITY_SECTION],
  GESTIONNAIRE: commercialNav,
  COMPTABLE: comptabiliteNav,
  MAGASINIER: magasinNav,
  // The client portal (PORTAIL.md §2): its own screens only.
  CLIENT: portailNav,
};

/** Sidebar sections for a role. */
export function navFor(role: Role): NavSection[] {
  return NAVS[role];
}

/** Caption under the logo: the role, never the space being browsed. */
export function roleLabelFor(role: Role): string {
  return ROLE_LABELS[role];
}
