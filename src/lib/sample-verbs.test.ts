import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SampleStatus } from "@/generated/prisma/enums";
import { ROLES, type Role } from "./roles";
import { SAMPLE_STATUS_LABELS } from "./labels";
import { CORRECTABLE_STATUSES, canTransition } from "./sample-status";
import {
  CORRECTION_MESSAGES,
  FICHE_CORRECTION_ROLES,
  cancellersLabel,
  correctionLabel,
  correctionRefusal,
  correctionRights,
  verbsFor,
} from "./sample-verbs";

/**
 * « Corriger la fiche » in two halves (16/10, Q128 — RP3b (a)): once the
 * programme is confirmed, the analyses — their list, the product type and
 * the number of units — are changed by the responsable des paramètres and
 * the administrator only; the identification stays with the reception, the
 * validation desks and the administrator. The table below is the decision,
 * written out role by role and step by step, so that any change of who may
 * change what shows in a review.
 */

const STATUSES = Object.keys(SAMPLE_STATUS_LABELS) as SampleStatus[];

/** « I » = identification, « A » = analyses, « IA » = both, « - » = nothing. */
type Cell = "-" | "I" | "A" | "IA";

//                        PRELEVE  RECU  PROGRAMME  EN_ANALYSE  RESULTATS_SAISIS  VALIDE  RAPPORT_ENVOYE  ANNULE
const TABLE: Record<Role, Record<SampleStatus, Cell>> = {
  RECEPTIONNISTE: row("IA", "IA", "I", "I", "I"),
  VALIDATEUR: row("IA", "IA", "I", "I", "I"),
  DIRECTION: row("IA", "IA", "I", "I", "I"),
  // Before the bench his programme sheet is open; at the bench, the analyses only.
  PROGRAMMATEUR: row("-", "-", "-", "A", "A"),
  ADMIN: row("IA", "IA", "IA", "IA", "IA"),
  PRELEVEUR: row("-", "-", "-", "-", "-"),
  TECHNICIEN: row("-", "-", "-", "-", "-"),
  GESTIONNAIRE: row("-", "-", "-", "-", "-"),
  COMPTABLE: row("-", "-", "-", "-", "-"),
  CLIENT: row("-", "-", "-", "-", "-"),
  MAGASINIER: row("-", "-", "-", "-", "-"),
};

/** The five correctable steps; nothing once approved, sent or cancelled. */
function row(preleve: Cell, recu: Cell, programme: Cell, enAnalyse: Cell, saisis: Cell): Record<SampleStatus, Cell> {
  return {
    PRELEVE: preleve,
    RECU: recu,
    PROGRAMME: programme,
    EN_ANALYSE: enAnalyse,
    RESULTATS_SAISIS: saisis,
    VALIDE: "-",
    RAPPORT_ENVOYE: "-",
    ANNULE: "-",
  };
}

const cellOf = (rights: { identification: boolean; analyses: boolean }): Cell =>
  rights.identification && rights.analyses ? "IA" : rights.identification ? "I" : rights.analyses ? "A" : "-";

describe("correctionRights — who changes what in « Corriger la fiche » (16/10, Q128)", () => {
  it("covers every role and every status", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...ROLES].sort());
    expect(STATUSES).toHaveLength(8);
  });

  for (const role of ROLES) {
    it(`${role}: ${STATUSES.map((status) => TABLE[role][status]).join(" ")}`, () => {
      for (const status of STATUSES) {
        expect(cellOf(correctionRights(role, status)), `${role} ${status}`).toBe(TABLE[role][status]);
      }
    });
  }

  it("keeps the identification exactly with FICHE_CORRECTION_ROLES until the approval", () => {
    for (const role of ROLES) {
      for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[]) {
        expect(correctionRights(role, status).identification, `${role} ${status}`).toBe(
          (FICHE_CORRECTION_ROLES as readonly Role[]).includes(role)
        );
      }
    }
  });

  it("gives the analyses after the programme to the responsable des paramètres and the administrator only", () => {
    for (const status of ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[]) {
      const holders = ROLES.filter((role) => correctionRights(role, status).analyses);
      expect(holders, status).toEqual(status === "PROGRAMME" ? ["ADMIN"] : ["PROGRAMMATEUR", "ADMIN"]);
    }
  });
});

