import { describe, expect, it } from "vitest";
import { COMPANY, COMPANY_OPTIONAL_FIELDS } from "./company";
import {
  COMPANY_FIELD_LABELS,
  COMPANY_OPTIONAL_MAX,
  COMPANY_REQUIRED_FIELDS,
  readCompanyOptionalFields,
} from "./company-input";

describe("readCompanyOptionalFields — IF, Patente, CNSS, fax", () => {
  it("leaves a field the request does not name as it is stored", () => {
    expect(readCompanyOptionalFields({ name: "Labo" })).toEqual({ ok: true, data: {} });
    expect(readCompanyOptionalFields({ fax: undefined })).toEqual({ ok: true, data: {} });
  });

  it("clears a field sent null or blank — the footer then leaves it out", () => {
    expect(readCompanyOptionalFields({ fiscalId: null, patente: "", cnss: "   " })).toEqual({
      ok: true,
      data: { fiscalId: null, patente: null, cnss: null },
    });
  });

  it("keeps a value trimmed, its inner spaces collapsed", () => {
    expect(readCompanyOptionalFields({ fiscalId: " 12 34 ", patente: "AB-12/3", cnss: "1.2", fax: " +212 (0)5 22.00-00  09 " })).toEqual({
      ok: true,
      data: { fiscalId: "12 34", patente: "AB-12/3", cnss: "1.2", fax: "+212 (0)5 22.00-00 09" },
    });
  });

  it("refuses a value too long for its line of the footer", () => {
    const tooLong = readCompanyOptionalFields({ cnss: "1".repeat(COMPANY_OPTIONAL_MAX.cnss + 1) });
    expect(tooLong).toEqual({ ok: false, error: "Le champ « CNSS » est trop long (30 caractères maximum)." });
    expect(readCompanyOptionalFields({ cnss: "1".repeat(COMPANY_OPTIONAL_MAX.cnss) }).ok).toBe(true);
    expect(readCompanyOptionalFields({ fax: "0".repeat(41) }).ok).toBe(false);
  });

  it("refuses what an identifier or a fax number is not written with", () => {
    // A line break is a space once collapsed; a control character is not.
    expect(readCompanyOptionalFields({ fiscalId: "12\n34" })).toEqual({ ok: true, data: { fiscalId: "12 34" } });
    for (const fiscalId of ["<b>1</b>", "12;34", "-12", "12\u000034"]) {
      const read = readCompanyOptionalFields({ fiscalId });
      expect(read.ok, fiscalId).toBe(false);
    }
    expect(readCompanyOptionalFields({ fiscalId: "<b>" })).toEqual({
      ok: false,
      error: "Le champ « IF (identifiant fiscal) » ne peut contenir que des chiffres, des lettres, des espaces, « . », « / » ou « - ».",
    });
    expect(readCompanyOptionalFields({ fax: "fax: 05" }).ok).toBe(false);
    expect(readCompanyOptionalFields({ patente: 12345 })).toEqual({ ok: false, error: "Le champ « Patente » est invalide." });
  });
});

describe("the identity's labels — one map for the form and the API", () => {
  it("names every field of the identity but the logo", () => {
    const fields = Object.keys(COMPANY).filter((key) => key !== "logoData").sort();
    expect(Object.keys(COMPANY_FIELD_LABELS).sort()).toEqual(fields);
    expect([...COMPANY_REQUIRED_FIELDS, ...COMPANY_OPTIONAL_FIELDS].sort()).toEqual(fields);
  });
});
