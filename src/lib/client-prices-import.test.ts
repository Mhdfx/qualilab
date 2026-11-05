import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { formatDate } from "./labels";
import {
  CLIENT_PRICE_FILE_HEADER,
  clientPriceColumns,
  equalsLegacyTariff,
  legacyDate,
  legacyPrice,
  LegacyClientResolver,
  LegacyParameterResolver,
  planClientPriceImport,
  planWritesPrices,
  preferredPrice,
  readClientPriceRows,
  type ExistingClientPrice,
  type LegacyClientPrice,
  type PriceImportDb,
} from "./client-prices-import";

/**
 * Lot 4H, H5 (RETOUR-LABO-04-11.md §5): « Importer les prix clients » — the
 * old software's prices proper to some clients, matched to our clients and
 * analyses, reported (matched / client introuvable / analyse introuvable /
 * doublons), idempotent, never over a price typed on the fiche. Invented
 * names only (public repository).
 */

const header = CLIENT_PRICE_FILE_HEADER.split(";");

function file(lines: string[]): string {
  return [CLIENT_PRICE_FILE_HEADER, ...lines].join("\n");
}

function read(lines: string[]) {
  const table = parseCsv(file(lines), ";");
  const columns = clientPriceColumns(table[0])!;
  return readClientPriceRows(table.slice(1), columns);
}

let nextLine = 2;
function row(over: Partial<LegacyClientPrice>): LegacyClientPrice {
  return {
    line: nextLine++,
    legacyPriceId: nextLine * 10,
    legacyClientId: 5,
    clientType: 101,
    client: "Traiteur Démo",
    ice: "",
    legacyParentId: null,
    parent: "",
    legacyParamId: 1,
    legacyNatureId: 1,
    parameter: "Escherichia coli",
    price: 40,
    modifiedAt: new Date("2024-03-01T10:00:00Z"),
    legacyTariff: null,
    ...over,
  };
}

const db = (over: Partial<PriceImportDb> = {}): PriceImportDb => ({
  clients: [
    { id: "c-traiteur", name: "TRAITEUR DEMO", ice: "001234567000089", archived: false, mergedIntoId: null },
    { id: "c-cafe", name: "Café d'Essai", ice: null, archived: false, mergedIntoId: null },
    { id: "c-old", name: "Ancienne Raison", ice: null, archived: true, mergedIntoId: "c-cafe" },
    { id: "c-dup1", name: "Boulangerie Test", ice: null, archived: false, mergedIntoId: null },
    { id: "c-dup2", name: "BOULANGERIE  TEST", ice: null, archived: false, mergedIntoId: null },
    { id: "c-chain", name: "Chaîne Démo", ice: null, archived: false, mergedIntoId: null },
    { id: "c-franchise", name: "Franchisé Démo", ice: null, archived: false, mergedIntoId: null },
  ],
  sites: [
    { legacyId: 900, clientId: "c-chain", billingClientId: "c-franchise" },
    { legacyId: 901, clientId: "c-chain", billingClientId: null },
  ],
  parameters: [
    { id: "p-ecoli-food", name: "E. coli", aliases: "Escherichia coli", category: "ALIMENTAIRE", family: "MICRO" },
    { id: "p-ecoli-water", name: "E. coli", aliases: "Escherichia coli", category: "EAU", family: "MICRO" },
    { id: "p-salmo", name: "Salmonella", aliases: null, category: "ALIMENTAIRE", family: "MICRO" },
    { id: "p-ph", name: "pH", aliases: null, category: "EAU", family: "CHIMIE" },
    { id: "p-flore-air", name: "Flore totale", aliases: null, category: "AMBIANCE", family: "MICRO" },
  ],
  natures: [
    { legacyId: 1, category: "ALIMENTAIRE", family: "MICRO" },
    { legacyId: 3, category: "EAU", family: "MICRO" },
    { legacyId: 2, category: "EAU", family: "CHIMIE" },
    { legacyId: 4, category: "AMBIANCE", family: "MICRO" },
  ],
  existing: [],
  ...over,
});

