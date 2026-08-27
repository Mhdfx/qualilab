/**
 * Single source of truth for the application roles.
 *
 * Better Auth stores the role as a string on the user record; the LIMS uses
 * these values everywhere (guards, navigation, dashboards). Keep this list and
 * the Prisma `Role` enum in sync.
 */
export const ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "TECHNICIEN",
  "VALIDATEUR",
  "GESTIONNAIRE",
  "COMPTABLE",
  "ADMIN",
  "CLIENT",
  "MAGASINIER",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  PRELEVEUR: "Préleveur",
  RECEPTIONNISTE: "Réceptionniste",
  TECHNICIEN: "Technicien",
  VALIDATEUR: "Validateur",
  GESTIONNAIRE: "Gestionnaire commercial",
  COMPTABLE: "Comptable",
  ADMIN: "Administrateur",
  CLIENT: "Client",
  MAGASINIER: "Magasinier",
};

/** Landing page for each role after login. */
export const ROLE_HOME: Record<Role, string> = {
  PRELEVEUR: "/preleveur",
  RECEPTIONNISTE: "/reception",
  TECHNICIEN: "/technicien",
  VALIDATEUR: "/validation",
  GESTIONNAIRE: "/commercial",
  COMPTABLE: "/comptabilite",
  ADMIN: "/admin",
  CLIENT: "/portail",
  MAGASINIER: "/magasin",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function getDashboardPath(role: unknown): string {
  return isRole(role) ? ROLE_HOME[role] : "/login";
}
