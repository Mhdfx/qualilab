import type { Family, SampleType } from "@/generated/prisma/enums";
import { SAMPLE_TYPE_LABELS } from "./labels";
import { PARAMETER_FAMILIES } from "./parameter-validation";
import { normalizeLabel } from "./serie-input";

/**
 * Changing the domain of several analysis parameters at once (RETOUR-LABO-19-10.md
 * D-19): the reprise of 07/10 filed every unknown parameter as microbiology,
 * so hundreds of physico-chemical analyses are proposed under « Analyses
 * microbiologiques ». Pure — the route reads the database, this decides.
 *
 * What the domain (`AnalysisParameter.family`) drives, read in the code:
 * - a NEW line: each analysis goes to the sample of its domain and needs its
 *   box ticked (`planLineSamples`); the visit and deposit forms show it under
 *   that box; a profile only ticks the analyses of the boxes ticked;
 * - the programme sheet and « Corriger les analyses » group the analyses by
 *   it (« autre domaine que l'échantillon » for the other one);
 * - nothing else: a sample already recorded keeps its `SampleParameter`
 *   rows (no route moves or re-checks them — the programme and the
 *   corrections check the category only), the report and the bench follow
 *   the sample's nature, a criterion never reads it.
 *
 * Hence the two refusals — what would silently break — and the two notices:
 * - REFUSED: no active nature of that domain for the parameter's category
 *   (« Autres analyses » of water: nothing could carry the analysis any
 *   more); an active profile of a nature of another domain names it (applied
 *   on a line of its own domain, the profile would drop it without a word).
 * - NOTICES: samples in progress carrying it on a sample of another domain
 *   (it stays there, shown « autre domaine que l'échantillon »); active
 *   product families of another domain citing it.
 */

/** The most parameters one request changes — the 19/10 list is ≈ 230. */
export const RECLASSIFY_MAX = 500;

/**
 * The domains as the reclassification names them — its buttons, its dialog,
 * its refusals: « Autres analyses », as the sample card says, not the short
 * « Autre » of the filters.
 */
export const RECLASSIFY_FAMILY_LABELS: Record<Family, string> = {
  MICRO: "Microbiologie",
  CHIMIE: "Physico-chimie",
  AUTRE: "Autres analyses",
};

export type ReclassifyRequest = {
  parameterIds: string[];
  family: Family;
  /** True: answer the plan, write nothing (the confirmation dialog). */
  preview: boolean;
};

export type ReclassifyRequestResult =
  | { ok: true; value: ReclassifyRequest }
  | { ok: false; error: string };

export function validateReclassifyRequest(body: unknown): ReclassifyRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Requête invalide." };
  }
  const input = body as Record<string, unknown>;

  const family = input.family as Family;
  if (typeof family !== "string" || !PARAMETER_FAMILIES.includes(family)) {
    return { ok: false, error: "Domaine invalide : microbiologie, physico-chimie ou autre." };
  }

  if (!Array.isArray(input.parameterIds) || input.parameterIds.length === 0) {
    return { ok: false, error: "Choisissez au moins un paramètre." };
  }
  if (input.parameterIds.some((id) => typeof id !== "string" || id.trim() === "" || id.length > 191)) {
    return { ok: false, error: "Identifiant de paramètre invalide." };
  }
  const parameterIds = [...new Set((input.parameterIds as string[]).map((id) => id.trim()))];
  if (parameterIds.length > RECLASSIFY_MAX) {
    return {
      ok: false,
      error: `Trop de paramètres à la fois (${RECLASSIFY_MAX} au plus) : reclassez-les en plusieurs fois.`,
    };
  }

  // A preview asked in any other form (« "true" », 1) must not turn into a write.
  if (input.preview !== undefined && typeof input.preview !== "boolean") {
    return { ok: false, error: "Requête invalide." };
  }

  return { ok: true, value: { parameterIds, family, preview: input.preview === true } };
}

/** A parameter as the plan reads it. */
export type ReclassifyRow = { id: string; name: string; category: SampleType; family: Family };

/** What the database says around the parameters asked for (the route reads it). */
export type ReclassifyContext = {
  /** The ACTIVE natures: which category × domain a sample can be. */
  natures: readonly { family: Family; legacyType: SampleType }[];
  /** The ACTIVE profiles naming one of the parameters, with their nature's domain. */
  profiles: readonly { name: string; family: Family; parameterIds: readonly string[] }[];
  /** Samples in progress carrying a parameter, counted per domain of the sample's nature. */
  openSamples: readonly { parameterId: string; family: Family; count: number }[];
  /** Active product families citing a parameter (active criterion), counted per domain of the family. */
  citedBy: readonly { parameterId: string; family: Family; count: number }[];
};

export type ReclassifyChange = {
  id: string;
  name: string;
  category: SampleType;
  from: Family;
  /** Samples in progress that carry it on a sample of another domain: it stays there. */
  openSamples: number;
  /** Active product families of another domain (« Autres analyses » aside) citing it. */
  otherDomainTypes: number;
};

export type ReclassifyRefusal = { id: string; name: string | null; reason: string };

export type ReclassifyPlan = {
  family: Family;
  /** What the request changes, in the screen's order (category, then name). */
  changes: ReclassifyChange[];
  /** Already in that domain: nothing to write. */
  unchanged: { id: string; name: string }[];
  /** Left as they are, with the reason — the request writes nothing while there is one. */
  refused: ReclassifyRefusal[];
};

