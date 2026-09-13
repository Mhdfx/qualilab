import type {
  Cadre,
  HandsState,
  LineKind,
  QuantityUnit,
  SamplerKind,
  SerieKind,
} from "@/generated/prisma/enums";

/**
 * Validating a série (visite or dépôt) and its lines — pure, shared by the
 * API and, later, the forms.
 *
 * The rules mirror the paper protocole de prélèvement: an aliment line
 * carries a lot, dates and a quantity; a surface line an area; a mains line a
 * person; temperatures and remarks are allowed on every kind. Anything the
 * kind does not use is dropped, never silently stored.
 */

export const LINE_KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];
export const QUANTITY_UNITS: QuantityUnit[] = ["UNITE", "G", "ML", "L"];
export const HANDS_STATES: HandsState[] = ["LAVEES", "NON_LAVEES"];
export const SAMPLER_KINDS: SamplerKind[] = ["QUALILAB", "CLIENT", "SERVICE_VETERINAIRE", "AUTRE"];
export const SERIE_KINDS: SerieKind[] = ["VISITE", "DEPOT"];
export const CADRES: Cadre[] = ["AUTOCONTROLE", "OFFICIEL"];

export const MAX_LINES = 200;
const TEXT = 191;

export type NatureRef = { id: string; defaultLineKind: LineKind; active: boolean };

export type CleanLine = {
  natureId: string;
  lineKind: LineKind;
  produit: string | null;
  lieu: string;
  numeroLot: string | null;
  productionDate: Date | null;
  expiryDate: Date | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  receptionTemperature: number | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  remarks: string | null;
  unitCount: number;
  parameterIds: string[];
};

export type CleanSerie = {
  kind: SerieKind;
  clientId: string;
  siteId: string | null;
  interlocutor: string | null;
  samplerKind: SamplerKind;
  samplerName: string | null;
  cadre: Cadre;
  clientReference: string | null;
  startedAt: Date;
  endedAt: Date | null;
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  notes: string | null;
  lines: CleanLine[];
};

export type SerieValidation =
  | { ok: true; value: CleanSerie }
  | { ok: false; error: string; line?: number };

function text(value: unknown, max = TEXT): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > max ? s.slice(0, max) : s;
}

function tooLong(value: unknown, max = TEXT) {
  return typeof value === "string" && value.trim().length > max;
}

function numberOrNull(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "invalid";
}

