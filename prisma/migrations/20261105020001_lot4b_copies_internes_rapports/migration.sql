-- Lot 4B · L6 (RETOUR-LABO-04-11.md §5, R-16) — the internal copies extended
-- to the reports. Each address of « Copies internes (alertes et rapports) »
-- receives the alerts, the reports or both. Additive: the addresses of L5
-- keep receiving the alerts only (forAlerts true, forReports false) until the
-- administrator ticks « Rapports ».
ALTER TABLE `AlertCopyAddress`
    ADD COLUMN `forAlerts` BOOLEAN NULL DEFAULT true,
    ADD COLUMN `forReports` BOOLEAN NULL DEFAULT false;
