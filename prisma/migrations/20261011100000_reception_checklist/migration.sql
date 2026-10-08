-- Retour du 08/10 — « les règles comme une checklist »: the seven rules of the
-- bon de réception (PG05/EN04 version G) become a checklist on every sample.
-- Additive only: the enum value is appended, the new column is nullable, old
-- rows keep working unchanged.

-- Rule (1): « ne pas accepter des échantillons non exploitables lors de
-- l'analyse (exemple : tête de poisson, os, etc.) » gets its coded motif.
-- `Sample.conformityReason` is the only column of this ENUM; the value is
-- appended last, so MariaDB grows the ENUM in place and existing values are
-- kept.
ALTER TABLE `Sample`
    MODIFY `conformityReason` ENUM('CHAINE_FROID', 'TEMPERATURE_MANQUANTE', 'QUANTITE_INSUFFISANTE', 'EMBALLAGE', 'DELAI', 'IDENTIFICATION', 'AUTRE', 'NON_EXPLOITABLE') NULL;

-- Rule (1), the réceptionniste's answer for each sample. NULL = received
-- before the checklist existed (no backfill: nobody answered for them).
ALTER TABLE `Sample`
    ADD COLUMN `receptionExploitable` BOOLEAN NULL;
