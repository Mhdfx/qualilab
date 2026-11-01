-- Lot 3D, M7 — relecture du 01/11. Strictement additif : deux colonnes
-- facultatives, aucune ligne réécrite. Une facture garde la base sur
-- laquelle sa retenue a été calculée et l'état de l'attestation à ce
-- moment : changer la base dans les réglages, ou remplacer l'attestation du
-- fournisseur par une plus récente, ne réécrit pas l'état des retenues des
-- factures déjà saisies. Vide = facture saisie avant (les écrans lisent
-- alors les réglages et l'attestation connue aujourd'hui).
ALTER TABLE `PurchaseInvoice` ADD COLUMN `withholdingBase` ENUM('HT', 'TVA', 'TTC') NULL,
    ADD COLUMN `taxCertificateState` ENUM('VALIDE', 'EXPIREE', 'ABSENTE') NULL;