/** « 2026-09-13 » or a full ISO instant; a plain date is kept as a date. */
function dateOrNull(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const d = new Date(plain);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Lower-cased, unaccented, single-spaced — the key that spots « CF+PAV1 » vs « CF + PAV1 ». */
export function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateLine(
  raw: unknown,
  index: number,
  natures: Map<string, NatureRef>
): { ok: true; value: CleanLine } | { ok: false; error: string; line: number } {
  const line = index + 1;
  const fail = (error: string) => ({ ok: false as const, error, line });
  const input = (raw ?? {}) as Record<string, unknown>;

  const natureId = text(input.natureId);
  const nature = natures.get(natureId);
  if (!nature || !nature.active) return fail("Choisissez la nature d'analyse.");

  const lineKind = oneOf(input.lineKind, LINE_KINDS) ?? nature.defaultLineKind;

  const lieu = text(input.lieu);
  if (!lieu) return fail("Indiquez le lieu / la section du prélèvement.");
  if (tooLong(input.lieu)) return fail("Le lieu est trop long (191 caractères maximum).");

  for (const [key, label] of [
    ["produit", "La désignation"],
    ["numeroLot", "Le numéro de lot"],
    ["surfaceLabel", "La surface"],
    ["personName", "Le nom de la personne"],
    ["personRole", "La fonction"],
  ] as const) {
    if (tooLong(input[key])) return fail(`${label} est trop long(ue) (191 caractères maximum).`);
  }

  const produit = text(input.produit) || null;
  const surfaceLabel = text(input.surfaceLabel) || null;
  const personName = text(input.personName) || null;

  if (lineKind === "ALIMENT" && !produit) return fail("Indiquez la désignation du produit.");
  if (lineKind === "SURFACE" && !surfaceLabel) return fail("Indiquez la surface prélevée.");
  if (lineKind === "MAINS" && !personName) return fail("Indiquez la personne prélevée.");

  const productionDate = dateOrNull(input.productionDate);
  const expiryDate = dateOrNull(input.expiryDate);
  if (productionDate === "invalid") return fail("La date de production n'est pas valide.");
  if (expiryDate === "invalid") return fail("La date d'expiration n'est pas valide.");
  if (productionDate && expiryDate && expiryDate < productionDate) {
    return fail("La date d'expiration précède la date de production.");
  }

  const quantity = numberOrNull(input.quantity);
  if (quantity === "invalid" || (quantity !== null && quantity <= 0)) {
    return fail("La quantité doit être un nombre positif.");
  }
  const quantityUnit = quantity === null ? null : (oneOf(input.quantityUnit, QUANTITY_UNITS) ?? "UNITE");

  const productTemperature = numberOrNull(input.productTemperature);
  const ambientTemperature = numberOrNull(input.ambientTemperature);
  const receptionTemperature = numberOrNull(input.receptionTemperature);
  for (const [t, label] of [
    [productTemperature, "La température du produit"],
    [ambientTemperature, "La température ambiante"],
    [receptionTemperature, "La température à l'arrivée"],
  ] as const) {
    if (t === "invalid" || (t !== null && (t < -80 || t > 300))) {
      return fail(`${label} doit être un nombre plausible (−80 à 300 °C).`);
    }
  }

  let surfaceAreaCm2: number | null = null;
  if (lineKind === "SURFACE") {
    const area = numberOrNull(input.surfaceAreaCm2);
    if (area === "invalid" || (area !== null && (!Number.isInteger(area) || area <= 0 || area > 100000))) {
      return fail("L'aire prélevée doit être un nombre entier de cm².");
    }
    surfaceAreaCm2 = area ?? 100;
  }

  const handsState = lineKind === "MAINS" ? oneOf(input.handsState, HANDS_STATES) : null;

  const unitCountRaw = numberOrNull(input.unitCount);
  const unitCount = unitCountRaw === null ? 1 : unitCountRaw;
  if (unitCount === "invalid" || !Number.isInteger(unitCount) || unitCount < 1 || unitCount > 26) {
    return fail("Le nombre d'unités doit être un entier entre 1 et 26.");
  }

  const ids = Array.isArray(input.parameterIds) ? input.parameterIds : [];
  const parameterIds = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (parameterIds.length === 0) return fail("Choisissez au moins une analyse.");

  return {
    ok: true,
    value: {
      natureId,
      lineKind,
      produit: lineKind === "ALIMENT" || lineKind === "EAU" || lineKind === "AIR" || lineKind === "AUTRE" ? produit : null,
      lieu,
      numeroLot: text(input.numeroLot) || null,
      productionDate: lineKind === "ALIMENT" ? productionDate : null,
      expiryDate: lineKind === "ALIMENT" ? expiryDate : null,
      quantity: quantity as number | null,
      quantityUnit,
      productTemperature: productTemperature as number | null,
      ambientTemperature: ambientTemperature as number | null,
      receptionTemperature: receptionTemperature as number | null,
      surfaceLabel: lineKind === "SURFACE" ? surfaceLabel : null,
      surfaceAreaCm2,
      personName: lineKind === "MAINS" ? personName : null,
      personRole: lineKind === "MAINS" ? text(input.personRole) || null : null,
      handsState,
      remarks: text(input.remarks, 2000) || null,
      unitCount: unitCount as number,
      parameterIds,
    },
  };
}

export function validateSerie(
  raw: unknown,
  natures: Map<string, NatureRef>,
  options: { kind: SerieKind }
): SerieValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string) => ({ ok: false as const, error });

  const clientId = text(input.clientId);
  if (!clientId) return fail("Choisissez le client.");
  const siteId = text(input.siteId) || null;

  const samplerKind =
    options.kind === "DEPOT"
      ? (oneOf(input.samplerKind, SAMPLER_KINDS) ?? "CLIENT")
      : (oneOf(input.samplerKind, SAMPLER_KINDS) ?? "QUALILAB");
  const samplerName = text(input.samplerName) || null;
  if ((samplerKind === "SERVICE_VETERINAIRE" || samplerKind === "AUTRE") && !samplerName) {
    return fail("Indiquez qui a effectué le prélèvement.");
  }

  // The cadre is derived from who samples; the réception may override it later.
  const cadre: Cadre =
    oneOf(input.cadre, CADRES) ?? (samplerKind === "SERVICE_VETERINAIRE" ? "OFFICIEL" : "AUTOCONTROLE");

  const startedAtRaw = dateOrNull(input.startedAt);
  if (startedAtRaw === "invalid") return fail("La date et l'heure du prélèvement ne sont pas valides.");
  const startedAt = startedAtRaw ?? new Date();
  const now = Date.now();
  if (startedAt.getTime() > now + 5 * 60 * 1000) return fail("L'heure du prélèvement est dans le futur.");
  if (startedAt.getTime() < now - 30 * 24 * 3600 * 1000) return fail("L'heure du prélèvement remonte à plus de 30 jours.");

  const endedAt = dateOrNull(input.endedAt);
  const arrivedAt = dateOrNull(input.arrivedAt);
  if (endedAt === "invalid") return fail("L'heure de fin n'est pas valide.");
  if (arrivedAt === "invalid") return fail("L'heure d'arrivée n'est pas valide.");
  if (endedAt && endedAt < startedAt) return fail("L'heure de fin précède le début du prélèvement.");
  if (arrivedAt && endedAt && arrivedAt < endedAt) return fail("L'arrivée au laboratoire précède la fin du prélèvement.");
  if (arrivedAt && !endedAt && arrivedAt < startedAt) return fail("L'arrivée au laboratoire précède le prélèvement.");

  const coolerTemperature = numberOrNull(input.coolerTemperature);
  if (coolerTemperature === "invalid" || (coolerTemperature !== null && (coolerTemperature < -80 || coolerTemperature > 300))) {
    return fail("La température à l'arrivée doit être un nombre plausible.");
  }

  for (const [key, label] of [
    ["interlocutor", "L'interlocuteur"],
    ["clientReference", "La référence client"],
  ] as const) {
    if (tooLong(input[key])) return fail(`${label} est trop long(ue) (191 caractères maximum).`);
  }

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length === 0) return fail("Ajoutez au moins une ligne d'échantillon.");
  if (rawLines.length > MAX_LINES) return fail(`Une série ne peut pas dépasser ${MAX_LINES} lignes.`);

  const lines: CleanLine[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const checked = validateLine(rawLines[i], i, natures);
    if (!checked.ok) return { ok: false, error: checked.error, line: checked.line };
    lines.push(checked.value);
  }

  return {
    ok: true,
    value: {
      kind: options.kind,
      clientId,
      siteId,
      interlocutor: text(input.interlocutor) || null,
      samplerKind,
      samplerName,
      cadre,
      clientReference: text(input.clientReference) || null,
      startedAt,
      endedAt,
      arrivedAt,
      coolerTemperature: coolerTemperature as number | null,
      notes: text(input.notes, 2000) || null,
      lines,
    },
  };
}
