import type { Role } from "./roles";
import type { SerieProgress, SerieStatus } from "./series";
import { serieProgress } from "./series";

/**
 * What each audience sees of a série and its lines.
 *
 * Same principle as `sample-select.ts`: the préleveur's payload carries no
 * N° de contrôle — the restriction is in the query, not in the screen.
 */

const LINE_COMMON = {
  id: true,
  code: true,
  lineNumber: true,
  lineKind: true,
  status: true,
  lieu: true,
  produit: true,
  numeroLot: true,
  productionDate: true,
  expiryDate: true,
  quantity: true,
  quantityUnit: true,
  productTemperature: true,
  ambientTemperature: true,
  surfaceLabel: true,
  surfaceAreaCm2: true,
  personName: true,
  personRole: true,
  handsState: true,
  remarks: true,
  unitCount: true,
  cancelReason: true,
  nature: { select: { id: true, code: true, label: true, family: true } },
  parameters: {
    select: { parameter: { select: { id: true, name: true, unit: true } } },
  },
} as const;

const SERIE_COMMON = {
  id: true,
  kind: true,
  serialNumber: true,
  year: true,
  client: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  interlocutor: true,
  samplerKind: true,
  samplerUser: { select: { id: true, name: true } },
  samplerName: true,
  cadre: true,
  clientReference: true,
  startedAt: true,
  endedAt: true,
  arrivedAt: true,
  coolerTemperature: true,
  notes: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  receivedAt: true,
} as const;

export const SERIE_FIELD_SELECT = {
  ...SERIE_COMMON,
  samples: { select: LINE_COMMON, orderBy: { lineNumber: "asc" as const } },
} as const;

export const SERIE_LAB_SELECT = {
  ...SERIE_COMMON,
  receivedBy: { select: { id: true, name: true } },
  samples: {
    select: {
      ...LINE_COMMON,
      controlCode: true,
      receptionTemperature: true,
      conformity: true,
      conformityNote: true,
      technician: { select: { id: true, name: true } },
    },
    orderBy: { lineNumber: "asc" as const },
  },
} as const;

export function serieSelectFor(role: Role) {
  return role === "PRELEVEUR" ? SERIE_FIELD_SELECT : SERIE_LAB_SELECT;
}

type Numeric = { toString(): string } | number | null | undefined;
const num = (v: Numeric) => (v === null || v === undefined ? null : Number(v));

/**
 * JSON-ready shape: Decimal quantities become numbers, and the derived
 * status and progress travel with the série so screens never recompute them.
 */
export function serializeSerie<T extends { samples: { status: string; quantity?: Numeric }[] }>(
  serie: T,
  status: SerieStatus
) {
  const { samples, ...rest } = serie;
  return {
    ...rest,
    status,
    progress: serieProgress(samples as unknown as { status: never }[]),
    samples: samples.map((s) => ({ ...s, quantity: num(s.quantity) })),
  } as Omit<T, "samples"> & {
    status: SerieStatus;
    progress: SerieProgress;
    samples: (Omit<T["samples"][number], "quantity"> & { quantity: number | null })[];
  };
}
