-- AlterTable
ALTER TABLE `Client` ADD COLUMN `archived` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `Client_archived_name_idx` ON `Client`(`archived`, `name`);

