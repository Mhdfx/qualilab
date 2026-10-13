import type { Family, LineKind, SerieKind, StorageClass, TemperatureSource } from "@/generated/prisma/enums";
import { formatDateOnly, isoDayOf } from "./date-only";
import { STORAGE_CLASS_LABELS, TEMPERATURE_SOURCE_LABELS, formatDecimal } from "./labels";
import { labDayOf } from "./lab-time";
import type { ChecklistRow, ChecklistStatus } from "./reception-rules";

/**
 * The contrôles complémentaires of the reception — the checks the
 * laboratory runs on top of the eight rules of the paper bon de réception
 * (PG05/EN04), coded C1 … C7 so they never read as the paper's (1) … (8).
 *
 * Pure: the screens run it live while the réceptionniste ticks, the APIs run
 * it again before writing, the programme sheet recomputes it. Each check
 * either is ticked by the réceptionniste (Oui / Non) or is computed from
 * what the série and the sample carry. The rows are `ChecklistRow`s that
 * carry a `code`: the screens list them after the paper's eight rules, in a
 * group of their own, and `proposedConformity` reads them after the paper's,
 * so a paper rule keeps the priority.
 *
 * C4 (the water bottle) is the hint of C3 on a water sample; C6 (the signed
 * protocol) is a série-level check, not a sample row (`signedProtocolRow`):
 * it never enters a sample's `proposedConformity`.
 */

export type ComplementaryKey = "DELAI" | "TRANSPORT_TEMP" | "EMBALLAGE" | "IDENTIFICATION" | "DLC";

export type ComplementaryCode = "C1" | "C2" | "C3" | "C5" | "C7";

export type ComplementaryCheck = {
  key: ComplementaryKey;
  code: ComplementaryCode;
  /** The number of the code — the row's `n`. */
  n: number;
  /** The wording, lower case as the rows print it after the code. */
  text: string;
  /** TICK: the réceptionniste answers Oui / Non; COMPUTED: read from the data. */
  mode: "TICK" | "COMPUTED";
  /** The kinds of sample it concerns; every kind when absent. */
  kinds?: readonly LineKind[];
};

/** The registry, in code order — the order the rows are listed in. */
export const COMPLEMENTARY_CHECKS: readonly ComplementaryCheck[] = [
  { key: "DELAI", code: "C1", n: 1, text: "délai prélèvement → laboratoire", mode: "COMPUTED" },
  { key: "TRANSPORT_TEMP", code: "C2", n: 2, text: "température de transport", mode: "COMPUTED" },
  { key: "EMBALLAGE", code: "C3", n: 3, text: "emballage / contenant intact, fermé et adapté", mode: "TICK" },
  {
    key: "IDENTIFICATION",
    code: "C5",
    n: 5,
    text: "identification lisible et conforme à la fiche (désignation, lot, DLC)",
    mode: "TICK",
  },
  { key: "DLC", code: "C7", n: 7, text: "DLC", mode: "COMPUTED", kinds: ["ALIMENT"] },
];

const CHECK_OF = new Map(COMPLEMENTARY_CHECKS.map((check) => [check.key, check]));

/**
 * The laboratory's limits for the computed controls, set in /admin/reglages
 * (`LabSettings`). The defaults are the plan's until the laboratory answers.
 */
export type ComplementaryThresholds = {
  /** C1 — maximum delay end of sampling → arrival, microbiology (h). */
  maxDelayMicroH: number;
  /** C1 — the same for physico-chemistry (h); null = no limit. */
  maxDelayChemH: number | null;
  /** C1 — an exceeded delay is non conforme (true) or « à vérifier » (false). */
  delayBlocking: boolean;
  /** C2 — the chilled range (°C): `coldChainMinC` … `coldChainMaxC`. */
  coldChainMinC: number;
  coldChainMaxC: number;
  /** C2 — the chilled maximum of a water sample for microbiology (°C). */
  waterMicroMaxC: number;
  /** C2 — above this a frozen sample is « à vérifier » (°C). */
  frozenMaxC: number;
};

export const DEFAULT_COMPLEMENTARY_THRESHOLDS: ComplementaryThresholds = {
  maxDelayMicroH: 24,
  maxDelayChemH: null,
  delayBlocking: false,
  coldChainMinC: 0,
  coldChainMaxC: 8,
  waterMicroMaxC: 8,
  frozenMaxC: -15,
};

