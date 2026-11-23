# Lot performance — avancement

**But.** Rendre l'application plus rapide pour les utilisateurs sans rien changer
au métier : rôles, gardes, textes français et interrupteurs (`src/lib/lab-proposals.ts`)
restent identiques. Branche `lot2-retour-16-10` (base `7df269c`, code de production `0305d67`).

**Plan.** `.ui-tests/perf/plan.md` (priorités P1 → P3) et les cinq rapports
d'enquête `.ui-tests/perf/investigate-*.md` (dossier non versionné, sur le poste).

**Mesures avant (production, 23/11).**
- Requêtes `?_rsc` de préchargement passives par vue : /admin 59, /commercial 52,
  /validation 47, /recherche 43, /technicien 27, /programmation 25, /reception 25 ;
  toutes relancées après chaque `router.refresh()`.
- Sur `tech1 /technicien/<id>` : get-session jusqu'à 6,5 s et RSC de navigation 5 s
  (file d'attente du navigateur, HTTP/1.1, 6 sockets) contre 0,25–0,5 s sans file.
- Pool de 5 connexions MySQL ; documents de 0,4 à 2 Mo sur /commercial et /programmation/<id>.
- Scripts : `node .ui-tests/perf-prod.mjs <label>`, `perf-prod-2.mjs`, `perf-count.mjs`
  (références `perf-prod.before.json`, `perf-prod-2.before.json`).

## État

| Étape | Éléments du plan | État | Commit |
|---|---|---|---|
| 1 — navigation | P1-1, P1-4, P1-5, P1-3, P2-8 (code) | fait localement, non déployé | « Perf 1 » |
| 2 — pages allégées | P1-6, P2-1, P2-2, P2-7, P2-10 | fait localement, non déployé | « Perf 2 » |
| 3 | P2-4, P2-5, P2-6 (+ P3 au besoin) | à faire | |
| nginx / compose (hors code) | P1-2, P2-3, P2-8 (nginx), P2-9 | à faire sur le VPS | |

## Journal

- 23/11 — Étape 1 : `AppLink` (préchargement à l'intention seulement : survol 80 ms, focus, toucher) à la place de `next/link` dans 52 fichiers + règle ESLint ; toucher de session d'IdleLogout différé de 5 s ; doubles rendus refresh+push retirés (`goFresh`) ; pool DB réglable `DB_POOL_SIZE` (défaut 5, compose 15) ; favicon Next par défaut supprimé, logos en cache 1 jour. Reprise : étape 2 (P1-6 /commercial, P2-5 températures).
- 23/11 — Étape 2 : /commercial allégé (plus de téléphone, d'adresse ni d'adresses e-mail par client ; l'indication « À compléter » calculée côté serveur ; 100 lignes puis « Afficher les N suivants », filtre sur toute la base) ; référentiel de /programmation/[id] et de `GET /api/samples/[id]/programme` compact (`programme-referential-wire.ts`, `hydrateReferential`) ; /recherche n'envoie plus que les sites du client choisi, les autres via `GET /api/recherche/sites` (rôles de /recherche, 403 au technicien, sites inactifs inclus) ; /admin et /preleveur reçoivent leurs premières données avec la page ; file de programmation et listes du technicien plafonnées à 100 lignes (`?afficher=`). Mesures locales (dev) : /commercial 269 Ko, `GET …/programme` 344 Ko. Reprise : étape 3 (P2-4 index LegacySample, P2-5 températures, P2-6 fiche de paillasse).