describe("reading the file", () => {
  it("finds the columns by name and reads each row", () => {
    expect(clientPriceColumns(header)).not.toBeNull();
    expect(clientPriceColumns(["client", "prix"])).toBeNull();
    const { rows, rejected } = read([
      "6442;5;101;Traiteur Démo;001234567000089;0;;;1;1;Micro-organismes-1 à 30°C;40.00;2022-02-22 10:12:26;40.00",
      "6443;7;102;Site Nord;;0;3;Chaîne Démo;5;1;Recherche des Salmonella;75,50;;0",
    ]);
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      legacyPriceId: 6442,
      legacyClientId: 5,
      clientType: 101,
      ice: "001234567000089",
      legacyNatureId: 1,
      parameter: "Micro-organismes-1 à 30°C",
      price: 40,
      legacyTariff: 40,
    });
    // The laboratory's wall clock (UTC+1 in 2022).
    expect(rows[0].modifiedAt?.toISOString()).toBe("2022-02-22T09:12:26.000Z");
    expect(rows[1]).toMatchObject({ clientType: 102, legacyParentId: 3, parent: "Chaîne Démo", price: 75.5, modifiedAt: null, legacyTariff: null });
  });

  it("reads a file written before « tarifAncien » existed: no tariff, nothing compared", () => {
    const old = "legacyPriceId;legacyClientId;clientType;client;ice;clientObsolete;legacyParentId;parent;legacyParamId;legacyNatureId;parametre;prix;derniereModification";
    const table = parseCsv(`${old}\n6442;5;101;Traiteur Démo;;0;;;1;1;pH;40.00;`, ";");
    const columns = clientPriceColumns(table[0]);
    expect(columns).not.toBeNull();
    const { rows } = readClientPriceRows(table.slice(1), columns!);
    expect(rows[0].legacyTariff).toBeNull();
    expect(equalsLegacyTariff(rows[0])).toBe(false);
  });

  it("rejects a row without its ids, its client, its analysis or a readable price, with the line", () => {
    const { rows, rejected } = read([
      ";5;101;A;;0;;;1;1;pH;10;",
      "1;x;101;A;;0;;;1;1;pH;10;",
      "2;5;101;;;0;;;1;1;pH;10;",
      "3;5;101;A;;0;;;1;1;;10;",
      "4;5;101;A;;0;;;1;1;pH;dix;",
    ]);
    expect(rows).toEqual([]);
    expect(rejected.map((r) => [r.line, r.reason])).toEqual([
      [2, "Identifiant du prix manquant ou invalide."],
      [3, "Identifiant du client manquant ou invalide."],
      [4, "Nom du client manquant."],
      [5, "Analyse manquante."],
      [6, "Prix illisible « dix »."],
    ]);
  });

  it("reads prices and dates as the old software writes them", () => {
    expect(legacyPrice("250.00")).toBe(250);
    expect(legacyPrice("249,5")).toBe(249.5);
    expect(legacyPrice("1 200")).toBe(1200);
    expect(legacyPrice("0.00")).toBe(0);
    expect(legacyPrice("-3")).toBeNull();
    expect(legacyPrice("20000000")).toBeNull();
    // Before 20/09/2026 the laboratory's clock was UTC+1, plain UTC since.
    expect(legacyDate("2026-09-07 15:17:49")?.toISOString()).toBe("2026-09-07T14:17:49.000Z");
    expect(legacyDate("2026-09-07")?.toISOString()).toBe("2026-09-06T23:00:00.000Z");
    expect(legacyDate("2026-10-05 23:30:00")?.toISOString()).toBe("2026-10-05T23:30:00.000Z");
    expect(legacyDate("")).toBeNull();
    expect(legacyDate("2026-13-01")).toBeNull();
  });

  it("a change made late in the evening is shown on its own day, not the next one", () => {
    expect(formatDate(legacyDate("2024-03-05 23:30:00")!)).toBe(formatDate(legacyDate("2024-03-05 08:00:00")!));
    expect(formatDate(legacyDate("2024-03-05 23:30:00")!)).not.toBe(formatDate(legacyDate("2024-03-06 08:00:00")!));
  });
});

