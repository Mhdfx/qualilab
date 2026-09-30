import type { Family } from "@/generated/prisma/enums";
import { normalizeLabel } from "./serie-input";

/**
 * « Réglementation en vigueur » chosen per sample (RETOUR-LABO-30-09.md,
 * slice I) — pure. The technical validator picks it; the screen proposes the
 * most specific choice already known, so after the first times the right one
 * is usually there already.
 */

export type RegulationSources = {
  /** Already chosen for this very sample (a second visit of the screen). */
  sample: string | null;
  /** The last choice for this client's product. */
  clientProduct: string | null;
  /** The product type's default. */
  productType: string | null;
  family: Family | null;
  settings: { regulationMicroId: string | null; regulationChimieId: string | null };
};

/** The regulation to preselect, or null; only an active one is proposed. */
export function proposeRegulation(sources: RegulationSources, active: Set<string>): string | null {
  const familyDefault =
    sources.family === "CHIMIE" ? sources.settings.regulationChimieId : sources.settings.regulationMicroId;
  for (const id of [sources.sample, sources.clientProduct, sources.productType, familyDefault]) {
    if (id && active.has(id)) return id;
  }
  return null;
}

/** A sample judged against criteria needs a regulation on its report. */
export function needsRegulation(sample: { productTypeId: string | null }): boolean {
  return sample.productTypeId !== null;
}

export type CleanRegulation = { title: string; normalizedTitle: string; text: string; active: boolean; sortOrder: number };

export function validateRegulation(
  raw: unknown
): { ok: true; value: CleanRegulation } | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!title) return { ok: false, error: "Le nom court est obligatoire." };
  if (title.length > 191) return { ok: false, error: "Le nom court est trop long (191 caractères maximum)." };
  if (text.length > 4000) return { ok: false, error: "Le texte est trop long (4 000 caractères maximum)." };
  const sortOrder = Number(input.sortOrder ?? 0);
  return {
    ok: true,
    value: {
      title,
      normalizedTitle: normalizeLabel(title),
      // The report prints the text; the name alone is enough when they coincide.
      text: text || title,
      active: input.active === undefined ? true : input.active === true,
      sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
    },
  };
}
