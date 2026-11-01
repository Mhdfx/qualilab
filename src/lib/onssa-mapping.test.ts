import { describe, expect, it } from "vitest";
import { ONSSA_GROUP_NAME_MAX } from "./onssa-canevas";
import {
  MAX_MAPPING_CHANGES,
  ONSSA_MAPPING_MESSAGES,
  parameterProposals,
  validateGroupInput,
  validateMappingBatch,
} from "./onssa-mapping";

/** Lot 3E, N2 — the checks of /admin/onssa's routes. */

describe("validateGroupInput", () => {
  it("creates with a name, the domain defaulting to food", () => {
    expect(validateGroupInput({ name: "  Lait   test " }, true)).toEqual({
      ok: true,
      value: { name: "Lait test", domain: "ALIMENTAIRE" },
    });
    expect(validateGroupInput({ name: "Eaux test", domain: "EAU", sortOrder: 4 }, true)).toEqual({
      ok: true,
      value: { name: "Eaux test", domain: "EAU", sortOrder: 4 },
    });
  });

  it("refuses a missing or too long name, an unknown domain, a bad order or flag", () => {
    expect(validateGroupInput({}, true)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.nameMissing });
    expect(validateGroupInput({ name: "x".repeat(ONSSA_GROUP_NAME_MAX + 1) }, true)).toEqual({
      ok: false,
      error: ONSSA_MAPPING_MESSAGES.nameTooLong,
    });
    expect(validateGroupInput({ name: "A", domain: "CHIMIE" }, true)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.domainInvalid });
    expect(validateGroupInput({ sortOrder: 1.5 }, false)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.orderInvalid });
    expect(validateGroupInput({ sortOrder: 1000 }, false)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.orderInvalid });
    expect(validateGroupInput({ active: "non" }, false)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.activeInvalid });
    expect(validateGroupInput([], false)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.invalid });
  });

  it("updates only what is sent, and refuses an empty update", () => {
    expect(validateGroupInput({ active: false }, false)).toEqual({ ok: true, value: { active: false } });
    expect(validateGroupInput({}, false)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.nothing });
  });
});

describe("validateMappingBatch", () => {
  it("accepts links to a group or to « non déclaré », and known columns", () => {
    expect(
      validateMappingBatch({
        productTypes: [{ id: "t1", groupId: "g1" }],
        natures: [{ id: "n1", groupId: null }],
        parameters: [
          { id: "p1", column: "SALMONELLA" },
          { id: "p2", column: null },
        ],
      })
    ).toEqual({
      ok: true,
      value: {
        productTypes: [{ id: "t1", groupId: "g1" }],
        natures: [{ id: "n1", groupId: null }],
        parameters: [
          { id: "p1", column: "SALMONELLA" },
          { id: "p2", column: null },
        ],
      },
    });
  });

  it("keeps the last value of a row named twice", () => {
    const checked = validateMappingBatch({
      parameters: [
        { id: "p1", column: "SALMONELLA" },
        { id: "p1", column: "MOR_22" },
      ],
    });
    expect(checked).toEqual({ ok: true, value: { productTypes: [], natures: [], parameters: [{ id: "p1", column: "MOR_22" }] } });
  });

  it("refuses an unknown column, a malformed entry, nothing, or too much", () => {
    expect(validateMappingBatch({ parameters: [{ id: "p1", column: "salmonella" }] })).toEqual({
      ok: false,
      error: ONSSA_MAPPING_MESSAGES.columnInvalid,
    });
    expect(validateMappingBatch({ productTypes: [{ id: "", groupId: "g" }] })).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.invalid });
    expect(validateMappingBatch({ productTypes: [{ id: "t", groupId: 3 }] })).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.invalid });
    expect(validateMappingBatch({ natures: "n1" })).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.invalid });
    expect(validateMappingBatch({})).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.nothing });
    expect(validateMappingBatch(null)).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.invalid });
    const many = Array.from({ length: MAX_MAPPING_CHANGES + 1 }, (_, i) => ({ id: `t${i}`, groupId: null }));
    expect(validateMappingBatch({ productTypes: many })).toEqual({ ok: false, error: ONSSA_MAPPING_MESSAGES.tooMany });
  });
});

describe("parameterProposals", () => {
  it("proposes for the « non déclaré » parameters only, never over a choice made", () => {
    expect(
      parameterProposals([
        { id: "p1", name: "Salmonella", family: "MICRO", category: "ALIMENTAIRE", onssaColumn: null },
        { id: "p2", name: "Salmonella", family: "MICRO", category: "ALIMENTAIRE", onssaColumn: "MOR_22" },
        { id: "p3", name: "Germe inconnu", family: "MICRO", category: "ALIMENTAIRE", onssaColumn: null },
        { id: "p4", name: "Histamine", family: "CHIMIE", category: "ALIMENTAIRE", onssaColumn: null },
      ])
    ).toEqual([
      { id: "p1", column: "SALMONELLA" },
      { id: "p4", column: "CHIMIE_ALIMENTAIRE" },
    ]);
  });
});
