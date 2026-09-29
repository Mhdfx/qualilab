-- RETOUR-LABO-29-09.md, slice C — what the laboratory's report model prints,
-- frozen so that editing a criterion or a regulation text never alters a
-- report already issued (answer 5 of 29/09).

-- The criterion a result was judged against: { n, c, mKind, m, bigM }.
ALTER TABLE `Result` ADD COLUMN `criterion` JSON NULL;

-- The « Réglementation en vigueur » printed on the report, as it stood at approval.
ALTER TABLE `Report` ADD COLUMN `regulation` TEXT NULL;
