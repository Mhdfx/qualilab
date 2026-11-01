import { describe, expect, it } from "vitest";
import { SAMPLING_MEANS_BY_KIND } from "./lab-proposals";
import { samplingMeansText } from "./sampling-means";

describe("samplingMeansText (K6, Q104 (d))", () => {
  it("is on by default — the proposal of 18/10, to confirm by R-27", () => {
    expect(SAMPLING_MEANS_BY_KIND).toBe(true);
  });

  it("names the laboratory's means per kind when the laboratory sampled", () => {
    expect(samplingMeansText({ lineKind: "SURFACE", sampledByLab: true })).toBe("Écouvillon");
    expect(samplingMeansText({ lineKind: "MAINS", sampledByLab: true })).toBe("Écouvillon");
    expect(samplingMeansText({ lineKind: "EAU", sampledByLab: true })).toBe("Flacon stérile");
    expect(samplingMeansText({ lineKind: "ALIMENT", sampledByLab: true })).toBe("Sachet stérile ou emballage d'origine");
    expect(samplingMeansText({ lineKind: "AUTRE", sampledByLab: true })).toBe("N/A");
    expect(samplingMeansText({ lineKind: null, sampledByLab: true })).toBe("N/A");
  });

  it("prints N/A when the client or a third party sampled (« 2 cas »)", () => {
    expect(samplingMeansText({ lineKind: "ALIMENT", sampledByLab: false })).toBe("N/A");
    expect(samplingMeansText({ lineKind: "SURFACE", sampledByLab: false })).toBe("N/A");
  });

  it("keeps the air's own method, whoever sampled", () => {
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: true, airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: 45 })).toBe("Boîte exposée 45 min");
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: false, airMethod: "BIOCOLLECTEUR" })).toBe("Biocollecteur");
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: true, airMethod: null })).toBe("N/A");
  });

  it("goes back to N/A outside the air with the switch off", () => {
    expect(samplingMeansText({ lineKind: "EAU", sampledByLab: true }, false)).toBe("N/A");
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: true, airMethod: "BIOCOLLECTEUR" }, false)).toBe("Biocollecteur");
  });
});
