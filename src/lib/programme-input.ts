import type { Family, LineKind, ProgrammePriority, SampleStatus, SampleType } from "@/generated/prisma/enums";
import { ANALYSIS_FAMILY_LABELS, SAMPLE_STATUS_LABELS } from "./labels";
import { PROGRAMMABLE_STATUSES } from "./sample-status";
import { MAX_UNITS } from "./series";

/**
 * The programme d'analyse as the responsable des paramètres sends it
 * (PROGRAMME.md §5) — validated here, once, before any write.
 *
 * Pure: the route loads the referential the rules need (the types visible
 * to the client, the parameters of the nature's category, the active
 * technicians, the norm versions of each parameter) and this decides. Every
 * rule gives a message in French; the first failure stops the check.
 *
 * RETOUR-LABO-06-10.md §5 (V3, Q49 by default): the fine nature (cosmetics,
 * supplements, oils…) is chosen here, never by the préleveur — the payload
 * may name another active nature of the SAME family as the line's (the other
 * family is another sample, with its own code « …M » / « …P »). The
 * parameters are then those of the new nature's category.
 */

export const PROGRAMME_PRIORITIES: readonly ProgrammePriority[] = ["NORMALE", "URGENTE"];

/** How far in the past a due date may be: two clocks rarely agree to the minute. */
export const DUE_AT_TOLERANCE_MS = 5 * 60_000;
/** `Sample.testPortion` VARCHAR(60). */
export const MAX_TEST_PORTION = 60;
/** `Sample.programmeNote` TEXT — a screen's worth, not a document. */
export const MAX_PROGRAMME_NOTE = 4000;
/** `SampleParameter.note` VARCHAR(191). */
export const MAX_PARAMETER_NOTE = 191;
/** `SampleParameter.dilutionFactor` DECIMAL(12, 4): eight integer digits. */
export const MAX_DILUTION_FACTOR = 99_999_999;

export type ProgrammeParameter = {
  parameterId: string;
  /** Null = the sample's technician. */
  technicianId: string | null;
  normVersionId: string | null;
  dilutionFactor: number | null;
  note: string | null;
};

/** A nature as the programme reads it — the referential's `natures` carry the same fields. */
export type ProgrammeNatureRef = {
  id: string;
  label: string;
  family: Family;
  /** The category the nature maps to: it becomes `Sample.type` and decides the parameters offered. */
  legacyType: SampleType;
  /** The kind of sample the nature is for: a change keeps the line's kind (a food stays a food). */
  defaultLineKind?: LineKind;
  active: boolean;
};

export type ProgrammeInput = {
  /** True = « Confirmer le programme »; false = a draft, or an edit of a confirmed one. */
  confirm: boolean;
  /** The line's nature after the write: the current one unless the request names another. */
  natureId: string;
  productTypeId: string | null;
  parameterIds: string[];
  unitCount: number;
  testPortion: string | null;
  technicianId: string | null;
  priority: ProgrammePriority;
  dueAt: Date | null;
  programmeNote: string | null;
  /** One entry per programmed parameter, in `parameterIds` order. */
  parameters: ProgrammeParameter[];
};

export type ProgrammeContext = {
  /** The line's current status: only RECU and PROGRAMME accept a programme. */
  status: SampleStatus;
  clientId: string;
  /** The line's current nature and its family — a change stays in that family. */
  natureId: string;
  natureFamily: Family;
  /** The kind of sample the current nature is for: the new nature must be for the same kind. */
  natureLineKind?: LineKind;
  /**
   * The natures the request may name: at least the active ones of the line's
   * family and the requested one, so a refusal can say why (unknown,
   * archived, other family).
   */
  natures: readonly ProgrammeNatureRef[];
  /** The product types the request names (the rule checks activity and visibility). */
  productTypes: { id: string; clientId: string | null; active: boolean }[];
  /**
   * The parameters the line may be given — those of the category of the
   * nature it will have: the requested one when the request changes it
   * (`resolveProgrammeNature` tells the route which).
   */
  parameterIds: readonly string[];
  /** The names of the parameters the request names, to say which one is refused. */
  parameterNames?: Readonly<Record<string, string>>;
  /** The users the request names as technicians (the rule checks role and ban). */
  technicians: { id: string; role: string; banned: boolean | null }[];
  /** The norm versions each parameter may be programmed with. */
  normVersionIds: Record<string, readonly string[]>;
  /** Injected by the tests; the wall clock otherwise. */
  now?: Date;
};

export type NatureResolution =
  | {
      ok: true;
      /** The line's nature after the write. */
      natureId: string;
      /** The requested nature when it differs from the current one, null otherwise. */
      changed: ProgrammeNatureRef | null;
    }
  | { ok: false; error: string };

/**
 * The nature a request asks for (Q49 by default): absent, empty or the
 * current one = no change; otherwise an active nature of the same family.
 * The route calls it first to know which category's parameters to load;
 * `validateProgramme` calls it again, so the rule lives in one place.
 */
