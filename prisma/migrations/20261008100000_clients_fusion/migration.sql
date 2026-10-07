-- CLIENTS-FUSION.md §1 — duplicate clients, sites recorded as clients and
-- billing clients (RETOUR-LABO-06-10.md §7). Additive: three nullable
-- columns, each indexed, each a foreign key to `Client` that empties itself
-- when the client it points to is deleted (clients are archived, never
-- deleted, so this is a safety net). Old rows keep working unchanged.

-- §2–3: the record kept when this client was merged into another one, or
-- attached as one of its sites (set on the archived record only).
-- §4: « client facturé de » — this client receives the invoices for its
-- principal client.
ALTER TABLE `Client`
    ADD COLUMN `mergedIntoId` VARCHAR(191) NULL,
    ADD COLUMN `billedForId` VARCHAR(191) NULL;

-- §4: the billing client the samples of a site are invoiced to (NULL: the
-- site's own client).
ALTER TABLE `Site`
    ADD COLUMN `billingClientId` VARCHAR(191) NULL;

CREATE INDEX `Client_mergedIntoId_idx` ON `Client`(`mergedIntoId`);
CREATE INDEX `Client_billedForId_idx` ON `Client`(`billedForId`);
CREATE INDEX `Site_billingClientId_idx` ON `Site`(`billingClientId`);

ALTER TABLE `Client` ADD CONSTRAINT `Client_mergedIntoId_fkey` FOREIGN KEY (`mergedIntoId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Client` ADD CONSTRAINT `Client_billedForId_fkey` FOREIGN KEY (`billedForId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Site` ADD CONSTRAINT `Site_billingClientId_fkey` FOREIGN KEY (`billingClientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
