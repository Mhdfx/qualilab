import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Retouches of 02/11, found while capturing the lot 3 presentation: wording
 * on screens that a source pin holds (the screens are verified in a browser).
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("retouches of 02/11 — wording", () => {
  it("Achat: the invoice number keeps its spaces in « Corriger la facture … — possible » and « Annuler la saisie de la facture … (saisie par erreur) »", () => {
    const source = read("src/components/magasin/PurchaseInvoicesManager.tsx");
    // One text node each: the number cannot be glued to the words around it.
    expect(source).toContain("{`Corriger la facture ${invoice.number} — possible tant qu'aucun paiement n'est enregistré ; la correction est journalisée.`}");
    expect(source).toContain("{`Annuler la saisie de la facture ${invoice.number} (saisie par erreur) : elle reste dans l'historique, hors des totaux, des alertes et du journal des achats.`}");
    expect(source).not.toMatch(/Corriger la facture \{invoice\.number\}/);
    expect(source).not.toMatch(/Annuler la saisie de la facture \{invoice\.number\}/);
  });

  it("Sauvegardes: without a journal, a plain sentence for the administrator — no DEPLOY.md shown to users", () => {
    const source = read("src/app/admin/sauvegardes/page.tsx");
    expect(source).not.toContain("DEPLOY.md");
    expect(source).toContain("demandez à l'administrateur du serveur de vérifier que la sauvegarde automatique est bien installée.");
  });
});
