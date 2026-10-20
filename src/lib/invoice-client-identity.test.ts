import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLIENT_IDENTITY_SELECT,
  clientSnapshotOf,
  invoiceClientIdentity,
  parseClientSnapshot,
} from "./invoice-client-identity";

const live = {
  name: "Laiterie Exemple (nouveau nom)",
  address: "99 avenue Nouvelle, Ville",
  contact: "M. Nouveau",
  phone: "0500000000",
  email: "nouveau@example.test",
  ice: "000000000000099",
  fiscalId: "99999999",
  tradeRegister: "9999 Ville",
};

const frozen = {
  name: "Laiterie Exemple",
  address: "12 rue des Essais, Ville",
  contact: null,
  phone: null,
  email: "compta@example.test",
  ice: "000000000000012",
  fiscalId: "12121212",
  tradeRegister: "1212 Ville",
};

/** An identity as a row or a snapshot taken before 20/10 holds it: no IF, no RC. */
function withoutIfRc<T extends { fiscalId: unknown; tradeRegister: unknown }>(identity: T): Omit<T, "fiscalId" | "tradeRegister"> {
  const copy: Partial<T> = { ...identity };
  delete copy.fiscalId;
  delete copy.tradeRegister;
  return copy as Omit<T, "fiscalId" | "tradeRegister">;
}

describe("clientSnapshotOf", () => {
  it("keeps exactly the six printed fields, the IF and the RC (H2)", () => {
    const row = { ...live, id: "c1", archived: false, createdAt: new Date() };
    expect(clientSnapshotOf(row)).toEqual(live);
    expect(Object.keys(clientSnapshotOf(row)).sort()).toEqual([
      "address",
      "contact",
      "email",
      "fiscalId",
      "ice",
      "name",
      "phone",
      "tradeRegister",
    ]);
  });

  it("copies an IF and an RC the source does not hold as empty", () => {
    const withoutTaxIds = withoutIfRc(live);
    expect(clientSnapshotOf(withoutTaxIds)).toEqual({ ...live, fiscalId: null, tradeRegister: null });
  });
});

describe("parseClientSnapshot", () => {
  it("reads a stored snapshot back", () => {
    expect(parseClientSnapshot(frozen)).toEqual(frozen);
  });

  it("reads missing optional fields as null", () => {
    expect(parseClientSnapshot({ name: "Client Test" })).toEqual({
      name: "Client Test",
      address: null,
      contact: null,
      phone: null,
      email: null,
      ice: null,
      fiscalId: null,
      tradeRegister: null,
    });
  });

  it("reads a snapshot taken before 20/10 (no IF, no RC) with them empty", () => {
    const beforeH2 = withoutIfRc(frozen);
    expect(parseClientSnapshot(beforeH2)).toEqual({ ...frozen, fiscalId: null, tradeRegister: null });
  });

  it("accepts the column handed back as a JSON string", () => {
    expect(parseClientSnapshot(JSON.stringify(frozen))).toEqual(frozen);
  });

  it("is null for nothing or a damaged value, never throws", () => {
    expect(parseClientSnapshot(null)).toBeNull();
    expect(parseClientSnapshot(undefined)).toBeNull();
    expect(parseClientSnapshot("{not json")).toBeNull();
    expect(parseClientSnapshot([frozen])).toBeNull();
    expect(parseClientSnapshot({ ...frozen, name: "" })).toBeNull();
    expect(parseClientSnapshot({ ...frozen, name: 12 })).toBeNull();
    expect(parseClientSnapshot({ ...frozen, ice: 12 })).toBeNull();
    expect(parseClientSnapshot({ ...frozen, fiscalId: 12 })).toBeNull();
    expect(parseClientSnapshot({ ...frozen, tradeRegister: ["RC"] })).toBeNull();
  });
});

