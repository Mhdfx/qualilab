import type { Family, OnssaDomain, SampleType } from "@/generated/prisma/enums";

/**
 * The ONSSA monthly activity report's canevas (RETOUR-LABO-28-10.md §3.2,
 * lot 3E) — the fixed part: the 23 microbiology columns of the feuille
 * « II-AT » extract the laboratory sent on 28/10, in their order, each with
 * the method printed under it, plus « chimie alimentaires ». Pure and
 * client-safe: the admin screen, the report and the tests read the same list.
 *
 * `header` and `method` are the canevas' own words (trailing spaces
 * trimmed, its spelling kept: the export is pasted into their file); `label`
 * is what our screens show. `sibling` ties the columns one germ shares,
 * told apart by the method only (yeasts and moulds: NM 08.0.123, NM ISO
 * 21527-1, NM ISO 21527-2): a parameter mapped to one of them is counted in
 * the sibling whose method is the norm its result was read under
 * (`resolveOnssaColumn`).
 */

export type OnssaColumnKey =
  | "BACILLUS_CEREUS"
  | "LACTIQUES_30"
  | "SULFITO_REDUCTEURS"
  | "CLOSTRIDIUM_PERFRINGENS"
  | "COLIFORMES_FECAUX"
  | "COLIFORMES_30"
  | "ENTEROBACTERIES"
  | "ESCHERICHIA_COLI_44"
  | "LEVURES_25"
  | "LEVURES_1"
  | "LEVURES_2"
  | "LISTERIA_MONOCYTOGENES"
  | "MICRO_ORGANISMES_30"
  | "MOISISSURES_25"
  | "MOISISSURES_1"
  | "MOISISSURES_2"
  | "SALMONELLA"
  | "STAPHYLOCOQUES_37"
  | "ENTEROCOQUES_INTESTINAUX"
  | "MOR_22"
  | "MOR_36"
  | "PSEUDOMONAS"
  | "CLOSTRIDIA"
  | "CHIMIE_ALIMENTAIRE";

export type OnssaColumn = {
  key: OnssaColumnKey;
  /** The canevas' header (row 6), as written there. */
  header: string;
  /** The canevas' method (row 7); empty for « chimie alimentaires ». */
  method: string;
  /** Our screens' wording. */
  label: string;
  /** Microbiology (C → Y) or the chemistry column (Z). */
  kind: "MICRO" | "CHIMIE";
  /** Columns one germ shares, told apart by the method. */
  sibling?: "LEVURES" | "MOISISSURES";
};

