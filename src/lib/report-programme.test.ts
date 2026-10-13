import { describe, expect, it } from "vitest";
import { reportMethod, reportTechnicianNames } from "./report-programme";

/**
 * PROGRAMME.md §6, §10 — who analysed the line: the technician who took it,
 * then the technicians a legacy programme handed parameters to, each once;
 * the method follows the programme before the catalogue.
 */
describe("reportTechnicianNames", () => {
  it("prints the taker alone — since 13/10 no parameter is handed to anyone", () => {
    const sample = { technician: { name: "Tech 1" }, parameters: [{ technician: null }, { technician: undefined }, { technician: null }] };
    expect(reportTechnicianNames(sample)).toBe("Tech 1");
    expect(reportTechnicianNames({ technician: { name: " Tech 1 " }, parameters: [] })).toBe("Tech 1");
  });

  it("prints the sample's technician alone when the parameters follow them", () => {
    const sample = { technician: { name: "Tech 1" }, parameters: [{ technician: null }, { technician: null }] };
    expect(reportTechnicianNames(sample)).toBe("Tech 1");
  });

  it("adds each legacy parameter technician once, the taker first, joined by « · »", () => {
    const sample = {
      technician: { name: "Tech 1" },
      parameters: [{ technician: { name: "Tech 2" } }, { technician: { name: "Tech 1" } }, { technician: { name: "Tech 2" } }],
    };
    expect(reportTechnicianNames(sample)).toBe("Tech 1 · Tech 2");
  });

  it("names the legacy parameter technicians when nobody took the sample", () => {
    const sample = { technician: null, parameters: [{ technician: { name: "Tech 2" } }, { technician: { name: "Tech 3" } }] };
    expect(reportTechnicianNames(sample)).toBe("Tech 2 · Tech 3");
  });

  it("is null when nobody is named (never taken) — the report keeps its « — »", () => {
    expect(reportTechnicianNames({ technician: null, parameters: [] })).toBeNull();
    expect(reportTechnicianNames({ technician: { name: "  " }, parameters: [{ technician: undefined }] })).toBeNull();
  });
});

describe("reportMethod", () => {
  it("prefers the programmed version, then the criterion's, then the parameter's", () => {
    expect(reportMethod("NM ISO 4833-1:2013", "NM ISO 4833-1:2003", "NM ISO 4833")).toBe("NM ISO 4833-1:2013");
    expect(reportMethod(null, "NM ISO 4833-1:2003", "NM ISO 4833")).toBe("NM ISO 4833-1:2003");
    expect(reportMethod(null, null, "NM ISO 4833")).toBe("NM ISO 4833");
    expect(reportMethod(undefined, "", null)).toBeNull();
  });
});
