# Recette « une journée du laboratoire » — production, 6 octobre 2026

Un seul prélèvement suivi de bout en bout, à la main dans le navigateur, sur
http://185.217.126.53, avec les comptes de démonstration et dans l'ordre où le
laboratoire travaille : visite → réception → programme d'analyse → paillasse →
validation → approbation → rapport → facture. Chaque étape a été relue après
rechargement de la page et confrontée au journal d'audit (`/admin/journal`),
qui n'écrit que ce que la base de données a réellement enregistré.

Heures en **heure légale du Maroc (GMT)**. Le PC de test affiche une heure de
plus (fuseau non mis à jour) : ce n'est pas un défaut de l'application — voir
`HANDOFF.md` §8, 2026-10-05.

## 1. Le prélèvement suivi : série 1/26, contrôle 1/26

Client de test « TEST UI 2026-10-06 Traiteur » (id `cmuwqu9uz000201o0pv6wt2zu`),
produit « Pastilla au poulet », lot L-1006-A, lieu « Cuisine chaude ».

| Heure | Qui | Écran | Ce qui a été fait | Ce que la base a enregistré (journal / API) |
|---|---|---|---|---|
| 13:58 | commercial1 — Hicham Tazi | Clients → Nouveau client | Fiche créée avec ICE, adresse, e-mail test-ui@example.com | « Client créé » ; `POST /api/clients` 201 |
| 13:59 | pre1 — Karim Benali | Nouvelle visite | Client, interlocuteur, une ligne aliment ; « Prélevé le » laissé à l'heure proposée (13:59, heure légale affichée sous le champ) ; arrivée au laboratoire renseignée | Série **1/26** créée (`cmuwqwr2l000501o0cbvyfxm1`), échantillon PRELEVE ; aucun N° de contrôle visible au préleveur ; protocole PDF 200 |
| 14:01 | recep1 — Salma Idrissi | Réception → série 1/26 | Glacière 5 °C, 300 g, conforme, **technicien laissé au responsable des paramètres** ; « Valider la réception » | « Échantillon réceptionné 1/26 » ; N° de contrôle **1/26**, statut RECU ; étiquettes PDF 200 |
| 14:03 | param1 — Rachid Alaoui | Programmation → fiche 1/26 | Type « PLAT CUIT PRÊT À CONSOMMER » (6 germes cochés avec leurs critères), n = 5, prise d'essai 25 g, Yassine par défaut, **Salmonelles → Imane**, délai 07/10 16:00 ; « Confirmer le programme » | « Programme d'analyse confirmé 1/26 » ; statut PROGRAMME, `programmedAt` 14:03 ; `PUT /api/samples/[id]/programme` 200 |
| 14:06 | tech1 — Yassine Amrani | Paillasse → 1/26 | R1 … R5 tapés au clavier pour ses 5 germes (< 10, Absence, 1.10³ …) ; « Enregistrer » | « Analyse démarrée », « Résultats enregistrés » ; statut EN_ANALYSE ; `PUT …/results` 200 |
| 14:07 | tech2 — Imane Cherkaoui | Paillasse → 1/26 | Salmonelles R1 … R5 « Absence » ; enregistré puis « Soumettre à la validation » | « Résultats enregistrés », « Résultats soumis à validation » ; statut RESULTATS_SAISIS |
| 14:08 | valid1 — Dr. Nawal Bennani | À valider → 1/26 | Six verdicts « Conforme » relus face aux critères ; réglementation proposée par le type ; « Valider techniquement » | « Validation technique », « Réglementation choisie pour un échantillon » ; étape 1 signée, statut inchangé jusqu'à l'approbation (double validation) |
| 14:10 | admin — Sara Mansouri | Approbations → 1/26 | « Approuver définitivement » | « Approbation finale », « Rapport envoyé » ; statut RAPPORT_ENVOYE ; **RAP-2026-00001** ; e-mail simulé (SMTP non branché) |
| 14:11 | admin | Rapport PDF | PDF téléchargé et relu à l'image | « Rapport téléchargé RAP-2026-00001 » ; en-tête réglementation avec la croix sous « Satisfaisant », R1 … R5 par germe, critères n / c / m / M, « Analyses réalisées par : Yassine Amrani · Imane Cherkaoui », trois signatures, une page |
| 14:16 | compta1 — Leila Fassi | Comptabilité → Nouvelle facture | Client de test → 1/26 proposé ; 6 lignes au prix du catalogue ; TVA 20 % | « Facture émise » **FAC-2026-0001** (1 250 DH HT, 1 500 DH TTC) ; PDF relu 14:17 ; 1/26 n'est plus proposé |
| 14:18 | valid1 | Recherche des analyses | 1/26 cherché | « Rapport envoyé · Satisfaisant », rapport et série en lien |