export const ONSSA_COLUMNS: readonly OnssaColumn[] = [
  { key: "BACILLUS_CEREUS", header: "Bacillus cereus", method: "NM ISO 7932 2021", label: "Bacillus cereus", kind: "MICRO" },
  {
    key: "LACTIQUES_30",
    header: "bactéries lactiques mésophiles à 30°C",
    method: "NM 15214 2007",
    label: "Bactéries lactiques mésophiles à 30 °C",
    kind: "MICRO",
  },
  {
    key: "SULFITO_REDUCTEURS",
    header: "bactéries sulfito-réducteurs",
    method: "NM ISO 15213 2007",
    label: "Bactéries sulfito-réductrices",
    kind: "MICRO",
  },
  {
    key: "CLOSTRIDIUM_PERFRINGENS",
    header: "Clostridium perfringens",
    method: "NM 08 0 111 2003",
    label: "Clostridium perfringens",
    kind: "MICRO",
  },
  { key: "COLIFORMES_FECAUX", header: "Coliformes Fécaux", method: "NM 08-0-124 - 2012", label: "Coliformes fécaux", kind: "MICRO" },
  { key: "COLIFORMES_30", header: "Coliformes à 30°C", method: "NM ISO 4832 2008", label: "Coliformes à 30 °C", kind: "MICRO" },
  { key: "ENTEROBACTERIES", header: "Entérobacteries", method: "NM 08 0  109 2012", label: "Entérobactéries", kind: "MICRO" },
  {
    key: "ESCHERICHIA_COLI_44",
    header: "Essherichia coli à 44°C",
    method: "NM ISO 16649-2 2007",
    label: "Escherichia coli à 44 °C",
    kind: "MICRO",
  },
  {
    key: "LEVURES_25",
    header: "Levure à 25°C",
    method: "NM 08 0 123 2006",
    label: "Levures à 25 °C (NM 08.0.123)",
    kind: "MICRO",
    sibling: "LEVURES",
  },
  {
    key: "LEVURES_1",
    header: "Levure 1",
    method: "NM ISO 21527-1 2012",
    label: "Levures (NM ISO 21527-1)",
    kind: "MICRO",
    sibling: "LEVURES",
  },
  {
    key: "LEVURES_2",
    header: "Levure - 2",
    method: "NM ISO 21527-2 2012",
    label: "Levures (NM ISO 21527-2)",
    kind: "MICRO",
    sibling: "LEVURES",
  },
  {
    key: "LISTERIA_MONOCYTOGENES",
    header: "Listeria monocytogènes",
    method: "NM ISO 11290-1 2017",
    label: "Listeria monocytogenes",
    kind: "MICRO",
  },
  {
    key: "MICRO_ORGANISMES_30",
    header: "Micro-organismes à 30°C",
    method: "NM ISO 4833",
    label: "Micro-organismes à 30 °C",
    kind: "MICRO",
  },
  {
    key: "MOISISSURES_25",
    header: "Moisissure à 25°C",
    method: "NM 08 0 123 2006",
    label: "Moisissures à 25 °C (NM 08.0.123)",
    kind: "MICRO",
    sibling: "MOISISSURES",
  },
  {
    key: "MOISISSURES_1",
    header: "Moisissure-1",
    method: "NM ISO 21527-1 2012",
    label: "Moisissures (NM ISO 21527-1)",
    kind: "MICRO",
    sibling: "MOISISSURES",
  },
  {
    key: "MOISISSURES_2",
    header: "Moisissure-2",
    method: "NM ISO 21527-2 2012",
    label: "Moisissures (NM ISO 21527-2)",
    kind: "MICRO",
    sibling: "MOISISSURES",
  },
  { key: "SALMONELLA", header: "Recherche Salmonella", method: "NM ISO 6579-1 2021", label: "Recherche de Salmonella", kind: "MICRO" },
  {
    key: "STAPHYLOCOQUES_37",
    header: "staphylococcus à 37°C",
    method: "NM ISO 6888-1 2022 NM 03-7-036 2019",
    label: "Staphylocoques à 37 °C",
    kind: "MICRO",
  },
  {
    key: "ENTEROCOQUES_INTESTINAUX",
    header: "Entérocoques intéstinaux",
    method: "NM ISO 7899-2 2007",
    label: "Entérocoques intestinaux",
    kind: "MICRO",
  },
  { key: "MOR_22", header: "Mor 22°C", method: "NM ISO 6222 2007", label: "Micro-organismes revivifiables à 22 °C", kind: "MICRO" },
  { key: "MOR_36", header: "Mor 36°C", method: "NM ISO 6222 2007", label: "Micro-organismes revivifiables à 36 °C", kind: "MICRO" },
  { key: "PSEUDOMONAS", header: "Pseudomonas", method: "NM ISO 16266 2012", label: "Pseudomonas aeruginosa", kind: "MICRO" },
  { key: "CLOSTRIDIA", header: "Clostridia", method: "NM ISO 6461-2 2007", label: "Clostridia (spores d'anaérobies sulfito-réducteurs)", kind: "MICRO" },
  { key: "CHIMIE_ALIMENTAIRE", header: "chimie alimentaires", method: "", label: "Chimie alimentaire", kind: "CHIMIE" },
];

const BY_KEY = new Map<string, OnssaColumn>(ONSSA_COLUMNS.map((column) => [column.key, column]));

export function isOnssaColumnKey(value: unknown): value is OnssaColumnKey {
  return typeof value === "string" && BY_KEY.has(value);
}

export function onssaColumn(key: string | null | undefined): OnssaColumn | null {
  return key ? (BY_KEY.get(key) ?? null) : null;
}

