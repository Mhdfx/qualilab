import { describe, expect, it } from "vitest";
import {
  cellDay,
  cellNumber,
  headerKey,
  parseArticleSheet,
  parseSupplierSheet,
  paymentTermDays,
  splitKnown,
  type SheetRow,
} from "./stock-import";

/**
 * Lot 3D, M8 — the imports of the magasin, in the laboratory's own
 * templates: « Fiche de stock » (articles, opening stock) and « Journal
 * Achat » (suppliers). « Créer seulement ».
 */

// The « Fiche de stock » template: a blank first row, the header on row 2,
// « Prix (dh/ht) » merged over two columns (H2:I2).
const STOCK_HEADER: SheetRow = ["Date", "Libellé", "Lot", "EXPIRATION", "Entrée", "Sortie", "Stock", "Prix (dh/ht)", null, "Lieu de stockage"];

describe("cell readers", () => {
  it("matches headers without accents nor case", () => {
    expect(headerKey("Libellé")).toBe("libelle");
    expect(headerKey("Délai de paiement ")).toBe("delai de paiement");
    expect(headerKey("Prix (dh/ht)")).toBe("prix dh ht");
  });

  it("reads numbers with a comma or spaces, days in three spellings", () => {
    expect(cellNumber("1 250,50")).toBe(1250.5);
    expect(cellNumber(12)).toBe(12);
    expect(cellNumber("")).toBeNull();
    expect(cellNumber("abc")).toBeNull();
    expect(cellDay("2027-03-31")).toBe("2027-03-31");
    expect(cellDay("31/03/2027")).toBe("2027-03-31");
    expect(cellDay("1/2/27")).toBe("2027-02-01");
    expect(cellDay(46477)).toBe("2027-03-31");
    expect(cellDay("31/02/2027")).toBeNull();
    expect(cellDay("bientôt")).toBeNull();
  });

  it("reads a payment term in days, « comptant » as 0", () => {
    expect(paymentTermDays(30)).toBe(30);
    expect(paymentTermDays("60 jours")).toBe(60);
    expect(paymentTermDays("45 j")).toBe(45);
    expect(paymentTermDays("Comptant")).toBe(0);
    expect(paymentTermDays("à réception")).toBe(0);
    expect(paymentTermDays("fin de mois")).toBeNull();
  });
});

describe("parseArticleSheet — the « Fiche de stock »", () => {
  it("makes one article per label, its opening stock the last « Stock » of the register", () => {
    const parsed = parseArticleSheet([
      [],
      STOCK_HEADER,
      ["2026-10-01", "Gélose PCA", "L-1", "2027-01-31", 20, null, 20, 12.5, 250, "Réfrigérateur 2"],
      ["2026-10-10", "Gélose PCA", null, null, null, 5, 15, null, null, "Réfrigérateur 2"],
      ["2026-10-12", "Gélose PCA", "L-2", "31/03/2027", 10, null, 25, 13, 130, "Réfrigérateur 2"],
      ["2026-10-02", "Eau peptonée", null, null, 6, 1, null, null, 60, ""],
      [null, null, null, null, null, null, null, null, null, null],
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rows).toBe(4);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.drafts).toHaveLength(2);
    const [pca, eau] = parsed.drafts;
    expect(pca).toMatchObject({ opening: 25, lot: "L-2", expiryDay: "2027-03-31", unitPriceHT: 13, line: 5 });
    expect(pca.item).toMatchObject({ name: "Gélose PCA", unit: "unité", location: "Réfrigérateur 2" });
    // No « Stock » on its row: entries − exits; the price from the amount ÷ quantity.
    expect(eau).toMatchObject({ opening: 5, unitPriceHT: 10, lot: null, expiryDay: null });
  });

  it("reads our optional columns: unit, category, threshold", () => {
    const parsed = parseArticleSheet([
      ["Libellé", "Unité", "Catégorie", "Seuil", "Stock"],
      ["Gélose VRBG", "boîte", "Milieux", "4", "12"],
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.drafts[0].item).toMatchObject({ unit: "boîte", category: "Milieux", minQuantity: 4 });
    expect(parsed.drafts[0].opening).toBe(12);
  });

  it("refuses a row without a label, a negative stock and an unreadable expiry", () => {
    const parsed = parseArticleSheet([
      STOCK_HEADER,
      [null, null, "L", null, 3, null, null, null, null, null],
      ["2026-10-01", "Article négatif", null, null, 1, 4, null, null, null, null],
      ["2026-10-01", "Article daté", null, "bientôt", 1, null, 1, null, null, null],
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.drafts).toEqual([]);
    expect(parsed.invalid.map((problem) => problem.line)).toEqual([2, 3, 4]);
  });

  it("says when the file is not the template", () => {
    expect(parseArticleSheet([["Nom", "Quantité"]])).toEqual({
      error: "Colonne « Libellé » introuvable : utilisez le modèle « Fiche de stock ».",
    });
  });
});

describe("parseSupplierSheet — the « Journal Achat »", () => {
  const HEADER: SheetRow = ["Fournisseurs", "Délai de paiement ", "N° Facture", "Mois", "Date", "Echéance ", "Montant HT", "TVA 20%", "Montant TTC", "Euro", "Statut ", "Date paiement ", "Mode de paiement "];

  it("makes one supplier per name, with its payment term", () => {
    const parsed = parseSupplierSheet([
      HEADER,
      ["Fournisseur A", "60 jours", "F1", "", "", "", 100, 20, 120, null, "", "", ""],
      ["Fournisseur A", "60 jours", "F2", "", "", "", 100, 20, 120, null, "", "", ""],
      ["Fournisseur B", "Comptant", "F3", "", "", "", 10, 2, 12, null, "", "", ""],
      ["Fournisseur C", "", "F4", "", "", "", 10, 2, 12, null, "", "", ""],
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.drafts.map((draft) => [draft.supplier.name, draft.supplier.paymentTermDays])).toEqual([
      ["Fournisseur A", 60],
      ["Fournisseur B", 0],
      ["Fournisseur C", 30],
    ]);
  });

  it("reads the optional columns and refuses what does not validate", () => {
    const parsed = parseSupplierSheet([
      ["Fournisseur", "Délai", "ICE", "Email", "Soumis à la retenue"],
      ["Fournisseur D", 30, "001234567000011", "d@exemple.test", "oui"],
      ["Fournisseur E", "fin de mois", "", "", ""],
      ["Fournisseur F", 30, "12", "", ""],
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.drafts[0].supplier).toMatchObject({ ice: "001234567000011", email: "d@exemple.test", withholdingSubject: true });
    expect(parsed.invalid.map((problem) => problem.line)).toEqual([3, 4]);
  });

  it("says when the file is not the template", () => {
    expect("error" in parseSupplierSheet([["Nom"]])).toBe(true);
  });
});

describe("splitKnown", () => {
  it("leaves a name already known alone, case and accents ignored", () => {
    const { toCreate, alreadyKnown } = splitKnown(["Gélose PCA", "Eau peptonée"], (name) => name, ["gelose pca"]);
    expect(toCreate).toEqual(["Eau peptonée"]);
    expect(alreadyKnown).toEqual(["Gélose PCA"]);
  });
});