export function resolveProgrammeNature(
  raw: unknown,
  ctx: Pick<ProgrammeContext, "natureId" | "natureFamily" | "natureLineKind" | "natures">
): NatureResolution {
  const requested =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).natureId
      : undefined;
  if (requested === undefined || requested === null || requested === "" || requested === ctx.natureId) {
    return { ok: true, natureId: ctx.natureId, changed: null };
  }
  if (typeof requested !== "string") return { ok: false, error: "Nature d'analyse invalide." };

  const nature = ctx.natures.find((candidate) => candidate.id === requested);
  if (!nature) return { ok: false, error: "Nature d'analyse inconnue." };
  if (nature.family !== ctx.natureFamily) {
    return {
      ok: false,
      error: `Choisissez une nature de la même famille (${ANALYSIS_FAMILY_LABELS[ctx.natureFamily].toLowerCase()}) : l'autre famille fait l'objet d'un autre échantillon.`,
    };
  }
  if (ctx.natureLineKind && nature.defaultLineKind && nature.defaultLineKind !== ctx.natureLineKind) {
    return {
      ok: false,
      error: `La nature « ${nature.label} » concerne un autre type d'échantillon : choisissez une nature de ce type.`,
    };
  }
  if (!nature.active) {
    return { ok: false, error: `La nature « ${nature.label} » est archivée : choisissez-en une autre.` };
  }
  return { ok: true, natureId: nature.id, changed: nature };
}

/** « L'analyse « Salmonella » n'existe pas… », or a count when several are refused. */
function outsideCategoryMessage(
  outside: string[],
  names: Readonly<Record<string, string>> | undefined,
  changed: ProgrammeNatureRef | null
): string {
  const where = changed ? `la nature « ${changed.label} »` : "cette nature";
  const named = outside.flatMap((id) => (names?.[id] ? [`« ${names[id]} »`] : []));
  const subject =
    outside.length === 1
      ? named.length === 1
        ? `L'analyse ${named[0]} n'existe pas`
        : "Une des analyses demandées n'existe pas"
      : `${outside.length} analyses demandées n'existent pas`;
  const list = outside.length > 1 && named.length > 0 ? ` (${named.join(", ")})` : "";
  // After a change of nature, say the way out: drop them or keep the nature.
  const remedy = changed
    ? ` : ${outside.length === 1 ? "retirez-la" : "retirez-les"} ou gardez la nature actuelle.`
    : ".";
  return `${subject}${list} pour ${where}${remedy}`;
}

export type ProgrammeValidation =
  | { ok: true; value: ProgrammeInput }
  | { ok: false; error: string; httpStatus: 400 | 409 };

const fail = (error: string, httpStatus: 400 | 409 = 400): ProgrammeValidation => ({
  ok: false,
  error,
  httpStatus,
});

/** A trimmed string, or null for empty / absent. Non-strings are refused upstream. */
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** An identifier, or null for empty / absent. */
function optionalId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" ? value : undefined;
}

