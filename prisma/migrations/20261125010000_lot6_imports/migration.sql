-- Lot 6 (RETOUR-LABO-25-11.md §8, M13) — imports of the laboratory's files of 25/11.
-- Additive only: three nullable columns and one unique index; no column
-- dropped or renamed, no row rewritten.
--   * `StockMovement.orderReference`: the bon de commande of an entry (the
--     « Libellé » of the stock sheet), typed or imported (6A).
--   * `StockMovement.importKey`: the fingerprint of the imported row — a
--     second import of the same workbook writes nothing (6A). NULL for every
--     existing movement (a unique index allows any number of NULLs).
--   * `PurchaseInvoice.importedFrom`: « Reprise du journal des achats » (6B).

-- AlterTable
ALTER TABLE `StockMovement` ADD COLUMN `orderReference` VARCHAR(64) NULL,
    ADD COLUMN `importKey` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `StockMovement_importKey_key` ON `StockMovement`(`importKey`);

-- AlterTable
ALTER TABLE `PurchaseInvoice` ADD COLUMN `importedFrom` VARCHAR(191) NULL;
