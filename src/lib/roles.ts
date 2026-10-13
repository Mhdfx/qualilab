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
  // « Direction » (answer of 12/10): the director and the deputy who sign
  // the validation administrative — every right of the validateur plus the
  // approval, none of the administrator's system powers.
  "DIRECTION",
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
  // Step 1 of the double validation; step 2, the « Validation
  // administrative », is signed by the Direction (12/10) or an administrator.
  VALIDATEUR: "Validateur technique",
  DIRECTION: "Direction — validation administrative",
  GESTIONNAIRE: "Gestionnaire commercial",
  COMPTABLE: "Comptable",
  ADMIN: "Administrateur",
  CLIENT: "Client (portail)",
  MAGASINIER: "Magasinier",
};

/**
 * The roles of the sample circuit, in the order of the laboratory's list of
 * 08/10 (« Les rôles : 1. Prélèvement des échantillons … 6. Validation
 * administrative »): one role per function of that list, the sixth signed
 * by the Direction since 12/10 (« Directeur et son suppléant ») and still
 * by the administrator. Wording only — never a guard list: the API's own
 * `CIRCUIT_ROLES` also admit the gestionnaire and the comptable.
 */
export const LAB_FUNCTION_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "PROGRAMMATEUR",
  "TECHNICIEN",
  "VALIDATEUR",
  "DIRECTION",
  "ADMIN",
] as const satisfies readonly Role[];

export type LabFunctionRole = (typeof LAB_FUNCTION_ROLES)[number];

/**
 * The function of each circuit role in the laboratory's own words (08/10),
 * shown under the role in /admin/utilisateurs so accounts are created from
 * the lab's list. Labels only: the role values, guards and audit codes are
 * unchanged. The administrator also keeps the administration of the system.
 */
export const ROLE_FUNCTIONS: Record<LabFunctionRole, string> = {
  PRELEVEUR: "Prélèvement des échantillons",
  RECEPTIONNISTE: "Réception des échantillons",
  PROGRAMMATEUR: "Enregistrement des paramètres",
  TECHNICIEN: "Saisie des résultats",
  VALIDATEUR: "Validation technique des résultats",
  DIRECTION: "Validation administrative",
  ADMIN: "Validation administrative et administration du système",
};

/**
 * What the administrator must know when giving a role whose rights its
 * function does not say — shown under the role picker of /admin/utilisateurs.
 * The Direction also signs the technical validation (two of the four people
 * of the laboratory's list do both), never both steps of one sample. The
 * two-signature rule compares accounts, not people: a second account for
 * someone who already has one would let that person sign both steps.
 */
const ROLE_HINTS: Partial<Record<Role, string>> = {
  DIRECTION:
    "Signe aussi la validation technique, jamais les deux étapes d'un même échantillon. Sans accès à l'administration du système. " +
    "À une personne qui a déjà un compte, donnez ce rôle sur ce compte : un second compte lui permettrait de signer les deux étapes.",
};

/** The hint of a role for the account screen, or null. */
export function roleHint(role: unknown): string | null {
  return isRole(role) ? (ROLE_HINTS[role] ?? null) : null;
}

/** The lab's function of a role, or null for a role outside the circuit (commercial, comptabilité, magasin, portail). */
export function roleFunction(role: unknown): string | null {
  return (LAB_FUNCTION_ROLES as readonly unknown[]).includes(role) ? ROLE_FUNCTIONS[role as LabFunctionRole] : null;
}

/** Landing page for each role after login. */
export const ROLE_HOME: Record<Role, string> = {
  PRELEVEUR: "/preleveur",
  RECEPTIONNISTE: "/reception",
  PROGRAMMATEUR: "/programmation",
  TECHNICIEN: "/technicien",
  VALIDATEUR: "/validation",
  // Both steps of the validation are on the same queue (12/10).
  DIRECTION: "/validation",
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
