import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import { SITE_KEEPER_ROLES, createdSiteActive } from "./site-creation";

describe("createdSiteActive — a site created from the visit or the deposit", () => {
  it("is always active for the préleveur and the reception", () => {
    for (const role of ["PRELEVEUR", "RECEPTIONNISTE"] as const) {
      expect(createdSiteActive(role, false), role).toBe(true);
      expect(createdSiteActive(role, true), role).toBe(true);
    }
  });

  it("follows the request for those who keep the client's sites", () => {
    for (const role of SITE_KEEPER_ROLES) {
      expect(createdSiteActive(role, false), role).toBe(false);
      expect(createdSiteActive(role, true), role).toBe(true);
    }
  });

  it("lets nobody else deactivate a site at its creation", () => {
    for (const role of ROLES.filter((r) => !(SITE_KEEPER_ROLES as readonly string[]).includes(r))) {
      expect(createdSiteActive(role, false), role).toBe(true);
    }
  });
});
