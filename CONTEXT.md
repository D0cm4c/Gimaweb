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

## 📦 État — M5d : import XML de l'ancienne base Access (PR #13)

- **`server/import-xml.js`** : portage serveur de `import.js` (maquette) — **0 dépendance** (mini-parseur XML maison dédié à la structure plate Access : records > champs texte, tags échappés `_xHHHH_`, entités). Mêmes mappings que la maquette : STATUS_MAP (`orbem`→`cpas`, `seniors`→`pensionne`, `employé`→`travailleur`…), genre, dates FR `JJ/MM/AAAA`→ISO, âge depuis année de naissance, email nettoyé (le `#` coupe AVANT — `marie#dupont@…` perd l'email, comportement maquette), ABO mensuel/annuel/annuel CPAS → subscription, avertissements (statut non mappé / email illisible / date invalide).
- **`POST /api/membres/import`** (`api-membres.js`, derrière la session admin) : `{xml, essai?}` — `essai:true` = analyse sans écriture (aperçu de la modale), sinon insertion transactionnelle : doublons `member_no` ignorés, ids `imp<n°>`, **notification `import_membres`** à chaque import réel. Garde : 401 sans session, 400 XML manquant/invalide, 413 > 50 Mo.
- **`app.js`** : bloc import migré — `handleImportFile` → `importerXml(xml, true)` (aperçu : nombre + avertissements), `confirmImport` → `importerXml(xml, false)` puis toast + re-render. L'ancien code SQL mort `MIGRE_M5B()` supprimé.
- Test **18/18** (`tests/m5d-import-xml.js`) : garde 401/400, essai sans écriture, mappings complets (décodage `_x00E9_`, orbem→cpas, dates FR, email `#`, seniors→pensionné, statut inconnu→null, fiche sans n° ignorée), import réel en base, **idempotence** (ré-import = 3 doublons), notification, XML cassé/texte brut → 400. Régression totale : **238/238**.
- ⚠ Leçon : `documentElement.children` de la maquette ≠ enfants de la racine du parseur maison — les fiches sont au niveau SOUS l'élément racine du document. Et toujours vérifier le comportement réel des helpers de la maquette avant de les tester (`split('#')[0]` garde ce qui est AVANT le `#`).

## 📦 État — M6 : parcours de bout en bout via le client HTTP (PR #14)

- **Objectif** : vague de vérification finale — les autres suites testaient des API en direct ; celle-ci rejoue **une journée complète à L'Atelier du web, 100 % via le client HTTP `ADWDatabase`** (exactement le code appelé par les pages migrées), avec session admin injectée dans le fetch (comme le cookie same-origin du navigateur).
- **Scénario chronologique** (`tests/m6-parcours.js`, **55/55**) : 9h connexion équipe → import XML Access + création manuelle (`#1000`) → pointage nommé (409 double) + **visite anonyme** → impressions (N&B + couleur, effacer solde) → aperçu/renouvellement d'abonnement → sync formations du site WP mocké (auto au GET, via client) → inscriptions/déscription → paiement `bancontact` + présence `present` + journal → salle (ajout, renommage, attribution, planning par mois `fid`, dates, deleteRoom 409 si occupée) → liste d'attente générique (depuis Paramètres : ajout, membre, top, contactée, par titre, retrait) → équipe + tickets complets (urgent, commentaire, mise à jour, suppression cascade, technical 409 si assigné) → suggestions (création, compteur, done 204) → notifications (push manuel, avant-première, lu/tout-lu/purge) → agrégats de fin de journée (flot, stats, recherche) → **sauvegarde chiffrée + remplacement de base**.
- Couvre ~46 méthodes client jamais exercées par les suites précédentes (preview/renewRenewal, effacerSolde, syncFormations, unregister, setFmPayment/Attendance, addRoom/renameRoom/deleteRoom, setFormationDates, getRoomConflicts, waitlist complète, suggestions, tickets via client, équipe, notifications détaillées, sauvegardeChiffree/remplacerBase).
- Régression totale : **293/293** (11 suites).
- ⚠ Leçons (contrats réels qu'il faut connaître avant d'écrire un test client) : `payment` attend un MOYEN (`bancontact|cash`), `attendance` un état (`present|canceled`), jamais un montant/booléen ; le planning porte `fid` (pas `formation_id`) ; notification lue = `is_read` ; les 204 (markRead, setSuggestionStatus) ne renvoient AUCUN corps — toujours re-lister pour vérifier l'effet ; visites abonné mensuel = 0 € (seule l'anonyme paie).

## 📦 Documentation — fin de chantier (PR #15)

- `docs/CONTRAT-API.md` complété : visites anonymes (`member_id` NULL depuis M5c), historique visites/impressions par membre, **import XML Access** (`POST /api/membres/import`, essai/réel, gardes 401/400/413), **agrégats** (`/api/agregats/flot`, `/api/agregats/stats`, `/api/recherche`), et correction du remplacement de base (JSON `fichier_base64`, pas multipart) + sauvegarde chiffrée (AES-256-GCM, timer 02:30).
- `README.md` : ADMINISTRATION.md ajouté à la table des docs + état du chantier (M6 fusionné, 0 SQL navigateur, 293/293).

## 🚨 Correctif production — bug auth.js : modale de déverrouillage VIDE (PR #16)

- **Symptôme signalé en production* : « pleins de liens/boutons qui marchent pas », dont Importer XML de membres.html.
- **Cause racine** : `public/auth.js` `ouvrirModale()` — **la ligne `modale.innerHTML = …` avait disparu** lors de la réécriture M5a : la grande chaîne HTML restait une expression flottante (syntaxe valide !), la modale était appendChild-ée VIDE, puis `champ.focus()` sur `null` → **TypeError à CHAQUE action gardée** (ensureUnlocked) : import XML, suppressions, purge RGPD, sauvegarde, paramètres… Le `node --check` ne peut pas attraper ça ( valide en syntaxe), et aucune suite ne chargeait les pages dans un DOM.
- **Correctif** : innerHTML restauré + structure conforme à la charte (overlay `modal-overlay` > `modal`, `form-group`, `modal-actions`, `zIndex 1000`) comme `auth.js` maquette.
- **Nouvelle suite `tests/m7-dom.js` (17/17)** : chaque page est chargée en **vrai DOM (jsdom, devDependency)** avec ses scripts exécutés, fetch branché sur le serveur réel avec cookie jar (comme un navigateur) → « page charge sans erreur JS » pour les 12 pages ; puis **parcours DOM du bouton Importer XML** : présent → clic → modale de déverrouillage → saisie du mot de passe → submit → modale d'import visible → essai serveur 1 fiche analysée.
- Régression totale : **310/310** (12 suites).
- ⚠ Leçons (les plus importantes du chantier) : 1) une expression-flottante est INFAILLIBLE en `node --check` — seule une exécution réelle en DOM l'attrape ; 2) le point commun de « plein de boutons morts » = une seule fonction partagée qui throw (ici ensureUnlocked) ; 3) une réécriture UI se teste en CLIQUANT, pas seulement en appelant l'API en dessous.

