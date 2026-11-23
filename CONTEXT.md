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
