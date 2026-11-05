-- Lot 4H, H5 — relecture du 05/11 (RETOUR-LABO-04-11.md §5 « H5 — tel que
-- construit ») :
--   * `ClientPrice.removedAt` : un prix repris de l'ancien logiciel puis retiré
--     à la main n'est plus supprimé ; la ligne garde la mémoire du retrait, la
--     reprise suivante ne le remet pas (tous les lecteurs l'ignorent) ;
--   * `InvoiceItem.priceSource` : l'origine du prix d'une ligne de facture
--     (prix du client repris ou saisi, catalogue, saisi à la main), écrite à
--     l'enregistrement du brouillon, lue sur le brouillon et la fiche de la
--     facture (jamais imprimée).
-- Strictement additif : deux colonnes nullables, aucune ligne existante touchée.

-- AlterTable
ALTER TABLE `ClientPrice` ADD COLUMN `removedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `priceSource` ENUM('CLIENT_REPRISE', 'CLIENT_SAISIE', 'CATALOGUE', 'MAIN') NULL;
