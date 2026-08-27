/**
 * Reading the values a microbiology technician actually writes.
 *
 * The laboratory notes counts the way they appear on the bench sheet:
 * `8,9.10²`, `3.10²`, `1,5 x 10^4`, `< 10`, `Absence`. A contamination alert
 * has to compare those against a limit, so every entry is kept twice — exactly
 * as typed (for the report) and parsed to a number (for the comparison).
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

export type ParsedValue = {
  /** Numeric reading, or null when the entry cannot be read as a number. */
  numeric: number | null;
  /** How the entry was understood — used to explain the result in the UI. */
  kind: "number" | "absence" | "below" | "unreadable";
};

export function parseLabValue(raw: string): ParsedValue {
  const input = raw?.trim();
  if (!input) return { numeric: null, kind: "unreadable" };

  if (ABSENCE.test(input)) return { numeric: 0, kind: "absence" };

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
 * still 0, so those readings survive any factor unchanged.
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
 * at or below the parameter's limit. It is only a suggestion: the technician
 * confirms it, because a bench judgement can override the arithmetic.
 */
export function suggestConformity(
  numeric: number | null,
  limitValue: number | null | undefined
): boolean | null {
  if (numeric === null || limitValue === null || limitValue === undefined) {
    return null;
  }
  return numeric <= limitValue;
}

/** Formats a number back into the lab's notation for display. */
export function formatLabValue(numeric: number): string {
  if (numeric === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(numeric)));
  if (exponent < 2) return String(numeric);

  const mantissa = numeric / 10 ** exponent;
  const digits = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
  const sup = String(exponent)
    .split("")
    .map((d) => digits[Number(d)] ?? d)
    .join("");
  const shown = Number.isInteger(mantissa)
    ? String(mantissa)
    : mantissa.toFixed(1).replace(".", ",");
  return `${shown}.10${sup}`;
}
