-- Lot 3C, K4 (RETOUR-LABO-28-10.md §5) : le logo d'accréditation et le cachet
-- figés avec chaque version émise du rapport. Une table nouvelle, en ajout
-- seulement (jamais modifiée ni vidée par l'application) : l'image, clé par
-- son empreinte SHA-256, que la version garde dans ses données. Strictement
-- additif : aucune ligne existante n'est réécrite.
CREATE TABLE `ReportImageArchive` (
    `hash` VARCHAR(64) NOT NULL,
    `dataUri` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
