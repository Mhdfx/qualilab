/**
 * The laboratory's own addresses in copy of the contamination alerts
 * (RETOUR-LABO-28-10.md L5 — Q93, « (direction) » and « qualité » circled,
 * « Possibilité de mettre qualité dans les alertes [un client à sites] par
 * défaut »; reading to confirm by R-16). Pure, shared by /admin/entreprise,
 * its routes and the dispatch (`sendContaminationAlerts`).
 *
 * Each address is « tous les clients » or « clients choisis » (the client as
 * a whole: every one of its sites). They join the identity's e-mail, always
 * in copy since the first alert; nobody is written twice, and an address
 * already among the client's recipients is not copied again. With no
 * address recorded nothing changes.
 */

export type AlertCopy = {
  email: string;
  /** Null (an older row) reads as « tous les clients », the column's default. */
  allClients: boolean | null;
  /** Null reads as active. */
  active: boolean | null;
  clientIds: readonly string[];
};

export const ALERT_COPY_LABEL_MAX = 60;
export const ALERT_COPY_MAX = 20;

const key = (email: string) => email.trim().toLowerCase();

/** The copies one client's alert carries, beside the always-copied `base` (the identity's e-mail). */
export function alertCopyRecipients(input: {
  copies: readonly AlertCopy[];
  clientId: string;
  base: readonly string[];
  to: readonly string[];
}): string[] {
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
    if (copy.active === false) continue;
    if (copy.allClients !== false || copy.clientIds.includes(input.clientId)) add(copy.email);
  }
  return cc;
}

/** One e-mail address, as the client's own are checked: one @, a dot in the domain, no space. */
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export type AlertCopyInput = {
  email: string;
  label: string | null;
  allClients: boolean;
  active: boolean;
  clientIds: string[];
};

export type AlertCopyRead = { ok: true; value: AlertCopyInput } | { ok: false; error: string };

/**
 * One address as /admin/entreprise sends it: `{ email, label?, allClients,
 * active?, clientIds? }`. « Clients choisis » needs at least one client.
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
  return { ok: true, value: { email, label: label || null, allClients: input.allClients, active, clientIds: input.allClients ? [] : clientIds } };
}
