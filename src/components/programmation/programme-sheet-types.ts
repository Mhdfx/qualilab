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
  nature: { id: string; code: string; label: string; family: Family };
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
  /** The client's own types first, then the catalogue. */
  productTypes: ProductTypeRef[];
  /** The parameters of the nature's category. */
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
