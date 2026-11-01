import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INTERNAL_NOTE_HINT, INTERNAL_NOTE_LABEL, showsNoteField } from "./result-note";
import { TIMELINE_ACTIONS } from "./sample-timeline";

/**
 * 2.20 (h), the laboratory's answer of 28/10 — « la note devient interne »
 * (RETOUR-LABO-28-10.md G2): written at the bench, read by the validator and
 * counted in the parcours, never printed on a new report.
 */

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("the note of an analysis is internal (2.20 (h), G2)", () => {
  it("the bench shows the field for an anomaly, a note already written, or after « Ajouter une note »", () => {
    expect(showsNoteField({ workStatus: "ANOMALIE", note: "" }, false)).toBe(true);
    expect(showsNoteField({ workStatus: "TERMINE", note: "Boîte contaminée, refaite" }, false)).toBe(true);
    expect(showsNoteField({ workStatus: "EN_COURS", note: "" }, true)).toBe(true);
    // Otherwise the button only.
    expect(showsNoteField({ workStatus: "EN_COURS", note: "" }, false)).toBe(false);
    expect(showsNoteField({ workStatus: "TERMINE", note: "   " }, false)).toBe(false);
  });

  it("says where it goes, in French, on the bench", () => {
    expect(INTERNAL_NOTE_LABEL).toBe("Note interne");
    expect(INTERNAL_NOTE_HINT).toMatch(/^Non imprimée sur le rapport : lue par le validateur\./);
    expect(INTERNAL_NOTE_HINT).toMatch(/conclusion\.$/);
    const form = read("../components/technicien/ResultEntryForm.tsx");
    expect(form).toMatch(/\+ Ajouter une note/);
    expect(form).toMatch(/showsNoteField\(line, notesOpened\.has\(line\.parameterId\)\)/);
  });

  it("a new report never prints it (the frozen versions keep theirs)", () => {
    const dispatch = read("./report-dispatch.ts");
    const mapping = dispatch.slice(dispatch.indexOf("results: sample.results.map((result) => ({"));
    // Gated as K1: only a version issued from now on (the aligned layout)
    // drops it; a report issued before lot 1b, rendered from the live data
    // (no layout), prints it as it did.
    expect(mapping).toMatch(/conform: result\.conform,[\s\S]{0,600}?note: aligned \? null : result\.note,/);
    expect(dispatch).toContain("const aligned = fields.layout === REPORT_LAYOUT_ALIGNED;");
    // Both issuances (first version, amendment) pass the aligned layout.
    expect(dispatch.match(/layout: REPORT_LAYOUT_ALIGNED/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // The live path of an old report passes none.
    const live = dispatch.slice(dispatch.indexOf("async function liveReportData"), dispatch.indexOf("async function liveReportData") + 900);
    expect(live).not.toContain("REPORT_LAYOUT_ALIGNED");
  });

  it("the validator reads it, said « Note interne »", () => {
    expect(read("../app/validation/[id]/page.tsx")).toMatch(/result\.workStatus === "ANOMALIE" \? "Anomalie" : "Note interne"/);
  });

  it("the parcours counts the internal notes of a submission", () => {
    const note = TIMELINE_ACTIONS.RESULTS_SUBMITTED.note!;
    expect(note({ nonConformes: 0, anomalies: 0, notes: 1 })).toBe("1 note interne");
    expect(note({ nonConformes: 1, anomalies: 0, notes: 2 })).toBe("1 résultat non conforme — 2 notes internes");
    expect(note({ nonConformes: 0, anomalies: 0 })).toBeNull();
    const submit = read("../app/api/samples/[id]/results/submit/route.ts");
    expect(submit).toMatch(/notes: results\.filter\(\(r\) => r\.workStatus !== "ANOMALIE" && \(r\.note \?\? ""\)\.trim\(\) !== ""\)\.length/);
    expect(submit).toMatch(/notes: outcome\.notes,/);
  });
});
