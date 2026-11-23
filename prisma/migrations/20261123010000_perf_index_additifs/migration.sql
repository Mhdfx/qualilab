-- Lot performance, étape 3 (P2-4, P3-6) — `.ui-tests/perf/plan.md`.
-- Index seulement : aucune colonne, aucune ligne touchée. MySQL les construit
-- en ligne (INPLACE, LOCK=NONE) ; les index existants sont gardés.
--   * `LegacySample` : la carte « Historique (ancien logiciel) » (comptes par
--     année, nombre, sites distincts) filtre toujours `cancelled = false` —
--     ces trois index la servent sans lire la table.
--   * `AuditLog (actorId, createdAt)` : /admin/journal filtré par utilisateur,
--     le plus récent d'abord.
--   * `Sample (clientId, receivedAt)` : la synthèse de /commercial/[id] (les
--     échantillons d'un client reçus sur une période, du plus récent).

-- CreateIndex
CREATE INDEX `AuditLog_actorId_createdAt_idx` ON `AuditLog`(`actorId`, `createdAt`);

-- CreateIndex
CREATE INDEX `LegacySample_clientId_cancelled_year_idx` ON `LegacySample`(`clientId`, `cancelled`, `year`);

-- CreateIndex
CREATE INDEX `LegacySample_clientId_cancelled_receivedAt_idx` ON `LegacySample`(`clientId`, `cancelled`, `receivedAt`);

-- CreateIndex
CREATE INDEX `LegacySample_clientId_cancelled_siteId_idx` ON `LegacySample`(`clientId`, `cancelled`, `siteId`);

-- CreateIndex
CREATE INDEX `Sample_clientId_receivedAt_idx` ON `Sample`(`clientId`, `receivedAt`);
