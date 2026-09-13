import type { LineKind, Family, SampleType, QuantityUnit, HandsState } from "@/generated/prisma/enums";

/** Shapes shared by the visit screens (client side). */

export type NatureOption = {
  id: string;
  code: string;
  label: string;
  family: Family;
  defaultLineKind: LineKind;
  legacyType: SampleType;
};

export type ClientOption = {
  id: string;
  name: string;
  sites?: { id: string; name: string }[];
};

export type ParameterOption = { id: string; name: string; unit?: string | null };

/** A panel of analyses proposed in one tap (client-specific ones first). */
export type ProfileOption = {
  id: string;
  name: string;
  natureId: string;
  clientId: string | null;
  unitCount: number;
  parameterIds: string[];
};

export type ClientMemory = { places: string[]; products: string[] };

/** The forms' suggestions: the client's memory first, then what this visit already typed. */
export function mergeSuggestions(memory: string[], typed: string[]) {
  return [...new Set([...memory, ...typed.map((s) => s.trim()).filter(Boolean)])];
}

export type LineDraft = {
  key: string;
  natureId: string;
  lineKind: LineKind;
  produit: string;
  lieu: string;
  numeroLot: string;
  productionDate: string;
  expiryDate: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  productTemperature: string;
  ambientTemperature: string;
  surfaceLabel: string;
  surfaceAreaCm2: string;
  personName: string;
  personRole: string;
  handsState: HandsState | "";
  remarks: string;
  unitCount: number;
  parameterIds: string[];
};

let keySeed = 0;
export function newKey() {
  keySeed += 1;
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${keySeed}`;
}

/** The kinds a line of this nature may take (hands belong to surface microbiology). */
export function kindsFor(nature: NatureOption | undefined): LineKind[] {
  if (!nature) return ["ALIMENT"];
  if (nature.defaultLineKind === "SURFACE") return ["SURFACE", "MAINS"];
  return [nature.defaultLineKind];
}

export function emptyLine(nature: NatureOption | undefined, previous?: LineDraft): LineDraft {
  const kind = nature?.defaultLineKind ?? "ALIMENT";
  return {
    key: newKey(),
    natureId: nature?.id ?? "",
    lineKind: kind,
    produit: "",
    lieu: previous?.lieu ?? "",
    numeroLot: "",
    productionDate: "",
    expiryDate: "",
    quantity: kind === "ALIMENT" ? "1" : "",
    quantityUnit: kind === "EAU" ? "L" : "UNITE",
    productTemperature: "",
    ambientTemperature: previous?.ambientTemperature ?? "",
    surfaceLabel: "",
    surfaceAreaCm2: "100",
    personName: "",
    personRole: "",
    handsState: "",
    remarks: "",
    unitCount: 1,
    parameterIds: previous && previous.natureId === nature?.id ? [...previous.parameterIds] : [],
  };
}

/** What the line is about, for lists and recaps. */
export function lineDesignation(line: {
  lineKind: LineKind;
  produit?: string | null;
  surfaceLabel?: string | null;
  personName?: string | null;
}) {
  if (line.lineKind === "SURFACE") return line.surfaceLabel || "Surface";
  if (line.lineKind === "MAINS") return line.personName ? `Mains — ${line.personName}` : "Mains du personnel";
  return line.produit || "—";
}

/** `datetime-local` wants local time without zone: 2026-09-13T14:05 */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
