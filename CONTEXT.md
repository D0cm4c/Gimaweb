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