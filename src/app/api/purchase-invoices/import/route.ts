import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { labDayOf } from "@/lib/lab-time";
import { loadAchatSettings } from "@/lib/achat-settings";
import { MAX_EXCHANGE_RATE } from "@/lib/achat-validation";
import { cellNumber } from "@/lib/stock-import";
import { importRequestTooLarge, readImportFile } from "@/lib/stock-import-file";
import { parsePurchaseJournal } from "@/lib/purchase-import";
import { purchasePlanFromDatabase, purchasePlanReport, purchasePlanWrites, writePurchasePlan } from "@/lib/purchase-import-server";

/**
 * Import of the supplier invoices of the laboratory's « Journal Achat »
 * (lot 6B, RETOUR-LABO-25-11.md M16) — MAGASINIER, ADMIN, the roles of
 * `/api/purchase-invoices` (decision of 25/10: the magasinier keeps the
 * supplier invoices).
 *
 * - `mode=analyse`: the suppliers to create / matched, the invoices to
 *   create (with their due day, payments and retenue), those already there
 *   (supplier + number — skipped, never modified), the rows « à trancher »
 *   and the refusals with their reason, the totals HT / TVA / TTC, how many
 *   will be « à payer » and « en retard ».
 * - `mode=commit`: the same analysis, read again from the database, then
 *   written in one transaction. **Idempotent** on the key supplier +
 *   number: a second import of the same file writes nothing.
 * - `eurRate` (optional): « Taux EUR → DH » for the rows in euros without
 *   their DH amount.
 *
 * Journalled (PURCHASE_INVOICES_IMPORTED) when something is written; 409
 * when a supplier or an invoice was created meanwhile.
 */
export async function POST(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  if (importRequestTooLarge(request)) return NextResponse.json({ error: "Fichier trop volumineux (8 Mo maximum)." }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  const commit = form.get("mode") === "commit";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choisissez le fichier du journal des achats." }, { status: 400 });
  }
  const typedRate = String(form.get("eurRate") ?? "").trim();
  let eurRate: number | null = null;
  if (typedRate) {
    eurRate = cellNumber(typedRate);
    if (eurRate === null || eurRate <= 0 || eurRate > MAX_EXCHANGE_RATE) {
      return NextResponse.json({ error: "Le taux EUR → DH doit être un nombre positif (par exemple 10,85)." }, { status: 400 });
    }
    eurRate = Math.round(eurRate * 1_000_000) / 1_000_000;
  }

  const read = await readImportFile(file);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });

  const today = labDayOf(new Date());
  const settings = await loadAchatSettings();
  const journal = parsePurchaseJournal(read.rows, { today, eurRate, defaultVatRate: settings.defaultVatRate });
  if ("error" in journal) return NextResponse.json({ error: journal.error }, { status: 400 });

  const plan = await purchasePlanFromDatabase(journal, { today, settings: settings.withholding });
  const report = { file: file.name.slice(0, 191), eurRate, ...purchasePlanReport(journal, plan, today) };
  if (!commit) return NextResponse.json({ mode: "analyse", ...report, written: null });
  if (!purchasePlanWrites(plan)) {
    return NextResponse.json({ mode: "commit", ...report, written: { suppliersCreated: 0, invoices: 0, payments: 0 } });
  }

  let written;
  try {
    written = await writePurchasePlan(plan, { actorId: session.id, fileName: file.name, today });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Un fournisseur ou une facture du fichier vient d'être enregistré par ailleurs — relancez l'analyse : ce qui existe déjà sera sauté." },
        { status: 409 }
      );
    }
    throw error;
  }

  await logAudit({
    actorId: session.id,
    action: "PURCHASE_INVOICES_IMPORTED",
    entity: "PurchaseInvoice",
    metadata: {
      file: file.name.slice(0, 191),
      rows: journal.rows,
      invoicesCreated: written.invoices,
      suppliersCreated: written.suppliersCreated,
      payments: written.payments,
      paid: plan.totals.paid,
      toPay: plan.totals.toPay,
      skipped: plan.existing.length,
      conflicts: journal.conflicts.length,
      refused: plan.refused.length,
      warnings: plan.warnings.length,
      ...(eurRate !== null ? { eurRate } : {}),
      totals: { ht: plan.totals.ht, vat: plan.totals.vat, ttc: plan.totals.ttc, withheld: plan.totals.withheld },
    },
  });

  return NextResponse.json({ mode: "commit", ...report, written });
}
