import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { NavSection } from "./nav-types";
import { adminNav } from "./admin-nav";
import { preleveurNav } from "./preleveur-nav";
import {
  receptionNav,
  technicienNav,
  validationNav,
  commercialNav,
  comptabiliteNav,
  magasinNav,
  qualiteNav,
} from "./role-navs";

/**
 * The sidebar depends on WHO is signed in, never on which URL segment is
 * being rendered. An administrator keeps the administration menu while
 * working inside /reception; a validateur sees validation and the quality
 * system as one menu whether the page lives under /validation or /qualite.
 *
 * No JSX here so vitest (node environment) can import it directly. RoleShell
 * calls it on the client: nav items carry Lucide components, which cannot
 * cross the server/client boundary as props.
 */
const NAVS: Record<Role, NavSection[]> = {
  ADMIN: adminNav,
  PRELEVEUR: preleveurNav,
  RECEPTIONNISTE: receptionNav,
  TECHNICIEN: technicienNav,
  VALIDATEUR: [
    ...validationNav,
    {
      title: "Système qualité",
      items: qualiteNav.flatMap((section) => section.items),
    },
  ],
  GESTIONNAIRE: commercialNav,
  COMPTABLE: comptabiliteNav,
  MAGASINIER: magasinNav,
  // The client portal (Phase 8) has no screens yet: nothing to list.
  CLIENT: [],
};

/** Sidebar sections for a role. */
export function navFor(role: Role): NavSection[] {
  return NAVS[role];
}

/** Caption under the logo: the role, never the space being browsed. */
export function roleLabelFor(role: Role): string {
  return ROLE_LABELS[role];
}