/** The sample as the complementary checks read it. */
export type ComplementaryLine = {
  lineKind: LineKind;
  family: Family;
  /** C2 — the temperature at arrival (°C), as rule (6) reads it; absent = none. */
  receptionTemperature?: number | null;
  /** C2 — the class chosen at reception; null or absent = the kind's default. */
  storageClass?: StorageClass | null;
  /** C2 — where the temperature was read; null or absent = unknown. */
  temperatureSource?: TemperatureSource | null;
  /** C7 — the DLC, a calendar date (`@db.Date`, UTC midnight); null or absent = none given. */
  expiryDate?: Date | null;
};

/** The série's times, as C1 reads them, and the reception instant (C1, C7). */
export type ComplementarySerie = {
  /** Null: the payload does not carry the série's times (C1 is then not computed). */
  startedAt: Date | null;
  endedAt: Date | null;
  /**
   * The arrival at the laboratory: as typed at reception, else the série's.
   * Null: not given — the reception instant (`receivedAt`) stands for it.
   */
  arrivedAt: Date | null;
  /** False on a deposit whose sampling time was not given; null or absent otherwise. */
  samplingTimeDeclared?: boolean | null;
  /**
   * The reception instant — now while the sample is being received. Null
   * only on a screen not mounted yet (no clock): the rows that need it wait.
   */
  receivedAt: Date | null;
};

/** The réceptionniste's ticks; null = not answered yet. */
export type ComplementaryAnswers = {
  packagingOk: boolean | null;
  identificationOk: boolean | null;
};

/**
 * C3's hint — what « intact, fermé et adapté » means for this kind of
 * sample. On a water sample for microbiology it is C4, the sterile bottle.
 */
export function packagingHint(lineKind: LineKind, family: Family): string {
  switch (lineKind) {
    case "ALIMENT":
      return "Emballage d'origine fermé ou sachet stérile";
    case "SURFACE":
    case "MAINS":
      return "Écouvillon dans son tube avec diluant, non desséché";
    case "AIR":
      return "Boîte fermée, gélose intacte";
    case "EAU":
      return family === "MICRO"
        ? "C4 : flacon stérile ; au thiosulfate si eau traitée (chlorée)"
        : "Flacon adapté";
    default:
      return "Contenant fermé et adapté à l'analyse";
  }
}

/** C5's hint: what is compared with the fiche, and what to do when it does not match. */
export function identificationHint(lineKind: LineKind, answer: boolean | null): string {
  if (answer === false) return "Corriger la fiche avant de valider";
  return lineKind === "ALIMENT"
    ? "Désignation, lot et DLC lus sur l'échantillon, comparés à la fiche"
    : "Désignation lue sur l'échantillon, comparée à la fiche";
}

// ---- C1 — délai prélèvement → laboratoire ----------------------------------------

/** Whole minutes from the end of the sampling to the arrival; never negative. */
export function delayMinutes(sampledEnd: Date, arrival: Date): number {
  return Math.max(0, Math.floor((arrival.getTime() - sampledEnd.getTime()) / 60000));
}

/** « 3 h 30 », « 27 h », « 3 h 05 », « 45 min ». */
export function formatDelay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** The limit of a family (h): microbiology, physico-chemistry; none for another family. */
export function delayLimitHours(family: Family, thresholds: ComplementaryThresholds): number | null {
  if (family === "MICRO") return thresholds.maxDelayMicroH;
  if (family === "CHIMIE") return thresholds.maxDelayChemH;
  return null;
}

/**
 * The delay of a série, end of the sampling (its start without an end) →
 * arrival (the reception instant without one); null when neither is known.
 */
export function serieDelayMinutes(serie: ComplementarySerie): number | null {
  const arrival = serie.arrivedAt ?? serie.receivedAt;
  const sampledEnd = serie.endedAt ?? serie.startedAt;
  return arrival && sampledEnd ? delayMinutes(sampledEnd, arrival) : null;
}

function delayRow(line: ComplementaryLine, serie: ComplementarySerie | null, thresholds: ComplementaryThresholds): ChecklistRow {
  const limit = delayLimitHours(line.family, thresholds);
  const row = (status: ChecklistStatus, detail: string, judged = true): ChecklistRow => ({
    ...base("DELAI"),
    status,
    detail,
    ...(status === "A_VERIFIER" || status === "NON_CONFORME" ? { reason: "DELAI" as const } : {}),
    rules: judged ? ["DELAI"] : [],
  });
  if (limit === null) return row("SANS_OBJET", "Pas de délai fixé", false);
  if (serie === null || serie.startedAt === null) return row("SANS_OBJET", "Délai non calculé", false);
  if (serie.samplingTimeDeclared === false) return row("A_VERIFIER", "Heure de prélèvement non déclarée");
  const minutes = serieDelayMinutes(serie);
  if (minutes === null) return row("SANS_OBJET", "Arrivée au laboratoire non renseignée", false);
  if (minutes <= limit * 60) return row("CONFORME", `Délai ${formatDelay(minutes)}`);
  return row(thresholds.delayBlocking ? "NON_CONFORME" : "A_VERIFIER", `Délai ${formatDelay(minutes)} > ${limit} h`);
}

