# Clients en double, sites et clients facturés — spec (07/10/2026)

Pourquoi : l'analyse du 07/10 (`RETOUR-LABO-06-10.md` §7) trouve, parmi les
clients actifs, des fiches en double (même société, orthographe différente),
des points de vente enregistrés comme clients, et des « clients facturés »
(franchisés, holdings, sociétés de gestion) que l'ancien logiciel liait à un
client principal. L'application n'a aucun outil pour corriger cela. Ces
outils se construisent sans attendre le laboratoire ; ils ne seront
**exécutés** sur les vrais clients qu'après la validation du fichier
`doublons-clients.xlsx` (Q54). Aucun nom de client réel dans ce dépôt.

## 1. Modèle (migration additive `20261008100000_clients_fusion`)

- `Client.mergedIntoId` (String?, FK `Client`, `onDelete: SetNull`, index) —
  la fiche gardée quand ce client a été fusionné ou rattaché comme site.
- `Client.billedForId` (String?, FK `Client`, `onDelete: SetNull`, index) —
  « client facturé de » : ce client reçoit les factures pour le client principal.
- `Site.billingClientId` (String?, FK `Client`, `onDelete: SetNull`, index) —
  les échantillons de ce site sont facturés à ce client facturé (vide = au
  client du site).

## 2. Fusionner B dans A (« Fusionner avec… », ADMIN)

`POST /api/clients/[id]/merge` — `[id]` = B (la fiche qui disparaît),
corps `{ targetId: A, mode: "preview" | "commit" }`.

Refus (400) : A = B ; A ou B archivé ; **deux ICE renseignés et différents**
(deux sociétés) ; B est le client principal de A (`A.billedForId = B`) ou
l'inverse — défaire le lien d'abord.

Ce qui passe de B à A, dans une seule transaction :
- séries, échantillons et **factures** (même société : les documents
  portent désormais le nom de A — c'est le but) ;
- sites : un site de B dont le nom normalisé existe chez A est fusionné dans
  celui de A (séries, lieux, adresses repointés, puis le site de B est
  supprimé) ; sinon il passe à A ;
- adresses e-mail (une adresse que A a déjà est supprimée côté B) ;
- mémoire des lieux (fusionnée par site + libellé normalisé, compteurs
  additionnés, échantillons repointés) et des produits (fusionnée par
  libellé normalisé, compteurs additionnés, réglementation gardée si A n'en
  a pas, échantillons repointés) ;
- types de produits et profils propres au client ;
- les liens qui visaient B visent A : `Client.billedForId`,
  `Site.billingClientId` ;
- les champs vides de A (contact, e-mail, téléphone, adresse, ICE) sont
  complétés par ceux de B ; rien n'est écrasé.

B est archivé avec `mergedIntoId = A` — jamais supprimé. Journal :
`CLIENT_MERGED` sur A et sur B, avec les compteurs. L'aperçu renvoie les
mêmes compteurs sans rien écrire, et les avertissements (champs de B
ignorés parce que A les a déjà, ICE de B vide…).

## 3. Rattacher B comme site de A (« Rattacher comme site de… », ADMIN)

`POST /api/clients/[id]/attach-as-site` — `[id]` = B, corps
`{ parentId: A, siteName?: string, existingSiteId?: string, mode }`.

Refus : A = B ; A ou B archivé ; B a lui-même des sites ; B est un client
facturé (`billedForId` renseigné) ou en a ; `existingSiteId` d'un autre
client. Avertissement (pas de refus) quand B a son propre ICE : « c'est
peut-être un client facturé ».

Le site : `existingSiteId`, sinon le site de A au même nom normalisé, sinon
un nouveau site `{ name: siteName ?? B.name, address, phone, city: null }`.

Ce qui passe de B à A : séries (avec `siteId` = ce site quand la série n'en
avait pas) et échantillons ; mémoire des lieux (sur le site) et des
produits ; adresses e-mail sur le site, cases « rapports » et « alertes »
**décochées** (l'envoi par site attend Q45, comme l'import des sites) ;
types et profils. **Les factures restent à B** : ce sont des documents émis
à son nom. B est archivé avec `mergedIntoId = A`. Journal :
`CLIENT_ATTACHED_AS_SITE`.

La logique commune de transfert de la mémoire (lieux, produits, adresses)
vit dans une bibliothèque serveur partagée, utilisée aussi par l'import des
sites du 07/10 (mêmes règles de fusion).

## 4. Client facturé (GESTIONNAIRE, ADMIN)

- `PUT /api/clients/[id]/billed-for` `{ parentId | null }` : F devient (ou
  cesse d'être) client facturé de P. Refus : soi-même ; P archivé ; P est
  lui-même un client facturé ; F a des clients facturés à lui.
- `PATCH /api/clients/[id]/sites/[siteId]` accepte `billingClientId` :
  `null` (le client du site) ou un client facturé de ce client.
- **Facturation :** à facturer pour F = ses propres échantillons + ceux des
  sites dont `billingClientId = F` ; à facturer pour P = ses échantillons
  **sauf** ceux des sites facturés à un autre client. La création d'une
  facture accepte un échantillon dont le client est celui de la facture ou
  dont le site est facturé à ce client.
- Les rapports ne changent pas (le destinataire d'un franchisé attend Q54).
- Fiche de P : carte « Clients facturés » (liste, sites facturés à chacun,
  « Lier un client facturé »). Fiche de F : « Client facturé de P », ses
  sites, « Retirer le lien ». Gestion des sites : « Facturé à » par site.

## 5. Quasi-doublon à la création (GESTIONNAIRE, ADMIN)

`POST /api/clients` (et le renommage par `PATCH`) : le nom exact déjà pris
reste refusé ; un client **proche** (même nom sans forme juridique,
accents ni ponctuation ; même ICE ; une à trois fautes de frappe selon la
longueur, `src/lib/similar.ts`) renvoie 409
`{ error, similar: [{ id, name, reason }] }` tant que le corps n'a pas
`confirmDuplicate: true`. Le formulaire liste les fiches proches avec un
lien et une case « Ce n'est pas le même client ». `GET
/api/clients/similar?name=&ice=` donne la même liste pendant la saisie.

## 6. Fiche d'un client archivé

Une fiche fusionnée ou rattachée affiche « Fusionnée dans X » / « Rattachée
comme site de X » avec le lien ; elle n'apparaît plus dans les listes.