/** « NM ISO 21527-1 2012 », « NM ISO 21527-1:2012 », « nm iso 21527 - 1 » → « NMISO2152712012 »… */
export function normKey(text: string | null | undefined): string {
  return (text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The column a result is counted in: the parameter's column, or — for a
 * germ several columns share (yeasts, moulds) — the one sibling whose method
 * starts with the norm the result was read under. A norm unknown, absent or
 * matching more than one sibling (« NM ISO 21527 » without its part) keeps
 * the parameter's own column.
 */
export function resolveOnssaColumn(
  parameterColumn: string | null | undefined,
  normCode: string | null | undefined
): OnssaColumnKey | null {
  const column = onssaColumn(parameterColumn);
  if (!column) return null;
  const norm = normKey(normCode);
  if (!column.sibling || !norm) return column.key;
  const matches = ONSSA_COLUMNS.filter(
    (other) => other.sibling === column.sibling && normKey(other.method).startsWith(norm)
  );
  return matches.length === 1 ? matches[0].key : column.key;
}

// ---- Proposals by name / alias (N2: « préremplis par nom / alias ») ---------

/** Lower case, no accent, single spaces — the matching text of a name or alias. */
export function matchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[°º]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One rule per microbiology column, tried on the name and every alias.
 * Ordered: the revivifiable micro-organisms of water before the food's
 * mesophilic flora, Clostridium perfringens before the sulfite-reducers.
 */
const RULES: readonly { key: OnssaColumnKey; test: RegExp }[] = [
  { key: "BACILLUS_CEREUS", test: /bacillus cereus/ },
  { key: "LACTIQUES_30", test: /lactique/ },
  { key: "CLOSTRIDIUM_PERFRINGENS", test: /perfringens/ },
  { key: "CLOSTRIDIA", test: /clostridia\b|spores? d.?anaerobies/ },
  { key: "SULFITO_REDUCTEURS", test: /sulfito/ },
  { key: "COLIFORMES_FECAUX", test: /coliformes? (fecaux|thermo)/ },
  { key: "COLIFORMES_30", test: /coliformes?( totaux| a 30| 30)/ },
  { key: "ENTEROBACTERIES", test: /enterobacter/ },
  { key: "ESCHERICHIA_COLI_44", test: /\be\.? ?coli\b|escherichia/ },
  { key: "LISTERIA_MONOCYTOGENES", test: /listeria(?! spp)/ },
  { key: "MOR_22", test: /(revivifiable|\bmor\b).*\b22\b/ },
  { key: "MOR_36", test: /(revivifiable|\bmor\b).*\b3[67]\b/ },
  { key: "MICRO_ORGANISMES_30", test: /micro-? ?organismes?( aerobies)?( a)? 30|flore (aerobie )?mesophile|flore totale|\bfmat\b|germes aerobies/ },
  { key: "SALMONELLA", test: /salmonell/ },
  { key: "STAPHYLOCOQUES_37", test: /staphylo/ },
  { key: "ENTEROCOQUES_INTESTINAUX", test: /enterocoque|streptocoques? fecaux/ },
  { key: "PSEUDOMONAS", test: /pseudomonas/ },
  { key: "LEVURES_25", test: /levure/ },
  { key: "MOISISSURES_25", test: /moisissure/ },
];

/**
 * The canevas' water columns (NM ISO 6222, 16266, 6461-2, 7899-2): a water
 * parameter is proposed one of them only — the other columns carry a food
 * method (« Flore totale » of a water is not the food's NM ISO 4833).
 */
const WATER_COLUMNS: ReadonlySet<OnssaColumnKey> = new Set([
  "MOR_22",
  "MOR_36",
  "PSEUDOMONAS",
  "CLOSTRIDIA",
  "ENTEROCOQUES_INTESTINAUX",
]);

/** A ratio, or two germs joined by « / » (« Flore totale/Flore lactique »): not one count. */
function isCombination(text: string): boolean {
  if (/\bratio\b|\brapport\b/.test(text)) return true;
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 && parts.filter((part) => RULES.some((rule) => rule.test.test(part))).length > 1;
}

export type ParameterToMatch = {
  name: string;
  aliases?: string | null;
  family: Family;
  category: SampleType;
};

/**
 * The column proposed for a parameter from its name and aliases, or null.
 * Chemistry: every CHIMIE parameter of the food category goes to « chimie
 * alimentaires » (the canevas has no water chemistry column: left to the
 * administrator). A microbiology name matching two different columns
 * (« Levures et moisissures »), a ratio or two germs joined by « / »
 * propose nothing; a water parameter is proposed a water column only
 * (`WATER_COLUMNS`): the administrator decides the rest.
 */
export function proposeOnssaColumn(parameter: ParameterToMatch): OnssaColumnKey | null {
  if (parameter.family === "CHIMIE") return parameter.category === "ALIMENTAIRE" ? "CHIMIE_ALIMENTAIRE" : null;
  if (parameter.family !== "MICRO") return null;
  const texts = [parameter.name, ...(parameter.aliases ?? "").split(/\r?\n/)]
    .map((text) => matchText(text))
    .filter(Boolean);
  const found = new Set<OnssaColumnKey>();
  for (const text of texts) {
    const rule = RULES.find((candidate) => candidate.test.test(text));
    if (rule) found.add(rule.key);
  }
  // « Levures et moisissures » matches the yeasts only through the first
  // rule found: test it on both germs explicitly.
  if (texts.some((text) => /levure/.test(text) && /moisissure/.test(text))) return null;
  if (texts.some(isCombination)) return null;
  if (found.size !== 1) return null;
  const [key] = found;
  if (parameter.category === "EAU" && !WATER_COLUMNS.has(key)) return null;
  return key;
}

// ---- The product groups (the laboratory's list is asked: R-22) ---------------

export const ONSSA_DOMAIN_LABELS: Record<OnssaDomain, string> = {
  ALIMENTAIRE: "Microbiologie alimentaire",
  EAU: "Microbiologie des eaux",
};

/**
 * The list proposed until the laboratory sends its own (hypothèse, à
 * confirmer par R-22): created in one click on /admin/onssa, then renamed,
 * reordered or archived there.
 */
export const PROPOSED_ONSSA_GROUPS: readonly { name: string; domain: OnssaDomain }[] = [
  { name: "Lait et produits laitiers", domain: "ALIMENTAIRE" },
  { name: "Viandes et produits carnés", domain: "ALIMENTAIRE" },
  { name: "Volailles et ovoproduits", domain: "ALIMENTAIRE" },
  { name: "Produits de la pêche", domain: "ALIMENTAIRE" },
  { name: "Plats cuisinés et restauration", domain: "ALIMENTAIRE" },
  { name: "Pâtisserie et produits sucrés", domain: "ALIMENTAIRE" },
  { name: "Fruits, légumes et produits végétaux", domain: "ALIMENTAIRE" },
  { name: "Autres denrées alimentaires", domain: "ALIMENTAIRE" },
  { name: "Eaux", domain: "EAU" },
];

export const ONSSA_GROUP_NAME_MAX = 120;
