/**
 * The laboratory's own addresses in copy of what leaves for the client —
 * « Copies internes (alertes et rapports) ». Pure, shared by
 * /admin/entreprise, its routes and the dispatch (`sendContaminationAlerts`,
 * `sendReport`).
 *
 * L5 (RETOUR-LABO-28-10.md, Q93: « (direction) » and « qualité » circled)
 * put them in copy of the contamination alerts; L6 (RETOUR-LABO-04-11.md,
 * R-16: « adresses pour des alertes + rapport », « + 2 adresses dans tous
 * les envois ») extends them to the reports: each address receives the
 * alerts, the reports or both (`forAlerts`, `forReports`).
 *
 * Each address is « tous les clients » or « clients choisis » (the client as
 * a whole: every one of its sites). On an alert they join the identity's
 * e-mail, always in copy since the first alert; on a report — first send and
 * every resend — they are the only copy. Nobody is written twice, and an
 * address already among the client's recipients is not copied again. With
 * no address recorded nothing changes.
 *
 * An address of L5 (both columns null, or the defaults of the additive
 * migration) keeps receiving the alerts only: `forAlerts` null reads as
 * true, `forReports` null as false — the administrator ticks « Rapports ».
 */

export type AlertCopy = {
  email: string;
  /** Null (an older row) reads as « tous les clients », the column's default. */
  allClients: boolean | null;
  /** Null reads as active. */
  active: boolean | null;
  clientIds: readonly string[];
  /** L6: copied on the alerts. Null or absent (a row of L5) reads as true. */
  forAlerts?: boolean | null;
  /** L6: copied on the reports. Null or absent reads as false. */
  forReports?: boolean | null;
};

/** What an internal copy is for: the contamination alerts or the reports (L6). */
export type InternalCopyKind = "alerts" | "reports";

/** Whether an address is copied on this kind of send — the columns' null reading included. */
export function copiesKind(copy: Pick<AlertCopy, "forAlerts" | "forReports">, kind: InternalCopyKind): boolean {
  return kind === "alerts" ? copy.forAlerts !== false : copy.forReports === true;
}

export const ALERT_COPY_LABEL_MAX = 60;
export const ALERT_COPY_MAX = 20;

const key = (email: string) => email.trim().toLowerCase();

type CopyInput = {
  copies: readonly AlertCopy[];
  clientId: string;
  base: readonly string[];
  to: readonly string[];
};

/**
 * The internal copies one client's send of this kind carries, after the
 * always-copied `base` — the identity's e-mail on an alert, nothing on a
 * report.
 */
export function internalCopyRecipients(input: CopyInput & { kind: InternalCopyKind }): string[] {
  const taken = new Set(input.to.map(key));
  const cc: string[] = [];
  const add = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || taken.has(key(trimmed))) return;
    taken.add(key(trimmed));
    cc.push(trimmed);
  };
  for (const email of input.base) add(email);
  for (const copy of input.copies) {
    if (copy.active === false || !copiesKind(copy, input.kind)) continue;
    if (copy.allClients !== false || copy.clientIds.includes(input.clientId)) add(copy.email);
  }
  return cc;
}

/** The copies one client's alert carries, beside the always-copied `base` (the identity's e-mail). */
export function alertCopyRecipients(input: CopyInput): string[] {
  return internalCopyRecipients({ ...input, kind: "alerts" });
}

/**
 * The copies one client's report carries (L6) — first send and resend
 * alike: the addresses ticked « Rapports », never twice, never one of the
 * client's own recipients. The identity's e-mail is not added: the report
 * never copied it.
 */
export function reportCopyRecipients(input: Omit<CopyInput, "base">): string[] {
  return internalCopyRecipients({ ...input, base: [], kind: "reports" });
}

/** One e-mail address, as the client's own are checked: one @, a dot in the domain, no space. */
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export type AlertCopyInput = {
  email: string;
  label: string | null;
  allClients: boolean;
  active: boolean;
  clientIds: string[];
  forAlerts: boolean;
  forReports: boolean;
};

export const ALERT_COPY_MESSAGES = {
  kind: "Cochez au moins « Alertes » ou « Rapports » : sinon l'adresse ne reçoit rien.",
} as const;

export type AlertCopyRead = { ok: true; value: AlertCopyInput } | { ok: false; error: string };

/**
 * One address as /admin/entreprise sends it: `{ email, label?, allClients,
 * active?, clientIds?, forAlerts?, forReports? }`. « Clients choisis » needs
 * at least one client; the address receives at least one kind of send. A
 * page opened before L6 sends neither flag: read as L5 did — the alerts
 * only.
 */
export function parseAlertCopy(body: unknown): AlertCopyRead {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Requête invalide." };
  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) return { ok: false, error: "Indiquez l'adresse e-mail." };
  if (email.length > 191 || !EMAIL.test(email)) return { ok: false, error: "Adresse e-mail invalide." };
  const label = typeof input.label === "string" ? input.label.trim().replace(/\s+/g, " ") : "";
  if (label.length > ALERT_COPY_LABEL_MAX) return { ok: false, error: `Le libellé est trop long (${ALERT_COPY_LABEL_MAX} caractères maximum).` };
  if (typeof input.allClients !== "boolean") return { ok: false, error: "Choisissez « Tous les clients » ou « Clients choisis »." };
  const active = input.active === undefined ? true : input.active;
  if (typeof active !== "boolean") return { ok: false, error: "Requête invalide." };
  const rawIds = input.clientIds === undefined ? [] : input.clientIds;
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string" || !id)) return { ok: false, error: "Client invalide." };
  const clientIds = [...new Set(rawIds as string[])];
  if (!input.allClients && clientIds.length === 0) return { ok: false, error: "Choisissez au moins un client, ou « Tous les clients »." };
  if (clientIds.length > 500) return { ok: false, error: "Trop de clients choisis." };
  const forAlerts = input.forAlerts === undefined ? true : input.forAlerts;
  const forReports = input.forReports === undefined ? false : input.forReports;
  if (typeof forAlerts !== "boolean" || typeof forReports !== "boolean") return { ok: false, error: "Requête invalide." };
  if (!forAlerts && !forReports) return { ok: false, error: ALERT_COPY_MESSAGES.kind };
  return {
    ok: true,
    value: { email, label: label || null, allClients: input.allClients, active, clientIds: input.allClients ? [] : clientIds, forAlerts, forReports },
  };
}
