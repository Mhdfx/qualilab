-- Gaps build (contrôles complémentaires de réception, then the other gaps).
-- One unreleased folder, appended item by item. Additive only: enum values
-- appended last (the MariaDB ENUM grows in place, no table copy), new
-- columns nullable or defaulted, no data rewritten, no backfill.

-- ---- A1 · C3 emballage (C4 flacon d'eau) and C5 identification ----------------

-- The réceptionniste's two ticks. NULL = received before these controls
-- existed: nobody answered for them.
ALTER TABLE `Sample`
    ADD COLUMN `receptionPackagingOk` BOOLEAN NULL,
    ADD COLUMN `receptionIdentificationOk` BOOLEAN NULL;

-- « Non reçu au laboratoire »: a sample of the visit that never arrived.
-- `Sample.cancelReason` is the only column of this ENUM; every existing value
-- is kept in its order and NON_RECU is appended last.
ALTER TABLE `Sample`
    MODIFY `cancelReason` ENUM('NON_EXPLOITABLE', 'QUANTITE_INSUFFISANTE', 'DOUBLON', 'ANNULATION_CLIENT', 'DETRUIT_A_RECEPTION', 'AUTRE', 'NON_RECU') NULL;

-- ---- A3 · C1 délai prélèvement → arrivée au laboratoire -----------------------

-- The limits, in hours (defaults until the laboratory answers: 24 h in
-- microbiology, none in physico-chemistry), and whether an exceeded delay
-- refuses « conforme » (default: no, « à vérifier »).
ALTER TABLE `LabSettings`
    ADD COLUMN `maxDelayMicroH` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `maxDelayChemH` INTEGER NULL,
    ADD COLUMN `delayBlocking` BOOLEAN NOT NULL DEFAULT false;

-- A deposit whose sampling time was not given (`startedAt` = the counter's
-- instant) says so. NULL on a visit and on every série entered before.
ALTER TABLE `Serie`
    ADD COLUMN `samplingTimeDeclared` BOOLEAN NULL;

-- ---- A4 · C2 température de transport par classe de conservation -------------

-- The class chosen at reception (NULL = the default of the sample's kind)
-- and where the temperature at arrival was read (NULL = unknown: received
-- before, or no temperature).
ALTER TABLE `Sample`
    ADD COLUMN `storageClass` ENUM('REFRIGERE', 'CONGELE', 'AMBIANT', 'CHAUD') NULL,
    ADD COLUMN `receptionTemperatureSource` ENUM('GLACIERE', 'ECHANTILLON', 'FLACON_TEMOIN') NULL;

-- The ranges C2 judges with; `coldChainMaxC` (the chilled maximum) exists.
ALTER TABLE `LabSettings`
    ADD COLUMN `coldChainMinC` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `frozenMaxC` DOUBLE NOT NULL DEFAULT -15,
    ADD COLUMN `waterMicroMaxC` DOUBLE NOT NULL DEFAULT 8;

-- ---- A6 · C6 protocole signé par l'interlocuteur (visite) ---------------------

-- The reception's answer to « Protocole papier signé reçu » on a visit whose
-- photo is missing. NULL = a photo is attached, no answer, a deposit, or a
-- série received before the control existed.
ALTER TABLE `Serie`
    ADD COLUMN `signedProtocolReceived` BOOLEAN NULL;

-- ---- A7 · observation de réception (justification d'un « à vérifier » accepté) --

-- Free observation of the réceptionniste, per sample; required by the APIs
-- when a row « à vérifier » is accepted conforme. NULL on every sample
-- received before.
ALTER TABLE `Sample`
    ADD COLUMN `receptionNote` TEXT NULL;

-- ---- A9 · accord du client, « en attente du client » --------------------------

-- « En attente du client » (held since), and the client's agreement to
-- analyse a non-conform sample: who, how, when, note. NULL on every sample
-- before; no backfill.
ALTER TABLE `Sample`
    ADD COLUMN `awaitingClientSince` DATETIME(3) NULL,
    ADD COLUMN `clientConsultedAt` DATETIME(3) NULL,
    ADD COLUMN `clientConsultedName` VARCHAR(191) NULL,
    ADD COLUMN `clientConsultationChannel` ENUM('SUR_PLACE', 'TELEPHONE', 'EMAIL') NULL,
    ADD COLUMN `clientConsultationNote` TEXT NULL;

-- Whether the agreement is required before a non-conform sample is analysed
-- (default: no — recorded when given).
ALTER TABLE `LabSettings`
    ADD COLUMN `consultationRequired` BOOLEAN NOT NULL DEFAULT false;

-- ---- A11 · index de dates ------------------------------------------------------

-- Pure DDL: the date lists and filters (« Ce mois-ci », /recherche by sampling
-- date, the portal's list of one client, réception history, e-mail journal,
-- audit journal by action). None duplicates an existing index: `Sample` has
-- (status, receivedAt) but nothing led by `receivedAt` or `sampledAt`;
-- `EmailLog` has (type, createdAt) only; `AuditLog` has (createdAt) only.
CREATE INDEX `Sample_sampledAt_idx` ON `Sample`(`sampledAt`);
CREATE INDEX `Sample_receivedAt_idx` ON `Sample`(`receivedAt`);
CREATE INDEX `Sample_clientId_sampledAt_idx` ON `Sample`(`clientId`, `sampledAt`);
CREATE INDEX `Serie_receivedAt_idx` ON `Serie`(`receivedAt`);
CREATE INDEX `EmailLog_createdAt_idx` ON `EmailLog`(`createdAt`);
CREATE INDEX `AuditLog_action_createdAt_idx` ON `AuditLog`(`action`, `createdAt`);

-- ---- A12 · facture émise figée : le client tel qu'imprimé à l'émission ---------

-- The six fields the invoice PDF prints about its client, frozen in the
-- issuing transaction ({ name, address, contact, phone, email, ice }). NULL on
-- a draft (it stays addressed to the live client) and on every document
-- issued before this column: those keep printing the live client, as today
-- (no backfill here).
ALTER TABLE `Invoice`
    ADD COLUMN `clientSnapshot` JSON NULL;

-- ---- A13 · avoir lié à la ligne de facture reprise -----------------------------

-- An AVOIR line names the invoice line it takes back, so that what the credit
-- notes take back from one line never exceeds its total. NULL on a free line
-- and on every credit-note line issued before (no backfill: those stay bounded
-- by the invoice's total only). A self-reference; SET NULL if the invoice
-- line ever disappeared (only a draft's lines are deleted, and a draft has no
-- credit note).
ALTER TABLE `InvoiceItem`
    ADD COLUMN `creditedItemId` VARCHAR(191) NULL;

CREATE INDEX `InvoiceItem_creditedItemId_idx` ON `InvoiceItem`(`creditedItemId`);

ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_creditedItemId_fkey` FOREIGN KEY (`creditedItemId`) REFERENCES `InvoiceItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- C9 · export comptable : index de la date d'émission ----------------------

-- The accounting export (`GET /api/invoices/export`) filters and sorts the
-- issued invoices and credit notes by `issuedAt`. Pure DDL; `Invoice` had no
-- index led by it.
CREATE INDEX `Invoice_issuedAt_idx` ON `Invoice`(`issuedAt`);
