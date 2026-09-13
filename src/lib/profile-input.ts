/**
 * Validating an analysis profile — « Micro aliments standard », « Surfaces »,
 * « Histamine n = 9 »: the panel of parameters a nature is usually asked
 * for, optionally contractual to one client. Pure, shared by the API and
 * the admin form.
 */

export type CleanProfile = {
  name: string;
  natureId: string;
  clientId: string | null;
  unitCount: number;
  parameterIds: string[];
  active: boolean;
  sortOrder: number;
};

export type ProfileValidation =
  | { ok: true; value: CleanProfile }
  | { ok: false; error: string };

function text(value: unknown, max = 191) {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > max ? s.slice(0, max) : s;
}

export function validateProfile(raw: unknown): ProfileValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string): ProfileValidation => ({ ok: false, error });

  const name = text(input.name);
  if (!name) return fail("Donnez un nom au profil.");
  if (typeof input.name === "string" && input.name.trim().length > 191) {
    return fail("Le nom du profil est trop long (191 caractères maximum).");
  }

  const natureId = text(input.natureId);
  if (!natureId) return fail("Choisissez la nature d'analyse du profil.");

  const clientId = text(input.clientId) || null;

  const unitRaw = input.unitCount === undefined || input.unitCount === "" ? 1 : Number(input.unitCount);
  if (!Number.isInteger(unitRaw) || unitRaw < 1 || unitRaw > 26) {
    return fail("Le nombre d'unités doit être un entier entre 1 et 26.");
  }

  const ids = Array.isArray(input.parameterIds) ? input.parameterIds : [];
  const parameterIds = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (parameterIds.length === 0) return fail("Un profil contient au moins une analyse.");

  const active = input.active === undefined ? true : input.active === true;
  const sortRaw = input.sortOrder === undefined || input.sortOrder === "" ? 0 : Number(input.sortOrder);
  if (!Number.isInteger(sortRaw) || sortRaw < 0 || sortRaw > 10_000) {
    return fail("L'ordre d'affichage doit être un entier positif.");
  }

  return {
    ok: true,
    value: { name, natureId, clientId, unitCount: unitRaw, parameterIds, active, sortOrder: sortRaw },
  };
}
