import { describe, expect, it } from "vitest";
import { addressApplies, otherSitesMessage, pickRecipients, resolveRecipients, siteAddressHint, type ClientAddress } from "./email-recipients";

/** « TEST UI » chain: a head office address, one per shop, one shop address unticked. */
const direction: ClientAddress = { email: "direction@exemple.test", siteId: null, forReports: true, forAlerts: true };
const qualite: ClientAddress = { email: "qualite@exemple.test", siteId: null, forReports: true, forAlerts: false };
const shopA: ClientAddress = { email: "magasin-a@exemple.test", siteId: "site-a", forReports: true, forAlerts: true };
const shopB: ClientAddress = { email: "magasin-b@exemple.test", siteId: "site-b", forReports: true, forAlerts: true };
const shopAUnticked: ClientAddress = { email: "gerant-a@exemple.test", siteId: "site-a", forReports: false, forAlerts: false };

const chain = { email: "contact@exemple.test", emails: [direction, qualite, shopA, shopB, shopAUnticked] };

describe("pickRecipients — a site's addresses receive only that site's mail (D-04)", () => {
  it("sends a site's report to the client-wide addresses and to that site's own", () => {
    expect(pickRecipients(chain, "reports", "site-a")).toEqual([
      "direction@exemple.test",
      "qualite@exemple.test",
      "magasin-a@exemple.test",
    ]);
  });

  it("never sends to another site's address", () => {
    expect(pickRecipients(chain, "reports", "site-b")).not.toContain("magasin-a@exemple.test");
    expect(pickRecipients(chain, "alerts", "site-b")).toEqual(["direction@exemple.test", "magasin-b@exemple.test"]);
  });

  it("keeps site addresses out when the site is not known (the siège, an older caller)", () => {
    expect(pickRecipients(chain, "reports", null)).toEqual(["direction@exemple.test", "qualite@exemple.test"]);
    expect(pickRecipients(chain, "reports")).toEqual(["direction@exemple.test", "qualite@exemple.test"]);
  });

  it("follows the boxes « Reçoit les rapports » / « Reçoit les alertes »", () => {
    expect(pickRecipients(chain, "alerts", "site-a")).toEqual(["direction@exemple.test", "magasin-a@exemple.test"]);
    expect(pickRecipients(chain, "reports", "site-a")).not.toContain("gerant-a@exemple.test");
  });

  it("falls back to the client record's address when no address of the list applies", () => {
    expect(pickRecipients({ email: "contact@exemple.test", emails: [] }, "reports", "site-a")).toEqual(["contact@exemple.test"]);
    // Only another site's address, or only unticked ones: the record's address.
    expect(pickRecipients({ email: "contact@exemple.test", emails: [shopB] }, "reports", "site-a")).toEqual(["contact@exemple.test"]);
    expect(pickRecipients({ email: "contact@exemple.test", emails: [shopB] }, "alerts", null)).toEqual(["contact@exemple.test"]);
    expect(pickRecipients({ email: "contact@exemple.test", emails: [shopAUnticked] }, "reports", "site-a")).toEqual([
      "contact@exemple.test",
    ]);
  });

  it("returns nobody without a list or a record address", () => {
    expect(pickRecipients({ email: null, emails: [] }, "reports", "site-a")).toEqual([]);
    expect(pickRecipients({ email: null, emails: [shopB] }, "reports", "site-a")).toEqual([]);
  });

  it("never falls back on a record address that is another site's", () => {
    // The shop B manager's address typed into the record (any case): not for site A, nor for the siège.
    const record = { email: " Magasin-B@exemple.test ", emails: [shopB] };
    expect(pickRecipients(record, "reports", "site-a")).toEqual([]);
    expect(pickRecipients(record, "alerts", null)).toEqual([]);
    // Unticked, it is still shop B's.
    expect(pickRecipients({ email: "magasin-b@exemple.test", emails: [{ ...shopB, forReports: false }] }, "reports", "site-a")).toEqual([]);
    // For site B itself, its own address applies anyway.
    expect(pickRecipients(record, "reports", "site-b")).toEqual(["magasin-b@exemple.test"]);
    // An address of the site the mail is about, unticked, still falls back.
    expect(pickRecipients({ email: "gerant-a@exemple.test", emails: [shopAUnticked] }, "reports", "site-a")).toEqual(["gerant-a@exemple.test"]);
  });

  it("never lists an address twice", () => {
    expect(pickRecipients({ email: null, emails: [direction, { ...direction }] }, "reports", null)).toEqual([
      "direction@exemple.test",
    ]);
  });
});

