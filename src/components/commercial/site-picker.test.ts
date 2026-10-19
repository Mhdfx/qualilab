import { describe, expect, it } from "vitest";
import { siteDraftBody, siteDraftFor, siteDraftName, siteDraftPending, siteDraftTyped, withNewSite } from "./SitePicker";

describe("SitePicker — the new site's name waiting to be created", () => {
  it("reads the name typed for the client on screen only", () => {
    expect(siteDraftName({ clientId: "a", name: "Cuisine centrale" }, "a")).toBe("Cuisine centrale");
    expect(siteDraftName({ clientId: "a", name: "" }, "a")).toBe("");
    // Another client picked since, or none: the draft no longer shows.
    expect(siteDraftName({ clientId: "a", name: "Cuisine centrale" }, "b")).toBeNull();
    expect(siteDraftName({ clientId: "", name: "Cuisine centrale" }, "")).toBeNull();
    // Cancelled or created: no draft.
    expect(siteDraftName(null, "a")).toBeNull();
  });

  it("is pending while a non-empty name is typed and not created", () => {
    expect(siteDraftPending("Cuisine centrale")).toBe(true);
    expect(siteDraftPending("  Cuisine  ")).toBe(true);
    // « + Nouveau site… » opened but nothing typed: the form may move on with the siège.
    expect(siteDraftPending("")).toBe(false);
    expect(siteDraftPending("   ")).toBe(false);
    expect(siteDraftPending(null)).toBe(false);
    // The client changed: the name typed for the previous one does not block.
    expect(siteDraftPending(siteDraftName({ clientId: "a", name: "Cuisine centrale" }, "b"))).toBe(false);
  });
});

describe("withNewSite", () => {
  it("adds the site to the client it was created for only", () => {
    const client = { id: "a", name: "Client Démo", ice: null, sites: [{ id: "s1", name: "Snack Démo" }] };
    const site = { id: "s2", name: "Cuisine centrale" };
    expect(withNewSite(client, "a", site)?.sites).toEqual([...client.sites, site]);
    expect(withNewSite(client, "b", site)).toBe(client);
    expect(withNewSite(null, "a", site)).toBeNull();
  });
});

describe("SitePicker — the new site's sub-form (16/10, E2)", () => {
  it("siteDraftFor keeps the draft of the client on screen only", () => {
    const draft = { clientId: "a", name: "Cuisine", city: "Agadir" };
    expect(siteDraftFor(draft, "a")).toBe(draft);
    expect(siteDraftFor(draft, "b")).toBeNull();
    expect(siteDraftFor(draft, "")).toBeNull();
    expect(siteDraftFor(null, "a")).toBeNull();
  });

  it("siteDraftTyped: a name, or any other field typed, waits to be created", () => {
    expect(siteDraftTyped({ clientId: "a", name: "Cuisine" })).toBe(true);
    expect(siteDraftTyped({ clientId: "a", name: "", address: "1 rue Test" })).toBe(true);
    expect(siteDraftTyped({ clientId: "a", name: " ", phone: " 0600000000 " })).toBe(true);
    expect(siteDraftTyped({ clientId: "a", name: "", address: "  ", city: "", contact: "", phone: "" })).toBe(false);
    expect(siteDraftTyped(null)).toBe(false);
  });

  it("siteDraftBody sends every field of the sub-form, trimmed", () => {
    expect(siteDraftBody({ clientId: "a", name: " Cuisine centrale ", address: " 1 rue Test ", city: "Agadir", contact: " Personne Test ", phone: "0600000000" })).toEqual({
      name: "Cuisine centrale",
      address: "1 rue Test",
      city: "Agadir",
      contact: "Personne Test",
      phone: "0600000000",
    });
    expect(siteDraftBody({ clientId: "a", name: "Cuisine" })).toEqual({ name: "Cuisine", address: "", city: "", contact: "", phone: "" });
  });
});
