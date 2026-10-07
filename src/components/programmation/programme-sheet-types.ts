import type {
  CancelReason,
  Family,
  LimitKind,
  LineKind,
  NonConformityReason,
  ProgrammePriority,
  QuantityUnit,
  SampleStatus,
  SampleType,
  SerieKind,
} from "@/generated/prisma/enums";

/**
 * What the programme sheet receives (PROGRAMME.md §4–5): the line, its
 * current programme and the referential, exactly as `GET
 * /api/samples/[id]/programme` serialises them — dates as ISO strings,
 * decimals as numbers — so the server page and the API hand the client the
 * same shape.
 */

export type ProgrammeParameterData = {
  parameterId: string;
  name: string;
  unit: string | null;
  calcFactor: number;
  technicianId: string | null;
  technician: { id: string; name: string } | null;
  normVersionId: string | null;
  normVersion: { id: string; label: string; current: boolean } | null;
  dilutionFactor: number | null;
  note: string | null;
  /** The parameter's family (RETOUR-LABO-06-10.md §5, V3) and its category. */
  family: Family;
  category: SampleType;
};

export type ProgrammeSampleData = {
  id: string;
  code: string;
  controlCode: string | null;
  status: SampleStatus;
  lineNumber: number;
  lineKind: LineKind;
  type: SampleType;
  clientId: string;
  client: { id: string; name: string };
  serie: { id: string; serialNumber: string; kind: SerieKind; receivedAt: string | null };
  natureId: string;
  /** `legacyType` is the category the nature files the line under; `active` false = archived. */
  nature: { id: string; code: string; label: string; family: Family; legacyType: SampleType; active: boolean };
  produit: string | null;
  numeroLot: string | null;
  lieu: string;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  receivedAt: string | null;
  receptionTemperature: number | null;
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  analysisBlocked: boolean;
  unitCount: number;
  productTypeId: string | null;
  productType: { id: string; name: string } | null;
  technicianId: string | null;
  technician: { id: string; name: string } | null;
  priority: ProgrammePriority;
  dueAt: string | null;
  testPortion: string | null;
  programmeNote: string | null;
  programmedAt: string | null;
  programmedById: string | null;
  programmedBy: { id: string; name: string } | null;
  cancelReason: CancelReason | null;
  parameters: ProgrammeParameterData[];
};

/** The programme as stored, plus what the sheet may do with it. */
export type ProgrammeState = {
  /** The nature the programme was decided for — changeable within its family (Q49). */
  natureId: string;
  productTypeId: string | null;
  parameterIds: string[];
  unitCount: number;
  testPortion: string | null;
  technicianId: string | null;
  priority: ProgrammePriority;
  dueAt: string | null;
  programmeNote: string | null;
  parameters: {
    parameterId: string;
    technicianId: string | null;
    normVersionId: string | null;
    dilutionFactor: number | null;
    note: string | null;
  }[];
  programmedAt: string | null;
  programmedBy: { id: string; name: string } | null;
  /** False once the bench started, or while the line is held at reception. */
  editable: boolean;
};

export type CriterionRef = {
  parameterId: string;
  parameterName: string;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
  unit: string | null;
  normVersionId: string | null;
  normVersion: { id: string; label: string; current: boolean; version: string } | null;
};

export type ProductTypeRef = {
  id: string;
  name: string;
  family: Family;
  clientId: string | null;
  criteria: CriterionRef[];
};

export type ParameterRef = {
  id: string;
  name: string;
  unit: string | null;
  threshold: string | null;
  calcFactor: number;
  /** MICRO / CHIMIE / AUTRE, set on `/admin/parametres` — the sheet groups the analyses by it. */
  family: Family;
  category: SampleType;
};

/**
 * A nature the sheet may give the line (RETOUR-LABO-06-10.md §5, V3 — Q49
 * by default): the current one (`current`, even archived) and the active
 * natures of the same family, in the catalogue order.
 */
export type ProgrammeNatureData = {
  id: string;
  code: string;
  label: string;
  family: Family;
  legacyType: SampleType;
  active: boolean;
  current: boolean;
};

export type ProfileRef = {
  id: string;
  name: string;
  clientId: string | null;
  unitCount: number;
  parameterIds: string[];
};

export type NormVersionRef = {
  id: string;
  normId: string;
  normCode: string;
  version: string;
  label: string;
  current: boolean;
};

export type TechnicianRef = { id: string; name: string };

export type ProgrammeReferentialData = {
  /** The nature this referential was computed for — the line's, or the one the sheet is trying. */
  natureId: string;
  /** That nature's category: the parameters, prices and services below are of it. */
  category: SampleType;
  /** The natures the sheet may choose from (same family only). */
  natures: ProgrammeNatureData[];
  /** The client's own types first, then the catalogue. */
  productTypes: ProductTypeRef[];
  /** The parameters of the nature's category, each with its family. */
  parameters: ParameterRef[];
  profiles: ProfileRef[];
  technicians: TechnicianRef[];
  /** The norm versions each parameter may be programmed with. */
  normVersions: Record<string, NormVersionRef[]>;
  /** The catalogue price of each parameter; null = « prix à saisir ». */
  prices: Record<string, number | null>;
};

/** What `PUT /api/samples/[id]/programme` answers. */
export type ProgrammeResponse = {
  sample: ProgrammeSampleData;
  programme: ProgrammeState;
};

/** What `GET /api/samples/[id]/programme[?natureId=]` answers: the PUT's answer plus the referential. */
export type ProgrammeReadResponse = ProgrammeResponse & {
  referential: ProgrammeReferentialData;
};