describe("resolveRecipients — why nobody receives a mail", () => {
  it("says when every address belongs to another site", () => {
    expect(resolveRecipients({ email: null, emails: [shopB] }, "reports", "site-a")).toEqual({ to: [], otherSitesOnly: true });
    expect(resolveRecipients({ email: null, emails: [shopA, shopB] }, "alerts", null)).toEqual({ to: [], otherSitesOnly: true });
    // The record's address withheld because it is shop B's.
    expect(resolveRecipients({ email: "magasin-b@exemple.test", emails: [{ ...shopB, forReports: false }] }, "reports", "site-a")).toEqual({
      to: [],
      otherSitesOnly: true,
    });
  });

  it("does not blame the sites when there is simply no address", () => {
    expect(resolveRecipients({ email: null, emails: [] }, "reports", "site-a")).toEqual({ to: [], otherSitesOnly: false });
    // Only unticked addresses: nothing ticked anywhere, the sites are not the reason.
    expect(resolveRecipients({ email: null, emails: [shopAUnticked, { ...shopB, forAlerts: false }] }, "alerts", "site-a")).toEqual({
      to: [],
      otherSitesOnly: false,
    });
    expect(resolveRecipients(chain, "reports", "site-a")).toMatchObject({ otherSitesOnly: false });
  });

  it("words the refusal for a site and for the siège", () => {
    expect(otherSitesMessage("reports", "site-a")).toBe(
      "Aucune adresse email pour ce site ni pour l'ensemble du client : les adresses enregistrées appartiennent à d'autres sites. Ajoutez une adresse générale sur la fiche client."
    );
    expect(otherSitesMessage("alerts", null)).toBe(
      "Aucune adresse d'alerte pour l'ensemble du client : les adresses enregistrées appartiennent à ses sites et ne reçoivent que leurs envois. Ajoutez une adresse générale sur la fiche client."
    );
  });
});

describe("addressApplies", () => {
  it("takes a client-wide address for any site, a site's address for its own site only", () => {
    expect(addressApplies(direction, "reports", "site-b")).toBe(true);
    expect(addressApplies(direction, "reports", null)).toBe(true);
    expect(addressApplies(shopA, "reports", "site-a")).toBe(true);
    expect(addressApplies(shopA, "reports", "site-b")).toBe(false);
    expect(addressApplies(shopA, "reports", null)).toBe(false);
    expect(addressApplies(qualite, "alerts", "site-a")).toBe(false);
  });
});

describe("siteAddressHint — the client form under a site's address", () => {
  const both = { forReports: true, forAlerts: true };
  it("says what the address receives, from its two boxes, while it is unchanged", () => {
    expect(siteAddressHint("Magasin A", "magasin-a@exemple.test", "magasin-a@exemple.test", both)).toEqual({
      kept: true,
      text: "(site Magasin A) — reçoit les rapports et les alertes de ce site seulement.",
    });
    expect(siteAddressHint("Magasin A", "magasin-a@exemple.test", "magasin-a@exemple.test", { forReports: true, forAlerts: false }).text).toBe(
      "(site Magasin A) — reçoit les rapports de ce site seulement."
    );
    expect(siteAddressHint("Magasin A", "magasin-a@exemple.test", "magasin-a@exemple.test", { forReports: false, forAlerts: true }).text).toBe(
      "(site Magasin A) — reçoit les alertes de ce site seulement."
    );
    // The sites import and the attachment as a site leave both boxes unticked.
    expect(siteAddressHint("Magasin A", "magasin-a@exemple.test", "magasin-a@exemple.test", { forReports: false, forAlerts: false }).text).toBe(
      "(site Magasin A) — adresse de ce site seulement ; aucune case cochée, elle ne reçoit rien."
    );
    // The server matches the address in any case, spaces trimmed.
    expect(siteAddressHint("Magasin A", "magasin-a@exemple.test", " Magasin-A@exemple.test ", both).kept).toBe(true);
  });

  it("warns that a retyped address leaves its site", () => {
    const hint = siteAddressHint("Magasin A", "magasin-a@exemple.test", "magasin-a2@exemple.test", both);
    expect(hint.kept).toBe(false);
    expect(hint.text).toBe(
      "(site Magasin A) — adresse modifiée : elle ne sera plus rattachée à ce site et, cochée, recevra les envois de tous les sites."
    );
  });
});
