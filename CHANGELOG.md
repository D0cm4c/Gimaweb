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
## v1.2.1 — correctif import XML volumineux (413)
- **Fix** : l'import du fichier des 3 806 membres échouait en « HTTP 413 » — `express.json({ limit: '2mb' })` rejetait le body **avant** d'atteindre l'endpoint (la garde 50 Mo côté route ne servait jamais). Limite dédiée `64mb` sur `/api/membres/import` uniquement ; le reste de l'API reste à 2 Mo.
- Test étendu : XML de 8+ Mo analysé en mode essai (50 fiches), plus de 413. Régression : 313/313.
## v1.2.2 — correctif « session admin requise » à l'import XML
- **Fix** : après un redémarrage du serveur, les sessions (en mémoire) sont purgées — mais le navigateur gardait sa mémoire locale « déverrouillé 25 min » sans re-vérifier côté serveur : les actions gardées partaient au 401 (« session admin requise ») sans jamais redemander le mot de passe.
- `GET /api/auth/verification` : le navigateur consulte la session serveur avant de considérer l'app déverrouillée ; si la session est morte, la modale de mot de passe RE-apparaît.
- `auth.js?v=4` dans les 12 pages (bump cache).
- Scénario rejoué dans `tests/m7-dom.js` (déconnexion forcée = purge, puis clic : re-modale, re-déverrouillage, import OK). Régression : 323/323.
## v1.2.3 — correctif « allFormations.map is not a function » (fiche membre) + 4 du même type
- **Fix signalé** : membre.html → « Erreur : allFormations.map is not a function ». Cause : `listFormationTitlesDistinct()` (promesse depuis la migration serveur) assignée sans `.then` — le sélecteur d'intérêts recevait une promesse.
- **4 voisins du même type corrigés dans la vague** : feuille de présence `page-formation.js` (getFormationAttendees), suppression de ticket `tickets.js` (getTicket/refresh), suppression de salle `settings.js` (deleteRoom → crash « undefined »), renouvellement d'abonnement `app.js` (previewRenewal/renewSubscription affichaient « du undefined au undefined »).
- `adw-client.js` : `previewRenewal`/`renewSubscription` normalisent `newStart`/`newEnd` (contrat maquette) en plus de `nouveau_debut`/`nouvelle_fin` (serveur).
- Bumps cache : adw-client v2, app v38, tickets v4, settings v33. Test M7 étendu : membre.html?id= avec un VRAI membre rendu sans erreur + sélecteur présent. Régression : 319/319.
## v1.2.3 — correctif fiche membre + 4 appels promesse non attendus
- Fix signalé : membre.html → « allFormations.map is not a function » (listFormationTitlesDistinct promesse non attendue).
- 4 voisins du même type corrigés : feuille de présence (page-formation.js), suppression ticket (tickets.js), suppression salle (settings.js), renouvellement d'abonnement (app.js).
- Client : previewRenewal/renewSubscription normalisent newStart/newEnd en plus des champs serveur.
- Bumps cache : adw-client v2, app v38, tickets v4, settings v33. Régression : 319/319.
## v1.2.4 — fiche membre : boutons réparés + actions sur leur propre rangée
- **Fix signalé** : sur membre.html, Renouveler / Supprimer / Intérêts / Impressions ne répondaient pas — le callback du bouton « Pointer une visite » n'était jamais refermé : tout le câblage des autres actions était emboîté DEDANS (syntaxe valide en `node --check`, donc invisible pour la CI). Les actions ne se câblaient qu'après un premier clic sur « Pointer une visite ».
- **Mise en page signalée** : le bouton « Supprimer » chevauchait le n° de membre en filigrane — les 4 boutons passent sur leur propre rangée (`.detail-head-actions`) sous le bloc identité, avec réserve horizontale pour le filigrane + hauteur mini du hero.
- Bumps cache : page-membre v24, styles v92.
- Test DOM étendu : clic RÉEL sur « Renouveler l'abo » (alerte de confirmation attendue) + structure des boutons groupés. Régression : 321/321.
## v1.2.5 — formations.html : cartes cliquables réparées
- **Fix signalé** : les cartes formations n'étaient pas cliquables — les deux listeners de la maquette (clic carte → `formation.html?id=…`, clic « Réserver sur le site » → sélecteur de membre présaisi) avaient été perdus lors de la migration serveur M5a. Réintégrés en délégué sur la grille (la réservation MEC reste un lien/bouton : le clic carte ne la déclenche pas).
- `<script src="booking.js?v=3">` restauré dans formations.html (le sélecteur de membre n'était même pas chargé).
- M7 étendu : mock WP dans le test DOM, clic réel sur une carte (navigation vérifiée via VirtualConsole) + clic Réserver (modale du sélecteur ouverte). 30/30. Régression : 322/322.