Preuves côté base de données, après déconnexion / reconnexion et rechargement :
`GET /api/samples?limit=50` (admin) renvoie les deux échantillons du client en
`RAPPORT_ENVOYE` ; le journal porte les 23 écritures ci-dessus avec leurs heures
et leurs auteurs ; les compteurs de l'année valent série 2, contrôle 2, rapport 2,
facture 1 ; chaque page rouverte montre ce qui avait été saisi.

## 2. Second prélèvement, pour une vérification : série 2/26, contrôle 2/26

Même client, « Salade de poulet », « Cuisine froide », un seul germe (E. coli),
sans type de produit porteur de critères. Objet : vérifier que la
**réglementation changée par le validateur** est bien celle enregistrée.

| Heure | Qui | Ce qui a été fait | Base |
|---|---|---|---|
| 14:12 | recep1 | Réception sans technicien | « Échantillon réceptionné 2/26 », N° 2/26 |
| 14:13 | param1 → tech1 | Programme confirmé (E. coli seul), résultat < 10 UFC/g enregistré et soumis | PROGRAMME → EN_ANALYSE → RESULTATS_SAISIS, 4 écritures |
| 14:20 | valid1 | Dans la liste « Réglementation », « — aucune — » remplacée **au clavier** par « Arrêté conjoint n° 624-04 du 8 avril 2004 », puis « Valider techniquement » | « Réglementation choisie pour un échantillon » ; après rechargement et après reconnexion de l'admin, le panneau affiche l'arrêté choisi |
| 14:22 | admin | « Approuver définitivement » | **RAP-2026-00002**, « Rapport envoyé » |
| 14:23 | admin | PDF relu | Un germe, critère du catalogue 1.10², conclusion « conforme » ; **pas de tableau « Réglementation en vigueur »** : il n'est imprimé que lorsqu'un critère (plan n / c / m / M) ou un verdict officiel existe — ici aucun (voir §3) |

Conclusion : la réglementation choisie est enregistrée et reprise. L'échec
observé la veille venait de l'outil de test (valeur posée par script, que
React ne voit pas), pas de l'application : une vraie action de l'utilisateur
fonctionne.

## 3. Ce que cette journée a montré

| Gravité | Constat | Sort |
|---|---|---|
| Mineur | **Réception : un technicien était pré-sélectionné** (le premier de la liste) alors que le champ est facultatif depuis le programme d'analyse — à l'usage, la réception attribuerait sans le vouloir. | **Corrigé le jour même** : « À attribuer à la programmation » par défaut sur la réception de série, le dépôt et « Technicien pour toutes les lignes » ; déployé (voir §4). |
| Donnée | Le type « PLATS CUISINÉS-VOLAILLES » n'a **aucun critère** dans le catalogue repris de l'ancien logiciel (la fiche de programme l'affiche sans tableau) ; « PLAT CUIT PRÊT À CONSOMMER » a été utilisé à la place. D'autres types repris sont sans doute dans ce cas. | Question au laboratoire (NEEDEDINFO Q43) : liste des types à compléter avant le go-live. |
| Donnée | La réglementation proposée pour un plat cuisiné est « Critère Canadien … » : c'est celle rattachée au type dans les données reprises. | Le validateur peut la changer sur chaque échantillon (vérifié §2) ; à relire par le laboratoire type par type. |
| À décider | Un échantillon jugé sans critère (seulement une limite du catalogue) n'imprime pas la ligne « Réglementation en vigueur » même si le validateur en a choisi une (règle CRITERES.md §3 : pas de croix sans verdict officiel). | À confirmer avec le laboratoire : imprimer quand même la réglementation, sans la croix ? (NEEDEDINFO Q44) |
| Normal | Après « Valider techniquement », le badge reste « Résultats saisis » jusqu'à l'approbation de l'admin ; le panneau montre l'étape 1 signée. | Conforme à la double validation ; rien à changer. |
| Outil de test | Les valeurs posées par script dans la grille de paillasse et la liste des réglementations ne sont pas vues par React (une vraie frappe, oui) ; un onglet ouvert avant un redéploiement ne charge plus les données (ouvrir un nouvel onglet). | Sans effet pour un utilisateur ; noté pour les prochaines recettes. |

Aucun refus serveur, aucune erreur 500, aucune page « Une erreur est survenue »
sur tout le parcours ; chaque écriture a sa trace dans le journal.

## 4. Correction déployée après la recette

`SerieReceptionForm` et `DepositForm` ne pré-sélectionnent plus de technicien
(`defaultTechnician = ""`), et « Technicien pour toutes les lignes » propose
« À attribuer à la programmation ». Vérification sur production après
déploiement : voir la dernière ligne de TESTPLAN U.

## 5. Données de test

Le client « TEST UI 2026-10-06 Traiteur » et ses deux séries sont **conservés**
pour que le laboratoire puisse rejouer le parcours (rapports RAP-2026-00001 et
00002, facture FAC-2026-0001). Pour les supprimer et remettre les compteurs à
zéro : `node .ui-tests/purge-c.mjs` (dry run puis « SUPPRIMER »), ou
`/api/admin/maintenance/purge-clients` depuis `/admin/reglages`.
