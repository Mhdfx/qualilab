import { describe, expect, it } from "vitest";
import {
  RECLASSIFY_FAMILY_LABELS,
  RECLASSIFY_MAX,
  alreadyThereMessage,
  parameterMatches,
  planReclassification,
  reclassifyRefusal,
  refusalMessage,
  validateReclassifyRequest,
  type ReclassifyContext,
  type ReclassifyRow,
} from "./parameter-reclassify";

// The catalogue of 20/10: every category has a micro and a PC nature; only
// food has « Autres analyses » (« Analyse sensorielle »).
const NATURES: ReclassifyContext["natures"] = [
  { family: "MICRO", legacyType: "ALIMENTAIRE" },
  { family: "CHIMIE", legacyType: "ALIMENTAIRE" },
  { family: "AUTRE", legacyType: "ALIMENTAIRE" },
  { family: "MICRO", legacyType: "EAU" },
  { family: "CHIMIE", legacyType: "EAU" },
  { family: "MICRO", legacyType: "AMBIANCE" },
  { family: "CHIMIE", legacyType: "AMBIANCE" },
];

const context = (over: Partial<ReclassifyContext> = {}): ReclassifyContext => ({
  natures: NATURES,
  profiles: [],
  openSamples: [],
  citedBy: [],
  ...over,
});

const row = (id: string, name: string, over: Partial<ReclassifyRow> = {}): ReclassifyRow => ({
  id,
  name,
  category: "ALIMENTAIRE",
  family: "MICRO",
  ...over,
});

