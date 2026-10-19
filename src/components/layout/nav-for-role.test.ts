import { describe, it, expect } from "vitest";
import { ASSIGNABLE_ROLES, ROLE_HOME, ROLE_LABELS } from "@/lib/roles";
import { navFor, roleLabelFor } from "./nav-for-role";
import { activeHref } from "./nav-active";
import type { NavSection } from "./nav-types";

/** Root of every space an administrator is admitted to (each space layout allows ADMIN). */
const SPACE_ROOTS = [
  "/reception",
  "/programmation",
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

  it("gives the Direction the validation queue with both steps by name, the search and the quality system (12/10)", () => {
    const sections = navFor("DIRECTION");
    const items = sections.flatMap((section) => section.items);
    const href = (label: string) => items.find((item) => item.label === label)?.href;
    expect(href("Tableau de bord")).toBe("/validation");
    expect(href("Validation technique")).toBe("/validation?vue=a_valider#file");
    expect(href("Validation administrative")).toBe("/validation?vue=attente_admin#file");
    expect(href("Recherche des analyses")).toBe("/recherche");
    expect(sections.map((section) => section.title)).toContain("Système qualité");
    // Exactly the validateur's spaces, never the administration's.
    const all = hrefs(sections);
    const spaces = new Set(all.map((h) => h.split(/[?#]/)[0].split("/")[1]));
    expect([...spaces].sort()).toEqual(["qualite", "recherche", "validation"]);
    expect(all.some((h) => h.startsWith("/admin") || h.startsWith("/comptabilite") || h.startsWith("/commercial"))).toBe(false);
    for (const h of hrefs(navFor("VALIDATEUR"))) {
      expect(all.map((x) => x.split(/[?#]/)[0]), h).toContain(h.split(/[?#]/)[0]);
    }
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

  it("gives the responsable des paramètres « Familles & critères » in his own space, never the technician (16/10, Q125)", () => {
    const items = navFor("PROGRAMMATEUR").flatMap((section) => section.items);
    expect(items.find((item) => item.label === "Familles & critères")?.href).toBe("/programmation/familles");
    expect(hrefs(navFor("TECHNICIEN")).some((href) => href.startsWith("/programmation"))).toBe(false);
    expect(navFor("TECHNICIEN").flatMap((section) => section.items).some((item) => item.label === "Familles & critères")).toBe(false);
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
    expect(activeHref("/programmation/abc123", navFor("ADMIN"))).toBe("/programmation");
  });

  it("lights « Familles & critères » on the list and on a family, the dashboard on a sample's programme", () => {
    const nav = navFor("PROGRAMMATEUR");
    expect(activeHref("/programmation/familles", nav)).toBe("/programmation/familles");
    expect(activeHref("/programmation/familles/abc123", nav)).toBe("/programmation/familles");
    expect(activeHref("/programmation/abc123", nav)).toBe("/programmation");
  });

  it("lights the administrator's own entries for the reception history and the e-mail log", () => {
    const nav = navFor("ADMIN");
    expect(activeHref("/reception/historique", nav)).toBe("/reception/historique");
    expect(activeHref("/admin/envois", nav)).toBe("/admin/envois");
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

  it("reads a « ?vue= » step as a shortcut of its page: the Direction's dashboard lights, on the list and on a sample", () => {
    const nav = navFor("DIRECTION");
    expect(activeHref("/validation", nav)).toBe("/validation");
    expect(activeHref("/validation/abc123", nav)).toBe("/validation");
    expect(activeHref("/qualite/metrologie", nav)).toBe("/qualite/metrologie");
    expect(activeHref("/admin", nav)).toBeNull();
  });

  it("gives the technician « À prendre » before « Mes analyses », and lights only the dashboard on the bench (13/10)", () => {
    const nav = navFor("TECHNICIEN");
    const labels = nav.flatMap((section) => section.items).map((item) => item.label);
    expect(labels.indexOf("À prendre")).toBe(labels.indexOf("Mes analyses") - 1);
    const href = (label: string) => nav.flatMap((section) => section.items).find((item) => item.label === label)?.href;
    expect(href("À prendre")).toBe("/technicien?vue=a_prendre#analyses");
    // Two shortcuts into one page never light together: the plain link wins.
    expect(activeHref("/technicien", nav)).toBe("/technicien");
    expect(activeHref("/technicien/abc123", nav)).toBe("/technicien");
    expect(activeHref("/technicien/temperatures", nav)).toBe("/technicien/temperatures");
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
