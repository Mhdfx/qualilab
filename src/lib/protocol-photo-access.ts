import type { Role } from "./roles";

/**
 * The photo of the signed paper protocol (`Serie.signedProtocolData`) — who
 * may see it, and how the stored data URI becomes an image again. Pure: the
 * route `GET /api/series/[id]/protocol-photo` decides with it, the série
 * header (`PATCH /api/series/[id]`) checks an upload with the same pattern.
 *
 * The protocol carries the client's name, the interlocutor's signature and
 * the site: the blind bench (TECHNICIEN) never sees it, nor the roles with
 * no part in the sampling or its reception (programme, accounting, stock,
 * portal). A préleveur sees the photo of their own visits only, with the
 * same 404 as `GET /api/series/[id]` for anyone else's.
 */

/** The roles the route admits — named one by one, never a spread list. */
export const PROTOCOL_PHOTO_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "VALIDATEUR",
  "DIRECTION",
  "GESTIONNAIRE",
  "ADMIN",
] as const satisfies readonly Role[];

/** A photo as the phone sends it: an image data URI, the whole string checked. */
export const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
/** ≈ 1.5 MB of image once decoded. */
export const MAX_IMAGE_CHARS = 2_000_000;

/** The one path every screen links to (the validation page included). */
export function protocolPhotoHref(serieId: string): string {
  return `/api/series/${encodeURIComponent(serieId)}/protocol-photo`;
}

/** Whether a role may ever see a signed protocol — its own visits only for a préleveur. */
export function canSeeProtocolPhoto(role: Role): boolean {
  return (PROTOCOL_PHOTO_ROLES as readonly Role[]).includes(role);
}

export type ProtocolPhotoAccess = "ALLOWED" | "FORBIDDEN" | "NOT_FOUND";

/**
 * The decision for one viewer and one série: FORBIDDEN (403) for a role that
 * never sees the photo, NOT_FOUND (404) for a préleveur's look at another
 * préleveur's visit — the série is not theirs, so it does not exist for them.
 */
export function protocolPhotoAccess(
  viewer: { id: string; role: Role },
  serie: { createdById: string }
): ProtocolPhotoAccess {
  if (!canSeeProtocolPhoto(viewer.role)) return "FORBIDDEN";
  if (viewer.role === "PRELEVEUR" && serie.createdById !== viewer.id) return "NOT_FOUND";
  return "ALLOWED";
}

const CONTENT_TYPES: Record<string, { type: string; extension: string }> = {
  png: { type: "image/png", extension: "png" },
  jpg: { type: "image/jpeg", extension: "jpg" },
  jpeg: { type: "image/jpeg", extension: "jpg" },
  webp: { type: "image/webp", extension: "webp" },
};

export type DecodedImage = { contentType: string; extension: string; bytes: Uint8Array };

/**
 * The stored data URI as bytes and their content type; null when there is
 * none, or when the value is not exactly what an upload accepts (so the
 * route never serves anything but one of the three image types).
 */
export function decodeImageDataUri(value: string | null | undefined): DecodedImage | null {
  if (!value || value.length > MAX_IMAGE_CHARS) return null;
  const match = IMAGE_DATA_URI.exec(value);
  if (!match) return null;
  const kind = CONTENT_TYPES[match[1]];
  const base64 = value.slice(value.indexOf(",") + 1);
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (bytes.length === 0) return null;
  return { contentType: kind.type, extension: kind.extension, bytes };
}