/** An integer from a number or a typed string; null when it is not one. */
function integer(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

/** A decimal from a number or a typed string (« 10,5 »); null when it is not one. */
function decimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalised = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalised)) return null;
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateProgramme(raw: unknown, ctx: ProgrammeContext): ProgrammeValidation {
  if (!PROGRAMMABLE_STATUSES.includes(ctx.status)) {
    return fail(
      `Le programme ne peut plus être modifié : l'échantillon est « ${SAMPLE_STATUS_LABELS[ctx.status]} ».`,
      409
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("Requête invalide.");
  }
  const input = raw as Record<string, unknown>;

  const confirm = input.confirm === undefined ? false : input.confirm;
  if (typeof confirm !== "boolean") return fail("Requête invalide : « confirm » doit être vrai ou faux.");
  // A confirmed programme stays confirmed: an edit may not empty it.
  const confirming = confirm || ctx.status === "PROGRAMME";

  // ---- Nature (Q49: the fine nature, within the line's family) -----------
  const nature = resolveProgrammeNature(input, ctx);
  if (!nature.ok) return fail(nature.error);

  // ---- Analyses -----------------------------------------------------------
  if (!Array.isArray(input.parameterIds)) return fail("La liste des analyses est invalide.");
  const parameterIds: string[] = [];
  for (const id of input.parameterIds) {
    if (typeof id !== "string" || !id) return fail("La liste des analyses est invalide.");
    if (!parameterIds.includes(id)) parameterIds.push(id);
  }
  const allowedParameters = new Set(ctx.parameterIds);
  const outside = parameterIds.filter((id) => !allowedParameters.has(id));
  if (outside.length > 0) return fail(outsideCategoryMessage(outside, ctx.parameterNames, nature.changed));
  if (confirming && parameterIds.length === 0) {
    return fail("Choisissez au moins une analyse avant de confirmer le programme.");
  }

  // ---- Product type -------------------------------------------------------
  const productTypeRef = optionalId(input.productTypeId);
  if (productTypeRef === undefined) return fail("Type de produit invalide.");
  let productTypeId: string | null = null;
  if (productTypeRef) {
    const type = ctx.productTypes.find((candidate) => candidate.id === productTypeRef);
    if (!type || !type.active || (type.clientId !== null && type.clientId !== ctx.clientId)) {
      return fail("Type de produit inconnu pour ce client.");
    }
    productTypeId = type.id;
  }

  // ---- Numbers ------------------------------------------------------------
  const unitCount = integer(input.unitCount);
  if (unitCount === null || unitCount < 1 || unitCount > MAX_UNITS) {
    return fail(`Le nombre d'unités doit être un entier entre 1 et ${MAX_UNITS}.`);
  }
  const testPortion = optionalText(input.testPortion);
  if (testPortion === undefined) return fail("La prise d'essai est invalide.");
  if (testPortion && testPortion.length > MAX_TEST_PORTION) {
    return fail(`La prise d'essai est trop longue (${MAX_TEST_PORTION} caractères maximum).`);
  }

  // ---- Organisation -------------------------------------------------------
  const isTechnician = (id: string) =>
    ctx.technicians.some((user) => user.id === id && user.role === "TECHNICIEN" && !user.banned);

  const technicianId = optionalId(input.technicianId);
  if (technicianId === undefined) return fail("Technicien invalide.");
  if (technicianId && !isTechnician(technicianId)) {
    return fail("Technicien invalide : choisissez un technicien actif.");
  }

  const priority: unknown =
    input.priority === undefined || input.priority === null ? "NORMALE" : input.priority;
  if (!(PROGRAMME_PRIORITIES as readonly unknown[]).includes(priority)) return fail("Priorité inconnue.");

  let dueAt: Date | null = null;
  if (input.dueAt !== undefined && input.dueAt !== null && input.dueAt !== "") {
    if (typeof input.dueAt !== "string") return fail("Le délai de rendu est invalide.");
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) return fail("Le délai de rendu est invalide.");
    const now = ctx.now ?? new Date();
    if (parsed.getTime() < now.getTime() - DUE_AT_TOLERANCE_MS) {
      return fail("Le délai de rendu ne peut pas être dans le passé.");
    }
    dueAt = parsed;
  }

  const programmeNote = optionalText(input.programmeNote);
  if (programmeNote === undefined) return fail("Les consignes sont invalides.");
  if (programmeNote && programmeNote.length > MAX_PROGRAMME_NOTE) {
    return fail(`Les consignes sont trop longues (${MAX_PROGRAMME_NOTE} caractères maximum).`);
  }

  // ---- Per-parameter settings --------------------------------------------
  if (input.parameters !== undefined && !Array.isArray(input.parameters)) {
    return fail("Les réglages par analyse sont invalides.");
  }
  const settings = new Map<string, ProgrammeParameter>();
  for (const entry of (input.parameters ?? []) as unknown[]) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return fail("Les réglages par analyse sont invalides.");
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.parameterId !== "string" || !row.parameterId) {
      return fail("Les réglages par analyse sont invalides.");
    }
    // The settings of an analysis that is not programmed carry nothing.
    if (!parameterIds.includes(row.parameterId)) continue;
    if (settings.has(row.parameterId)) return fail("Une analyse apparaît deux fois dans les réglages.");

    const rowTechnicianId = optionalId(row.technicianId);
    if (rowTechnicianId === undefined) return fail("Technicien invalide pour une analyse.");
    if (rowTechnicianId && !isTechnician(rowTechnicianId)) {
      return fail("Technicien invalide pour une analyse : choisissez un technicien actif.");
    }

    const normVersionId = optionalId(row.normVersionId);
    if (normVersionId === undefined) return fail("Version de norme invalide.");
    if (normVersionId && !(ctx.normVersionIds[row.parameterId] ?? []).includes(normVersionId)) {
      return fail("Version de norme inconnue pour cette analyse.");
    }

    let dilutionFactor: number | null = null;
    if (row.dilutionFactor !== undefined && row.dilutionFactor !== null && row.dilutionFactor !== "") {
      const parsed = decimal(row.dilutionFactor);
      if (parsed === null || parsed <= 0 || parsed > MAX_DILUTION_FACTOR) {
        return fail("Le facteur de dilution doit être un nombre supérieur à 0.");
      }
      dilutionFactor = Math.round(parsed * 10_000) / 10_000;
      if (dilutionFactor <= 0) return fail("Le facteur de dilution doit être un nombre supérieur à 0.");
    }

    const note = optionalText(row.note);
    if (note === undefined) return fail("La note de méthode est invalide.");
    if (note && note.length > MAX_PARAMETER_NOTE) {
      return fail(`La note de méthode est trop longue (${MAX_PARAMETER_NOTE} caractères maximum).`);
    }

    settings.set(row.parameterId, {
      parameterId: row.parameterId,
      technicianId: rowTechnicianId,
      normVersionId,
      dilutionFactor,
      note,
    });
  }
  const parameters = parameterIds.map(
    (parameterId) =>
      settings.get(parameterId) ?? {
        parameterId,
        technicianId: null,
        normVersionId: null,
        dilutionFactor: null,
        note: null,
      }
  );

  return {
    ok: true,
    value: {
      confirm,
      natureId: nature.natureId,
      productTypeId,
      parameterIds,
      unitCount,
      testPortion,
      technicianId,
      priority: priority as ProgrammePriority,
      dueAt,
      programmeNote,
      parameters,
    },
  };
}
