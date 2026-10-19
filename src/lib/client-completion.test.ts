import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPLETION_GAP_LABELS, awaitsCompletion, clientCompletionGaps, completionHint, toCompleteAfterSave } from "./client-completion";

/**
 * « À compléter » (RETOUR-LABO-16-10.md E3): what a client created at the
 * counter or in the field still lacks, and when the flag goes.
 */

const bare = { ice: null, address: null, email: null, emails: [] };
const address = (email: string, extra: Partial<{ siteId: string | null; forReports: boolean; forAlerts: boolean }> = {}) => ({
  email,
  siteId: null,
  forReports: true,
  forAlerts: true,
  ...extra,
});

describe("clientCompletionGaps", () => {
  it("a client created with its name alone lacks the ICE, a report address and the postal address", () => {
    expect(clientCompletionGaps(bare)).toEqual(["ice", "reportAddress", "address"]);
  });

  it("a complete client lacks nothing", () => {
    expect(
      clientCompletionGaps({ ice: "001234567000089", address: "1 rue Test", email: null, emails: [address("rapports@example.com")] })
    ).toEqual([]);
  });

  it("an ICE made of zeros (the old software's placeholder) is no ICE", () => {
    expect(clientCompletionGaps({ ...bare, ice: "000000000000000" })).toContain("ice");
    expect(clientCompletionGaps({ ...bare, ice: " 001 234 567 000 089 " })).not.toContain("ice");
  });

  it("a blank postal address is none", () => {
    expect(clientCompletionGaps({ ...bare, address: "   " })).toContain("address");
  });

  it("the record's single address receives the reports when the list has none", () => {
    expect(clientCompletionGaps({ ...bare, email: "contact@example.com" })).not.toContain("reportAddress");
  });

  it("an address that does not receive the reports, or belongs to a site only, is no report address", () => {
    expect(clientCompletionGaps({ ...bare, emails: [address("alertes@example.com", { forReports: false })] })).toContain("reportAddress");
    expect(clientCompletionGaps({ ...bare, emails: [address("site@example.com", { siteId: "s1" })] })).toContain("reportAddress");
  });
});

describe("completionHint", () => {
  it("names what is missing, in plain French", () => {
    expect(completionHint(["ice", "reportAddress", "address"])).toBe("Manque : ICE, adresse e-mail des rapports et adresse postale.");
    expect(completionHint(["reportAddress"])).toBe(`Manque : ${COMPLETION_GAP_LABELS.reportAddress}.`);
  });

  it("nothing missing: the fiche only waits to be checked and saved", () => {
    expect(completionHint([])).toBe("Rien ne manque : vérifiez la fiche, puis enregistrez-la.");
  });
});

describe("toCompleteAfterSave — cleared by a save of the whole fiche only", () => {
  it("a full save clears the flag and says so when it was set", () => {
    expect(toCompleteAfterSave(true, true)).toEqual({ toComplete: false, completed: true });
    expect(toCompleteAfterSave(false, true)).toEqual({ toComplete: false, completed: false });
  });

  it("an archiving or a reactivation alone leaves it as it was", () => {
    expect(toCompleteAfterSave(true, false)).toEqual({ toComplete: true, completed: false });
    expect(toCompleteAfterSave(false, false)).toEqual({ toComplete: false, completed: false });
  });
});

describe("awaitsCompletion — the toggle's count, its filter and the badge", () => {
  it("is a flagged, live client; an archived one is no longer anyone's to complete", () => {
    expect(awaitsCompletion({ toComplete: true, archived: false })).toBe(true);
    expect(awaitsCompletion({ toComplete: true, archived: true })).toBe(false);
    expect(awaitsCompletion({ toComplete: false, archived: false })).toBe(false);
  });

  it("is what /commercial's list counts and filters with", () => {
    const list = readFileSync(fileURLToPath(new URL("../components/clients/ClientList.tsx", import.meta.url)), "utf8");
    expect(list).toMatch(/if \(onlyToComplete && !awaitsCompletion\(client\)\) return false;/);
    expect(list).toMatch(/const toCompleteCount = clients\.filter\(awaitsCompletion\)\.length;/);
    expect(list).not.toMatch(/onlyToComplete && !client\.toComplete/);
  });
});