const CATEGORY_ORDER: readonly SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

/** « « A », « B » et 2 autres » — a short list of names inside a sentence. */
function nameList(names: readonly string[], max = 2): string {
  const quoted = names.slice(0, max).map((name) => `« ${name} »`);
  const rest = names.length - quoted.length;
  if (rest > 0) return `${quoted.join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} et ${quoted[quoted.length - 1]}` : quoted[0] ?? "";
}

/**
 * Why `row` may not go to `family`, or null. The same rule guards the
 * reclassification, the single edit of `/api/parameters/[id]` (a change of
 * domain or of category) and the creation (`/api/parameters`: an empty id,
 * so only the rule of the natures applies).
 */
export function reclassifyRefusal(row: ReclassifyRow, family: Family, context: ReclassifyContext): string | null {
  const label = RECLASSIFY_FAMILY_LABELS[family];
  if (!context.natures.some((nature) => nature.family === family && nature.legacyType === row.category)) {
    return `Aucune nature d'analyse active du domaine « ${label} » pour la catégorie « ${SAMPLE_TYPE_LABELS[row.category]} » : l'analyse ne pourrait être demandée sur aucun échantillon.`;
  }

  const profiles = context.profiles
    .filter((profile) => profile.family !== family && profile.parameterIds.includes(row.id))
    .map((profile) => profile.name)
    .sort((a, b) => a.localeCompare(b, "fr"));
  if (profiles.length > 0) {
    const several = profiles.length > 1;
    return `Elle fait partie ${several ? "des profils" : "du profil"} ${nameList(profiles)}, d'un autre domaine : appliqué sur un échantillon de ce domaine, ${several ? "chacun la perdrait" : "le profil la perdrait"} sans le dire. Retirez-la d'abord ${several ? "de ces profils" : "du profil"} (Configuration › Profils d'analyses).`;
  }
  return null;
}

const countFor = (
  list: readonly { parameterId: string; family: Family; count: number }[],
  parameterId: string,
  keep: (family: Family) => boolean
) => list.reduce((sum, entry) => (entry.parameterId === parameterId && keep(entry.family) ? sum + entry.count : sum), 0);

/**
 * The plan of a reclassification: each parameter asked for is changed,
 * already in `family`, or refused (unknown, or `reclassifyRefusal`).
 */
export function planReclassification(
  parameterIds: readonly string[],
  rows: readonly ReclassifyRow[],
  family: Family,
  context: ReclassifyContext
): ReclassifyPlan {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const changes: ReclassifyChange[] = [];
  const unchanged: { id: string; name: string }[] = [];
  const refused: ReclassifyRefusal[] = [];

  for (const id of new Set(parameterIds)) {
    const row = byId.get(id);
    if (!row) {
      refused.push({ id, name: null, reason: "Paramètre introuvable : il a peut-être été supprimé entre-temps." });
      continue;
    }
    if (row.family === family) {
      unchanged.push({ id, name: row.name });
      continue;
    }
    const reason = reclassifyRefusal(row, family, context);
    if (reason) {
      refused.push({ id, name: row.name, reason });
      continue;
    }
    changes.push({
      id,
      name: row.name,
      category: row.category,
      from: row.family,
      openSamples: countFor(context.openSamples, id, (of) => of !== family),
      otherDomainTypes: countFor(context.citedBy, id, (of) => of !== family && of !== "AUTRE"),
    });
  }

  changes.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name, "fr")
  );
  return { family, changes, unchanged, refused };
}

/** The 409's message when the plan refuses something: nothing was written. */
export function refusalMessage(plan: Pick<ReclassifyPlan, "refused">): string {
  const count = plan.refused.length;
  return count === 1
    ? `Aucun paramètre reclassé (« ${plan.refused[0].name ?? plan.refused[0].id} » refusé). ${plan.refused[0].reason}`
    : `Aucun paramètre reclassé : ${count} sont refusés (raisons dans la liste). Retirez-les de la sélection.`;
}

/** The 400's message when every parameter sent is already in the domain asked for. */
export function alreadyThereMessage(plan: Pick<ReclassifyPlan, "family" | "unchanged">): string {
  return `Aucun paramètre à reclasser : ${plan.unchanged.length > 1 ? "ils sont" : "il est"} déjà en « ${RECLASSIFY_FAMILY_LABELS[plan.family]} ».`;
}

/**
 * The search of the parameters screen: every word typed must begin a word of
 * the name, of another spelling (alias) or of the norm in force — case,
 * accents and punctuation ignored. A word start, not anywhere inside: the
 * result is what a reclassification would tick, so « pH » must not bring
 * « Staphylococcus » nor « mésophiles », « As » not « Pseudomonas ». No
 * typing tolerance either: « Plomb » must not bring « Plomp ».
 */
export function parameterMatches(
  parameter: { name: string; aliases?: string | null; normLabel?: string | null },
  query: string
): boolean {
  const words = normalizeLabel(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const tokens = normalizeLabel([parameter.name, parameter.aliases ?? "", parameter.normLabel ?? ""].join(" ")).split(" ");
  return words.every((word) => tokens.some((token) => token.startsWith(word)));
}
