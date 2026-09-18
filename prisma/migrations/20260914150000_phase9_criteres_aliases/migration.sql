-- Chantier 2 — the spellings the criteria workbook uses for the germs the
-- catalogue already knows, so the import matches them instead of creating
-- duplicates. Only rows without aliases are touched (data, idempotent).
UPDATE `AnalysisParameter` SET `aliases` = 'Recherche des Salmonella\nSalmonella'
  WHERE `category` = 'ALIMENTAIRE' AND `name` = 'Salmonelles' AND `aliases` IS NULL;
UPDATE `AnalysisParameter` SET `aliases` = 'Listeria monocytogenes\nRecherche de Listeria monocytogenes'
  WHERE `category` = 'ALIMENTAIRE' AND `name` = 'Listeria' AND `aliases` IS NULL;
UPDATE `AnalysisParameter` SET `aliases` = 'Escherichia coli\nEscherichia-coli βglucoronidase positives à 44 °C'
  WHERE `category` = 'ALIMENTAIRE' AND `name` = 'E. coli' AND `aliases` IS NULL;
UPDATE `AnalysisParameter` SET `aliases` = 'Coliformes à 30°C\nColiformes'
  WHERE `category` = 'ALIMENTAIRE' AND `name` = 'Coliformes totaux' AND `aliases` IS NULL;
