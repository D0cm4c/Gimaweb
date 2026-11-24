# CONTEXT.md — Mémoire du projet Gimaweb (à lire en priorité)

> Mémoire entre sessions IA sur ce dépôt. **À lire en premier**, **à mettre à jour dans chaque PR** qui change l'état, une décision, ou une leçon. Ne jamais réécrire de zéro.

## 🎯 Objectif

**Gimaweb = le produit final** de la gestion membres/formations/inscriptions de l'Atelier du web : un serveur HTTP en réseau local (Ubuntu Server sur portable) avec **UNE seule base SQLite**, servi aux postes de l'asbl. GitHub Pages (le dépôt maquette `D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web`) reste le labo.

## 📜 Le brief fondateur

**Issue app #150 « Transmission maquette → app-serveur »** — le contrat de branchement est l'interface `ADWDatabase` (db.js maquette) : 5 primitives + 62 méthodes métier à devenir endpoints. Schéma 16 tables consolidé dans `server/schema.sql`, contrat complet dans `docs/CONTRAT-API.md`. **Acquittée le 23 nov. 2026** (commentaire « girafe-hélicoptère » + issue miroir dans ce dépôt).

## 🏗️ Décisions figées

- Stack : Node 22 LTS + Express + better-sqlite3 (WAL). Schéma maquette = base de départ ; une base exportée de la maquette doit s'ouvrir telle quelle.
- Deux rôles : servir le frontend statique (copie chartée de la maquette) + l'API `/api/…`.
- Déploiement : pull (GitHub HTTPS public → `git pull` sur serveur → restart service). Le serveur ne pousse jamais. Pas de clé sur le serveur.
- Design : `docs/CHARTE-GRAPHIQUE.html` fait foi — copiée au premier commit (exigence du brief).
- Langue française partout (code, commits, UI). Commits préfixés `feat:`, `fix:`, `docs:`.
- Zéro secret committé (`.env` gitignoré) ; RGPD : purge + remplacement de base derrière garde admin.
- Toute action automatique = notifiée + journalisée ; matching hiérarchique (n° membre > email > nom/prénom > création), les cas incertains passent par l'écran de validation humaine.

## ✅ Décisions tranchées par le porteur (23 nov. 2026) — FIGÉES

1. **Auth** : mot de passe unique partagé + cookie de session (garde des endpoints sensibles ; hash SHA-256 dans `.env`)
2. **Sauvegarde** : nocturne — `sqlite3 .backup` → chiffrement AES-GCM → WebDAV Nextcloud (M4)
3. **Frontend** : monolithe — copie des pages maquette dans `public/` de ce dépôt
4. **Service** : port 3000 direct en LAN (`http://192.168.x.x:3000`)

Le code démarre : plan M0→M5 dans `docs/CONCEPTION.md` §6.

## 📦 État actuel

