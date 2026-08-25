/**
 * Validating a client record.
 *
 * Kept as pure functions so the same rules apply to the API and the form, and
 * so they can be tested without a database. The ICE is Morocco's company
 * identifier and appears on every invoice, so it is checked rather than
 * accepted blindly — but only for shape, since we cannot verify it exists.
 */

export type ClientInput = {
  name?: unknown;
  contact?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  ice?: unknown;
};

export type CleanClient = {
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ice: string | null;
};

export type ValidationResult =
  | { ok: true; value: CleanClient }
  | { ok: false; error: string };

/** An address good enough to actually send a report to. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim());
}

/** The Moroccan ICE is 15 digits. */
export function isIce(value: string): boolean {
  return /^\d{15}$/.test(value.replace(/\s/g, ""));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateClient(input: ClientInput): ValidationResult {
  const name = text(input.name);
  if (!name) {
    return { ok: false, error: "La raison sociale est obligatoire." };
  }
  if (name.length > 200) {
    return { ok: false, error: "La raison sociale est trop longue." };
  }

  const email = text(input.email);
  if (email && !isEmail(email)) {
    return { ok: false, error: "L'adresse email n'est pas valide." };
  }

  const ice = text(input.ice).replace(/\s/g, "");
  if (ice && !isIce(ice)) {
    return { ok: false, error: "L'ICE doit comporter 15 chiffres." };
  }

  return {
    ok: true,
    value: {
      name,
      contact: text(input.contact) || null,
      email: email || null,
      phone: text(input.phone) || null,
      address: text(input.address) || null,
      ice: ice || null,
    },
  };
}

/** The recipient list attached to a client. */
export function validateClientEmails(
  entries: unknown
): { ok: true; value: { email: string; label: string | null; forReports: boolean; forAlerts: boolean }[] } | { ok: false; error: string } {
  if (!Array.isArray(entries)) return { ok: true, value: [] };

  const seen = new Set<string>();
  const value: { email: string; label: string | null; forReports: boolean; forAlerts: boolean }[] = [];

  for (const entry of entries) {
    const email = text((entry as { email?: unknown })?.email).toLowerCase();
    if (!email) continue;

    if (!isEmail(email)) {
      return { ok: false, error: `Adresse invalide : ${email}` };
    }
    if (seen.has(email)) {
      return { ok: false, error: `Adresse en double : ${email}` };
    }
    seen.add(email);

    const raw = entry as { label?: unknown; forReports?: unknown; forAlerts?: unknown };
    value.push({
      email,
      label: text(raw.label) || null,
      // Absent means "yes": a listed address is expected to receive things.
      forReports: raw.forReports !== false,
      forAlerts: raw.forAlerts !== false,
    });
  }

  return { ok: true, value };
}
