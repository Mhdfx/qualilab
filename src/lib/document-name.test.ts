import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_NAME_MAX,
  DOCUMENT_NAME_PREFIX,
  defaultDocumentName,
  onlyDocumentNameChange,
  readDocumentName,
  userDocumentName,
} from "./document-name";

/** Test names only (public repository): never a real person's. */
describe("defaultDocumentName — « Technicien de QUALILAB 'I.NOM' » (lot 1b, Q22)", () => {
  it("prints the function, the laboratory, the initial of the first given name and the family name in capitals", () => {
    expect(DOCUMENT_NAME_PREFIX).toBe("Technicien de QUALILAB");
    expect(defaultDocumentName("Karim Nomtest")).toBe("Technicien de QUALILAB 'K.NOMTEST'");
    expect(defaultDocumentName("  personne   test  ")).toBe("Technicien de QUALILAB 'P.TEST'");
  });

  it("takes the first of several given names, and both initials of a hyphenated one", () => {
    expect(defaultDocumentName("Mohamed Amine Nomtest")).toBe("Technicien de QUALILAB 'M.NOMTEST'");
    expect(defaultDocumentName("Jean-Pierre Nomtest")).toBe("Technicien de QUALILAB 'J.-P.NOMTEST'");
    expect(defaultDocumentName("Fatima-Zahra Nomtest")).toBe("Technicien de QUALILAB 'F.-Z.NOMTEST'");
  });

  it("keeps the particles with the family name", () => {
    expect(defaultDocumentName("Karim El Nomtest")).toBe("Technicien de QUALILAB 'K.EL NOMTEST'");
    expect(defaultDocumentName("Personne Ben Test")).toBe("Technicien de QUALILAB 'P.BEN TEST'");
    expect(defaultDocumentName("Jean de La Test")).toBe("Technicien de QUALILAB 'J.DE LA TEST'");
    expect(defaultDocumentName("Personne Aït Test")).toBe("Technicien de QUALILAB 'P.AÏT TEST'");
    // The first word always stays a given name, even when it reads like a particle.
    expect(defaultDocumentName("El Mehdi Nomtest")).toBe("Technicien de QUALILAB 'E.NOMTEST'");
    // A particle with an apostrophe is part of its word.
    expect(defaultDocumentName("Personne d'Test")).toBe("Technicien de QUALILAB 'P.D'TEST'");
  });

  it("keeps the accents, in capitals", () => {
    expect(defaultDocumentName("Hélène Têstè")).toBe("Technicien de QUALILAB 'H.TÊSTÈ'");
    expect(defaultDocumentName("Éric Nomtest")).toBe("Technicien de QUALILAB 'É.NOMTEST'");
    expect(defaultDocumentName("ömer çatest")).toBe("Technicien de QUALILAB 'Ö.ÇATEST'");
  });

  it("reads a family name typed first in capitals", () => {
    expect(defaultDocumentName("NOMTEST Karim")).toBe("Technicien de QUALILAB 'K.NOMTEST'");
    expect(defaultDocumentName("EL NOMTEST Fatima Zahra")).toBe("Technicien de QUALILAB 'F.EL NOMTEST'");
    // All in capitals: the usual order.
    expect(defaultDocumentName("KARIM NOMTEST")).toBe("Technicien de QUALILAB 'K.NOMTEST'");
    // An initial already typed stays one initial.
    expect(defaultDocumentName("K. Nomtest")).toBe("Technicien de QUALILAB 'K.NOMTEST'");
  });

  it("handles a one-word name and an empty one", () => {
    expect(defaultDocumentName("Préleveur")).toBe("Technicien de QUALILAB 'PRÉLEVEUR'");
    expect(defaultDocumentName("admin")).toBe("Technicien de QUALILAB 'ADMIN'");
    expect(defaultDocumentName("")).toBe("Technicien de QUALILAB");
    expect(defaultDocumentName("   ")).toBe("Technicien de QUALILAB");
    expect(defaultDocumentName(null)).toBe("Technicien de QUALILAB");
  });
});