// ---- C2 — température de transport ---------------------------------------------

/** The classes and sources both APIs accept — derived from their labels, never listed twice. */
export const STORAGE_CLASSES = Object.keys(STORAGE_CLASS_LABELS) as StorageClass[];
export const TEMPERATURE_SOURCES = Object.keys(TEMPERATURE_SOURCE_LABELS) as TemperatureSource[];

/**
 * « Ambiant » as the « Conservation » select offers it on a food: a stable
 * food — the one whose temperature at arrival rule (6) does not require
 * (the laboratory's answer of 12/10, `isStableFood` in reception-rules.ts).
 */
export const STABLE_FOOD_STORAGE_LABEL = "Ambiant — aliment stable (conserve, sec, UHT…)";

/**
 * The wording of a class in the « Conservation » select: on a food,
 * « Ambiant » says what choosing it means; elsewhere the class's label.
 */
export function storageClassOptionLabel(storage: StorageClass, lineKind: LineKind | null): string {
  return storage === "AMBIANT" && lineKind === "ALIMENT" ? STABLE_FOOD_STORAGE_LABEL : STORAGE_CLASS_LABELS[storage];
}

/**
 * A class or a source as a request sends it: absent, null or "" → null (an
 * older page, or « par défaut »); a known value → itself; anything else →
 * "invalid".
 */
export function parseChoice<T extends string>(value: unknown, allowed: readonly T[]): T | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : "invalid";
}

/**
 * The class a sample travels in when the reception does not say otherwise:
 * chilled for food, swabs (surfaces, hands) and water for microbiology;
 * none for air, water for physico-chemistry and other samples.
 */
export function defaultStorageClass(lineKind: LineKind, family: Family): StorageClass | null {
  if (lineKind === "ALIMENT" || lineKind === "SURFACE" || lineKind === "MAINS") return "REFRIGERE";
  if (lineKind === "EAU" && family === "MICRO") return "REFRIGERE";
  return null;
}

/** « (glacière) », « (mesurée sur l'échantillon) », « (flacon témoin) » — after a temperature. */
export function temperatureSourceSuffix(source: TemperatureSource | null | undefined): string {
  switch (source) {
    case "GLACIERE":
      return " (glacière)";
    case "ECHANTILLON":
      return " (mesurée sur l'échantillon)";
    case "FLACON_TEMOIN":
      return " (flacon témoin)";
    default:
      return "";
  }
}

/** The chilled range of a sample (°C): water for microbiology has its own maximum. */
export function chilledRange(line: Pick<ComplementaryLine, "lineKind" | "family">, thresholds: ComplementaryThresholds) {
  const max = line.lineKind === "EAU" && line.family === "MICRO" ? thresholds.waterMicroMaxC : thresholds.coldChainMaxC;
  return { min: thresholds.coldChainMinC, max };
}

/** « sans objet » — the kinds and families that travel without a class. */
function noClassNoun(line: ComplementaryLine): string {
  if (line.lineKind === "EAU") return "eau (physico-chimie)";
  if (line.lineKind === "AIR") return "air";
  return "autre prélèvement";
}

const celsius = (value: number) => `${formatDecimal(value)} °C`;

/**
 * C2: the temperature at arrival against the class's range. Never a
 * refusal: out of range is « à vérifier » with the motif CHAINE_FROID — a
 * product served hot, a frozen sample thawing: the réceptionniste decides.
 */