describe("verbsFor — the two halves on the screens", () => {
  it("offers « Corriger la fiche » for the identification and `correctAnalyses` for the analyses", () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const rights = correctionRights(role, status);
        const verbs = verbsFor({ status }, role);
        expect(verbs.correct, `${role} ${status}`).toBe(rights.identification);
        expect(verbs.correctAnalyses, `${role} ${status}`).toBe(rights.analyses);
      }
    }
  });

  it("never lets the responsable des paramètres cancel or reactivate", () => {
    for (const status of STATUSES) {
      const verbs = verbsFor({ status }, "PROGRAMMATEUR");
      expect(verbs.cancel, status).toBe(false);
      expect(verbs.reactivate, status).toBe(false);
    }
  });

  it("names the verb by what it changes", () => {
    expect(correctionLabel({ identification: true, analyses: true })).toBe("Corriger la fiche");
    expect(correctionLabel({ identification: true, analyses: false })).toBe("Corriger la fiche");
    expect(correctionLabel({ identification: false, analyses: true })).toBe("Corriger les analyses");
  });
});

describe("correctionRefusal — the intake route's answer, field by field", () => {
  const both = { identification: true, analyses: true };
  const analyses = { identification: false, analyses: true };
  const identification = { identification: true, analyses: false };

  it("refuses the analyses to the reception, the validateur and the Direction once the programme is confirmed", () => {
    for (const role of ["RECEPTIONNISTE", "VALIDATEUR", "DIRECTION"] as Role[]) {
      for (const status of ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[]) {
        expect(correctionRefusal(role, status, analyses), `${role} ${status}`).toBe(CORRECTION_MESSAGES.analysesReserved);
        expect(correctionRefusal(role, status, identification), `${role} ${status}`).toBeNull();
      }
      expect(correctionRefusal(role, "RECU", both)).toBeNull();
      expect(correctionRefusal(role, "PRELEVE", both)).toBeNull();
    }
    expect(CORRECTION_MESSAGES.analysesReserved).toBe(
      "Après la confirmation du programme, les analyses se changent par le responsable des paramètres."
    );
  });

  it("lets the responsable des paramètres change the analyses at the bench, never the identification", () => {
    for (const status of ["EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[]) {
      expect(correctionRefusal("PROGRAMMATEUR", status, analyses), status).toBeNull();
      expect(correctionRefusal("PROGRAMMATEUR", status, identification), status).toBe(
        CORRECTION_MESSAGES.identificationReserved
      );
      expect(correctionRefusal("PROGRAMMATEUR", status, both), status).toBe(CORRECTION_MESSAGES.identificationReserved);
    }
  });

  it("sends the responsable des paramètres to his programme sheet before the bench", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME"] as SampleStatus[]) {
      expect(correctionRefusal("PROGRAMMATEUR", status, analyses), status).toBe(CORRECTION_MESSAGES.analysesOnProgramme);
    }
  });

  it("lets the administrator change both halves until the approval", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[]) {
      expect(correctionRefusal("ADMIN", status, both), status).toBeNull();
    }
  });
});

describe("cancellersLabel — who cancels at this step, in words (16/10, Q13)", () => {
  it("the réception and the administrator before the programme, the validation desks and the administrator from it", () => {
    for (const status of ["PRELEVE", "RECU"] as SampleStatus[]) {
      expect(cancellersLabel(status), status).toBe("la réception ou l'administrateur");
      expect(cancellersLabel(status, true), status).toBe("de la réception ou de l'administrateur");
    }
    for (const status of ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[]) {
      expect(cancellersLabel(status), status).toBe("la validation, la Direction ou l'administrateur");
      expect(cancellersLabel(status, true), status).toBe("de la validation, de la Direction ou de l'administrateur");
    }
    for (const status of ["VALIDE", "RAPPORT_ENVOYE", "ANNULE"] as SampleStatus[]) expect(cancellersLabel(status), status).toBe("");
  });

  it("names exactly the roles the state machine lets cancel, step by step", () => {
    const NAMES: Partial<Record<Role, string>> = {
      RECEPTIONNISTE: "la réception",
      VALIDATEUR: "la validation",
      DIRECTION: "la Direction",
      ADMIN: "l'administrateur",
    };
    for (const status of STATUSES) {
      const allowed = ROLES.filter((role) => canTransition(status, "ANNULE", role).ok);
      for (const role of allowed) expect(NAMES[role], `${status} ${role} is named`).toBeDefined();
      const label = cancellersLabel(status);
      for (const role of Object.keys(NAMES) as Role[]) {
        expect(label.includes(NAMES[role]!), `${status} ${role}`).toBe(allowed.includes(role));
      }
    }
  });
});

