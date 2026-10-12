/**
 * Reading the values a microbiology technician actually writes.
 *
 * The laboratory notes counts the way they appear on the bench sheet:
 * `8,9.10²`, `3.10²`, `1,5 x 10^4`, `< 10`, `Absence`, and for a plate too
 * crowded to count `> 3.10⁵` or `Indénombrable` / `TNTC`. A contamination
 * alert has to compare those against a limit, so every entry is kept twice —
 * exactly as typed (for the report) and parsed to a number (for the
 * comparison).
 *
 * Anything we cannot read is never guessed: `numeric` is null and the
 * technician decides conformity themselves.
 */

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-",
};

const ABSENCE = /^(absence|absent|abs|néant|neant|nd|non\s*d[ée]tect[ée]?)\b/i;

/** « Indénombrable », « Incomptable », « TNTC », once folded by `isUncountableText`. */
const UNCOUNTABLE = /^(indenombrable|incomptable|tntc)s?$/;

/**
 * A plate too crowded to count: « Indénombrable », « indenombrable »,
 * « Incomptable », « TNTC » (« T.N.T.C. »). Case and accents do not matter.
 */
export function isUncountableText(raw: string | null | undefined): boolean {
  const word = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.\s]/g, "");
  return UNCOUNTABLE.test(word);
}

export type ParsedValue = {
  /**
   * Numeric reading, or null when the entry cannot be read as a number.
   * For « > x » it is x — a lower bound, never the count itself.
   */
  numeric: number | null;
  /**
   * How the entry was understood — used to explain the result in the UI.
   * `above` = « > x » (more than x); `uncountable` = « Indénombrable »,
   * above any limit, with no number.
   */
  kind: "number" | "absence" | "below" | "above" | "uncountable" | "unreadable";
};

export function parseLabValue(raw: string): ParsedValue {
  const input = raw?.trim();
  if (!input) return { numeric: null, kind: "unreadable" };

  if (isUncountableText(input)) return { numeric: null, kind: "uncountable" };
  if (ABSENCE.test(input)) return { numeric: 0, kind: "absence" };

  // "> 3.10⁵" — more than x: kept as x, flagged so that no comparison ever
  // takes it for an exact count (it can only prove a limit exceeded).
  const above = input.match(/^>\s*(.+)$/);
  if (above) {
    const inner = parseLabValue(above[1]);
    return inner.kind === "number" && inner.numeric !== null && inner.numeric >= 0
      ? { numeric: inner.numeric, kind: "above" }
      : { numeric: null, kind: "unreadable" };
  }

  // "< 10" — below the detection limit; counted as 0 for the comparison, but
  // flagged so the UI can say so rather than pretending it is an exact count.
  const below = input.match(/^<\s*(.+)$/);
  if (below) {
    const inner = parseLabValue(below[1]);
    return inner.numeric === null
      ? { numeric: null, kind: "unreadable" }
      : { numeric: 0, kind: "below" };
  }

  let text = input;
  for (const [sup, digit] of Object.entries(SUPERSCRIPTS)) {
    text = text.replaceAll(sup, `^${digit}`);
  }
  // "10^2^3" cannot happen, but a superscripted multi-digit exponent produces
  // "10^1^0" — collapse those back into a single exponent.
  text = text.replace(/\^(\d)\^(\d)/g, "^$1$2");
  text = text.replace(/\s+/g, "");

  // Decimal comma, as written in French.
  text = text.replace(/,/g, ".");

  // Mantissa × power of ten: "8.9.10^2", "8.9x10^2", "8.9*10^2", "8.9e2".
  const scientific = text.match(
    /^([0-9]+(?:\.[0-9]+)?)(?:[.x*×]10\^?|[eE])(-?[0-9]+)$/
  );
  if (scientific) {
    const mantissa = Number(scientific[1]);
    const exponent = Number(scientific[2]);
    const value = mantissa * 10 ** exponent;
    return Number.isFinite(value)
      ? { numeric: value, kind: "number" }
      : { numeric: null, kind: "unreadable" };
  }

  // Bare power of ten: "10^3".
  const power = text.match(/^10\^(-?[0-9]+)$/);
  if (power) return { numeric: 10 ** Number(power[1]), kind: "number" };

  const plain = text.match(/^-?[0-9]+(?:\.[0-9]+)?$/);
  if (plain) return { numeric: Number(text), kind: "number" };

  return { numeric: null, kind: "unreadable" };
}

