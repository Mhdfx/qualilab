/**
 * An image uploaded in /admin/entreprise as a data URI (the logo since
 * 2026-07; the accreditation logo and the stamp since lot 3C, K4). Pure,
 * shared by the form and the routes: PNG, JPEG, SVG or WebP, 300 KB at most
 * before base64, checked over the whole string — prefix and a pure base64
 * body — so nothing in the value can ever close the `<img src="…">`
 * attribute of a PDF template.
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;
/** ~300 KB before base64. */
export const IMAGE_MAX_BYTES = 300 * 1024;
/** The same ceiling once encoded. */
export const IMAGE_MAX_CHARS = 400_000;

export const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|svg\+xml|webp);base64,[A-Za-z0-9+/]+=*$/;

export type ImageRead = { ok: true; value: string | null | undefined } | { ok: false; error: string };

/**
 * One image field of a request: absent → undefined (unchanged), null or ""
 * → null (removed), a valid data URI → itself. `label` names it in the error.
 */
export function readImageField(input: Record<string, unknown>, key: string, label: string): ImageRead {
  if (!(key in input) || input[key] === undefined) return { ok: true, value: undefined };
  const value = input[key];
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !IMAGE_DATA_URI.test(value)) {
    return { ok: false, error: `${label} invalide — PNG, JPEG, SVG ou WebP attendu.` };
  }
  if (value.length > IMAGE_MAX_CHARS) return { ok: false, error: `${label} trop lourd — 300 Ko maximum.` };
  return { ok: true, value };
}