function transportRow(line: ComplementaryLine, thresholds: ComplementaryThresholds): ChecklistRow {
  const storage = line.storageClass ?? defaultStorageClass(line.lineKind, line.family);
  const temperature = line.receptionTemperature ?? null;
  const suffix = temperatureSourceSuffix(line.temperatureSource);
  const row = (status: ChecklistStatus, detail: string, judged = true): ChecklistRow => ({
    ...base("TRANSPORT_TEMP"),
    status,
    detail,
    ...(status === "A_VERIFIER" ? { reason: "CHAINE_FROID" as const } : {}),
    rules: judged ? ["CHAINE_FROID"] : [],
  });
  if (storage === null) return row("SANS_OBJET", `Sans objet : ${noClassNoun(line)}`, false);
  if (storage === "AMBIANT") return row("SANS_OBJET", "Transporté à température ambiante", false);
  if (storage === "CHAUD") return row("SANS_OBJET", "Transporté chaud", false);
  if (temperature === null) return row("SANS_OBJET", "Pas de température relevée", false);
  if (storage === "CONGELE") {
    return temperature <= thresholds.frozenMaxC
      ? row("CONFORME", `${celsius(temperature)}, congelé ≤ ${celsius(thresholds.frozenMaxC)}${suffix}`)
      : row(
          "A_VERIFIER",
          `${celsius(temperature)}, au-dessus de ${celsius(thresholds.frozenMaxC)} pour un congelé — vérifier la chaîne du froid${suffix}`
        );
  }
  const { min, max } = chilledRange(line, thresholds);
  return temperature >= min && temperature <= max
    ? row("CONFORME", `${celsius(temperature)}, réfrigéré entre ${formatDecimal(min)} et ${celsius(max)}${suffix}`)
    : row(
        "A_VERIFIER",
        `${celsius(temperature)}, hors de la plage réfrigérée ${formatDecimal(min)} à ${celsius(max)} — vérifier la chaîne du froid${suffix}`
      );
}

// ---- C7 — DLC ----------------------------------------------------------------------

/** The laboratory's calendar day of an instant (`lab-time.ts`), re-exported for the C7 callers. */
export { labDayOf };

/**
 * C7, food only: the DLC against the day of reception — calendar days, the
 * DLC read from its stored UTC day (date-only.ts), the reception from the
 * laboratory's clock. Past its DLC a sample is « à vérifier », never
 * refused: end-of-shelf-life tests must stay possible. The motif at hand is
 * AUTRE, the précision « DLC dépassée le … » (`expiredDlcNote`).
 */
function dlcRow(line: ComplementaryLine, serie: ComplementarySerie | null): ChecklistRow {
  const expiry = line.expiryDate ?? null;
  const row = (status: ChecklistStatus, detail: string, judged = true): ChecklistRow => ({
    ...base("DLC"),
    status,
    detail,
    ...(status === "A_VERIFIER" ? { reason: "AUTRE" as const } : {}),
    rules: judged ? ["DLC"] : [],
  });
  if (!expiry) return row("SANS_OBJET", "DLC non indiquée", false);
  const reception = serie?.receivedAt ?? null;
  // No clock yet (a screen before hydration): the date, unjudged.
  if (!reception) return row("SANS_OBJET", `DLC ${formatDateOnly(expiry)}`, false);
  return isoDayOf(expiry) < labDayOf(reception)
    ? row("A_VERIFIER", `DLC dépassée le ${formatDateOnly(expiry)}`)
    : row("CONFORME", `DLC ${formatDateOnly(expiry)}`);
}

/**
 * The précision the form pre-fills when such a sample is marked non
 * conforme under the motif AUTRE: « DLC dépassée le 09/10/2026 »; null when
 * the DLC is not passed.
 */
export function expiredDlcNote(rows: readonly ChecklistRow[]): string | null {
  const dlc = rows.find((row) => row.key === "DLC" && row.status === "A_VERIFIER");
  return dlc?.detail ?? null;
}

// ---- the rows ------------------------------------------------------------------

function base(key: ComplementaryKey): Pick<ChecklistRow, "n" | "key" | "code" | "text"> {
  const check = CHECK_OF.get(key)!;
  return { n: check.n, key: check.key, code: check.code, text: check.text };
}

/** A ticked row: unanswered → « à confirmer », Non → non conforme with its motif. */
function tickedRow(
  key: "EMBALLAGE" | "IDENTIFICATION",
  answer: boolean | null,
  detail: string
): ChecklistRow {
  const status = answer === null ? "A_CONFIRMER" : answer ? "CONFORME" : "NON_CONFORME";
  return {
    ...base(key),
    status,
    detail,
    ...(answer === false ? { reason: key } : {}),
    rules: [key],
  };
}

/**
 * The contrôles complémentaires of one sample, in code order. Every row of
 * a kind is always listed — a computed check that does not concern the
 * sample says « sans objet » — so the two samples of a two-family line
 * line up row by row. `serie` null: the times are not known yet (a screen
 * before its clock) — the computed rows wait, « sans objet ».
 */
