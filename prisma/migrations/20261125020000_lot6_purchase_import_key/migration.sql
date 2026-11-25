-- Lot 6, relecture (constat 6) — the fingerprint of an imported supplier
-- invoice. Additive only: one nullable column and one unique index; NULL
-- for every existing invoice (a unique index allows any number of NULLs).
--   * `PurchaseInvoice.importKey`: the file's supplier name + the invoice
--     number, or — a row without number — its supplier, day and amounts. A
--     re-import of the journal finds the invoice by it, even after the
--     supplier was renamed or the missing number filled in (6B).

-- AlterTable
ALTER TABLE `PurchaseInvoice` ADD COLUMN `importKey` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `PurchaseInvoice_importKey_key` ON `PurchaseInvoice`(`importKey`);