const source = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("PATCH /api/samples/[id]/intake applies these rules (F8, C5) — read from its source", () => {
  const route = source("../app/api/samples/[id]/intake/route.ts");
  const patch = route.slice(route.indexOf("export async function PATCH"));
  const at = (text: string, needle: string) => {
    const index = text.indexOf(needle);
    expect(index, needle).toBeGreaterThan(0);
    return index;
  };

  it("admits the responsable des paramètres in its guard; refuses with correctionRights (403) before the body is read", () => {
    expect(patch).toMatch(/requireApiRole\("RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "PROGRAMMATEUR", "ADMIN"\)/);
    const rights = at(patch, "const rights = correctionRights(session.role, sample.status);");
    expect(patch.slice(rights)).toMatch(/^const rights = correctionRights\(session\.role, sample\.status\);\s*if \(!rights\.identification && !rights\.analyses\) \{\s*const refusal = correctionRefusal\([^\n]*\n\s*return NextResponse\.json\(\{ error: refusal \}, \{ status: 403 \}\);/);
    expect(rights).toBeLessThan(at(patch, "await request.json()"));
  });

  it("refuses field by field — correctionRefusal on what the body actually changes — before any write", () => {
    const refusal = at(patch, "const refusal = correctionRefusal(session.role, sample.status, correctionTouches(body, checked.value));");
    expect(refusal).toBeGreaterThan(at(patch, "const checked = validateIntake(body, current);"));
    expect(refusal).toBeLessThan(at(patch, "prisma.$transaction("));
    expect(patch.slice(refusal)).toMatch(/^[^\n]*\n\s*if \(refusal\) return NextResponse\.json\(\{ error: refusal \}, \{ status: 403 \}\);/);
  });

  it("writes the identification only for whoever may correct it — the analyses' half alone otherwise", () => {
    expect(patch).toMatch(/const changes = rights\.identification \? checked\.value\.changes : analysesChangesOnly\(checked\.value\.changes\);/);
  });

  it("C5: decides the reset under the lock, deletes only the withdrawn analyses' readings, and clears the technical signature at validation", () => {
    const tx = patch.slice(at(patch, "prisma.$transaction("));
    expect(at(tx, "FOR UPDATE")).toBeLessThan(at(tx, "resultsToReset("));
    expect(tx).toMatch(/await tx\.result\.deleteMany\(\{ where: \{ sampleId: id, parameterId: \{ in: reset\.parameterIds \} \} \}\)/);
    expect(tx).toMatch(/const clearValidation = reset\.kind === "removed" && sample\.status === "RESULTATS_SAISIS";/);
    expect(tx).toMatch(/\.\.\.\(clearValidation \? \{ validatedById: null, validatedAt: null \} : \{\}\)/);
    expect(tx).toMatch(/const backToBench = resetAll && sample\.status === "RESULTATS_SAISIS";/);
  });
});

describe("« Corriger les analyses » reads what it offers (F8)", () => {
  /** The roles of the guard of a route's GET (string literals, as written). */
  function getGuard(relative: string): string[] {
    const text = source(relative);
    const get = text.slice(text.search(/export\s+async\s+function\s+GET\b/));
    const call = get.match(/requireApiRole\(([^)]*)\)/);
    expect(call, relative).not.toBeNull();
    return [...call![1].matchAll(/["']([A-Z_]+)["']/g)].map((match) => match[1]);
  }

  it("every role that changes the analyses at some step is admitted by GET /api/parameters and GET /api/product-types", () => {
    const correctors = ROLES.filter((role) => CORRECTABLE_STATUSES.some((status) => correctionRights(role, status).analyses));
    expect([...correctors].sort()).toEqual(["ADMIN", "DIRECTION", "PROGRAMMATEUR", "RECEPTIONNISTE", "VALIDATEUR"]);
    for (const relative of ["../app/api/parameters/route.ts", "../app/api/product-types/route.ts"]) {
      const roles = getGuard(relative);
      for (const role of correctors) expect(roles, `${relative} ${role}`).toContain(role);
    }
  });

  it("the dialog says when the analyses cannot be loaded, instead of an empty list", () => {
    const dialog = source("../components/samples/SampleVerbs.tsx");
    expect(dialog).toMatch(/if \(!r\.ok\) throw new Error/);
    expect(dialog).toMatch(/Impossible de charger les analyses\./);
  });
});
