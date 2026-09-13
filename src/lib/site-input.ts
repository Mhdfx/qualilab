/**
 * Validating a client's sampling site — « Siège », « Cuisine centrale »,
 * « Usine de Berrechid ». Pure, shared by the API and the client fiche.
 */

export type CleanSite = {
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  contact: string | null;
  active: boolean;
};

export type SiteValidation = { ok: true; value: CleanSite } | { ok: false; error: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateSite(raw: unknown): SiteValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string): SiteValidation => ({ ok: false, error });

  const name = text(input.name);
  if (!name) return fail("Le nom du site est obligatoire.");
  if (name.length > 191) return fail("Le nom du site est trop long (191 caractères maximum).");

  for (const [key, label] of [
    ["code", "Le code"],
    ["address", "L'adresse"],
    ["city", "La ville"],
    ["phone", "Le téléphone"],
    ["contact", "Le contact"],
  ] as const) {
    if (text(input[key]).length > 191) return fail(`${label} est trop long(ue) (191 caractères maximum).`);
  }

  return {
    ok: true,
    value: {
      name,
      code: text(input.code) || null,
      address: text(input.address) || null,
      city: text(input.city) || null,
      phone: text(input.phone) || null,
      contact: text(input.contact) || null,
      active: input.active === undefined ? true : input.active === true,
    },
  };
}
