import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentRowOf, validateDocumentReferences, type DocumentRow } from "./document-reference-input";
import type { DocumentRef } from "./document-types";

/** The rows as the database returns them: `@db.Date` columns come back as the UTC midnight of their day. */
const STORED: DocumentRef[] = [
  { docType: "PROTOCOLE", reference: "PG04/EN01", version: "F", createdOn: new Date("2007-11-26T00:00:00Z"), updatedOn: new Date("2024-10-01T00:00:00Z") },
  { docType: "BON_RECEPTION", reference: "PG05/EN04", version: "G", createdOn: new Date("2006-01-05T00:00:00Z"), updatedOn: new Date("2024-10-01T00:00:00Z") },
  { docType: "FEUILLE_PAILLASSE", reference: "PG06/EN01", version: "G", createdOn: new Date("2006-01-05T00:00:00Z"), updatedOn: new Date("2024-10-08T00:00:00Z") },
  { docType: "CAHIER_PHYSICO", reference: "PG06/EN06", version: "C", createdOn: new Date("2015-01-24T00:00:00Z"), updatedOn: new Date("2019-10-11T00:00:00Z") },
  { docType: "RAPPORT", reference: "", version: "", createdOn: null, updatedOn: null },
];

/** What the database adapter writes for a DATE: the UTC day of the instant. */
const storedDay = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

/** One save of /admin/documents: rows read → date inputs → PUT body → the dates written. */
function save(rows: DocumentRef[]): DocumentRef[] {
  const body = JSON.parse(JSON.stringify({ items: rows.map(documentRowOf) }));
  const check = validateDocumentReferences(body);
  if (!check.ok) throw new Error(check.error);
  return check.items;
}

describe("/admin/documents — a save leaves an untouched date unchanged", () => {
  beforeEach(() => {
    // The container's zone, on a runtime whose tz data still puts Morocco at UTC+1.
    vi.stubEnv("TZ", "Africa/Casablanca");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs where reading a date at local midnight would slip it to the day before", () => {
    expect(new Date("2024-10-01T00:00:00").toISOString()).toBe("2024-09-30T23:00:00.000Z");
  });

  it("shows the stored day in the date inputs", () => {
    expect(documentRowOf(STORED[1])).toEqual({
      docType: "BON_RECEPTION",
      reference: "PG05/EN04",
      version: "G",
      createdOn: "2006-01-05",
      updatedOn: "2024-10-01",
    });
    expect(documentRowOf(STORED[4])).toMatchObject({ createdOn: "", updatedOn: "" });
  });

  it("writes back exactly the stored days, save after save", () => {
    const once = save(STORED);
    const twice = save(once);
    for (const [index, row] of STORED.entries()) {
      expect(storedDay(once[index].createdOn)).toBe(storedDay(row.createdOn));
      expect(storedDay(once[index].updatedOn)).toBe(storedDay(row.updatedOn));
      expect(twice[index]).toEqual(once[index]);
    }
    expect(storedDay(once[1].updatedOn)).toBe("2024-10-01");
    expect(storedDay(once[3].updatedOn)).toBe("2019-10-11");
  });

  it("stores a newly typed day as that day", () => {
    const row: DocumentRow = { ...documentRowOf(STORED[1]), version: "H", updatedOn: "2026-10-09" };
    const check = validateDocumentReferences({ items: [row] });
    expect(check.ok && storedDay(check.items[0].updatedOn)).toBe("2026-10-09");
  });

  it("reads a row sent back as the GET returned it (ISO instants) by its day", () => {
    const check = validateDocumentReferences(JSON.parse(JSON.stringify({ items: [STORED[1]] })));
    expect(check.ok && check.items[0]).toEqual(STORED[1]);
  });
});

describe("validateDocumentReferences — refusals", () => {
  const bon = documentRowOf(STORED[1]);
  const error = (body: unknown) => {
    const check = validateDocumentReferences(body);
    return check.ok ? null : check.error;
  };

  it("refuses an empty or malformed body", () => {
    expect(error(null)).toBe("Aucun document à enregistrer.");
    expect(error({ items: [] })).toBe("Aucun document à enregistrer.");
    expect(error({ items: [null] })).toBe("Type de document inconnu.");
    expect(error({ items: [{ ...bon, docType: "FACTURE" }] })).toBe("Type de document inconnu.");
  });

  it("names the document in French", () => {
    expect(error({ items: [{ ...bon, version: "" }] })).toBe("Bon de réception : indiquez la référence et la version.");
    expect(error({ items: [{ ...bon, reference: "X".repeat(41) }] })).toBe(
      "Bon de réception : référence (40) ou version (10) trop longue."
    );
    expect(error({ items: [bon, bon] })).toBe("Bon de réception : document envoyé deux fois.");
  });

  it("refuses an impossible or unreadable date, and an update before the creation", () => {
    expect(error({ items: [{ ...bon, updatedOn: "2024-02-30" }] })).toBe(
      "Bon de réception · dernière mise à jour : date invalide."
    );
    expect(error({ items: [{ ...bon, createdOn: "05/01/2006" }] })).toBe("Bon de réception · date de création : date invalide.");
    expect(error({ items: [{ ...bon, createdOn: 20060105 }] })).toBe("Bon de réception · date de création : date invalide.");
    expect(error({ items: [{ ...bon, updatedOn: "2005-12-31" }] })).toBe(
      "Bon de réception : la dernière mise à jour précède la création."
    );
  });

  it("accepts a cartouche not filled yet", () => {
    const check = validateDocumentReferences({ items: [documentRowOf(STORED[4])] });
    expect(check).toEqual({
      ok: true,
      items: [{ docType: "RAPPORT", reference: "", version: "", createdOn: null, updatedOn: null }],
    });
  });
});