export function complementaryChecklist(
  line: ComplementaryLine,
  serie: ComplementarySerie | null,
  thresholds: ComplementaryThresholds,
  answers: ComplementaryAnswers
): ChecklistRow[] {
  const build: Record<ComplementaryKey, () => ChecklistRow> = {
    DELAI: () => delayRow(line, serie, thresholds),
    TRANSPORT_TEMP: () => transportRow(line, thresholds),
    EMBALLAGE: () => tickedRow("EMBALLAGE", answers.packagingOk, packagingHint(line.lineKind, line.family)),
    IDENTIFICATION: () =>
      tickedRow("IDENTIFICATION", answers.identificationOk, identificationHint(line.lineKind, answers.identificationOk)),
    DLC: () => dlcRow(line, serie),
  };
  // The registry decides the kinds a check concerns: C7 is food only, the
  // other kinds get no row at all.
  return COMPLEMENTARY_CHECKS.filter((check) => !check.kinds || check.kinds.includes(line.lineKind)).map((check) =>
    build[check.key]()
  );
}

// ---- C6 — documents : protocole signé (série, visite) -------------------------------

/** C6 as the screens print it: « C6 Documents : protocole signé par l'interlocuteur ». */
export const SIGNED_PROTOCOL_CHECK = {
  code: "C6",
  n: 6,
  text: "documents : protocole signé par l'interlocuteur",
} as const;

/** The série's C6 row — a row of its own, above the samples, never a sample's. */
export type SignedProtocolRow = {
  code: "C6";
  n: 6;
  text: string;
  status: ChecklistStatus;
  detail: string;
};

/**
 * C6, a visit only: the protocol signed by the interlocutor came back. A
 * photo attached by the préleveur answers it (CONFORME). Without one, the
 * réceptionniste may tick « Protocole papier signé reçu »: Oui is CONFORME,
 * Non is « à vérifier » — amber, never a refusal, never a sample's motif —
 * and no answer stays « à confirmer », optional.
 */
export function signedProtocolRow(input: { hasPhoto: boolean; received: boolean | null }): SignedProtocolRow {
  const row = (status: ChecklistStatus, detail: string): SignedProtocolRow => ({ ...SIGNED_PROTOCOL_CHECK, status, detail });
  if (input.hasPhoto) return row("CONFORME", "Photo jointe");
  if (input.received === true) return row("CONFORME", "Protocole papier signé reçu");
  if (input.received === false) return row("A_VERIFIER", "Protocole signé non reçu : à réclamer à l'interlocuteur");
  return row("A_CONFIRMER", "Pas de photo jointe : protocole papier signé reçu ? (facultatif)");
}

/**
 * What `Serie.signedProtocolReceived` stores: the answer on a visit without
 * a photo; null with a photo (it answers), on a deposit, or with no answer.
 */
export function storedSignedProtocolAnswer(
  kind: SerieKind | null | undefined,
  hasPhoto: boolean,
  answer: boolean | null
): boolean | null {
  return kind === "VISITE" && !hasPhoto ? answer : null;
}

/**
 * The refusals of the ticked controls, worded once for the screens and both
 * APIs (prefixed « Échantillon 2 : » at reception, « Échantillon 2 — » at the
 * counter).
 */
export const COMPLEMENTARY_MESSAGES = {
  // Only a page opened before the controls (A1) sends a line without the answers.
  packagingMissing:
    "Indiquez si l'emballage est intact (rechargez la page si elle date d'avant la mise à jour).",
  identificationMissing:
    "Indiquez si l'identification est conforme à la fiche (rechargez la page si elle date d'avant la mise à jour).",
} as const;

/**
 * « Contrôle C3 « Emballage / contenant intact, fermé et adapté » non
 * conforme — … L'échantillon ne peut pas être déclaré conforme. »
 */
export function complementaryRefusal(row: Pick<ChecklistRow, "code" | "text" | "detail">): string {
  const text = row.text.charAt(0).toLocaleUpperCase("fr") + row.text.slice(1);
  // « Corriger la fiche » → « corriger la fiche », but a code or an acronym
  // keeps its capitals: « C4 : flacon stérile … », « DLC … ».
  const lowerFirst = (value: string) =>
    /^\p{Lu}\p{Ll}/u.test(value) ? `${value.charAt(0).toLocaleLowerCase("fr")}${value.slice(1)}` : value;
  const detail = row.detail ? ` — ${lowerFirst(row.detail)}` : "";
  return `Contrôle ${row.code} « ${text} » non conforme${detail}. L'échantillon ne peut pas être déclaré conforme.`;
}