describe("userDocumentName — the account's own denomination, else the default", () => {
  it("prints the denomination typed in /admin/utilisateurs as typed", () => {
    expect(userDocumentName({ name: "Karim Nomtest", documentName: "Préleveur de QUALILAB 'X.NOM'" })).toBe(
      "Préleveur de QUALILAB 'X.NOM'"
    );
    expect(userDocumentName({ name: "Karim Nomtest", documentName: "  Technicien 'X.NOM'  " })).toBe("Technicien 'X.NOM'");
  });

  it("falls back to the default when none is typed", () => {
    expect(userDocumentName({ name: "Karim Nomtest", documentName: null })).toBe("Technicien de QUALILAB 'K.NOMTEST'");
    expect(userDocumentName({ name: "Karim Nomtest", documentName: "   " })).toBe("Technicien de QUALILAB 'K.NOMTEST'");
    expect(userDocumentName({ name: "Karim Nomtest" })).toBe("Technicien de QUALILAB 'K.NOMTEST'");
  });
});

describe("readDocumentName — PATCH /api/admin/users/[id]", () => {
  it("trims, collapses the inner spaces and keeps what fits the column", () => {
    expect(readDocumentName("  Technicien de QUALILAB   'X.NOM' ")).toEqual({ ok: true, value: "Technicien de QUALILAB 'X.NOM'" });
    expect(readDocumentName("a".repeat(DOCUMENT_NAME_MAX))).toEqual({ ok: true, value: "a".repeat(191) });
  });

  it("reads empty or null as « back to the default »", () => {
    expect(readDocumentName("")).toEqual({ ok: true, value: null });
    expect(readDocumentName("   ")).toEqual({ ok: true, value: null });
    expect(readDocumentName(null)).toEqual({ ok: true, value: null });
  });

  it("refuses what is too long or not text", () => {
    const tooLong = readDocumentName("a".repeat(DOCUMENT_NAME_MAX + 1));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toBe("La dénomination sur les documents ne peut pas dépasser 191 caractères.");
    for (const value of [42, true, {}, ["x"], undefined]) {
      expect(readDocumentName(value)).toEqual({ ok: false, error: "Dénomination sur les documents invalide." });
    }
  });
});

describe("onlyDocumentNameChange — the one field allowed on one's own account", () => {
  it("allows a request that changes the denomination alone", () => {
    expect(onlyDocumentNameChange({ documentName: "X" })).toBe(true);
    expect(onlyDocumentNameChange({ documentName: null })).toBe(true);
    // An unknown key is ignored by the route, as before.
    expect(onlyDocumentNameChange({ documentName: "", other: 1 })).toBe(true);
  });

  it("refuses a role, a client, a ban or a password — even alongside the denomination", () => {
    expect(onlyDocumentNameChange({})).toBe(false);
    for (const key of ["role", "clientId", "banned", "password"]) {
      expect(onlyDocumentNameChange({ [key]: null }), key).toBe(false);
      expect(onlyDocumentNameChange({ documentName: "X", [key]: "x" }), key).toBe(false);
    }
  });
});

describe("PATCH /api/admin/users/[id] — the denomination (read from the source: the route imports the database)", () => {
  const route = readFileSync(new URL("../app/api/admin/users/[id]/route.ts", import.meta.url), "utf8");

  it("stays ADMIN only, and lets one's own account through for the denomination alone", () => {
    expect(route).toContain('requireApiRole("ADMIN")');
    expect(route).toContain("if (user.id === session.id && !onlyDocumentNameChange(fields)) {");
    // The self check comes before any write.
    expect(route.indexOf("onlyDocumentNameChange(fields)")).toBeLessThan(route.indexOf("prisma.$transaction"));
  });

  it("reads the body's denomination with the shared rule and refuses a bad one before writing", () => {
    expect(route).toContain("readDocumentName(fields.documentName)");
    expect(route.indexOf("readDocumentName(fields.documentName)")).toBeLessThan(route.indexOf("prisma.$transaction"));
    expect(route).toContain("...(documentNameChanged ? { documentName: nextDocumentName } : {})");
  });

  it("journals the change with the old and the new value, and answers with it", () => {
    expect(route).toContain('action: "USER_DOCUMENT_NAME_CHANGED"');
    expect(route).toContain("metadata: { username: user.username, from: user.documentName, to: nextDocumentName }");
    const answer = route.slice(route.lastIndexOf("const updated = await prisma.user.findUnique"));
    expect(answer).toContain("documentName: true");
  });
});
