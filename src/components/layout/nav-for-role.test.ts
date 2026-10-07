import { describe, it, expect } from "vitest";
import { ASSIGNABLE_ROLES, ROLE_HOME, ROLE_LABELS } from "@/lib/roles";
import { navFor, roleLabelFor } from "./nav-for-role";
import { activeHref } from "./nav-active";
import type { NavSection } from "./nav-types";

/** Root of every space an administrator is admitted to (each space layout allows ADMIN). */
const SPACE_ROOTS = [
  "/reception",
  "/technicien",
  "/validation",
  "/commercial",
  "/comptabilite",
  "/magasin",
  "/qualite",
  "/admin",
];

function hrefs(sections: NavSection[]) {
  return sections
    .flatMap((section) => section.items)
    .flatMap((item) => (item.href ? [item.href] : []));
}

describe("navFor", () => {
  it("lists the role's own home in every assignable role's menu", () => {
    // CLIENT included: its home is the portal (PORTAIL.md §2).
    for (const role of ASSIGNABLE_ROLES) {
      expect(hrefs(navFor(role)), role).toContain(ROLE_HOME[role]);
    }
  });

  it("gives the administrator a way into every space", () => {
    const admin = hrefs(navFor("ADMIN"));
    for (const root of SPACE_ROOTS) {
      expect(admin, root).toContain(root);
    }
  });

  it("never repeats an href inside one menu", () => {
    for (const role of ASSIGNABLE_ROLES) {
      const all = hrefs(navFor(role));
      expect(new Set(all).size, role).toBe(all.length);
    }
  });

  it("merges validation and the quality system into one validateur menu", () => {
    const sections = navFor("VALIDATEUR");
    const all = hrefs(sections);
    expect(all).toContain("/validation");
    expect(all).toContain("/qualite");
    expect(sections.map((section) => section.title)).toContain("Système qualité");
  });

  it("gives the client portal its own screens and nothing of the laboratory", () => {
    const all = hrefs(navFor("CLIENT"));
    expect(all).toEqual(["/portail", "/portail/echantillons", "/portail/compte"]);
    for (const href of all) expect(href.startsWith("/portail")).toBe(true);
  });

  it("gives the responsable des paramètres the programme, the search and the bench sheet", () => {
    // PROGRAMME.md §2: everything a technician reads plus the programme —
    // and nothing of the validation or the administration.
    const all = hrefs(navFor("PROGRAMMATEUR"));
    expect(all).toContain("/programmation");
    expect(all).toContain("/programmation#file");
    expect(all).toContain("/recherche");
    expect(all).toContain("/api/bench-sheet");
    expect(all.some((href) => href.startsWith("/validation") || href.startsWith("/admin"))).toBe(false);
  });

  it("captions the shell with the role, not the space", () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(roleLabelFor(role)).toBe(ROLE_LABELS[role]);
    }
  });
});

describe("activeHref", () => {
  it("lights the space root in the admin menu on a nested page", () => {
    expect(activeHref("/reception/abc123", navFor("ADMIN"))).toBe("/reception");
    expect(activeHref("/qualite/temperatures", navFor("ADMIN"))).toBe("/qualite");
  });

  it("prefers the longest matching href", () => {
    const nav = navFor("COMPTABLE");
    expect(activeHref("/comptabilite/factures/nouvelle", nav)).toBe(
      "/comptabilite/factures/nouvelle"
    );
    expect(activeHref("/comptabilite/factures/42", nav)).toBe("/comptabilite/factures");
    expect(activeHref("/admin/factures", navFor("ADMIN"))).toBe("/admin/factures");
  });

  it("lights the plain dashboard link, not its anchor shortcut, on the dashboard", () => {
    expect(activeHref("/admin", navFor("ADMIN"))).toBe("/admin");
    expect(activeHref("/preleveur", navFor("PRELEVEUR"))).toBe("/preleveur");
  });

  it("does not light the dashboard on a sibling route", () => {
    expect(activeHref("/preleveur/nouvelle-visite", navFor("PRELEVEUR"))).toBe("/preleveur/nouvelle-visite");
    expect(activeHref("/qualite/metrologie", navFor("VALIDATEUR"))).toBe("/qualite/metrologie");
  });

  it("matches whole route segments only", () => {
    expect(activeHref("/receptionnaire", navFor("ADMIN"))).toBeNull();
    expect(activeHref("/login", navFor("ADMIN"))).toBeNull();
  });
});
