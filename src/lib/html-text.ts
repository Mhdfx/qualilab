/**
 * Text going into a printed document.
 *
 * The PDFs are rendered by Chromium inside the container, whose font set is
 * deliberately small. Liberation Sans carries ¹ ² ³ (Latin-1) but not ⁴ and
 * above (Unicode "Superscripts and Subscripts"), so a threshold typed as
 * « 1.10⁴ UFC/g » silently printed as « 1.10 UFC/g » — a limit off by a
 * factor of ten thousand on a document the client keeps. Superscript digits
 * are therefore turned into real `<sup>` markup, which needs no glyph at all.
 */

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
};

const SUPERSCRIPT_RUN = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g;

/** HTML-escape a value coming from the database or from a user. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rewrites Unicode superscript runs as `<sup>` markup.
 *
 * Must run on already-escaped text: it is the only place allowed to add tags,
 * so nothing a user typed can become markup.
 */
export function withSuperscripts(escaped: string) {
  return escaped.replace(SUPERSCRIPT_RUN, (run) => {
    const digits = [...run].map((char) => SUPERSCRIPTS[char] ?? char).join("");
    return `<sup>${digits}</sup>`;
  });
}

/** Escaped, print-safe text. `null` renders as an em dash, never an empty cell. */
export function show(value: string | null | undefined) {
  return value ? withSuperscripts(escapeHtml(value)) : "—";
}

/** The CSS every printed document needs for the `<sup>` above. */
export const SUPERSCRIPT_CSS =
  "sup { font-size: 0.7em; line-height: 0; vertical-align: super; }";
