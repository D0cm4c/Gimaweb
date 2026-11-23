# Gimaweb — document de conception (pré-production)

> Rédigé selon le skill **pre-production** (conception avant code — leçon n° 20 généralisée).
> ✅ Phase de conception **validée le 23 nov. 2026** : les 4 questions ouvertes sont tranchées (§5) — le code démarre (M0).

## 1. Le besoin (3 phrases)

L'Atelier du Web (EPN de Saint-Gilles, 25 ordis + 2 salles de formation) remplace sa maquette GitHub Pages par **le produit final** : l'équipe (plusieurs postes) doit partager **UNE seule base** de membres, inscriptions, formations, salles, tickets et suggestions. Décision figée en amont ([app #150]) : **serveur en réseau local** (Ubuntu Server sur portable), HTTP LAN, GitHub Pages reste le labo. Ce dépôt (`Gimaweb`) est le serveur.

## 2. Périmètre

**Dans** : le serveur Node (API + fichiers statiques du frontend), la base SQLite unique, le service systemd, les docs de conduite (AGENTS/CONTEXT), la sauvegarde nocturne chiffrée AES-GCM vers Nextcloud (cran plus tard, plan de sauvegarde dans ce doc).
**Dehors (pour l'instant)** : la synchro des bookings MEC côté plugin (le plugin WP existe déjà : `D0cm4c/plugin-wp-inscription-membre-atelier-du-web`), tout compte utilisateur multi-rôles (l'équipe reste sans comptes — décisions maquette), Internet public.

## 3. Options pesées (architecture serveur)

| Critère | A. Node + Express + better-sqlite3 **(recommandé)** | B. PHP + PDO SQLite | C. Tauri app locale par poste |
|---|---|---|---|
| Fidélité au contrat app #150 | ✅ prévu par `docs/BACKEND.md` de la maquette (guide écrit pour ça) | Réécriture de tous les endpoints | ❌ ne répond pas au besoin multi-postes |
| Frontend réutilisé tel quel | ✅ pages servies statiquement, `db.js` remplacé par un client HTTP | ✅ pareil | ❌ réempaquetage |
| Simplicité d'admin (systemd, pull) | ✅ 1 service, 1 fichier .db | 1 service, PHP-FPM | App desktop à installer par poste |
| Sauvegarde (copie du .db) | ✅ | ✅ | Base par poste (le problème initial) |
| Risque connu | Compilation native better-sqlite3 (prébuilds Node LTS OK) | Moins cohérent avec l'existant | Hors périmètre figé |

**Recommandation : A** — c'est l'architecture que toute la maquette a anticipée (schéma standard, requêtes paramétrées, 63 méthodes mappables 1:1, `docs/BACKEND.md` écrit pour ce collègue : nous).

## 4. Décisions figées (héritées du brief app #150)

1. **Stack** : Node.js 22 LTS + Express + better-sqlite3 (WAL), schéma de [`server/schema.sql`](../server/schema.sql).
2. **Rôles du serveur** : servir les fichiers statiques du frontend (copie chartée de la maquette) + l'API REST `/api/…` (contrat : [`docs/CONTRAT-API.md`](CONTRAT-API.md)).
3. **Déploiement** : pull deployment — GitHub (HTTPS public, sans clé) → `git pull` sur le serveur → restart service. **Le serveur ne pousse jamais.**
4. **Design** : la charte graphique fait foi, copiée au premier commit ([CHARTE-GRAPHIQUE.html](CHARTE-GRAPHIQUE.html), [SKILL-DESIGN.md](SKILL-DESIGN.md)).
5. **RGPD/sécurité** : zéro secret committé ; données statuts sociaux sensibles ; endpoint purge + remplacement de base derrière la garde admin (mot de passe admin de la maquette → session côté serveur, à valider point 6).
6. **Pointage, matching, notifications** : la logique métier de la maquette (hiérarchie de matching, journal des actions automatiques) est **reprise telle quelle**, déplacée serveur.

## 5. Décisions tranchées par le porteur (23 nov. 2026) — FIGÉES

| # | Question | Décision |
|---|---|---|
| 1 | **Auth serveur** | ✅ **Mot de passe unique partagé** + cookie de session (fidèle à auth.js de la maquette) — garde les endpoints sensibles (purge RGPD, remplacement de base, réglages) ; premiers POST d'auth comparés au hash SHA-256 du mot de passe dans `.env` |
| 2 | **Sauvegarde** | ✅ **Chaque nuit** : cron `sqlite … VACUUM INTO`/`.backup` → chiffrement AES-GCM → upload Nextcloud WebDAV (M4) |
| 3 | **Frontend ici** | ✅ **Monolithe** : copie des pages maquette dans `public/` de ce dépôt — le serveur est le produit |
| 4 | **Port/URL** | ✅ **Port 3000 direct** : `http://192.168.x.x:3000` (recommandation BACKEND.md reprise) |

Verrou : le mot de passe et l'URL WebDAV vivent dans `.env` (jamais committé).

## 6. Plan de livraison (phases démontrables)

1. **M0 — squelette servi** : Express + static + schema.sql exécuté + `GET /api/sante` (répond `{"status":"ok"}`) — testable en LAN dès M0.
2. **M1 — membres** : CRUD + n° auto + cascade RGPD + visites/impressions.
3. **M2 — formations** : sync serveur (fetch WP côté serveur), inscriptions, salles/dates, listes d'attente.
4. **M3 — notifications/bookings/matching** : plugin WP → `/api/bookings/upsert` (secret en `.env`), matching + écran de validation.
5. **M4 — tickets/suggestions/équipe** + sauvegarde chiffrée nocturne.
6. **M5 — frontend** : copie chartée de la maquette dans `public/`, `db.js` → client HTTP de l'objet ADWDatabase.

## 7. Questions bloquantes externes

- CORS / secret du plugin : réglé server-to-server (le serveur appelle et reçoit, pas le navigateur).
- Aucun bloqueur identifié pour M0–M2.
