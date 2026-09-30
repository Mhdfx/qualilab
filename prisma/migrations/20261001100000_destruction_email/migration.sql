-- RETOUR-LABO-30-09.md, slice H3 — the client is told when a line is
-- destroyed at reception (answer to Q35): a third kind of e-mail.
ALTER TABLE `EmailLog`
    MODIFY `type` ENUM('RAPPORT', 'ALERTE_CONTAMINATION', 'DESTRUCTION') NOT NULL DEFAULT 'RAPPORT';
