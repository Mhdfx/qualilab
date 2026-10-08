-- RETOUR-LABO-06-10.md §8.2 (retour du 08/10) — air and « autre » samples
-- take both families: air × physico-chimie and autre × microbiologie get a
-- nature each (nature-family.ts NATURE_CODE_BY_KIND). Data only.
-- INSERT IGNORE: a rerun, or a nature already created by hand under the
-- same code, is left as it is (unique index on `code`).
-- `legacyType` (the parameter domain) is AMBIANCE for both: the two natures
-- of a type must share one domain — the line loads ONE parameter list
-- (`lineCategory`) and the server refuses an analysis of another domain
-- (`planLineSamples`). MICRO_AIR and EFFET_ASEPTISANT are AMBIANCE already.
INSERT IGNORE INTO `AnalysisNature` (`id`, `code`, `label`, `labelEn`, `family`, `defaultLineKind`, `legacyType`, `minQuantity`, `minQuantityUnit`, `sortOrder`, `active`, `legacyId`) VALUES
('nat_pc_air', 'PC_AIR', 'Physico-chimie de l''air', 'Air physico-chemistry', 'CHIMIE', 'AIR', 'AMBIANCE', NULL, NULL, 65, true, NULL),
('nat_micro_autre', 'MICRO_AUTRE', 'Microbiologie — autres prélèvements', 'Microbiology — other samples', 'MICRO', 'AUTRE', 'AMBIANCE', NULL, NULL, 125, true, NULL);