- Bootstrap livré (PR #1) : README, AGENTS.md, CONTEXT.md, docs de conception + contrat API, charte copiée, `server/schema.sql` (16 tables consolidées).
- M0 **fusionné** (PR #1, #3 — CI verte sur main) : Express + better-sqlite3 (16 tables, salles seedées), `/api/sante`, auth mot de passe partagé + session 30 min, CI (test 8/8). Prochaine phase : M1 membres.
- PR #1 et #3 fusionnées le 23 nov. 2026 sur demande du porteur.

## 🧠 Leçons (importées de la maquette)

1. PRs petites et ciblées, une fonctionnalité par PR ; l'utilisateur valide le merge (« go »).
2. `toISOString()` décale les dates en UTC+1 — toujours formater en local (isoLocal).
3. Les caractères réels dans les ancres de patch (pas de `\u2705`) ; jamais d'emoji en échappements.
4. Tests sur données réelles : base vide n'exécute pas tous les chemins.
5. Conception avant code (skill pre-production du dépôt D0cm4c/skills).
6. Le plugin WP partenaire existe : `D0cm4c/plugin-wp-inscription-membre-atelier-du-web` (endpoint bookings server-to-server, + labels publics).

## 📌 Règles pour toute session

1. Lire ce fichier, puis `docs/CONCEPTION.md` et `docs/CONTRAT-API.md`.
2. `git status` / `git log` / issues ouvertes avant de toucher au code.
3. Mettre à jour ce fichier dans chaque PR (état, décisions, leçons).
4. Avant tout commit/push : résumer l'action (fichiers, but) dans la PR ; l'utilisateur fusionne.

## 📦 État — M1a (PR #4)

- **M1a (membres) livré** : `server/api-membres.js` — CRUD `/api/membres`, n° auto 1000-9999 (gaps comblés), validation (prénom/nom requis, subscription none|monthly|yearly), fiche enrichie (visit_count, visited_today, print_balance), `previewRenewal` sans écriture + renouvellement effectif (fige first_start_date, cycle +1 mois/1 an, actif→lendemain de fin, expiré→aujourd'hui), **cascade RGPD derrière session admin** (visits, prints, formations_members, waitlist, fm_payment_log, membre). Test fonctionnel réel 15/15 (`tests/m1-membres.js`), CI joue m0+m1a.
- Leçon : ne jamais envoyer de corps `"null"` en JSON au serveur Express (parse en 400) — côté client HTTP, DELETE sans corps.

## 📦 État — M1b (PR #5)

- **M1b (visites + impressions) livré** : `server/api-visites.js` — `POST /api/visites` (double pointage refusé 409, montant 1 € ou 0 si abonnement, motif FRB `reason` optionnel), `GET /api/membres/:id/visites` (historique fiche), `GET /api/visites?date=` (visites du jour avec identités — accueil/dashboard), `POST /api/impressions` (N&B 0,10 € / couleur 0,50 € par défaut, montant surchargeable), `GET /api/membres/:id/impressions` (solde + lignes), `POST /api/membres/:id/impressions/solder` (tout impayé → payé), `DELETE /api/membres/:id/impressions` (suppression du solde — erreur de saisie). Tarifs figés exportés dans `TARIFS` (module), source app.js. Test 15/15 (`tests/m1b-visites.js`), CI joue m0+m1a+m1b.
- **M1 (a+b) complet une fois #4 et #5 fusionnés.**

## 📦 État — M2a : formations en base (PR #6)

- **Client MEC porté côté serveur** (`server/mec.js`) : fetch paginé `wp-json/wp/v2/mec-events`, parseur FR (durée/dates/horaires, multi-dates, créneau AM/PM), résolution catégories (jamais d'ID numérique en base), fallback RSS (parsing regex — pas de DOMParser serveur), enrichissement labels/tarifs/lieu/organisateur via le plugin `adw-mec/v1/labels`. `WP_BASE`, `ADW_LABELS_URL`, `ADW_RSS_URL` surchargeables par .env (les tests injectent un mock).
- **API formations** (`server/api-formations.js`) : `POST /api/formations/sync` (maj/ajout/retrait + dates/créneaux + retrait auto des disparues avec CASCADE), `GET /api/formations` (auto-sync 15 min TTL,enrichies attendee_count/paid_count), `GET /api/formations/:id` (id interne OU event_id, dates, inscrits), inscriptions `POST/DELETE /inscrits` (409 doublon, retire les listes d'attente event + génériques du même titre normalisé), `GET /inscrits` + `PUT` paiement (bancontact|cash|null avec journal fm_payment_log paid/cleared) et présence (present|canceled|null), `GET /paiements` (journal), `GET /membres/:id/formations`, `GET /formations/titres/distincts`. Chaque sync notifie (règle des automatismes).
- Test 21/21 (`tests/m2a-formations.js`) avec **mock WP en boucle locale** (CI sans réseau). Le leurre `event_id` : stocké TEXT — comparer en String côté client.
- Le test m1b qui attendait 501 sur /api/formations repositionné sur /api/tickets.

## 📦 État — M2b : salles + listes d'attente (PR #7)

- **API salles** (`server/api-salles.js`) : `PUT /api/formations/:id/salle` (400 si salle inconnue), `GET|PUT /api/formations/:id/dates` (créneaux remplacés en bloc, validation AAAA-MM-JJ + AM/PM), `GET /api/salles/planning?mois=YYYY-MM` (grille du mois), `GET /api/formations/:id/conflits` (même salle × date × créneau, NON bloquants — décision maquette), `GET /api/formations/sans-salle`, CRUD `/api/salles` **derrière session admin** (suppression refusée 409 si formations attribuées).
- **Listes d'attente** : `POST /api/listes-attente` (anti-doublon event_id OU intitulé), `GET /api/listes-attente?event_id|titre`, `top?limite=`, `GET /api/membres/:id/listes-attente`, `DELETE`, `PUT …/contacte`, `GET /api/formations/:id/liste-attente/match` (garde critique : titre normalisé < 4 caractères = event_id seul), **option C** : `POST /api/listes-attente/migrer` — les attentes des sessions passées/disparues deviennent génériques (le sujet), anti-doublon, **notifiées** (type sync). La migration est **branchée sur chaque sync** (`apresSync` — option C maquette).
- Test 29/29 (`tests/m2b-salles.js`, mock WP + seeds manuels en base).
- Leçon : `LIKE '%…%'` sur titre normalisé ne matche pas les espacements multiples du titre stocké — le matching normalise pour la comparaison en SQL LOWER, l'anti-doublon POST utilise l'égalité exacte (LOWER) : pour les tests, titres à espacement simple.

## 📦 État — M3 : notifications + réservations du site (PR #8)

- **API notifications** (`server/api-notifications.js`) : `GET /api/notifications?limite=`, `GET /avant-premiere?limite=` (non-lues d'abord, complétées des récentes — en SQL), `GET /non-lues`, `POST` (usage programme), `PUT /:id/lu`, `PUT /lues` (tout marquer lu), `DELETE /lues` (purge des lues), `DELETE /notifications` (tout). Le journal `notifications` est déjà alimenté par les syncs ; `notifier()` centralisé dans serveur.js.
- **API bookings** (`server/api-bookings.js`) :
  - `POST /api/bookings/upsert` — **secret server-to-server** (`BOOKINGS_SECRET` en .env, Bearer ou x-adw-secret ; 503 si non configuré, 401 si invalide) : réception des réservations du plugin WP, upsert idempotent, puis **miroir immédiat**.
  - Miroir « le site vend, l'app gère » : annulation traitée → désinscription locale + notification auto_unlink + reset du booking (jamais de résurrection) ; annulation non traitée → ignorée (file propre).
  - `GET /bookings/non-traites` — file de validation avec **matching calculé par item** (n° membre > email LOWER > nom/prénom normalisés NFD → candidats, jamais certains).
  - `POST /bookings/traitement-automatique` — rattache les certains (auto_linked, notifié), les incertains restent à l'humain.
  - `PUT /bookings/:id/traitement {action: linked|created|ignored, member_id?}` — validation humaine : linked (inscription + notif), created (membre créé n° auto, données du booking + inscription + notif), ignored (silencieux). 409 si déjà traité, 404 id inconnu, formation inconnue → ignored + notif awaiting_validation.
- Test 32/32 (`tests/m3-bookings.js`) : garde secret (401/400/503), hiérarchie complète du matching, auto-traitement, validation humaine (candidats, création #1003), miroir (annulation → désinscription notifiée + non-résurrection), file sans annulées, cycle complet notifications.
- ⚠️ Leçon (bug attrapé par le test) : **`db.prepare('UPDATE…')` sans `.run()` s'exécute JAMAIS en better-sqlite3** (statement préparé ≠ requête jouée) — toujours `.run()`/`.get()`/`.all()`, et tester le RÉSULTAT pas le code HTTP (204 renvoyé alors que rien n'avait changé en base).

## 📦 État — M4 : tickets/suggestions/équipe + sauvegarde chiffrée + restauration (PR #9)

- **API tickets/suggestions/équipe** (`server/api-tickets.js`) : tickets CRUD (valeurs consacrées, resolved_at posé, DELETE derrière session admin, commentaires en cascade), suggestions (statuts open|done|discarded), équipe (suppression 409 si tickets assignés au nom), **purge RGPD derrière session admin** (périmètre maquette : visites, impressions, inscriptions, membres, bookings, suggestions, attentes, journal paiements — salles/formations conservées, notifiée).
- **Sauvegarde chiffrée** (`server/sauvegarde.js`) : snapshot cohérent via l'API `.backup` de better-sqlite3 → AES-256-GCM (clé scrypt depuis `BACKUP_PASSPHRASE`) → export WebDAV Nextcloud. `POST /api/base/sauvegarde` (session admin) + CLI dédiée. Test avec mock WebDAV : déchiffrement + mauvaise phrase → échec + fichier non-SQLite en clair.
- **Remplacement de base (restauration)** : `POST /api/base/remplacement {fichier_base64}` (session admin) — base candidate déposée **après** integrity_check, `redémarrage_requis`, adoptée au démarrage suivant si saine, jamais écrasée à chaud.
- `docs/ADMINISTRATION.md` : installation Node 22, systemd service + **timer 02:30** pour la nocturne (décision figée n° 2), pull deployment (GitHub → git pull → restart), restauration.
- Test 32/32 (`tests/m4-tickets-sauvegarde.js`) avec arrêt/redémarrage réel du serveur pour la restauration.

## 🧠 Leçons M4

1. **Piège WAL au remplacement** : écraser le `.db` sans purger `-wal`/`-shm` laisse l'ancienne base rejouer ses transactions PAR-DESSUS la restaurée — toujours supprimer les 3 fichiers ensemble. 16h30 sur ce chantier.
2. **Trap CLI endsWith** : ne JAMAIS détecter l'exécution CLI avec `argv[1].endsWith(nomModule)` — le test `m4-tickets-sauvegarde.js` finit pareil, l'import déclenchait une fausse CLI qui tuait le test (exit 1). Comparer `path.resolve(argv[1]) === fileURLToPath(import.meta.url)`.
3. **Serveurs fantômes en test** : un test qui crash sans tuer son serveur spawné laisse un processus sur son port → le run suivant parle à la base obsolète du fantôme (symptômes absurdes : UNIQUE 500 sur des insertions fraîches). Toujours `finally { kill }` + vérifier `ps` quand les résultats "ne collent pas".
4. Les sessions sont en mémoire : après redémarrage, re-login dans les tests (et dans la vraie vie — 30 min max).
## 📦 État — M5a : socle frontend (PR #10)

- **public/** : copie chartée de la maquette (12 pages HTML, styles.css, assets, modules partagés) — les tags `db.js`/`backup.js`/`import.js`/`demo-data.js` remplacés par **`adw-client.js`** (le client HTTP du contrat, 62 méthodes métier → REST `/api/…` ; `init/persist/flush` = no-ops ; `queryAll`/`run` refusés avec message "page à migrer (M5b)" — aucun SQL par le réseau).
- **Page Membres migrée** (`app.js`) : liste via `GET /api/membres` + filtre/tri/recherche **côté client** (11 tris, 6 filtres, recherche n°/texte — la maquette faisait le tri en SQL : c'est une réécriture, pas un portage), CRUD (`creerMembre`/`modifierMembre` — 409 = numéro épuisé), fiche détail enrichie (visites + formations via `Promise.all`), pointage (le **409 double-pointage vient du serveur**), impressions (ajouter/solder/effacer solde), renouvellement, suppression cascade, deep-links `#member=`/`#edit=`.
- **Page Formations migrée** (`page-formations.js`) : plus de `ADWMec` navigateur — `GET /api/formations` (auto-sync serveur 15 min), **modale de validation des inscriptions refondue serveur** : à l'ouverture → `traitement-automatique` (certains rattachés + notifiés), la file n'affiche que les incertains avec candidats/created/ignored → `PUT /bookings/:id/traitement`. Le bouton Démo 🧪 (résas simulées) supprimé — sync réelle plugin WP → serveur.
- **auth.js** : réécrit sur la session serveur (POST `/api/auth/connexion`, cookie HttpOnly 30 min, localStorage = simple mémoire de déverrouillage 25 min) — même interface `ensureUnlocked/lock/isUnlocked`, zéro changement pour les appelants.
- **notifications.js** : adapté au client asynchrone (badge, aperçu, push, rappels sans-salle + tickets urgents via `listTickets`).
- Pages **non migrées** (M5b, code maquette conservé — seules les méthodes métier marchent, les appels SQL échouent explicitement) : index/dashboard, stats, salles, tickets, suggestions, notifications (page), parametres, membre.html/formation.html (fiches détaillées), globalsearch, import XML.
- Test **41/41** (`tests/m5a-frontend.js`) : le client est **chargé dans Node** contre le serveur réel (fetch injecté avec l'origine, comme le navigateur) — flux complet membres/visites/impressions/formations/attente/notifications/salles + pages servies 200 + garde 401 RGPD + 501 API.
- ⚠ Leçons : pkill -f s'auto-matche dans la ligne de commande du shell (->[s]erveur.js) ; le client HTTP est testable dans Node avec un fetch injecté — pas besoin de navigateur pour la logique.

## 📦 État — M5b (1re vague) : fiches détaillées + pages simples (PR #11)

- **`page-membre.js` (fiche membre, URL partageable) migré** : KPI depuis le tableau de visites (plus d'agrégats SQL), les 3 sources (visites/formations/intérêts) en `Promise.all`, pointage via `pointerVisite` (409 serveur), impressions, renouvellement promisifié, suppression (garde admin), recherche d'intérêts — plus AUCUN SQL. Fix.structure : le listener "Renouveler" vivait DANS le callback du bouton Supprimer depuis la maquette (valide en syntaxe mais tordu) — séparé proprement.
- **`page-formation.js` (fiche formation) migré** : préchargement async complet (salles, dates, inscrits, attente, journaux de paiement par inscrit) via un pattern render() → ctx → _renderInterne ; attribution de salle + conflits en promesses ; recherche membre côté client ; aperçu membre via `getMembre`/`getMemberFormations` ; **Resynchroniser** passe par `POST /api/formations/sync` (serveur) ; `loadMecLabels`/`applyParsedData` supprimés (le serveur enrichit à la sync) ; init par `getFormationByEventId`. Plus AUCUN SQL.
- **`page-suggestions.js`** et **`page-notifications.js`** migrés (promesses partout, même logique de rendu).
- **Reste M5c** : page-salles.js, tickets.js/page-ticket.js/page-tickets.js, dashboard.js/page-stats.js (nécessite des ENDPOINTS D'AGRÉGATS serveur — KPI, heatmap, motifs), globalsearch.js, page-parametres.js (salles admin + sauvegarde/restauration UI), import.js (endpoint d'import XML), booking.js (sélecteur membre pour MEC prefill).
- Pattern éprouvé pour M5c : render() précharge ses sources en `Promise.all` puis rend via une fonction interne synchrone ; les handlers d'action enchaînent promesse → notification → re-render.

## 📦 État — M5c : agrégats serveur + migration des dernières pages (PR #12)

- **API agrégats** (`server/api-agregats.js`) : `GET /api/agregats/flot` (KPI dashboard + agenda du jour + 6 visites récentes + impressions dues + tickets en UN appel) et `GET /api/agregats/stats` (TOUS les agrégats de la page Statistiques en UN appel : membres/visites/rétention/profil CP/motifs FRB/inclusion/statuts/cp_top10/genres/rapport annuel/heatmap 84j/graph 14j+12mois) + `GET /api/recherche?q=` (recherche globale topbar, ≥2 chars). Règle du contrat tenue : zéro SQL par le réseau, zéro `queryAll` restant dans `public/`.
- **Visites anonymes** : `POST /api/visites {anonyme:true, reason}` → `member_id = NULL`, 1 € — passage sans inscription. `pointerVisite('anon'|null)` côté client. **Migration de schéma** : `visits.member_id` nullable (recréation de table au démarrage pour les bases existantes, données préservées, index recréé).
- **Pages migrées (fin de vague M5c)** : `settings.js` (salles admin 409, équipe, sauvegarde chiffrée `sauvegardeChiffree()`, restauration `.db`/`.aes` par base64 + `remplacerBase`, changement de mot de passe → hash SHA-256 affiché + instruction `.env`), `page-salles.js` (planning serveur porte `room_id`), `dashboard.js` (flot en 1 appel, pointage anonyme OK, impression rapide), `globalsearch.js` (`rechercheGlobale`), `tickets.js`, `page-ticket.js` (équipe async, commentaires, save/delete/comment en `.then`), `booking.js` (sélecteur membre = `listerMembres` + filtre client limite 8), `page-stats.js` (refondue sur `agregatsStats()`, rapport annuel CSV côté client).
- Test **27/27** (`tests/m5c-agregats.js`) : anonymes (x2), flot, stats complètes + recalcul rétention, recherche (trouvée/vide/trop courte), pages servies. Régression totale : **220/220** (8+15+15+21+29+32+32+41+27).
- ⚠ Leçon : le schéma SQLite ne permet PAS de relâcher un `NOT NULL` par ALTER — migration par recréation de table (BEGIN implicite via db.exec, INSERT SELECT, DROP, RENAME). Et toujours vérifier les FK avant d'inventer un id sentinelle ('anon' → 500 FK).