describe("validateReclassifyRequest", () => {
  it("accepts a list of ids and a domain, preview only when asked", () => {
    expect(validateReclassifyRequest({ parameterIds: ["p1", "p2"], family: "CHIMIE" })).toEqual({
      ok: true,
      value: { parameterIds: ["p1", "p2"], family: "CHIMIE", preview: false },
    });
    expect(validateReclassifyRequest({ parameterIds: ["p1"], family: "AUTRE", preview: true })).toMatchObject({
      ok: true,
      value: { preview: true },
    });
    expect(validateReclassifyRequest({ parameterIds: ["p1"], family: "MICRO", preview: false })).toMatchObject({
      ok: true,
      value: { preview: false },
    });
  });

  it("refuses a preview that is not a boolean: a preview asked as « \"true\" » or 1 must not write", () => {
    for (const preview of ["true", 1, "false", 0, null, {}]) {
      expect(validateReclassifyRequest({ parameterIds: ["p1"], family: "MICRO", preview })).toEqual({
        ok: false,
        error: "Requête invalide.",
      });
    }
  });

  it("refuses a body that is not an object", () => {
    for (const body of [null, undefined, "CHIMIE", 3, ["p1"]]) {
      expect(validateReclassifyRequest(body)).toEqual({ ok: false, error: "Requête invalide." });
    }
  });

  it("refuses an unknown domain, an empty one included", () => {
    for (const family of [undefined, "", "PHYSICO", "chimie", 1]) {
      const result = validateReclassifyRequest({ parameterIds: ["p1"], family });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Domaine invalide/);
    }
  });

  it("asks for at least one parameter", () => {
    for (const parameterIds of [undefined, [], "p1", { 0: "p1" }]) {
      expect(validateReclassifyRequest({ parameterIds, family: "CHIMIE" })).toEqual({
        ok: false,
        error: "Choisissez au moins un paramètre.",
      });
    }
  });

  it("refuses an id that cannot be one", () => {
    for (const bad of [["p1", 2], ["p1", ""], ["   "], [null], ["x".repeat(192)]]) {
      expect(validateReclassifyRequest({ parameterIds: bad, family: "CHIMIE" })).toEqual({
        ok: false,
        error: "Identifiant de paramètre invalide.",
      });
    }
  });

  it("counts each parameter once, spaces trimmed", () => {
    const result = validateReclassifyRequest({ parameterIds: ["p1", " p1 ", "p2", "p1"], family: "CHIMIE" });
    expect(result).toMatchObject({ ok: true, value: { parameterIds: ["p1", "p2"] } });
  });

  it(`takes at most ${RECLASSIFY_MAX} parameters, duplicates not counted`, () => {
    const ids = Array.from({ length: RECLASSIFY_MAX }, (_, i) => `p${i}`);
    expect(validateReclassifyRequest({ parameterIds: [...ids, "p0"], family: "CHIMIE" }).ok).toBe(true);
    const result = validateReclassifyRequest({ parameterIds: [...ids, "one-more"], family: "CHIMIE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/500 au plus/);
  });
});

describe("planReclassification", () => {
  it("changes, leaves what is already there, sorted by category then name", () => {
    const rows = [
      row("ph", "pH"),
      row("abs", "Absorbance K 232 nm"),
      row("nitrates-eau", "Nitrates", { category: "EAU" }),
      row("cendres", "Cendres", { family: "CHIMIE" }),
    ];
    const plan = planReclassification(["ph", "nitrates-eau", "abs", "cendres"], rows, "CHIMIE", context());
    expect(plan.family).toBe("CHIMIE");
    expect(plan.changes.map((c) => c.id)).toEqual(["abs", "ph", "nitrates-eau"]);
    expect(plan.changes[0]).toEqual({
      id: "abs",
      name: "Absorbance K 232 nm",
      category: "ALIMENTAIRE",
      from: "MICRO",
      openSamples: 0,
      otherDomainTypes: 0,
    });
    expect(plan.unchanged).toEqual([{ id: "cendres", name: "Cendres" }]);
    expect(plan.refused).toEqual([]);
  });

  it("refuses an id the catalogue does not know", () => {
    const plan = planReclassification(["gone", "ph"], [row("ph", "pH")], "CHIMIE", context());
    expect(plan.refused).toEqual([
      { id: "gone", name: null, reason: "Paramètre introuvable : il a peut-être été supprimé entre-temps." },
    ]);
    expect(plan.changes.map((c) => c.id)).toEqual(["ph"]);
  });

  it("refuses a domain no active nature of the category carries: the analysis could never be asked again", () => {
    const water = row("legio", "Legionella", { category: "EAU" });
    const plan = planReclassification(["legio"], [water], "AUTRE", context());
    expect(plan.changes).toEqual([]);
    expect(plan.refused[0].reason).toBe(
      "Aucune nature d'analyse active du domaine « Autres analyses » pour la catégorie « Eau » : l'analyse ne pourrait être demandée sur aucun échantillon."
    );
    // Food has « Analyse sensorielle »: allowed there.
    expect(planReclassification(["odeur"], [row("odeur", "Odeur")], "AUTRE", context()).changes).toHaveLength(1);
    // An archived nature is not in the context: the PC of water archived, water PC is refused too.
    const noPcWater = context({ natures: NATURES.filter((n) => !(n.family === "CHIMIE" && n.legacyType === "EAU")) });
    expect(planReclassification(["legio"], [water], "CHIMIE", noPcWater).refused).toHaveLength(1);
  });

  it("refuses a parameter an active profile of another domain names, and says which", () => {
    const profiles = [
      { name: "Huiles PC", family: "CHIMIE" as const, parameterIds: ["abs"] },
      { name: "Micro aliments standard", family: "MICRO" as const, parameterIds: ["abs", "ph"] },
    ];
    const plan = planReclassification(["abs", "ph"], [row("abs", "Absorbance K 232 nm"), row("ph", "pH")], "CHIMIE", context({ profiles }));
    expect(plan.changes).toEqual([]);
    expect(plan.refused.map((r) => r.id)).toEqual(["abs", "ph"]);
    expect(plan.refused[0].reason).toBe(
      "Elle fait partie du profil « Micro aliments standard », d'un autre domaine : appliqué sur un échantillon de ce domaine, le profil la perdrait sans le dire. Retirez-la d'abord du profil (Configuration › Profils d'analyses)."
    );
    // The profile of the target domain is no obstacle: back to MICRO, only the PC profile refuses.
    const back = planReclassification(["abs"], [row("abs", "Absorbance K 232 nm", { family: "CHIMIE" })], "MICRO", context({ profiles }));
    expect(back.refused[0].reason).toMatch(/du profil « Huiles PC »/);
  });

  it("names two profiles, then counts the others", () => {
    const profiles = ["C", "A", "B", "D"].map((name) => ({ name: `Profil ${name}`, family: "MICRO" as const, parameterIds: ["ph"] }));
    const [refusal] = planReclassification(["ph"], [row("ph", "pH")], "CHIMIE", context({ profiles: profiles.slice(0, 2) })).refused;
    expect(refusal.reason).toMatch(/^Elle fait partie des profils « Profil A » et « Profil C », d'un autre domaine : appliqué sur un échantillon de ce domaine, chacun la perdrait sans le dire\. Retirez-la d'abord de ces profils/);
    const [many] = planReclassification(["ph"], [row("ph", "pH")], "CHIMIE", context({ profiles })).refused;
    expect(many.reason).toMatch(/des profils « Profil A », « Profil B » et 2 autres,/);
  });

  it("counts the samples in progress left on a sample of another domain, and the families of another domain citing it", () => {
    const ctx = context({
      openSamples: [
        { parameterId: "abs", family: "MICRO", count: 3 },
        { parameterId: "abs", family: "AUTRE", count: 1 },
        { parameterId: "abs", family: "CHIMIE", count: 5 },
        { parameterId: "ph", family: "MICRO", count: 7 },
      ],
      citedBy: [
        { parameterId: "abs", family: "MICRO", count: 2 },
        { parameterId: "abs", family: "CHIMIE", count: 4 },
        { parameterId: "abs", family: "AUTRE", count: 1 },
      ],
    });
    const [change] = planReclassification(["abs"], [row("abs", "Absorbance K 232 nm")], "CHIMIE", ctx).changes;
    // On a micro or « Autres analyses » sample it stays: 3 + 1; on a PC sample it is at home.
    expect(change.openSamples).toBe(4);
    // A micro family citing it is worth a word; a PC family is its home; « Autres analyses » never counts.
    expect(change.otherDomainTypes).toBe(2);
  });

  it("does not count a parameter twice when the request repeats it", () => {
    const plan = planReclassification(["ph", "ph"], [row("ph", "pH")], "CHIMIE", context());
    expect(plan.changes).toHaveLength(1);
  });
});

describe("reclassifyRefusal (the single edit, the creation)", () => {
  it("reads the category the edit gives the parameter", () => {
    const moved = row("p", "Paramètre X", { category: "AMBIANCE" });
    expect(reclassifyRefusal(moved, "AUTRE", context())).toMatch(/catégorie « Ambiance »/);
    expect(reclassifyRefusal({ ...moved, category: "ALIMENTAIRE" }, "AUTRE", context())).toBeNull();
  });

  it("refuses a water parameter going from physico-chemistry to « Autres analyses »", () => {
    const water = row("nitrates", "Nitrates", { category: "EAU", family: "CHIMIE" });
    expect(reclassifyRefusal(water, "AUTRE", context())).toBe(
      "Aucune nature d'analyse active du domaine « Autres analyses » pour la catégorie « Eau » : l'analyse ne pourrait être demandée sur aucun échantillon."
    );
    expect(reclassifyRefusal(water, "MICRO", context())).toBeNull();
  });

  it("a creation (empty id) answers to the natures only, whatever the profiles", () => {
    // A profile of another domain refuses the parameters it names; the empty id is none of them.
    const ctx = context({ profiles: [{ name: "Micro aliments standard", family: "MICRO", parameterIds: ["p"] }] });
    expect(reclassifyRefusal(row("", "Nouveau", { family: "CHIMIE" }), "CHIMIE", ctx)).toBeNull();
    expect(reclassifyRefusal(row("", "Nouveau", { category: "AMBIANCE", family: "AUTRE" }), "AUTRE", ctx)).toMatch(
      /^Aucune nature d'analyse active du domaine « Autres analyses » pour la catégorie « Ambiance »/
    );
  });
});

describe("the domains' labels", () => {
  it("say « Autres analyses », as the dialog's title and buttons do", () => {
    expect(RECLASSIFY_FAMILY_LABELS).toEqual({
      MICRO: "Microbiologie",
      CHIMIE: "Physico-chimie",
      AUTRE: "Autres analyses",
    });
  });
});

describe("refusalMessage", () => {
  it("names the only refused parameter with its reason", () => {
    expect(refusalMessage({ refused: [{ id: "p", name: "pH", reason: "Elle fait partie du profil « A »." }] })).toBe(
      "Aucun paramètre reclassé (« pH » refusé). Elle fait partie du profil « A »."
    );
    expect(refusalMessage({ refused: [{ id: "gone", name: null, reason: "Raison." }] })).toMatch(/« gone »/);
  });

  it("counts several", () => {
    const refused = [
      { id: "a", name: "A", reason: "x" },
      { id: "b", name: "B", reason: "y" },
    ];
    expect(refusalMessage({ refused })).toBe(
      "Aucun paramètre reclassé : 2 sont refusés (raisons dans la liste). Retirez-les de la sélection."
    );
  });
});

describe("alreadyThereMessage", () => {
  it("agrees with the number sent", () => {
    expect(alreadyThereMessage({ family: "CHIMIE", unchanged: [{ id: "p", name: "pH" }] })).toBe(
      "Aucun paramètre à reclasser : il est déjà en « Physico-chimie »."
    );
    const two = [
      { id: "p", name: "pH" },
      { id: "c", name: "Cendres" },
    ];
    expect(alreadyThereMessage({ family: "AUTRE", unchanged: two })).toBe(
      "Aucun paramètre à reclasser : ils sont déjà en « Autres analyses »."
    );
  });
});

describe("parameterMatches", () => {
  const plomb = { name: "Plomb (SN)", aliases: "Pb\nPlomb total", normLabel: "NM ISO 6869:2000" };

  it("finds a word of the name, an alias or the norm — case, accents and punctuation ignored", () => {
    expect(parameterMatches(plomb, "plomb")).toBe(true);
    expect(parameterMatches(plomb, "TOTAL")).toBe(true);
    expect(parameterMatches(plomb, "iso 6869")).toBe(true);
    expect(parameterMatches({ name: "Matière sèche" }, "matiere SECHE")).toBe(true);
    expect(parameterMatches({ name: "Ponceau 4R E124 (SN)" }, "e124")).toBe(true);
    expect(parameterMatches({ name: "Acide caprique (C10:0)" }, "c10:0")).toBe(true);
  });

  it("needs every word", () => {
    expect(parameterMatches(plomb, "plomb mercure")).toBe(false);
  });

  it("matches the start of a word, never inside one: a short chemistry search sweeps no germ", () => {
    expect(parameterMatches({ name: "pH" }, "ph")).toBe(true);
    expect(parameterMatches({ name: "Phosphore" }, "ph")).toBe(true);
    expect(parameterMatches({ name: "Staphylococcus aureus" }, "ph")).toBe(false);
    expect(parameterMatches({ name: "Bactéries aérobies mésophiles" }, "ph")).toBe(false);
    expect(parameterMatches({ name: "Halophiles" }, "ph")).toBe(false);
    expect(parameterMatches({ name: "Pseudomonas aeruginosa" }, "as")).toBe(false);
    expect(parameterMatches({ name: "Staphylocoques à coagulase positive à 37°C" }, "as")).toBe(false);
    expect(parameterMatches({ name: "Vibrio Parahaemolyticus" }, "cu")).toBe(false);
    expect(parameterMatches({ name: "Cuivre (Cu)" }, "cu")).toBe(true);
    expect(parameterMatches({ name: "Arsenic (As)" }, "as")).toBe(true);
    // The start of a word of the norm or of an alias counts as well.
    expect(parameterMatches(plomb, "6869")).toBe(true);
    expect(parameterMatches(plomb, "869")).toBe(false);
  });

  it("tolerates no typing error: a selection must be exactly what was typed", () => {
    expect(parameterMatches(plomb, "plomp")).toBe(false);
  });

  it("an empty search keeps everything", () => {
    expect(parameterMatches(plomb, "  ")).toBe(true);
    expect(parameterMatches({ name: "pH" }, "")).toBe(true);
  });
});