describe("invoiceClientIdentity", () => {
  it("an issued invoice prints the client as it was at issue", () => {
    expect(invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: frozen, client: live })).toEqual(frozen);
  });

  it("an issued invoice keeps its IF and RC when the client changes them (H2)", () => {
    expect(invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: frozen, client: live })).toMatchObject({
      fiscalId: "12121212",
      tradeRegister: "1212 Ville",
    });
  });

  it("an issued invoice whose snapshot predates the IF and the RC reads them empty, never the live client's", () => {
    const beforeH2 = withoutIfRc(frozen);
    const identity = invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: beforeH2, client: live });
    expect(identity.name).toBe(frozen.name);
    expect(identity.fiscalId).toBeNull();
    expect(identity.tradeRegister).toBeNull();
  });

  it("an issued invoice without a snapshot (before 10/10) reads the live client's IF and RC, as its name", () => {
    expect(invoiceClientIdentity({ number: "FAC-2026-0001", clientSnapshot: null, client: live })).toMatchObject({
      name: live.name,
      fiscalId: "99999999",
      tradeRegister: "9999 Ville",
    });
  });

  it("an issued invoice without a snapshot (damaged row) falls back to the live client", () => {
    expect(invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: null, client: live })).toEqual(live);
    expect(invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: { name: 3 }, client: live })).toEqual(live);
  });

  it("a draft stays live, even with a stray snapshot", () => {
    expect(invoiceClientIdentity({ number: null, clientSnapshot: null, client: live })).toEqual(live);
    expect(invoiceClientIdentity({ number: null, clientSnapshot: frozen, client: live })).toEqual(live);
  });

  it("a credit note copying its invoice's identity prints the same client", () => {
    const invoiceIdentity = invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: frozen, client: live });
    const creditNoteSnapshot = clientSnapshotOf(invoiceIdentity);
    expect(invoiceClientIdentity({ number: "AV-2026-0003", clientSnapshot: creditNoteSnapshot, client: live })).toEqual(
      frozen
    );
  });
});

describe("every issue path freezes the IF and the RC with the rest (H2)", () => {
  // The snapshot is built by clientSnapshotOf from a client read with
  // CLIENT_IDENTITY_SELECT (or, for a credit note, from its invoice's
  // identity): the select must carry the IF and the RC.
  it("CLIENT_IDENTITY_SELECT reads the IF and the RC", () => {
    expect(CLIENT_IDENTITY_SELECT).toMatchObject({ fiscalId: true, tradeRegister: true });
  });

  for (const file of [
    "../app/api/invoices/route.ts",
    "../app/api/invoices/[id]/route.ts",
    "../app/api/invoices/[id]/issue/route.ts",
    "../app/api/invoices/[id]/credit-notes/route.ts",
  ]) {
    it(file.replace("../app/", ""), () => {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source).toContain("CLIENT_IDENTITY_SELECT");
      expect(source).toMatch(/clientSnapshot: clientSnapshotOf\(/);
    });
  }
});

describe("the documents that print the client read the frozen identity", () => {
  // The PDF prints it; the accounting export lists it. Both must read the
  // snapshot taken at issue, never `client.name` alone, or a rename / merge of
  // the client would rewrite what an issued invoice says.
  for (const file of ["../app/api/invoices/[id]/pdf/route.ts", "../app/api/invoices/export/route.ts"]) {
    it(file.replace("../app/", ""), () => {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source).toContain("invoiceClientIdentity(");
    });
  }
});

describe("the one-time snapshot backfill of HANDOFF §9 (Q54, E4) freezes every field (H2)", () => {
  // Since H2 a snapshot without the IF and the RC exports them empty for good
  // (no fallback to the live client): the documented statement must write all
  // eight keys, or running it would freeze every pre-10/10 invoice without them.
  const handoff = readFileSync(fileURLToPath(new URL("../../HANDOFF.md", import.meta.url)), "utf8");
  const statement = handoff.split("\n").find((line) => line.includes("SET i.`clientSnapshot` = JSON_OBJECT("));

  it("is documented", () => {
    expect(statement).toBeDefined();
  });

  it("writes exactly the keys of CLIENT_IDENTITY_SELECT, each from the client's column of that name", () => {
    const body = (statement ?? "").slice((statement ?? "").indexOf("JSON_OBJECT("));
    const pairs = [...body.slice(0, body.indexOf(")")).matchAll(/'(\w+)', c\.`(\w+)`/g)];
    expect(pairs.map(([, key]) => key)).toEqual(Object.keys(CLIENT_IDENTITY_SELECT));
    for (const [, key, column] of pairs) expect(column, key).toBe(key);
  });

  it("what it writes reads back with the client's IF and RC, an empty one as null", () => {
    const backfilled = { ...live, fiscalId: "40123456", tradeRegister: null };
    expect(invoiceClientIdentity({ number: "FAC-2026-0001", clientSnapshot: backfilled, client: { ...live, name: "Autre" } })).toEqual(
      backfilled
    );
  });
});
