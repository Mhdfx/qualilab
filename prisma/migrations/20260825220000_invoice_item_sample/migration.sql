-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `sampleId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `InvoiceItem_sampleId_idx` ON `InvoiceItem`(`sampleId`);

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_sampleId_fkey` FOREIGN KEY (`sampleId`) REFERENCES `Sample`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `InvoiceItem` RENAME INDEX `InvoiceItem_invoiceId_fkey` TO `InvoiceItem_invoiceId_idx`;