/**
 * Applies a parameter's calculation factor (dilution…) to a parsed reading.
 * Factor 1 — today's default for every parameter — leaves the reading
 * untouched; an unreadable entry stays unreadable rather than becoming a
 * guessed number. `Absence` and `< x` count as 0, and 0 times anything is
 * still 0, so those readings survive any factor unchanged. « > x » becomes
 * « > x × factor » (still a lower bound); « Indénombrable » has no number
 * and stays as it is.
 */
export function applyCalcFactor(
  parsed: ParsedValue,
  factor: number
): ParsedValue {
  if (parsed.numeric === null) return parsed;
  if (!Number.isFinite(factor) || factor <= 0) return parsed;
  return { numeric: parsed.numeric * factor, kind: parsed.kind };
}

/**
 * Conformity suggested from the reading — a result is conform while it stays
 * at or below the parameter's limit. The bench screen applies it as it is,
 * and the server stores it (`benchConformity`): the technician decides only
 * where it returns null.
 *
 * `kind` (from `parseLabValue`) matters for the two readings that are not a
 * count: « Indénombrable » is above any limit, and « > x » is above the
 * limit when x ≥ limit — below it, it proves nothing (null: a higher
 * dilution must be read, or the technician decides).
 */
export function suggestConformity(
  numeric: number | null,
  limitValue: number | null | undefined,
  kind?: ParsedValue["kind"]
): boolean | null {
  if (limitValue === null || limitValue === undefined) return null;
  if (kind === "uncountable") return false;
  if (numeric === null) return null;
  if (kind === "above") return numeric >= limitValue ? false : null;
  return numeric <= limitValue;
}

/**
 * The conformity the server stores for a result judged against the
 * parameter's own limit (no criterion): the suggestion — computed exactly as
 * the bench screen computes it (`suggestConformity`, `suggestUnitsConformity`)
 * — and the technician's choice only where the screen asks for one, i.e.
 * when there is no suggestion. The screen never sends anything else, so a
 * current page stores what it showed; a stale or forged request can no longer
 * store « conforme », or nothing, for « Indénombrable » or a « > x » over the
 * limit — the contamination alert keys off `conform` (HANDOFF §8c, 09/09).
 */
export function benchConformity(suggested: boolean | null, chosen: unknown): boolean | null {
  return suggested ?? (typeof chosen === "boolean" ? chosen : null);
}

/**
 * The text stored for a reading a factor rewrote: the final count in the
 * lab's notation, « > » kept on a lower bound. Null when the typed text
 * stands as it is (absence, « < x », « Indénombrable », unreadable).
 */
export function factoredText(parsed: ParsedValue): string | null {
  if (parsed.numeric === null) return null;
  if (parsed.kind === "number") return formatLabValue(parsed.numeric);
  if (parsed.kind === "above") return `> ${formatLabValue(parsed.numeric)}`;
  return null;
}

/** Formats a number back into the lab's notation for display. */
export function formatLabValue(numeric: number): string {
  if (numeric === 0) return "0";
  let exponent = Math.floor(Math.log10(Math.abs(numeric)));
  if (exponent < 2) return String(numeric);

  // One decimal on the mantissa; when that rounds up to 10 (995 → 9,95 →
  // "10,0"), carry into the exponent instead of printing "10,0.10²".
  let mantissa = Math.round((numeric / 10 ** exponent) * 10) / 10;
  if (mantissa >= 10) {
    exponent += 1;
    mantissa = Math.round((numeric / 10 ** exponent) * 10) / 10;
  }
  const digits = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
  const sup = String(exponent)
    .split("")
    .map((d) => digits[Number(d)] ?? d)
    .join("");
  const shown = Number.isInteger(mantissa)
    ? String(mantissa)
    : String(mantissa).replace(".", ",");
  return `${shown}.10${sup}`;
}
