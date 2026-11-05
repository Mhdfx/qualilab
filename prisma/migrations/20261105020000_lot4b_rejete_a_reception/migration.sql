-- Lot 4B · I9 (RETOUR-LABO-04-11.md §5, R-9) — « Rejeter (rendu au client) ».
-- A non-conform sample rejected at reception is given back to the client,
-- neither analysed nor destroyed: cancelled with its own motif.
-- `Sample.cancelReason` is the only column of this ENUM; every existing value
-- is kept in its order and REJETE_A_RECEPTION is appended last (additive: the
-- MariaDB ENUM grows in place, no table copy, no row changes).
ALTER TABLE `Sample`
    MODIFY `cancelReason` ENUM('NON_EXPLOITABLE', 'QUANTITE_INSUFFISANTE', 'DOUBLON', 'ANNULATION_CLIENT', 'DETRUIT_A_RECEPTION', 'AUTRE', 'NON_RECU', 'REJETE_A_RECEPTION') NULL;
