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
  // Responsable des paramètres (PROGRAMME.md §2): confirms the programme
  // d'analyse of each received line, between the reception and the bench.
  "PROGRAMMATEUR",
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
  PROGRAMMATEUR: "Responsable des paramètres",
  TECHNICIEN: "Technicien",
  VALIDATEUR: "Validateur",
  GESTIONNAIRE: "Gestionnaire commercial",
  COMPTABLE: "Comptable",
  ADMIN: "Administrateur",
  CLIENT: "Client (portail)",
  MAGASINIER: "Magasinier",
};

/** Landing page for each role after login. */
export const ROLE_HOME: Record<Role, string> = {
  PRELEVEUR: "/preleveur",
  RECEPTIONNISTE: "/reception",
  PROGRAMMATEUR: "/programmation",
  TECHNICIEN: "/technicien",
  VALIDATEUR: "/validation",
  GESTIONNAIRE: "/commercial",
  COMPTABLE: "/comptabilite",
  ADMIN: "/admin",
  CLIENT: "/portail",
  MAGASINIER: "/magasin",
};

/**
 * The client portal role (PORTAIL.md): an account of a client of the
 * laboratory, tied to that client by `User.clientId`. It only ever opens
 * `/portail` and `/api/portail/**`; every laboratory guard leaves it out.
 */
export const PORTAL_ROLE = "CLIENT" satisfies Role;

/** The laboratory's own roles — everyone except the portal accounts. */
export const LAB_ROLES: readonly Role[] = ROLES.filter((role) => role !== PORTAL_ROLE);

/**
 * Roles an administrator can give to an account. Since the portal exists
 * (PORTAIL.md §1), CLIENT is one of them — with a required client, checked by
 * the /admin/utilisateurs routes (`userClientRefusal` in portal-access.ts).
 */
export const ASSIGNABLE_ROLES: readonly Role[] = ROLES;

export function isPortalRole(value: unknown): boolean {
  return value === PORTAL_ROLE;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function getDashboardPath(role: unknown): string {
  return isRole(role) ? ROLE_HOME[role] : "/login";
}

/**
 * The authorization decision of every guard (`requireRole`, `requireApiRole`
 * in auth.ts): the role must be one of `allowed`. An empty list means « any
 * laboratory account » — never the portal (PORTAIL.md §3): a guard written
 * without roles must not open a laboratory screen to a client's account.
 */
export function roleAllowed(role: Role, allowed: readonly Role[]): boolean {
  return (allowed.length > 0 ? allowed : LAB_ROLES).includes(role);
}