## 🔧 Cache navigateur (complément PR #16)

- `auth.js?v=2` → `?v=3` dans les 12 pages : force le rechargement du fichier corrigé sur tous les postes LAN (sinon les navigateurs gardent l'ancien `auth.js` cassé en cache et les boutons restent morts même après `git pull`).
- Règle à retenir pour les prochaines corrections frontend : **bump du `?v=` d'un script à chaque modification de ce script** (le versioning des tags vient de la maquette, il ne se bump pas tout seul).

## 🏷️ Versionnement officiel (PR #18)

- L'app s'appelle **Gimaweb**. **v1.0.0 = première mise en production** (M0-M6, docs) ; **v1.1.0 = correctif auth.js + bump cache** (PR #16-#17) — c'est la version en prod.
- La version vit dans `package.json` (`version`) et est exposée par `GET /api/sante` (`version`, via createRequire — plus jamais en dur dans le code). Règle : **incrémenter à chaque maj poussée** — correctif = x.y.Z, fonctionnalité = x.Y.0, rupture de contrat = X.0.0 — et l'ajouter au `CHANGELOG.md`.

## 🖥️ v1.2.0 — nom + version affichés dans la sidebar (PR #19)

- `layout.js` : bloc `.side-version` (#adwVersion) dans le footer de la sidebar, **au-dessus du lien atelierduweb.be** — rempli par `fetch('/api/sante')` → « Gimaweb v1.2.0 » (synchro automatique avec package.json, aucune édition de page nécessaire au prochain bump).
- `.side-version` ajouté à styles.css (couleur atticée, uppercase 0,72rem).
- Bump cache : `layout.js?v=11`, et `styles.css` unifiée en `?v=91` (les pages trainaient 24/28/90 — maquette).
- Test DOM `m7-dom.js` étendu : position du bloc (avant le lien) + texte exact affiché. Régression : **312/312**.

## 🚨 v1.2.1 — fix 413 sur l'import XML réel (PR #20)

- **Symptôme en production** : « erreur de lecture XML : http 413 » au chargement du fichier des 3 806 membres.
- **Cause** : `express.json({ limit: '2mb' })` (serveur.js) rejetait le body AVANT l'endpoint — la garde 50 Mo de `/api/membres/import` n'était jamais atteinte. Le XML Access réel dépasse 2 Mo.
- **Fix** : body-parser dédié `app.use('/api/membres/import', express.json({ limit: '64mb' }))` monté AVANT le parseur 2 Mo ; le reste de l'API reste à 2 Mo. Test étendu : XML 8+ Mo en mode essai → 50 fiches analysées, plus de 413 (`tests/m5d-import-xml.js` 20/20). Régression : **313/313**.
- ⚠ Leçon : une garde de taille côté route est inutile si le middleware global coupe avant — tester la volumétrie RÉELLE (3 806 fiches), pas 3 fiches.

## 🚨 v1.2.2 — fix « session admin requise » après redémarrage (PR #22)

- **Symptôme en production** : import XML → « erreur de lecture XML : session admin requise » (401).
- **Cause** : après un `systemctl restart` (fait pour la v1.2.1), les sessions serveur (en mémoire) sont purgées — mais `auth.js` faisait confiance à sa **mémoire locale 25 min** sans re-vérifier côté serveur : la garde `ensureUnlocked` laissait passer, et l'API répondait 401 sans jamais redemander le mot de passe.
- **Fix** : `GET /api/auth/verification` (session serveur consultée même quand la mémoire locale dit « déverrouillé ») — session morte → purge mémoire locale → modale de mot de passe RE-affichée. `auth.js?v=4` (bump cache 12 pages).
- Scénario **rejoué dans `tests/m7-dom.js`** : déverrouillage → purge de session forcée (déconnexion = redémarrage simulé) → clic Importer → re-modale → re-déverrouillage → import OK. 22/22, régression **323/323**.
- ⚠ Leçon : une mémoire locale de déverrouillage n'est qu'un CACHE — la vérité de la session vit serveur ; toute action gardée doit vérifier avant d'agir.

## 🚨 v1.2.3 — fix allFormations.map + 4 appels promesse non attendus (PR #23)

- **Symptôme** : membre.html → « allFormations.map is not a function » : `listFormationTitlesDistinct()` promesse non attendue (reste de la maquette sync).
- **Chasse à la classe entière** (grep des `ADWDatabase.x()` sans `.then`) : feuille de présence (page-formation.js), suppression ticket (tickets.js), suppression salle (settings.js — crash res.blocked sur une promesse), renouvellement abo (app.js — « du undefined au undefined ») — tout corrigé au pattern `.then` + normalisation newStart/newEnd dans le client (previewRenewal/renewSubscription).
- Bumps cache adw-client v2 / app v38 / tickets v4 / settings v33 ; assertion M5a dé-épinglée de `?v=1` ; M7 teste membre.html?id avec un vrai membre (sélecteur intérêts rendu).
- ⚠ Leçon : après une migration sync→async, GREPPER tous les sites d'appel sans `.then` — chaque `var x = client.methode()` est un bug latent qui CRASHE ou silencieusement affiche undefined.

## 🚨 v1.2.3 — fix allFormations.map + 4 appels promesse non attendus (PR #23)

- **Symptôme** : membre.html → « allFormations.map is not a function » : `listFormationTitlesDistinct()` promesse non attendue.
- **Chasse à la classe entière** (grep des appels client sans `.then`) : feuille de présence (page-formation.js), suppression ticket (tickets.js), suppression salle (settings.js), renouvellement abo (app.js) — tout corrigé + normalisation newStart/newEnd dans le client.
- Bumps cache adw-client v2 / app v38 / tickets v4 / settings v33 ; assertion M5a dé-épinglée de ?v=1 ; M7 teste membre.html?id avec un vrai membre.
- ⚠ Leçon : après une migration sync→async, GREPPER tous les sites d'appel sans .then — chaque `var x = client.methode()` est un bug latent (crash ou « undefined » silencieux).

## 🚨 v1.2.4 — fiche membre : listeners emboîtés + chevauchement filigrane (PR #24)

- **Symptômes** : (1) boutons de membre.html inertes ; (2) « Supprimer » sur le n° de membre en filigrane.
- **Cause (1)** : le callback `checkinBtn.addEventListener(...)` n'était jamais refermé — intérêts/impressions/renouvellement/suppression étaient câblés DANS ce callback (donc seulement après un 1er clic sur « Pointer une visite »). `node --check` valide la syntaxe → invisible en CI. Double du bug M5b (listener Renouveler dans le callback Supprimer).
- **Fix (1)** fermeture au bon endroit + suppression de la fermeture en trop en fin de fonction ; **fix (2)** : `.detail-head-actions` (rangée dédiée basée flex-basis:100%, padding-right 7.5rem réserve filigrane, min-height 104px du hero).
- M7 étendu : clic réel sur « Renouveler l'abo » → alerte attendue (le test échouait sur l'ancien code), JS alert/confirm espionnés dans chargerPage. 26/26, régression **321/321**.
- ⚠ Leçon : dernière occurrence connue du schéma « callback non refermé » ; pour l'avenir, tout nouveau bloc addEventListener doit être testé par CLIC, pas juste par chargement de page.

## 🚨 v1.2.5 — formations.html : cartes non cliquables (PR #25)

- **Symptôme** : les cartes formations ne mènent nulle part ; « Réserver sur le site » inerte.
- **Cause** : les deux listeners délégués de la maquette (clic carte → fiche, clic bk-open → sélecteur de membre) n'ont pas survécu à la migration M5a (le fichier a été réécrit autour du client HTTP, le bloc `grid.addEventListener` a sauté) ; et `booking.js` n'était pas chargé par formations.html.
- **Fix** : réintégration des listeners (clic carte ignore `.bk-open, a, button` comme la maquette) + tag `booking.js?v=3` restauré avant page-formations.js.
- M7 : mock WP boucle locale ajouté au serveur de test, navigation vérifiée via **VirtualConsole jsdomError** (jsdom n'implémente pas la navigation — on capte la tentative), modale booking vérifiée. 30/30, régression **322/322**.
- ⚠ Leçon : lors d'une réécriture de page, la PARITÉ DES TAGS script avec la maquette doit être vérifiée (ici booking.js manquant) — un listener restauré sur un script non chargé reste muet.

## 🚨 v1.2.6 — formations.html : filtres inertes (PR #26)

- **Symptôme** : recherche / mois / catégorie / période sans effet sur formations.html.
- **Cause** : mêmes pertes de migration M5a que les clics de cartes (v1.2.5) — `applyFilters` était appelée après chargement mais AUCUN listener d'entrée (input/change/clic période) n'était branché.
- **Fix** : listeners réintégrés à l'identique de la maquette. Bump cache `page-formations.js?v=39`.
- M7 : recherche testée par interaction (terme inexistant → 0 carte, puis terme réel → cartes), bascule « Toutes » testée par clic. 33/33, régression **325/325**.
- ⚠ Leçon : la page formations était systématiquement vidée de ses listeners à la migration — après ce doublon, TOUTES les interactions des pages réécrites doivent être listées depuis la maquette et testées une par une.

## 🔍 v1.3.0 — audit de parité des listeners (PR #27)

- **Méthode** : script d'extraction des `.addEventListener` fichier par fichier maquette vs Gimaweb (26 fichiers comparés) — compteurs ET cibles.
- **Résultat** : parité partout sauf `page-formations.js` (dernier fichier réécrit en M5a) : il manquait les 3 listeners de la modale Inscriptions du site (bookingsBtn/bookingsCloseBtn/clic-fond). Réintégrés + bouton démo retiré du HTML.
- `ticketModal` (tickets.html) vérifié sain au passage : la modale de création fonctionne (test ajouté : ouvrir \u2192 remplir \u2192 soumettre \u2192 ticket en base).
- M7 : 38/38. Régression complète : **330/330**.
- ⚠ Leçon consolidée : les pertes de la migration se concentraient sur les fichiers RÉÉCRITS (page-formations.js surtout) ; les fichiers copiés tels quels (dashboard.js, tickets.js, settings.js…) sont à parité — la réécriture est le facteur de risque, pas la copie.

## 🚨 v1.3.1 — formation.html : appel fantôme loadMecLabels (PR #28)

- **Symptôme** : « Erreur de chargement : loadMecLabels is not defined » sur la fiche formation.
- **Cause** : lors de la migration M5b, la FONCTION loadMecLabels a été supprimée (labels servis par l'API) mais son APPEL est resté ligne 321 → ReferenceError au premier rendu de fiche. Aucun test ne chargeait formation.html AVEC un id — la page n'était testée que sur son chemin d'erreur.
- **Fix** : appel supprimé + rendu des labels serveur ajouté dans le hero (champ labels de l'API). Bump cache page-formation.js v2.
- M7 : formation.html?id=301 (mock WP) chargée en DOM réel, fiche rendue sans erreur. 39/39, régression **331/331**.
- ⚠ Leçon : quand on supprime une fonction à la migration, grepper SON NOM dans tout public/ (appel fantôme) ; et chaque page doit être testée avec de VRAIES données, pas seulement son écran d'erreur.

## ✨ v1.4.0 — favicon + carte Prochaine fermeture (PR #29)

- Demande utilisateur : les événements du site cat\u00e9gorie \u00ab fermeture \u00bb ne sont pas des formations — ne doivent pas figurer dans formations.html, mais m\u00e9ritent une carte dashboard \u00ab Prochaine fermeture \u00bb (conditionnelle) au-dessus de \u00ab Aujourd'hui à l'Atelier \u00bb.
- **Serveur** : `prochaine_fermeture` dans `/api/agregats/flot` (MIN(date) \u00e0 venir, cat\u00e9gorie LIKE fermeture insensible \u00e0 la casse) ; agenda du jour du flot EXCLUT d\u00e9sormais les fermetures.
- **Front** : applyFilters + fillSelects excluent fermeture (page-formations.js) ; carte `#nextClosure` cach\u00e9e par d\u00e9faut, remplie par renderNextClosure() seulement si le flot trouve une fermeture (dashboard.js).
- **Favicon** : assets/icons/icon-192.png (marque AW existante) li\u00e9 dans les 12 pages.
- M7 (mock WP + \u00e9v\u00e9nement fermeture cat Fermeture, 15 ao\u00fbt 2027) : 7 nouvelles v\u00e9rifications (d\u00e9tection flot, exclusion liste/filtre, carte visible + position DOM au-dessus de l'agenda, favicon 200). 47/47, r\u00e9gression **339/339**.

## ✨ v1.4.1 — carte fermeture : dates début + fin (PR #30)

- Compl\u00e9ment demand\u00e9 : la carte doit montrer la p\u00e9riode compl\u00e8te. Flot : MAX(fd.date) AS date_fin en plus du MIN ; dashboard : \u00ab du X au Y \u00bb si date_fin > date, date seule sinon.
- Mock : \u00e9v\u00e9nement fermeture sur 2 jours (15 + 16 ao\u00fbt 2027, parseur multi-dates du serveur v\u00e9rifi\u00e9 au passage). 48/48, r\u00e9gression **340/340**.

## 🚨 v1.4.2 — formation.html : Réserver sur le site inerte (PR #31)

- **Symptôme** : clic « Réserver sur le site » sans effet sur la fiche formation.
- **Cause** : le handler délégué existait (`window.ADWBooking.openPicker`) mais `booking.js` n'était pas chargé par formation.html → `window.ADWBooking` undefined, le handler rendait silencieusement. Exactement l'oubli bookings.js de formations.html (v1.2.5) sur l'autre page formations.
- **Fix** : tag `<script src="booking.js?v=3">` ajouté avant page-formation.js. M7 : clic réel sur #bookBtn → modale du sélecteur de membre ouverte (50/50).
- ⚠ Leçon (règle de registre) : TOUTE page qui référence une API d'un script partagé (ADWBooking, ADWAuth…) doit charger CE script — la parité des TAGS script de la maquette est la checklist, page par page.

## 🚨 v1.4.3 — fermetures sans salle + isolation CRITIQUE des tests + fin du démo (PR #32)

- Demande : les fermetures n'ont pas besoin de salle → exclues du planning et de la liste sans-salle (api-salles.js), 2 vérifications M7.
- **ALERTE SÉCURITÉ découvert à l'occasion** : les 12 suites de test faisaient `fs.rmSync('data')` (le dossier de la base de production !) et spawnaient le serveur sur DB_PATH par défaut. Lancés sur la machine de production, ils EFFAÇAIENT les membres. (Fausse alerte cette fois : les membres allaient bien, l'utilisateur cherchait les dettes.) Isolation désormais totale : `data-tests/` (wipe), un fichier de base PAR suite (`gimaweb-<suite>.db`), chemins path.resolve double-guillemets couverts (candidate.db, verif-decrypt.db), BACKUP_DIR dans data-tests, gitignore data-tests/.
- Démo retirée : bouton « Charger 20 membres de démo » (membres.html + câblage app.js) — jamais souhaitable en production.
- ⚠ Leçon : un `rmSync('data')` dans un test est une bombe à retardement si un jour quelqu'un lance les tests où vit la vraie base — les tests doivent vivre dans un espace étanche, et chaque suite doit avoir sa PROPRE base (les serveurs fantômes de la suite précédente provoquent sinon des contraintes UNIQUE).
- Régression **347/347**. data/ de production inatteignable.

## 📌 RÈGLE DE VERSIONNEMENT (directive utilisateur, v1.4.3)

- Sans demander : **incrémenter UNIQUEMENT le 3e chiffre** (ex. 1.4.3 → 1.4.4), bugfix comme nouveauté.
- **2e chiffre (minor) ou 1er (major) : TOUJOURS demander confirmation à l'utilisateur AVANT** le bump + PR.
- S'applique à package.json (la sidebar suit via /api/sante) et au CHANGELOG.

## 🚨 v1.4.4 — recherche pointage + grille salles (PR #33)

- (1) Modale « Pointer une visite » : handler input appelait displayCheckinResults (nom disparu à la migration, devenu afficherResultatsPointage) → ReferenceError à chaque frappe. (2) salles.html : getRoomPlanning recevait (debut, fin) du temps de SQL navigateur ; l'API serveur attend un mois YYYY-MM → 400 silencieux avalé par .catch, page sans colonnes de salles. Les deux : reliquats de la migration M5c.
- Checks M7 : frappe réelle dans checkinSearch (terme inexistant → « Aucun membre trouvé », terme réel → membre retrouvé, 0 erreur) ; salles.html chargée avec les 3 salles en colonnes + grille du mois. **61/61**, régression **352/352**.
- ⚠ Leçon : les promesses avalées (catch → []) cachent des 400 de contrat — un test devrait AUSSI piquer /api/salles/planning directement avec ce que la page envoie. Les deux bugs ont été corrigés... puis testés par rendu réel de page.

## 🎨 v1.4.5 — couleurs par catégorie + favicon bi-couleur (PR #34)

- Demande utilisateur : couleurs de bandeau par catégorie — tablette/smartphone = vert #18A55F, trucs et astuces = ambre #B26A00, formation = bleu #2F9BE4 (règle couleurCategorie partagée page-formations/page-formation/dashboard, repli hash pour les autres catégories). Favicon refait : bordeaux #9f0c45 + AW crème + bande lime #bbcc6a (favicon.ico 16/32, png 32/192/512, apple-touch).
- M7 : mock enrichi (cats 11-13 + events 305/307), 4 nouvelles vérifications couleurs (3 cartes + hero). **66/66**, régression **366/366**.
- ⚠ Leçon technique : insertion de fonction APRÈS une fermeture `}` repérée par find() — fragile (le find peut tomber sur un `}` intérieur) ; insertion d'une fonction partag\u00e9e : la placer TOUJOURS entre deux fonctions complètes, jamais à l'intérieur d'un corps.

## 🚨 v1.4.6 — couleurs : le vrai schéma de catégories du site (PR #35)

- La v1.4.5 passait les tests mais rien ne changeait en production. Diagnostic : interrogation du VRAI atelierduweb.be (wp-json) — chaque événement a plusieurs catégories, la 1re est GÉNÉRIQUE (Ateliers/Formations/Evènement), la catégorie utile arrive APRES. La règle ne regardait que categories[0].
- Fix : couleurCategorie(cat) accepte tableau OU chaîne 'a, b' et scanne TOUTES les catégories (tablette/smartphone → vert, truc → ambre, formation* → bleu), repli hash sur la 1re. Appels fournis en liste complète (ev.categories / cats / f.categories).
- Mock M7 aligné sur le site réel (Ateliers en tête) : « bandeau vert/ambre/bleu » toujours verts — le test ANCIEN (cats uniques) passait sans couvrir le cas réel.
- ⚠ Leçon : quand un mock invente des données, vérifier sa forme contre les DONNÉES RÉELLES de la source (ici : wp-json du site en prod, consultable directement) avant d'en tirer fierté de tests verts.
- Régression **366/366**.

## 🚨 v1.4.7 — entités HTML dans les titres de formations (PR #36)

- **Symptôme** : caractères spéciaux buggués dans les noms de formations (guillemets, apostrophes, &amp; visibles ou avalés).
- **Cause** : wp-json renvoie titres/extraits encodés (contenu « rendered ») ; l'ancien stripHtml ne décodait que 5 entités (amp, eacute…) et remplaçait les NUMÉRIQUES (&#8211;/&#8217;) par une ESPACE. Les données réelles du site en contiennent partout (aspelé vu en interrogeant le vrai wp-json).
- **Fix serveur** : decodeEntites (numériques déc/hex + 25 entités nommées) branché dans stripHtml → titres, extraits, dates parses propres. Correction auto des lignes DB à la prochaine sync (mise à jour non-COALESCE au sync).
- Test M7 : mock avec &amp; + &#8211; dans un titre → décodage vérifié côté API et à l'affichage. **68/68**, régression **368/368**.
- ⚠ Leçon : WP « rendered » = HTML encodé — toute chaîne issue de wp-json doit passer par decodeEntites/stripHtml AVANT stockage ou affichage.

## ✨ v1.4.8 — salles auto depuis le lieu + 20 formations passées + marges dashboard (PR #37)

- Demande : les lieux du site « GS/PS - Atelier du web » désignent Grande/Petite salle — attribution automatique dans la sync (api-formations.js), WHERE room_id IS NULL (la décision manuelle prime), fermetures exclues, comptée dans le journal de sync. Le lieu viendra du plugin WP quand installé (déjà lu via l'endpoint labels).
- Demande : montrer le passé — sync garde les 20 dernières formations passées (passees triées desc, slice 20) ; le filtre « À venir/Toutes » de formations.html devient réellement utile ; les anciennes partent seules aux syncs suivantes.
- Marges dashboard : margin-bottom inline 1.3rem supprimé (doublait le gap 1.1rem de .mosaic).
- Parseur : plages « du X au Y » (mois après 1re ou 2e date, année unique partagée) — la fermeture annuelle réelle du site (« du 27 juillet au 08 août inclus ») parse ses 13 jours.
- M7 : labels mockés avec GS/PS (attributions en base vérifiées), event passé masqué/affiché selon filtre, plage août 14→17. **73/73**, régression **374/374**.
- Note : quand le plugin WP exposerait tout proprement, le parsing d'excerpt pourra être simplifié.

## ✨ v1.4.9 — période de fermeture réelle affichée (PR #38)

- Champ « Dates : » du site = souvent UNE date seule (la borne de fin) ; la plage vit dans la description (« ferme ses portes du X au Y inclus »). Sync : si dates <= 1, on scanne la description ; la plage est cherchée aussi sur le texte brut (elle peut suivre le bloc « De 9h à 18h » que le clean tronque).
- Contre-vérifié sur le vrai atelierduweb.be : Fermeture Annuelle => 2026-07-27 → 2026-08-08. La carte dashboard affiche « du … au … ».
- M7 : mock 302 reformatté comme le site réel (Dates seul + plage dans la description après les horaires), bornes 14→17 août vérifiées dans le flot. **73/73**, régression **374/374**.

## ✨ v1.4.10 — lien vers l_evenement dans la carte fermeture (PR #39)

- Demande : bouton/lien vers l evement du site dans la carte Prochaine fermeture (controle humain quand la saisie des editeurs ou le parsing decev). Flot : url incluse dans prochaine_fermeture ; dashboard : lien <a target=_blank> affiche si url presente.
- M7 : assertion du lien href atelierduweb.be/fermeture/ dans la carte. **74/74**, regression **375/375**.

## 🚨 v1.4.11 — parametres : ids techniques desalignés + carte Formateurs (PR #40)

- Bug : le HTML gardait les ids de la maquette (teamList/newTeamMemberName/addTeamMemberBtn) mais settings.js (reécrit en M5c) cherchait teamAdminList/newTeamName/addTeamBtn \u2192 bouton Ajouter jamais câblé. Règle : les ids UI restent ceux du HTML maquette ; on adapte le JS, pas l inverse.
- Nouveauté : carte Formateurs/Animateurs \u2014 endpoint /api/formations/organisateurs (GROUP BY organizer, séances à venir >= today, fermetures exclues), rendu auto dans settings.js (badge « N à venir » + « dès le J mois »). Donn\u00e9e source : champ organizer de la sync (labels du site aujourd hui, plugin WP demain).
- Séparateur « Affichage » (fût vide) retiré.
- M7 : ajout réel de membre d équipe, carte formateurs avec l organisateur, plus de séparateur \u2014 79/79, régression **380/380**.

## ✨ v1.5.0 — locations de salles (PR #41)

- **Fonctionnalité (validée par le porteur, passage en minor confirmé)** : location des salles à des tiers, avec ou sans animateur. Entraînée par l'info « organisateur » des events du site (carte Formateurs v1.4.11).
- Schéma : `locations` (id, titre, room_id, animateur, contact, notes) + `location_dates` (location_id→CASCADE, date, slot CHECK AM/PM, UNIQUE(location_id,date,slot)) — APPEND dans schema.sql, appliqué par `db.exec` à chaque boot.
- `server/api-locations.js` : GET/POST/PUT/DELETE + `/locations/:id/conflits` (location×location ET location×formation). **Les locations ne remontent JAMAIS vers le site public** — le mock WP du test m8 trace toutes les requêtes sortantes et l'affirme.
- Planning salles : UNION formations + locations (`type:'formation'|'location'` côté serveur ; `byCell` de page-salles.js garde `type`, cellule rendue avec 🔑 si location, lien vers location.html). Limite connue et acceptée : un occupant par cellule (formation prioritaire) — le conflit complet reste visible sur les fiches.
- Frontend : locations.html (modale : mode unique/récurrente, créneau AM/PM/JOURNEE=AM+PM, salles + organisateurs dans les selects), location.html (fiche), adw-client v3 (listLocations/getLocation/createLocation/updateLocation/deleteLocation/conflitsLocation + listOrganisateurs), layout cache v12 (+ nav Locations sous Salles, Suggestions dans `.side-extra` épinglé bas), styles (.loc-banner, .slot-location hachures brunes, .side-extra).
- Tests : **m8-locations.js** (port 32137, 25/25 — CRUD garde admin, validations, journée, récurrence, conflits croisés, planning, cascade, zéro fuite wp-json). m7-dom : locations.html + location.html dans la liste des pages chargées, création réelle via la modale (seed localStorage gimaweb_deverrouille_jusquau + injection du cookie session dans etatCookies), fiche, cellule salles, sidebar. **97/97. Régression 417/417 (13 suites).**
- Leçon :  les crash d'une suite jsdom laissent le serveur spawné fantôme (EADDRINUSE au run suivant) — toujours `pkill -f "node server/serveur.js"` entre deux runs après un crash.

## 🚨 v1.5.1 — formateurs imbriqu\u00e9s dans la carte \u00c9quipe (param\u00e8tres.html)

- Bug : le `<section class="settings-card">` de l'\u00c9quipe technique n'\u00e9tait pas ferm\u00e9 avant celui des Formateurs (v1.4.11) \u2192 la carte formateurs vivait DANS la carte \u00e9quipe. Fix : `</section>` ajout\u00e9, doublon de fin retir\u00e9, appariement des balises valid\u00e9 par script Python.
- M7 : nouveau test `!carteEquipe.contains(carteFormateurs)` (cartes s\u0153urs via `closest('.settings-card')`). 98/98, r\u00e9gression 418/418.

## 🚨 v1.5.2 — champs dates hors de la modale location (locations.html)

- Bug : le fieldset Cr\u00e9neaux utilisait `.filter-group` (flex SANS wrap) \u2192 tous les champs sur une ligne, d\u00e9bordement horizontal \u00e0 partir des champs dates. Fix : grille `.loc-grid` auto-fit minmax(140px,1fr), champs en `.form-group` (label au-dessus), wrappers unique/r\u00e9currente en `display:contents` (le JS display:none/'' continue de marcher tel quel).
- M7 : pas de .filter-group dans la modale + .loc-grid pr\u00e9sent + bascule r\u00e9currente rejou\u00e9e. 101/101, r\u00e9gression 421/421.
- Le\u00e7on : jsdom ne rend pas le CSS \u2014 les bugs de d\u00e9bordement ne sont pas testables directement ; on teste la structure (classes/crutures) qui garantit le layout, + capture d'\u00e9cran humaine en prod.

## ✨ v1.5.3 — occurrences libres + locations visibles au dashboard

- Modale location : s\u00e9lecteur date+cr\u00e9neau + bouton \u00ab Ajouter \u00bb (chips supprimables), remplace le mode unique/r\u00e9currente. Doublon exact refus\u00e9 (date+cr\u00e9neau), date auto-avance +1 jour apr\u00e8s ajout, occurrences tri\u00e9es par date. JOURNEE \u2192 AM+PM \u00e0 la g\u00e9n\u00e9ration (API inchang\u00e9e).
- Dashboard : carte \u00ab \ud83d\udd11 Prochaines locations \u00bb (flot.prochaines_locations, 8 cr\u00e9neaux, liser\u00e9 brun #7A5230, style carte fermeture) entre nextClosure et todayAgenda dans index.html ; l'agenda du jour concat\u00e8ne les locations du jour (type:'location', lien location.html, pas d'inscrits \u2192 badge \u00ab location \u00bb).
- Versions cache : dashboard.js v46, styles v93, page-locations.js v2.
- M7 : 111/111 (chips modale \u00e0 base de clics r\u00e9els, doublon, \u2715, 3 s\u00e9ances JOURNEE+PM en base, flot + dashboard). R\u00e9gression 431/431.
- Le\u00e7on (r\u00e9currente) : les ancres python doivent matcher les \u00e9chappements LITT\u00c9RAUX \\uXXXX du fichier (s\u00e9quences) \u2014 chercher par fragment non-accentu\u00e9 quand l'ancre \u00e9choue ; et \u00e9viter les d\u00e9coupages s[a:b] sur bornes de blocs (g\u00e9n\u00e8re des accolades cass\u00e9es) \u2014 pr\u00e9f\u00e9rer l'insertion par ligne.

## ✨ v1.5.4 — retrait carte dashboard + carte Locations dans stats.html

- Retrait (demande du porteur) : carte \u00ab Prochaines locations \u00bb du dashboard (fonction renderNextLocations, section #nextLocations d'index.html, champ prochaines_locations du flot) \u2014 l'info vit dans locations.html. L'agenda \u00ab Aujourd'hui \u00e0 l'Atelier \u00bb garde ses items location du jour.
- Ajout : carte \u00ab \U0001F511 Locations \u00bb sur stats.html (3 KPI : cr\u00e9neaux lou\u00e9s ce mois, locataires \u00e0 venir, salle la plus lou\u00e9e) \u2014 /api/agregats/stats expose `locations` ; page-stats.js renderLocationsStats.
- M7 : 112/112. R\u00e9gression 432/432.
- INCIDENT \u00e9vit\u00e9 de justesse : un write python contenant des surrogates \u00e9chapp\u00e9s (\ud83d\udd11 \u00e9crit en paires \u00e9chapp\u00e9es) a TRONQU\u00c9 stats.html \u00e0 0 octet \u2014 restaur\u00e9 par git checkout puis r\u00e9\u00e9crit avec le vrai caract\u00e8re (U0001F511). LE\u00c7ON (d\u00e9j\u00e0 connue, v\u00e9rifier \u00e0 chaque fois) : jamais de s\u00e9quences surrogate \u00e9chapp\u00e9es dans un write utf-8 \u2014 et v\u00e9rifier la taille du fichier apr\u00e8s chaque edit python.

## ✨ v1.5.6 — salle PAR occurrence dans la modale location

- Mod\u00e8le : location_dates.room_id optionnel (NULL \u2192 salle de la location). Migration idempotente au boot (pragma_table_info + ALTER). Semble COALESCE(ld.room_id, l.room_id) serv\u00e9e partout (planning, conflits, agenda, fiche).
- Modale : s\u00e9lecteur Salle DANS la grille d'occurrences (Date|Salle|Cr\u00e9neau|Ajouter), sticky entre les ajouts (pr\u00e9s\u00e9lection = dernier choix). Champ Salle global supprim\u00e9. location.room = salle de la 1\u00e8re occurrence. Doublon = date+cr\u00e9neau+salle. Chip affiche la salle.
- Le CSS de la grille doit maintenant accueillir 4 cellules (auto-fit minmax 140px, s'enroule).
- m8 : 32/32 (salle par date), m7 : 116/116. R\u00e9gression 443/443.
- Repos : page-locations.js?v=3, page-location.js (salle par s\u00e9ance sur la fiche).

## ✨ v1.5.7 — modale Modifier sur la fiche location.html

- location.html : nouvelle #locEditModal (m\u00eame picker que la cr\u00e9ation, pr\u00e9-fix : titre/animateur/contact/notes + occurrences recharg\u00e9es, AM+PM m\u00eame date+salle fusionn\u00e9s en JOURNEE). page-location.js v2 : ouvrirModaleEdition/rendEditChips/editLocSave \u2192 PUT {titre, room_id=seances[0].salle, animateur, contact, notes, dates[]} puis charge().
- Fix s\u00e9mantique PUT /locations/:id : propri\u00e9t\u00e9 pr\u00e9sente (m\u00eame null) = remplacement, absente = conserv\u00e9e (helper champ()). Avant, animateur:null ne vidait pas.
- M7 : 122/122 (modale rejou\u00e9e : pr\u00e9-remplissage, fusion JOURNEE, \u2715, PUT v\u00e9rifi\u00e9 en base). R\u00e9gression 449/449.

## ✨ v1.5.8 — animateur PAR occurrence (locations.html + modale Modifier)

- Mod\u00e8le : location_dates.animateur optionnel (NULL \u2192 animateur de la location), migration idempotente au boot (pragma_table_info). COALESCE servi par fiche (par s\u00e9ance) + agenda dashboard.
- Les 2 modales : select Animateur dans le picker (sticky, optionnel), champ Animateur global retir\u00e9, location.animateur = celui de la 1\u00e8re occurrence. Fusion JOURNEE \u00e0 l'\u00e9dition : date+salle+animateur identiques.
- Le\u00e7on : la virgule apr\u00e8s la derni\u00e8re colonne AVANT une contrainte UNIQUE dans schema.sql — oubli = SQLITE_ERROR au boot, toutes les suites en \u00ab serveur injoignable \u00bb (attrap\u00e9 par boot manuel).
- m8 : 37/37, m7 : 125/125. R\u00e9gression 457/457. Cache : page-locations.js v4, page-location.js v3.

## ✨ v1.5.9 — HTTPS LAN (certificat auto-signé)

- serveur.js : si TLS_CERT+TLS_KEY existent \u2192 https.createServer (import dynamique node:https), sinon http. Log de boot annonce le sch\u00e9me + \u00ab TLS OK \u00bb. Fichiers TLS introuvables \u2192 repli HTTP + avertissement.
- tools/generer-certificat.sh (SAN : localhost, gimaweb.local, 127.0.0.1, IP LAN) ; certs dans data/certs/ (gitignor\u00e9). .env.exemple document\u00e9. ADMINISTRATION.md section d\u00e9di\u00e9e.
- tests/m9-https.js (9/9) : NODE_TLS_REJECT_UNAUTHORIZED=0 (undici fetch ignore l'option agent sous Node 22 \u2014 LE\u00c7ON), sortie du spawn retourn\u00e9e en GETTER (les strings sont des copies fig\u00e9es \u2014 LE\u00c7ON), serveurs tu\u00e9s \u00e0 la fin.
- R\u00e9gression 466/466 (14 suites). m9 dans package.json + ci.yml.

## \u2728 v1.5.10 — salles.html : grille semaine (M1) + agenda (M3), decision porteur

- Choix design parmi 4 mockups (PR #50) : M1 + colonnes Matin|A-midi par jour + M3 en dessous. Grille : LIGNES par salle (dynamiques via listRooms \u2014 admin ajoute/retire = ligne suit), 7 jours \u00d7 2 cr\u00e9neaux. Navigation \u00b17 jours, lundiDe() pour le lundi de semaine. Multi-mois : moisNecessaires() fusionne les getRoomPlanning des mois chevauch\u00e9s.
- M3 : agendaWrap \u2014 cartes .ag-jour des 30 prochains jours occup\u00e9s (formations color\u00e9es + \U0001F511 locations hachur\u00e9es, salle \u00e0 droite, jour courant encadr\u00e9).
- page-salles.js v5, mockup public retir\u00e9 (archive docs/mockups/). M7 : 131/131 (dont ligne dynamique test\u00e9e en ajout/rollback admin). R\u00e9gression 472/472.
- Le\u00e7on : les \u00e9chappements \\uXXXX des fichiers HTML "mockups" s'affichent LITT\u00c9RALEMENT dans le navigateur \u2014 toujours \u00e9crire les vrais caract\u00e8res UTF-8 (et d\u00e9coder avec gestion des paires de surrogates si besoin).

## ✨ v1.5.11 — 3 demandes : retention span-1, export de base sur poste, badges=alertes

- stats.html : carte R\u00e9tention span-2 \u2192 span-1.
- parametres.html : Sauvegarder maintenant = T\u00c9L\u00c9CHARGEMENT de la base sur le poste (GET /api/base/export, garde admin, snapshot via source.backup() \u2014 ASYNCHRONE, LE\u00c7ON : await obligatoire + on('error') sur le ReadStream sinon le serveur meurt sur ENOENT non g\u00e9r\u00e9). La nocturne chiffr\u00e9e AES-GCM/Nextcloud continue c\u00f4t\u00e9 serveur. settings.js v35.
- Pastilles notifications (cloche + sidebar) : comptent UNIQUEMENT les alertes non lues (severity warning/danger + types ticket_urgent/error/room_needed/awaiting_validation \u2014 miroir de TYPE_CATEGORY de page-notifications). Journal d'activit\u00e9 visible sans badge.
- R\u00e9gression 478/478 (14 suites). Rappel : chaque crash de suite laisse un serveur fant\u00f4me \u2192 pkill node server/serveur.js avant de re-rouler.

## ✨ v1.5.12 — branchement API M.E. Calendar (issue #52 + 3 commentaires)

- server/mec.js : `fetchViaApiMec(cle)` — GET /events (header `mec-token`, racine `events` indexée par date) + GET /events/:id/next-occurrences ; dates depuis `start.date` (ISO, pas les timestamps — pièges de fuseau), slot depuis `start.ampm`, allday → AM+PM. `chargerFormations({cleMec})` : MEC prioritaire puis **fusion** avec wp-json/RSS (les dates MEC remplacent le parseur FR ; les métadonnées wp-json — catégories, lieu, organisateur — sont conservées, l'API MEC ne les expose pas). `resultat.sourceMec` posé sur l'array. Échec MEC = silencieux → repli canal public.
- Table `settings` (key/value) dans schema.sql. Clé posée via la carte Paramètres (plus de localStorage — la clé que le porteur avait posée en v1.5.11 vivait dans le NAVIGATEUR, il faut la re-saisir une fois) ou `MEC_API_KEY` en .env (prioritaire). Endpoints garde admin : GET/PUT /api/parametres/cle-mec — jamais la clé en clair, état masqué `cle-…7890`.
- api-formations.js : `cleMecActive()`, `journaliser()`, notification sync « — dates via API M.E. Calendar » si sourceMec.
- Tests m10-mec-api.js (18/18, mock loopback de l'API MEC + serveur port 32138) ; m0 passe à 19 tables ; m7-dom attend v1.5.12. Régression 496/496 (15 suites).
- Surveillance future (issue #52) : champ « Numéro de membre (Optionnel) » côté WP → apparaîtra dans /config/custom-fields et les bookings → boucle matching n° > email > nom > création.

## ✨ v1.5.13 — API MEC prioritaire sur toutes les infos (audit clé réelle)

- Audit avec clé temporaire (docs/AUDIT-API-MEC.md + tools/audit-mec-api.cjs, dumps .vibe/mec-audit/ hors git). LEÇONS : racine {events, pagination} SANS wrapper data (le code v1.5.12 lisait data.events → OK en fait, c'est le script d'audit qui s'était trompé) ; pagination du plugin MEC IGNORE ?start=&offset= (payload identique) → UN SEUL GET, jamais suivre has_more_events (boucle infinie vérifiée) ; mauvaise clé = HTTP 500 invalid_api_token (pas 401).
- fetchViaApiMec : extraction riche — price (meta.mec_cost), location/organizer (data.locations/organizers[id].name), categories/labels (names), url (permalink), timeLabel (data.time), entités HTML décodées via stripHtml/decodeEntites. Séances = next-occurrences (futur) ∪ mec.days (TOUTES, format « YYYY-MM-DD:…:HH-MM-AM:HH-MM-PM ») → dates passées incluses.
- chargerFormations : marque _mec=true sur les events servis par l'API, enrichFromPlugin ne les surcharge plus (MEC prioritaire) ; events MEC-only ajoutés. Fermetures : CATÉGORIE uniquement (décision porteur — les labels = déco site web, id 74 Fermeture).
- m10 : mock calé sur la vraie structure + 9 nouvelles assertions (27/27). Régression 505/505 (15 suites).
- Champ « Numéro de membre (Optionnel) » : viendra avec le plugin WP dans les BOOKINGS (pas custom-fields — resté vide à l'audit) ; clé définitive déjà posée dans Gimaweb (carte Paramètres → table settings).

## ✨ v1.5.14 — fix hors fenêtre + mec.days pourri

- Constat réel : /events = fenêtre ~4 semaines (16 déc hors index → « Je maîtrise mon smartphone » sync en parseur). Pagination MEC ignore ?start/?offset/?page/?date (tous testés en direct). Fix : les IDs viennent du wp-json (chargé EN PREMIER maintenant), chaque ID absent de l'index → GET /events/:id (structure data identique).
- LEÇON : data.mec.days garde les dates d'ORIGINE des events dupliqués (11111 : 2023-03-31 pour une séance 2026-12-16) → jamais l'utiliser en source primaire. Ordre : next-occurrences (exact) > mec.days filtré futur > dates de l'index.
- chargerFormations réordonné : wp-json/RSS d'abord, puis MEC (besoin des IDs), fusion inchangée. m10 : 30/30 (event 504 hors fenêtre + mec.days pourri rejoués).
## ✨ v1.5.15 — héro du dashboard : « Renouveler un abo » + « Ajouter un membre » (rebasé sur la v1.5.14 / PR #56)

- **À LIRE PAR LES AUTRES SESSIONS** : cette PR touche UNIQUEMENT `public/index.html`, `public/dashboard.js`, `public/app.js`, `public/membres.html`, `public/styles.css` (bloc `.hero-home` uniquement), `tests/m7-dom.js`, `package.json`, `CHANGELOG.md`, ce fichier. Aucun endpoint serveur modifié.
- **index.html / dashboard.js** : dans le héro, « Gérer les membres » et « atelierduweb.be » sont SUPPRIMÉS, remplacés par **♻️ Renouveler un abo** (nouvelle modale `#renewModal`, même modèle que « Pointer une visite » : `searchMembers` + nav clavier `makeListNavigable` ; au clic sur un membre → `window.location.href = 'membres.html#member=<id>'`, la modale « Fiche de … » de membres.html où vit le bouton Renouveler) et **➕ Ajouter un membre** (lien `membres.html#add`).
- **app.js (membres.html)** : nouveau deep link `#add` → `openModal(null)` (« Ajouter un membre » s'ouvre directement), même pattern que `#member=`/`#edit=` existants (avec `history.replaceState` de nettoyage).
- **Hero plus haut / mieux mis en évidence** : classe `.hero-home` (styles.css:414) — padding 2.3rem, liseré bordeaux 4px (`var(--primary)`, micro-dose autorisée charte), lead 1.07rem, texte d'accueil qui résume les 4 boutons. **Charte respectée : pas d'ombre au repos, pas de dégradé, rayon ≤ 6px** (vérifié au grep).
- Bumps cache : index.html `styles.css?v=94` + `dashboard.js?v=47` ; membres.html `app.js?v=40`. Version `package.json` = **1.5.15** (m7-dom attend `Gimaweb v1.5.15`) — les v1.5.13 et v1.5.14 ont été prises par les PR #55 et #56 (API MEC), cette PR passe en v1.5.15.
- M7-dom : +13 vérifications (boutons héro présents/retirés, `.hero-home` + texte d'accueil, modale renew ouverte + recherche « niqueur » + navigation au clic, `membres.html#add` ouvre la modale, `membres.html#member=<id>` ouvre la fiche avec `detailRenewBtn`, 0 erreur JS sur les 3 pages chargées). Régression 521/521 (15 suites).

