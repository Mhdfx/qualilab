import { describe, expect, it } from "vitest";
import { emailSitesRefusal } from "@/lib/client-validation";
import { WHOLE_CLIENT_LABEL, emailSiteHint, siteOptionLabel, siteOptions } from "./client-form-logic";

/**
 * The client form's site of each address (RETOUR-LABO-19-10.md H3, Q45):
 * « Tout le client » or « Site : X », among the client's active sites.
 */

const sites = [
  { id: "s-b", name: "Site Test B", active: true },
  { id: "s-closed", name: "Site Test Fermé", active: false },
  { id: "s-a", name: "Site Test A", active: true },
  { id: "s-old", name: "Site Test Ancien", active: false },
];

describe("siteOptions", () => {
  it("lists the active sites by name", () => {
    expect(siteOptions(sites, []).map((site) => site.id)).toEqual(["s-a", "s-b"]);
  });

  it("keeps an inactive site an address already belongs to, after the active ones", () => {
    expect(siteOptions(sites, [null, "s-closed"]).map((site) => site.id)).toEqual(["s-a", "s-b", "s-closed"]);
  });

  it("is empty for a client without sites (the select is not shown)", () => {
    expect(siteOptions([], [null])).toEqual([]);
  });
});

describe("siteOptionLabel", () => {
  it("« Site : X », and says when the site is deactivated", () => {
    expect(WHOLE_CLIENT_LABEL).toBe("Tout le client");
    expect(siteOptionLabel(sites[0])).toBe("Site : Site Test B");
    expect(siteOptionLabel(sites[1])).toBe("Site : Site Test Fermé (désactivé)");
  });
});

describe("emailSiteHint", () => {
  const row = { email: "qualite@example.com", siteId: null, savedSiteId: null, forReports: true, forAlerts: true };

  it("says nothing for an address of the whole client", () => {
    expect(emailSiteHint(row, sites)).toBeNull();
  });

  it("a site's address receives that site's mail only (D-04), even retyped", () => {
    expect(emailSiteHint({ ...row, siteId: "s-a" }, sites)).toEqual({
      kept: true,
      text: "(site Site Test A) — reçoit les rapports et les alertes de ce site seulement.",
    });
    expect(emailSiteHint({ ...row, siteId: "s-a", savedSiteId: "s-a", email: "autre@example.com", forAlerts: false }, sites)).toEqual({
      kept: true,
      text: "(site Site Test A) — reçoit les rapports de ce site seulement.",
    });
  });

  it("a site's address with no box ticked receives nothing", () => {
    expect(emailSiteHint({ ...row, siteId: "s-b", forReports: false, forAlerts: false }, sites)?.text).toBe(
      "(site Site Test B) — adresse de ce site seulement ; aucune case cochée, elle ne reçoit rien."
    );
  });

  it("what the form offers on a deactivated site, the server saves (any row, retyped or new)", () => {
    // Saved: one address bound to « Site Test Fermé ». The form offers that
    // site on every row; the hint says « ce site seulement »; the save agrees.
    const saved = new Map<string, string | null>([["magasin@example.com", "s-closed"]]);
    const offered = siteOptions(sites, [...saved.values()]).map((site) => site.id);
    expect(offered).toContain("s-closed");
    const retyped = { ...row, email: "magasin.nord@example.com", siteId: "s-closed", savedSiteId: "s-closed" };
    expect(emailSiteHint(retyped, sites)?.kept).toBe(true);
    const sent = [
      { email: retyped.email, label: null, forReports: true, forAlerts: true, siteId: "s-closed" },
      { email: "nouveau@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-closed" },
    ];
    expect(emailSitesRefusal(sent, sites, saved)).toBeNull();
  });

  it("warns when an address of a site is given back to the whole client", () => {
    expect(emailSiteHint({ ...row, siteId: null, savedSiteId: "s-b" }, sites)).toEqual({
      kept: false,
      text: "Adresse générale : elle ne sera plus réservée au site Site Test B et, cochée, recevra les envois de tous les sites.",
    });
  });
});