describe("finding the client — our clients keep no id of the old software", () => {
  const resolver = new LegacyClientResolver(db().clients, db().sites);
  const base = { legacyClientId: 5, clientType: 101, client: "", ice: "", parent: "" };

  it("by the ICE first, digits only", () => {
    expect(resolver.resolve({ ...base, client: "Autre nom", ice: "001 234 567 000 089" })).toEqual({ status: "found", clientId: "c-traiteur", by: "ice" });
  });

  it("never by a scrap of ICE: then by the name, accents, case and spacing aside", () => {
    expect(resolver.resolve({ ...base, client: "cafe d essai", ice: "0" })).toEqual({ status: "found", clientId: "c-cafe", by: "nom" });
    expect(resolver.resolve({ ...base, client: "Traiteur demo" })).toEqual({ status: "found", clientId: "c-traiteur", by: "nom" });
  });

  it("a merged client stands for the client it was merged into", () => {
    expect(resolver.resolve({ ...base, client: "Ancienne raison" })).toEqual({ status: "found", clientId: "c-cafe", by: "nom" });
  });

  it("says ambiguous when the name names two fiches, missing when none", () => {
    expect(resolver.resolve({ ...base, client: "Boulangerie test" })).toEqual({
      status: "ambiguous",
      candidates: ["Boulangerie Test", "BOULANGERIE  TEST"],
    });
    expect(resolver.resolve({ ...base, client: "Inconnu SARL" })).toEqual({ status: "missing" });
  });

  it("a site of the old software: the client billed for our site (hypothèse), else its client, else its parent by name", () => {
    const site = { ...base, clientType: 102, client: "Site Nord", parent: "Chaîne Démo" };
    expect(resolver.resolve({ ...site, legacyClientId: 900 })).toEqual({ status: "found", clientId: "c-franchise", by: "site" });
    expect(resolver.resolve({ ...site, legacyClientId: 901 })).toEqual({ status: "found", clientId: "c-chain", by: "site" });
    expect(resolver.resolve({ ...site, legacyClientId: 999 })).toEqual({ status: "found", clientId: "c-chain", by: "parent" });
    expect(resolver.resolve({ ...site, legacyClientId: 999, parent: "" })).toEqual({ status: "missing" });
  });

  it("prefers an active client to an archived one of the same name", () => {
    const r = new LegacyClientResolver(
      [
        { id: "a", name: "Hôtel Démo", ice: null, archived: true, mergedIntoId: null },
        { id: "b", name: "Hotel demo", ice: null, archived: false, mergedIntoId: null },
      ],
      []
    );
    expect(r.resolve({ ...base, client: "HOTEL DEMO" })).toEqual({ status: "found", clientId: "b", by: "nom" });
  });

  it("decides between clients sharing an ICE by the name", () => {
    const r = new LegacyClientResolver(
      [
        { id: "a", name: "Groupe Démo Nord", ice: "001234567000089", archived: false, mergedIntoId: null },
        { id: "b", name: "Groupe Démo Sud", ice: "001234567000089", archived: false, mergedIntoId: null },
      ],
      []
    );
    expect(r.resolve({ ...base, client: "Groupe Demo Sud", ice: "001234567000089" })).toEqual({ status: "found", clientId: "b", by: "ice" });
    expect(r.resolve({ ...base, client: "Groupe Démo", ice: "001234567000089" })).toEqual({ status: "missing" });
  });
});

