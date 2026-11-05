import { describe, expect, it } from "vitest";
import { SAMPLING_MEANS_AIR_ONLY, SAMPLING_MEANS_BY_KIND } from "./lab-proposals";
import { samplingMeansText } from "./sampling-means";

describe("samplingMeansText — K9, the air only (04/11, Q14)", () => {
  it("is on by default — confirmé le 04/11", () => {
    expect(SAMPLING_MEANS_AIR_ONLY).toBe(true);
    expect(SAMPLING_MEANS_BY_KIND).toBe(true);
  });

  it("prints no line outside the air, whoever sampled", () => {
    for (const lineKind of ["SURFACE", "MAINS", "EAU", "ALIMENT", "AUTRE"] as const) {
      expect(samplingMeansText({ lineKind, sampledByLab: true }), lineKind).toBeNull();
      expect(samplingMeansText({ lineKind, sampledByLab: false }), lineKind).toBeNull();
    }
    expect(samplingMeansText({ lineKind: null, sampledByLab: true })).toBeNull();
  });

  it("keeps the air's own method, whoever sampled", () => {
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: true, airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: 45 })).toBe("Boîte exposée 45 min");
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: false, airMethod: "BIOCOLLECTEUR" })).toBe("Biocollecteur");
    expect(samplingMeansText({ lineKind: "AIR", sampledByLab: true, airMethod: null })).toBe("N/A");
  });
});

describe("samplingMeansText — K6 (Q104 (d)), the way back with K9 off", () => {
  const k6 = (input: Parameters<typeof samplingMeansText>[0], byKind = true) => samplingMeansText(input, byKind, false);

  it("names the laboratory's means per kind when the laboratory sampled", () => {
    expect(k6({ lineKind: "SURFACE", sampledByLab: true })).toBe("Écouvillon");
    expect(k6({ lineKind: "MAINS", sampledByLab: true })).toBe("Écouvillon");
    expect(k6({ lineKind: "EAU", sampledByLab: true })).toBe("Flacon stérile");
    expect(k6({ lineKind: "ALIMENT", sampledByLab: true })).toBe("Sachet stérile ou emballage d'origine");
    expect(k6({ lineKind: "AUTRE", sampledByLab: true })).toBe("N/A");
    expect(k6({ lineKind: null, sampledByLab: true })).toBe("N/A");
  });

  it("prints N/A when the client or a third party sampled (« 2 cas »)", () => {
    expect(k6({ lineKind: "ALIMENT", sampledByLab: false })).toBe("N/A");
    expect(k6({ lineKind: "SURFACE", sampledByLab: false })).toBe("N/A");
  });

  it("goes back to N/A outside the air with K6 off too", () => {
    expect(k6({ lineKind: "EAU", sampledByLab: true }, false)).toBe("N/A");
    expect(k6({ lineKind: "AIR", sampledByLab: true, airMethod: "BIOCOLLECTEUR" }, false)).toBe("Biocollecteur");
  });
});
