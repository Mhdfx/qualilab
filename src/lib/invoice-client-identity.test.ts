import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clientSnapshotOf, invoiceClientIdentity, parseClientSnapshot } from "./invoice-client-identity";

const live = {
  name: "Laiterie Exemple (nouveau nom)",
  address: "99 avenue Nouvelle, Ville",
  contact: "M. Nouveau",
  phone: "0500000000",
  email: "nouveau@example.test",
  ice: "000000000000099",
};

const frozen = {
  name: "Laiterie Exemple",
  address: "12 rue des Essais, Ville",
  contact: null,
  phone: null,
  email: "compta@example.test",
  ice: "000000000000012",
};

describe("clientSnapshotOf", () => {
  it("keeps exactly the six printed fields", () => {
    const row = { ...live, id: "c1", archived: false, createdAt: new Date() };
    expect(clientSnapshotOf(row)).toEqual(live);
    expect(Object.keys(clientSnapshotOf(row)).sort()).toEqual(["address", "contact", "email", "ice", "name", "phone"]);
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
    });
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
  });
});

describe("invoiceClientIdentity", () => {
  it("an issued invoice prints the client as it was at issue", () => {
    expect(invoiceClientIdentity({ number: "FAC-2026-0042", clientSnapshot: frozen, client: live })).toEqual(frozen);
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
