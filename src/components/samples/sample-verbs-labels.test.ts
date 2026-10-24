import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The dialogs of `SampleVerbs` — « Annuler » on /reception, /validation and
 * /programmation, « Réactiver », « Corriger la fiche » — name their fields:
 * every label either points at its field (`htmlFor` = the field's `id`) or
 * wraps it. Found in the production test of 21/10: « Précision » of
 * « Annuler » was a bare label, a click on it did nothing and a screen
 * reader read the box without its name. Read from the source (a client
 * component, no DOM here).
 */

const source = readFileSync(new URL("./SampleVerbs.tsx", import.meta.url), "utf8");

type Label = { attributes: string; children: string; text: string };

/** Every `<label …>…</label>` of the file, its attributes and its content. */
function labels(): Label[] {
  return [...source.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)].map((match) => ({
    attributes: match[1],
    children: match[2],
    text: match[2].replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim(),
  }));
}

/** The target a label names: `htmlFor="x"`, htmlFor={`x-${key}`} or htmlFor={x}, as written. */
function target(attributes: string): string | null {
  const match = attributes.match(/htmlFor=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

/** Whether a field of the file carries that id, written the same way. */
function hasField(id: string): boolean {
  return source.includes(`id="${id}"`) || source.includes(`id={\`${id}\`}`) || source.includes(`id={${id}}`);
}

describe("SampleVerbs — every label names its field", () => {
  it("finds the labels of the three dialogs", () => {
    const texts = labels().map((label) => label.text);
    expect(texts).toEqual(expect.arrayContaining(["Motif *", "Précision", "Quantité", "Motif de la correction *"]));
  });

  it("each label points at an existing field, or wraps one", () => {
    for (const label of labels()) {
      const id = target(label.attributes);
      if (id === null) {
        expect(label.children, `« ${label.text} » neither points at nor wraps a field`).toMatch(/<(input|select|textarea)\b/);
      } else {
        expect(hasField(id), `« ${label.text} » points at a missing id « ${id} »`).toBe(true);
      }
    }
  });

  it("« Annuler »: « Motif » is the select, « Précision » the text box", () => {
    expect(source).toMatch(/<label htmlFor="cancel-reason"[^>]*>Motif \*<\/label>\s*<select id="cancel-reason"/);
    expect(source).toMatch(/<label htmlFor="cancel-note"[^>]*>Précision \{reason === "AUTRE" && "\*"\}<\/label>\s*<textarea id="cancel-note"/);
  });

  it("« Réactiver »: « Motif » is its text box; « Corriger la fiche »: « Quantité » its figure, the unit named", () => {
    expect(source).toMatch(/<label htmlFor="reactivate-note"[^>]*>Motif \*<\/label>\s*<textarea id="reactivate-note"/);
    expect(source).toMatch(/<input id="correct-quantity"[^\n]*\/>\s*<select aria-label="Unité de la quantité"/);
  });

  it("no id is given twice in the file (one dialog open at a time, each id once)", () => {
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
});
