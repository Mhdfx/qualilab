# Rapports : amendement et duplicata — spec (08/10/2026)

L'ancien logiciel a l'état « Amendement » et, dans les options du rapport,
« amendement + note d'amendement, duplicata + date de duplicata ». Ici,
l'amendement est la voie tracée pour corriger un rapport déjà approuvé ; la
correction silencieuse de l'administrateur (`/api/reports/[id]/admin-edit`,
décision du client du 28/07) reste telle quelle, à part.

## 1. Versions figées

Table `ReportVersion` : rapport, `version` (0 = original, 1 = A1…),
`number` imprimé, `data` (JSON : les données du rapport telles
qu'imprimées, `ReportData`), `note` (motif de l'amendement), `issuedAt`,
`issuedById`. Une version est écrite à chaque émission (approbation
initiale et chaque amendement). Pour un rapport émis avant cette
fonction, la version 0 est figée à partir des données actuelles au moment
du premier amendement (noté « reconstituée »). `Report` gagne `version`
(courante), `amendmentNote`, `amendedAt`.

## 2. Amender un rapport

1. **Rouvrir pour amendement** (VALIDATEUR, DIRECTION, ADMIN depuis le
   16/10, Q13 — `REPORT_REOPEN_ROLES`, le rôle inscrit au journal
   `REPORT_REOPENED` ; échantillon `VALIDE` ou `RAPPORT_ENVOYE`) : motif obligatoire → l'échantillon revient à
   `RESULTATS_SAISIS` (transition ajoutée à la machine d'états), la
   validation technique et l'approbation sont effacées, la version courante
   est figée si elle ne l'est pas, le rapport garde son numéro et note
   « amendement en cours ». « Corriger la fiche » et la saisie redeviennent
   possibles (la paillasse : « Renvoyer au technicien » existant).
2. Validation technique puis approbation comme d'habitude (double
   validation, signataires distincts).
3. À l'approbation, le rapport n'est pas recréé : `version` + 1, numéro
   imprimé `RAP-AAAA-NNNNN-A1` (A2…), mention en tête « Rapport amendé —
   annule et remplace le rapport RAP-… du … » et la note d'amendement ;
   nouvelle `ReportVersion`. La version amendée est émise à l'approbation ;
   elle ne part au client que par « Valider et envoyer », ou plus tard par
   « Envoyer au client » (jamais automatiquement depuis le 16/10, Q92 — objet
   « Rapport amendé … »). En attendant, l'échantillon est dans « Validés — à
   envoyer », et « Envoyer » ou « Renvoyer au client » se décide par version
   (`reportVersionSent` : un « -A1 » jamais envoyé lit « Envoyer », même si
   l'original était parti). Journal : `REPORT_REOPENED`, `REPORT_AMENDED`.

Les échantillons en cours d'amendement apparaissent dans la file de
validation avec le badge « Amendement ».

## 3. Duplicata

`GET /api/samples/[id]/report?duplicata=1` (rôles qui lisent déjà le
rapport) : le PDF de la version courante porte « DUPLICATA — édité le … »
en tête et en pied ; journal `REPORT_DUPLICATE`. `?version=N` rend une
version figée (historique), lecture seule, marquée « Version remplacée par
… » quand elle n'est plus la courante.

## 4. Écrans

Page de validation et fiche de recherche d'un échantillon approuvé :
« Rouvrir pour amendement » (VALIDATEUR, DIRECTION, ADMIN, avec motif), « Duplicata (PDF) »,
« Versions du rapport » (liste : numéro, date, motif, lien PDF).
