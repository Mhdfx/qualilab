import { normalizeSiteName } from "./sites-import";

/**
 * Validating a client's sampling site — « Cuisine centrale », « Usine de
 * Berrechid ». Pure, shared by the API and the client fiche.
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

/** Why a new site may not be named « Siège ». */
export const SIEGE_SITE_REFUSAL = "Le siège n'est pas un site : laissez le site vide pour prélever au siège.";

/**
 * The siège is no site: every picker offers « Siège (adresse du client) »
 * (no site, the client's own address), so a site of that name would show
 * twice and take séries meant for the client's address. Refused at the
 * creation of a site — with the client (`POST /api/clients`) and on its own
 * (`POST /api/clients/[id]/sites`) — case, accents and punctuation aside
 * (`normalizeSiteName`). Null when the name is not the siège.
 */
export function siegeSiteRefusal(name: string): string | null {
  return normalizeSiteName(name) === "SIEGE" ? SIEGE_SITE_REFUSAL : null;
}
