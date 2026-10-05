import type { ProgrammePriority, SampleStatus } from "@/generated/prisma/enums";
import { SAMPLE_STATUS_LABELS } from "./labels";
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

export type ProgrammeInput = {
  /** True = « Confirmer le programme »; false = a draft, or an edit of a confirmed one. */
  confirm: boolean;
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
  /** The product types the request names (the rule checks activity and visibility). */
  productTypes: { id: string; clientId: string | null; active: boolean }[];
  /** The parameters the line may be given — those of the nature's category. */
  parameterIds: readonly string[];
  /** The users the request names as technicians (the rule checks role and ban). */
  technicians: { id: string; role: string; banned: boolean | null }[];
  /** The norm versions each parameter may be programmed with. */
  normVersionIds: Record<string, readonly string[]>;
  /** Injected by the tests; the wall clock otherwise. */
  now?: Date;
};

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
      `Le programme ne peut plus être modifié : la ligne est « ${SAMPLE_STATUS_LABELS[ctx.status]} ».`,
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

  // ---- Analyses -----------------------------------------------------------
  if (!Array.isArray(input.parameterIds)) return fail("La liste des analyses est invalide.");
  const parameterIds: string[] = [];
  for (const id of input.parameterIds) {
    if (typeof id !== "string" || !id) return fail("La liste des analyses est invalide.");
    if (!parameterIds.includes(id)) parameterIds.push(id);
  }
  const allowedParameters = new Set(ctx.parameterIds);
  if (parameterIds.some((id) => !allowedParameters.has(id))) {
    return fail("Une des analyses demandées n'existe pas pour cette nature.");
  }
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