describe("finding the analysis — the catalogue reprise's rule", () => {
  const resolver = new LegacyParameterResolver(db().parameters, db().natures);

  it("in the domain of the type d'analyse, by the name or an alias", () => {
    expect(resolver.resolve("Escherichia coli", 1)).toEqual({ parameter: expect.objectContaining({ id: "p-ecoli-food" }) });
    expect(resolver.resolve("Escherichia coli", 3)).toEqual({ parameter: expect.objectContaining({ id: "p-ecoli-water" }) });
    expect(resolver.resolve("Recherche des Salmonella", 1)).toEqual({ parameter: expect.objectContaining({ id: "p-salmo" }) });
    expect(resolver.resolve("pH", 2)).toEqual({ parameter: expect.objectContaining({ id: "p-ph" }) });
  });

  it("never across domains: an analysis absent from the type's domain is not found", () => {
    expect(resolver.resolve("Salmonella", 3)).toEqual({ reason: "Analyse absente du catalogue pour ce type d'analyse." });
  });

  it("without a type d'analyse: food first, then water, then the environment (micro)", () => {
    expect(resolver.resolve("E. coli", null)).toEqual({ parameter: expect.objectContaining({ id: "p-ecoli-food" }) });
    expect(resolver.resolve("Flore totale", 77)).toEqual({ parameter: expect.objectContaining({ id: "p-flore-air" }) });
    expect(resolver.resolve("Inconnu", null)).toMatchObject({ reason: expect.stringMatching(/sans type d'analyse/) });
    expect(resolver.resolve("***", 1)).toEqual({ reason: "Libellé d'analyse illisible." });
  });
});

describe("planClientPriceImport", () => {
  it("counts matched, client introuvable, analyse introuvable, doublons, prix à 0 and illisibles", () => {
    const rows = [
      row({ legacyPriceId: 1, price: 40 }),
      row({ legacyPriceId: 2, parameter: "Salmonella", price: 75 }),
      row({ legacyPriceId: 3, price: 0 }),
      row({ legacyPriceId: 4, legacyClientId: 77, client: "Inconnu SARL" }),
      row({ legacyPriceId: 5, legacyClientId: 77, client: "Inconnu SARL", parameter: "Salmonella" }),
      row({ legacyPriceId: 6, legacyClientId: 8, client: "Boulangerie Test" }),
      row({ legacyPriceId: 7, parameter: "Levures osmophiles" }),
    ];
    const plan = planClientPriceImport(rows, [{ line: 99, client: "X", parameter: "", reason: "Analyse manquante." }], db());
    expect(plan.rows).toBe(8);
    expect(plan.counts).toMatchObject({
      create: 2,
      zeroPrice: 1,
      clientNotFound: 2,
      clientAmbiguous: 1,
      analysisNotFound: 1,
      duplicate: 0,
      rejected: 1,
    });
    expect(plan.matched).toBe(2);
    expect(plan.clients).toMatchObject({ matched: 1, notFound: 1, ambiguous: 1, byName: 1 });
    expect(plan.missingClients).toEqual([
      { legacyClientId: 77, name: "Inconnu SARL", prices: 2, reason: "introuvable" },
      { legacyClientId: 8, name: "Boulangerie Test", prices: 1, reason: "ambigu" },
    ]);
    expect(plan.missingAnalyses).toEqual([
      { label: "Levures osmophiles", legacyNatureId: 1, prices: 1, reason: "Analyse absente du catalogue pour ce type d'analyse." },
    ]);
    expect(plan.writes.map((w) => [w.clientId, w.parameterId, w.itemKey, w.unitPrice, w.existingId])).toEqual([
      ["c-traiteur", "p-ecoli-food", "P:p-ecoli-food", 40, null],
      ["c-traiteur", "p-salmo", "P:p-salmo", 75, null],
    ]);
    expect(planWritesPrices(plan)).toBe(true);
  });

  it("keeps one price per client and analysis — the most recently changed — and reports the others as doublons", () => {
    const rows = [
      // Two types d'analyse of the same domain (aliments, aliments liquides) → the same parameter of ours.
      row({ legacyPriceId: 10, legacyNatureId: 1, price: 40, modifiedAt: new Date("2023-01-01") }),
      row({ legacyPriceId: 11, legacyNatureId: 1, price: 45, modifiedAt: new Date("2025-06-01") }),
      row({ legacyPriceId: 12, legacyNatureId: 1, price: 45, modifiedAt: new Date("2024-01-01") }),
    ];
    const plan = planClientPriceImport(rows, [], db());
    expect(plan.counts.create).toBe(1);
    expect(plan.counts.duplicate).toBe(2);
    expect(plan.conflicts).toBe(1);
    expect(plan.writes).toEqual([expect.objectContaining({ unitPrice: 45, legacyPriceId: 11 })]);
    expect(plan.examples.duplicate.map((e) => e.detail)).toEqual([
      expect.stringMatching(/à un autre prix : gardé, .*le plus récemment modifié/),
      expect.stringMatching(/même prix/),
    ]);
    // The conflict is listed with both prices, their source and their type d'analyse.
    expect(plan.conflictList).toEqual([
      {
        client: "TRAITEUR DEMO",
        analysis: "E. coli",
        kept: expect.objectContaining({ price: 45, source: "client", legacyNatureId: 1, modifiedOn: expect.any(String) }),
        others: [expect.objectContaining({ price: 40, source: "client" })],
      },
    ]);
  });

  it("C-8 (c), the client's own price before a site's (switch on) — the most recent only (off)", () => {
    // The franchise's own price (older) and the price of a site billed to it (newer).
    const own = row({ legacyPriceId: 70, legacyClientId: 40, client: "Franchisé Démo", price: 60, modifiedAt: new Date("2023-01-01") });
    const site = row({ legacyPriceId: 71, legacyClientId: 900, clientType: 102, client: "Site Nord", parent: "Chaîne Démo", price: 52, modifiedAt: new Date("2025-01-01") });
    expect(preferredPrice(own, site, true)).toBe(true);
    expect(preferredPrice(site, own, true)).toBe(false);
    expect(preferredPrice(own, site, false)).toBe(false);

    const on = planClientPriceImport([site, own], [], db(), { skipLegacyTariff: true, ownBeforeSite: true });
    expect(on.writes).toEqual([expect.objectContaining({ clientId: "c-franchise", unitPrice: 60, legacyPriceId: 70 })]);
    expect(on.duplicateRule).toMatch(/prix propre du client avant celui d'un de ses sites/);
    expect(on.conflictList).toEqual([
      expect.objectContaining({ kept: expect.objectContaining({ price: 60, source: "client" }), others: [expect.objectContaining({ price: 52, source: "site", legacyName: "Site Nord" })] }),
    ]);

    const off = planClientPriceImport([site, own], [], db(), { skipLegacyTariff: true, ownBeforeSite: false });
    expect(off.writes).toEqual([expect.objectContaining({ clientId: "c-franchise", unitPrice: 52, legacyPriceId: 71 })]);
  });

  it("C-8 (e), a price equal to the old tariff: counted apart and not taken (switch on), taken (off)", () => {
    const rows = [
      row({ legacyPriceId: 80, price: 40, legacyTariff: 40 }),
      row({ legacyPriceId: 81, parameter: "Salmonella", price: 70, legacyTariff: 90 }),
      row({ legacyPriceId: 82, legacyNatureId: 3, price: 30, legacyTariff: null }),
    ];
    const on = planClientPriceImport(rows, [], db(), { skipLegacyTariff: true, ownBeforeSite: true });
    expect(on.counts).toMatchObject({ sameAsLegacyTariff: 1, create: 2 });
    expect(on.legacyTariff).toEqual({ equal: 1, withTariff: 2, skipped: true });
    expect(on.writes.map((w) => w.legacyPriceId)).toEqual([81, 82]);
    expect(on.examples.sameAsLegacyTariff[0].detail).toMatch(/pas un prix négocié/);

    const off = planClientPriceImport(rows, [], db(), { skipLegacyTariff: false, ownBeforeSite: true });
    expect(off.counts).toMatchObject({ sameAsLegacyTariff: 0, create: 3 });
    expect(off.legacyTariff).toEqual({ equal: 1, withTariff: 2, skipped: false });
  });

  it("a price taken over, then removed by hand on the fiche, then the reprise run again: nothing written", () => {
    const rows = [row({ legacyPriceId: 90, price: 40 }), row({ legacyPriceId: 91, parameter: "Salmonella", price: 75 })];
    const first = planClientPriceImport(rows, [], db());
    expect(first.counts.create).toBe(2);
    // Written, then « Retirer » on the fiche: the row stays, marked removed (DELETE /api/clients/[id]/prices).
    const existing: ExistingClientPrice[] = first.writes.map((w, i) => ({
      id: `w${i}`,
      clientId: w.clientId,
      itemKey: w.itemKey,
      unitPrice: w.unitPrice,
      origin: "REPRISE",
      legacyPriceId: w.legacyPriceId,
      removedAt: w.legacyPriceId === 90 ? new Date("2026-11-05T10:00:00Z") : null,
    }));
    const again = planClientPriceImport(rows, [], db({ existing }));
    expect(again.counts).toMatchObject({ create: 0, update: 0, unchanged: 1, keptRemoved: 1 });
    expect(again.writes).toEqual([]);
    expect(again.examples.keptRemoved[0].detail).toMatch(/retiré à la main sur la fiche le .* : non repris/);
    // Even when the old software changed the price meanwhile.
    const changed = planClientPriceImport([row({ legacyPriceId: 90, price: 44 })], [], db({ existing }));
    expect(changed.counts).toMatchObject({ update: 0, keptRemoved: 1 });
    expect(planWritesPrices(changed)).toBe(false);
  });

  it("a removed price moved onto another fiche (a merge since) is not brought back either", () => {
    const plan = planClientPriceImport([row({ legacyPriceId: 95, price: 40 })], [], db({
      existing: [{ id: "gone", clientId: "c-cafe", itemKey: "P:p-ecoli-food", unitPrice: 40, origin: "REPRISE", legacyPriceId: 95, removedAt: new Date("2026-11-01") }],
    }));
    expect(plan.counts).toMatchObject({ create: 0, keptRemoved: 1 });
    expect(plan.writes).toEqual([]);
  });

  it("brings two old clients merged into one of ours onto that one", () => {
    const rows = [
      row({ legacyPriceId: 20, legacyClientId: 30, client: "Café d'Essai", price: 50, modifiedAt: new Date("2024-01-01") }),
      row({ legacyPriceId: 21, legacyClientId: 31, client: "Ancienne Raison", price: 55, modifiedAt: new Date("2025-01-01") }),
    ];
    const plan = planClientPriceImport(rows, [], db());
    expect(plan.writes).toEqual([expect.objectContaining({ clientId: "c-cafe", unitPrice: 55, legacyClientId: 31 })]);
    expect(plan.counts.duplicate).toBe(1);
  });

  it("is idempotent: unchanged prices are left alone, a changed one updated, a price typed on the fiche never touched", () => {
    const rows = [
      row({ legacyPriceId: 40, price: 40 }),
      row({ legacyPriceId: 41, parameter: "Salmonella", price: 80 }),
      row({ legacyPriceId: 42, legacyNatureId: 3, price: 30 }),
    ];
    const existing = [
      { id: "e1", clientId: "c-traiteur", itemKey: "P:p-ecoli-food", unitPrice: 40, origin: "REPRISE" as const, legacyPriceId: 40, removedAt: null },
      { id: "e2", clientId: "c-traiteur", itemKey: "P:p-salmo", unitPrice: 75, origin: "REPRISE" as const, legacyPriceId: 41, removedAt: null },
      { id: "e3", clientId: "c-traiteur", itemKey: "P:p-ecoli-water", unitPrice: 33, origin: "SAISIE" as const, legacyPriceId: null, removedAt: null },
    ];
    const plan = planClientPriceImport(rows, [], db({ existing }));
    expect(plan.counts).toMatchObject({ create: 0, update: 1, unchanged: 1, keptManual: 1 });
    expect(plan.writes).toEqual([expect.objectContaining({ existingId: "e2", unitPrice: 80 })]);

    // Once written, the same file writes nothing.
    const after = existing.map((e) => (e.id === "e2" ? { ...e, unitPrice: 80 } : e));
    const again = planClientPriceImport(rows, [], db({ existing: after }));
    expect(again.counts).toMatchObject({ create: 0, update: 0, unchanged: 2, keptManual: 1 });
    expect(planWritesPrices(again)).toBe(false);
  });

  it("leaves a price already taken over onto another fiche where it is", () => {
    const plan = planClientPriceImport([row({ legacyPriceId: 50, price: 40 })], [], db({
      existing: [{ id: "moved", clientId: "c-cafe", itemKey: "P:p-ecoli-food", unitPrice: 40, origin: "REPRISE", legacyPriceId: 50, removedAt: null }],
    }));
    expect(plan.counts).toMatchObject({ create: 0, unchanged: 1 });
    expect(plan.writes).toEqual([]);
  });

  it("asks the client once per old client, whatever the number of its prices", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ legacyPriceId: 60 + i, legacyClientId: 77, client: "Inconnu SARL" }));
    const plan = planClientPriceImport(rows, [], db());
    expect(plan.clients.notFound).toBe(1);
    expect(plan.missingClients).toEqual([{ legacyClientId: 77, name: "Inconnu SARL", prices: 5, reason: "introuvable" }]);
  });
});
