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
## v1.2.6 — formations.html : filtres réparés
- **Fix signalé** : les filtres ne répondaient pas — les listeners de la recherche (input), du mois et de la catégorie (change) et des boutons de période « À venir / Toutes » avaient été perdus à la migration serveur M5a, comme les clics de cartes corrigés en v1.2.5. Réintégrés à l'identique de la maquette.
- M7 étendu : la recherche filtre réellement les cartes (0 résultat sur un terme inexistant, résultat retrouvé ensuite), bascule de période testée par clic. 33/33. Régression : 325/325.
## v1.3.0 — audit de parité des interactions (toutes pages)
- **Audit systématique** : comparaison des branchements `addEventListener` fichier par fichier entre la maquette et Gimaweb (26 fichiers) — toutes les pages sont à parité, SAUF page-formations.js qui gardait 5 manquants.
- **Fix** : modale « Inscriptions du site » complètement réparée (ouvrir via le bouton badge, fermer, clic-fond) — les 3 listeners étaient perdus à la migration ; le bouton « Charger 3 résas de démo » (obsolète en serveur, la sync arrive du plugin WP) retiré de la page.
- **Tests** : clics réels étendus — modale Inscriptions du site (ouvrir/fermer par le fond), modale Signaliser un incident de tickets.html (ouvrir, soumettre, vérification du ticket en base). 38/38. Régression : 330/330.
## v1.3.1 — fix formation.html : « loadMecLabels is not defined »
- **Fix signalé** : la fiche formation plantait au chargement — appel fantôme à `loadMecLabels()`, fonction supprimée à la migration serveur (les labels viennent du serveur à la sync), l'appel était resté.
- Bonus : les labels serveur (niveau, annulé…) sont maintenant rendus dans le hero de la fiche (badges), champ `labels` servi par l'API.
- M7 étendu : `formation.html?id=<vraie formation>` chargée en DOM réel sans erreur (le test aurait attrapé le bug). 39/39. Régression : 331/331.
## v1.4.0 — favicon + carte « Prochaine fermeture »
- **Favicon** : `<link rel="icon">` (icon-192.png, la marque AW de la charte) ajouté aux 12 pages.
- **Nouveauté demandée** : les événements du site de catégorie « fermeture » ne sont plus des formations — exclus de la page formations (liste + filtre catégorie + agenda du jour du dashboard), et une nouvelle carte dashboard **« 🔴 Prochaine fermeture »** apparaît au-dessus de « Aujourd'hui à l'Atelier », uniquement si un événement fermeture est programmé : titre, date et horaires de la plus proche fermeture à venir.
- `GET /api/agregats/flot` expose `prochaine_fermeture` (titre, date la plus proche à venir, horaires) — null si aucune.
- Tests (mock WP avec un événement fermeture) : fermeture absente de la liste/garde formation visible/absente du filtre, carte dashboard affichée avec la date + positionnée au-dessus de l'agenda, favicon servi. 47/47. Régression : 339/339.
## v1.4.1 — carte fermeture : période complète (début → fin)
- La carte « Prochaine fermeture » affiche désormais **la date de début ET de fin** de la fermeture (« du lundi 15 août au mardi 16 août ») quand l'événement s'étend sur plusieurs jours ; date seule si fermeture d'un jour.
- `prochaine_fermeture` du flot expose `date` (début) et `date_fin` (MAX des dates de l'événement).
- Test : fermeture du mock sur 2 jours, date_fin vérifiée et période affichée dans la carte. 48/48. Régression : 340/340.
## v1.4.2 — fix formation.html : « Réserver sur le site » inerte
- **Fix signalé** : le bouton « Réserver sur le site » de la fiche formation ne faisait rien — le handler était présent mais `booking.js` (le sélecteur de membre présaisi) n'était pas chargé par formation.html (même oubli que formations.html en v1.2.5).
- `<script src="booking.js?v=3">` ajouté ; le clic réel est testé dans le DOM (modale du sélecteur ouverte). 50/50. Régression : 342/342.
