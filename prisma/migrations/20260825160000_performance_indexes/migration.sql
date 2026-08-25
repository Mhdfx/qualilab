-- CreateIndex
CREATE INDEX `EmailLog_type_createdAt_idx` ON `EmailLog`(`type`, `createdAt`);

-- CreateIndex
CREATE INDEX `Invoice_status_idx` ON `Invoice`(`status`);

-- CreateIndex
CREATE INDEX `Invoice_createdAt_idx` ON `Invoice`(`createdAt`);

-- CreateIndex
CREATE INDEX `Sample_status_receivedAt_idx` ON `Sample`(`status`, `receivedAt`);

-- CreateIndex
CREATE INDEX `Sample_technicianId_status_idx` ON `Sample`(`technicianId`, `status`);

-- CreateIndex
CREATE INDEX `Sample_userId_createdAt_idx` ON `Sample`(`userId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Sample_createdAt_idx` ON `Sample`(`createdAt`);

-- RenameIndex
ALTER TABLE `invoice` RENAME INDEX `Invoice_clientId_fkey` TO `Invoice_clientId_idx`;

-- RenameIndex
ALTER TABLE `result` RENAME INDEX `Result_parameterId_fkey` TO `Result_parameterId_idx`;

