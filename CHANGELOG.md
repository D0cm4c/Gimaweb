# Changelog Gimaweb

L'app : **Gimaweb**. Version sémantique : **majeure** (rupture de contrat), **mineure** (fonctionnalité), **correctif** (fix).
La version vit dans `package.json` et est exposée par `GET /api/sante` (`version`).

## v1.1.0 — correctif auth (en production)
- **Fix auth.js** : la modale de déverrouillage était ajoutée VIDE (ligne `innerHTML` manquante depuis M5a) — toutes les actions gardées (import XML, suppressions, purge RGPD, sauvegarde, paramètres) plantaient silencieusement. (PR #16)
- `auth.js?v=3` dans les 12 pages : rechargement forcé sur les postes (cache navigateur). (PR #17)
- Nouvelle suite de tests DOM (`tests/m7-dom.js`, jsdom) : les 12 pages chargées en vrai DOM sans erreur + parcours clic du bouton Importer XML. Régression : 310/310.

## v1.0.0 — première mise en production
- M0-M6 fusionnés : serveur Express + SQLite (WAL, 16 tables), API complète (membres, visites + anonymes, impressions, formations + sync WP, salles, listes d'attente, notifications, bookings + matching, tickets/suggestions/équipe, sauvegarde chiffrée AES-256-GCM + restauration), frontend migré 100 % client HTTP (zéro SQL navigateur), import XML de l'ancienne base Access, agrégats dashboard/stats en un appel. (PR #1-#15)
- Régression au lancement : 293/293 (10 suites) — docs : CONTRAT-API, ADMINISTRATION, CONCEPTION, CONTEXT (mémoire de chantier).

## v1.2.0 — nom + version dans la sidebar
- La colonne latérale affiche **« Gimaweb v1.2.0 »** en bas, au-dessus du lien atelierduweb.be — version lue depuis `GET /api/sante` (toujours en synchro avec `package.json`).
- Bump cache `layout.js?v=11` + `styles.css?v=91` unifiée dans les 12 pages (les pages trainaient 3 numéros de styles.css différents : 24/28/90 → 91).
- Suite DOM étendue : position du bloc vérifiée dans le footer + texte exact. Régression : 312/312.
