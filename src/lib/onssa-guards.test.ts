import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ONSSA_MAPPING_ROLES, ONSSA_REPORT_ROLES } from "./onssa-access";
import { navFor } from "@/components/layout/nav-for-role";

/**
 * Lot 3E — who opens the ONSSA report and its correspondences, read from the
 * sources (HANDOFF §3: every page and route names its roles), and N1's
 * « imprimés nulle part »: no printed document reads the série's ONSSA
 * fields.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("the ONSSA report's rights (N3)", () => {
  it("is the Direction's, the administrator's and the validateur's — never the bench nor a client", () => {
    expect([...ONSSA_REPORT_ROLES].sort()).toEqual(["ADMIN", "DIRECTION", "VALIDATEUR"]);
  });

  it("guards the screen and the Excel with that list, inside the quality system's layout", () => {
    // Literal lists: the guard tests (direction, technician, prices) read the roles off the call.
    expect(read("app/qualite/onssa/page.tsx")).toMatch(/requireRole\("VALIDATEUR", "DIRECTION", "ADMIN"\)/);
    expect(read("app/api/onssa/rapport/route.ts")).toMatch(/requireApiRole\("VALIDATEUR", "DIRECTION", "ADMIN"\)/);
    expect(read("app/qualite/layout.tsx")).toMatch(/requireRole\("VALIDATEUR", "DIRECTION", "ADMIN"\)/);
  });

  it("journals every export", () => {
    expect(read("app/api/onssa/rapport/route.ts")).toMatch(/action: "ONSSA_REPORT_EXPORTED"/);
  });

  it("is in the menus of those roles", () => {
    for (const role of ONSSA_REPORT_ROLES) {
      const hrefs = navFor(role).flatMap((section) => section.items.map((item) => item.href));
      expect(hrefs, role).toContain("/qualite/onssa");
    }
    for (const role of ["TECHNICIEN", "RECEPTIONNISTE", "GESTIONNAIRE", "COMPTABLE", "CLIENT"] as const) {
      const hrefs = navFor(role).flatMap((section) => section.items.map((item) => item.href));
      expect(hrefs, role).not.toContain("/qualite/onssa");
    }
  });
});

describe("the correspondences' rights (N2)", () => {
  it("are the administrator's only, on the page and on every route", () => {
    expect([...ONSSA_MAPPING_ROLES]).toEqual(["ADMIN"]);
    expect(read("app/admin/onssa/page.tsx")).toMatch(/requireRole\("ADMIN"\)/);
    for (const route of [
      "app/api/admin/onssa/groups/route.ts",
      "app/api/admin/onssa/groups/[id]/route.ts",
      "app/api/admin/onssa/mappings/route.ts",
    ]) {
      const source = read(route);
      expect(source, route).toMatch(/requireApiRole\("ADMIN"\)/);
      expect(source, route).toMatch(/logAudit\(/);
    }
    const hrefs = navFor("ADMIN").flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/admin/onssa");
  });
});

describe("the série's ONSSA fields (N1)", () => {
  it("are corrected through the série route, the préleveur stopped at the reception, journalled", () => {
    const source = read("app/api/series/[id]/route.ts");
    expect(source).toMatch(/patchOnssaControl\(/);
    expect(source).toMatch(/le laboratoire seul peut changer le contrôle officiel/);
    expect(source).toMatch(/onssa: onssa\.ok && onssa\.changed/);
  });

  it("are printed nowhere (no document, label, e-mail or report reads them)", () => {
    const printed = readdirSync(join(SRC, "lib"))
      .filter((name) => /(html|pdf|labels-html|templates|report-dispatch|destruction-notice|not-received-notice)\.ts$/.test(name))
      .filter((name) => !name.endsWith(".test.ts"))
      .map((name) => `lib/${name}`)
      .concat(["lib/emails/templates.ts", "app/api/series/[id]/document/route.ts"]);
    expect(printed.length).toBeGreaterThan(5);
    for (const path of printed) {
      expect(read(path), path).not.toMatch(/controleOfficiel|organismePreleveur|\betablissement\b|serie\.origine|\borigine:/);
    }
  });
});
