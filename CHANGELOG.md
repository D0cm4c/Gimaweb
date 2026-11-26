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
## v1.4.3 — fermetures hors salles + tests isolés de la base production + fin des données de démo
- **Fermetures** (demande) : les événements « fermeture » n'ont pas besoin de salle — exclus du planning mensuel (`/api/salles/planning`) et de la liste « sans salle » (`/api/formations/sans-salle`). Testés.
- **SÉCURITÉ CRITIQUE — isolation des tests** : toutes les suites de test effaçaient `data/` (le dossier de la base de PRODUCTION) et utilisaient la même base que le serveur. Toute personne lançant `npm test` sur la machine de production effaçait les membres. Les tests vivent désormais dans `data-tests/` (wipe effectué là), chaque suite a SON PROPRE fichier `gimaweb-<suite>.db` (DB_PATH explicite), y compris les chemins doubles-guillemets (candidate.db, verif-decrypt.db) et BACKUP_DIR. `data-tests/` ajouté au .gitignore. La production (`data/`) est structurellement inatteignable par les tests.
- **Bouton « Charger 20 membres de démo » retiré** de membres.html (+ son câblage app.js) — obsolète en production (le bouton résa-démo de formations.html l'avait déjà été en v1.3.0). Cache app.js v39.
- Régression : 347/347.
## v1.4.4 — modale Pointer une visite (recherche réparée) + page salles (grille réparée)
- **Fix signalé 1** : la recherche de la modale « Pointer une visite » ne filtrait rien — le handler appelait `displayCheckinResults(...)`, fonction qui n'existe plus (renombrée `afficherResultatsPointage` à la migration) : chaque frappe levait une ReferenceError silencieuse.
- **Fix signalé 2** : les salles ne s'affichaient pas dans salles.html — `getRoomPlanning(bounds[0], bounds[1])` passait une DATE alors que l'API serveur attend un MOIS (YYYY-MM) : planning rejeté en 400 (entrée de mois invalide), page vide. L'appel passe désormais le mois courant ; les 3 salles (Grande, Petite, Cyber-espace) s'affichent avec la grille du mois.
- Bumps cache : dashboard v41, page-salles v3.
- M7 étendu : frappe réelle dans le moteur de recherche de pointage (filtre + résultat retrouvé + zéro erreur) et rendu complet de salles.html (3 colonnes salles, grille jours). 61/61. Régression : 352/352.
## v1.4.5 — couleurs par catégorie (charte) + nouveau favicon aux couleurs maîtresses
- **Couleurs par catégorie** (cartes formations, hero des fiches, agenda dashboard) : « Utilisation d'une tablette ou d'un smartphone » → vert #18A55F ; « Trucs et astuces » → ambre #B26A00 ; « Formation » → bleu #2F9BE4. Les autres catégories gardent le ton déterministe par hash. Règle partagée par les 3 pages (couleurCategorie).
- **Favicon refait** aux couleurs maîtresses de l'Atelier du web : fond bordeaux #9f0c45, monogramme AW crème, bande lime #bbcc6a en bas — servi en favicon.ico (16+32), PNG 32/192/512, apple-touch-icon ; liens mis à jour dans les 12 pages.
- Bumps cache : page-formations v42, page-formation v3, dashboard v42.
- M7 étendu : 3 événements de test (tablette/trucs/formation) → couleurs de bandeau vérifiées sur les cartes + hero ; favicon.ico servi. 66/66. Régression : 366/366.
## v1.4.6 — couleurs par catégorie : le vrai schéma du site (catégories multiples)
- **Fix signalé** : les couleurs ne changeaient pas sur formations.html malgré la v1.4.5. Cause trouvée en interrogeant le VRAI atelierduweb.be : chaque événement porte PLUSIEURS catégories, et la première est générique (« Ateliers », « Formations », « Evènement ») — la catégorie utile (tablette/smartphone, trucs et astuces) arrive en 2e position. La règle ne regardait que la 1re → aucune couleur ne bougeait.
- La règle `couleurCategorie` scanne désormais TOUTES les catégories de l'événement (tablette/smartphone = vert, trucs = ambre, formation = bleu), avec repli sur le ton déterministe. Appliquée aux cartes, aux héros de fiches et à l'agenda du dashboard.
- Le mock du test reflète le schéma réel du site (cat générique en tête, utile derrière) : « Ateliers + Truc et astuces » → ambre, etc. Bumps cache : page-formations v43, page-formation v4, dashboard v43. Régression : 366/366.
## v1.4.7 — caractères spéciaux des formations réparés (entités HTML)
- **Fix signalé** : les caractères spéciaux bugguaient dans les noms de formations — WordPress renvoie titres et extraits encodés en entités HTML (« Soleils &amp; Cri » — &#8211; / L&rsquo;Atelier…) et l'ancien stripHtml écrasait les entités NUMÉRIQUES par une espace en ignorant la plupart des entités nommées.
- Nouveau décodeur `decodeEntites` (server/mec.js) : entités numériques &#NNN; et &#xHH; + 25+ entités nommées (amp, rsquo, lsquo, laquo/raquo, hellip, ndash/mdash, accents…), appliqué aux titres ET extraits au moment de la sync (stripHtml l'utilise). Les données existantes se corrigent à la prochaine sync automatique (15 min).
- Test : un titre du mock contient « boîte mail &amp; spam &#8211; bien gérer » → vérifié décodé dans /api/formations ET propre à l'affichage. 68/68. Régression : 368/368.
## v1.4.8 — salles auto-attribuées depuis le lieu du site + les 20 formations passées + marges du dashboard + plages de dates
- **Attribution automatique de salle (demande)** : les événements du site ont des lieux — « GS - Atelier du web » → **Grande salle**, « PS - Atelier du web » → **Petite salle**. À chaque sync, la salle est attribuée automatiquement (seulement si aucune salle n'est déjà attribuée : la décision manuelle prime ; fermetures exclues). Le journal de sync compte les attributions — règle projet : toute action automatique est notifiée.
- **Formations passées (demande)** : la sync conservait uniquement les événements à venir — le filtre « Toutes » de formations.html ne montrait donc rien de plus que « À venir ». Désormais les **20 dernières formations passées** sont conservées (les plus anciennes sont retirées automatiquement au fil des syncs).
- **Marges du dashboard (demande précédente)** : la marge interne des cartes (1,3rem) doublait le gap de la grille (1,1rem) — marges externes trop grandes sur « Prochaine fermeture » et « Aujourd'hui à l'Atelier » ; corrigé.
- **Plages de dates (suite v1.4.1)** : le parseur gère maintenant « du 27 juillet au 08 août inclus » et « du 14 au 17 août 2027 » (mois après la 2e date, année unique pour les deux bornes) — la vraie fermeture annuelle du site affiche enfin sa date de fin.
- M7 : lieux GS/PS mockés (attributions vérifiées en base), formation passée masquée avec « À venir » et affichée avec « Toutes », plage de fermeture parsée (14→17 août). 73/73. Régression : 374/374.
## v1.4.9 — la vraie période de fermeture s'affiche (plage cherchée aussi dans la description)
- **Complément demandé** : le champ « Dates : » des événements du site ne donne qu'une date (ex. « samedi 08 août ») pour la Fermeture Annuelle — la période complète (« ferme ses portes du 27 juillet au 08 août inclus ») vit dans la description. La sync scanne désormais la description en repli quand le champ Dates est seul, et la plage est cherchée aussi après le bloc horaires. Vérifié sur le vrai site : 27 juillet → 08 août (13 jours).
- La carte « Prochaine fermeture » du dashboard affiche donc bien « du … au … » avec les vraies bornes de la fermeture réelle.
- Mock aligné sur le schéma du site réel ; 73/73, régression 374/374.
## v1.4.10 — carte fermeture : lien direct vers l'événement du site
- **Demande** : les éditeurs du site ne sont pas toujours fiables dans la saisie et le parsing ne marchera pas à tous les coups — la carte « Prochaine fermeture » affiche désormais un lien 🔗 « Voir l'événement sur atelierduweb.be » vers la page de l'événement (URL stockée à la sync, incluse dans prochaine_fermeture du flot).
- Test : présence du lien vers l'URL de l'événement vérifiée dans la carte. 74/74. Régression : 375/375.
## v1.4.11 — parametres.html : équipe technique réparée, carte Formateurs/Animateurs, séparateur Affichage retiré
- **Fix signalé** : impossible d'ajouter un membre de l'équipe technique — le HTML avait les ids de la maquette (teamList, newTeamMemberName, addTeamMemberBtn) mais settings.js cherchait d'autres ids (teamAdminList…) : la section ne se câblait jamais. Ids réalignés.
- **Nouveauté demandée** : carte « Formateurs / Animateurs » dans le même style que l'équipe technique — liste AUTOMATIQUE des organisateurs des événements du site à venir (nouvel endpoint GET /api/formations/organisateurs : nom, nombre de séances à venir, prochaine date ; fermetures exclues). Rien à gérer : elle suit la sync du site.
- **Demande** : le séparateur « Affichage » (fût vide) est retiré de la page.
- Bumps cache : settings v34, adw-client v3. Tests : ajout réel d'un membre d'équipe (saisie + clic), carte formateurs alimentée par l'organisateur du mock, absence du séparateur. 79/79. Régression : 380/380.
## v1.5.0 — locations de salles (nouvelle fonctionnalité)
- **Fonctionnalité demandée** : l'Atelier loue ses salles de formation à des tiers, avec ou sans animateur. Ces **locations** sont gérées dans Gimaweb uniquement — **jamais ouvertes aux inscriptions, jamais publiées sur le site public** (le serveur est pull-only, aucune donnée ne remonte, affirmé par test).
- Nouvelles tables `locations` + `location_dates` (créneaux AM/PM — mêmes créneaux que les formations, jamais de créneau flottant), appliquées automatiquement au boot (`IF NOT EXISTS`).
- **Nouvelle API** `server/api-locations.js` : CRUD (garde admin : titre + salle + dates requis, slot AM/PM, 400 dates max), agrégats de liste (premiere/derniere date, nb_seances, a_venir), et **conflits location×location ET location×formation** par salle×date×créneau (non bloquants, comme les formations). Notifications location_creee/modifiee/supprimee.
- **Nouvelles pages** : `locations.html` (liste avec filtre « À venir/Toutes », modale de création — date unique ou récurrente chaque semaine, créneau AM/PM/journée, sélecteurs salles + animateurs/formateurs du site) et `location.html` (fiche : hero, détails, séances, conflits, modifier/supprimer) — style des pages formations.
- Le **planning des salles** affiche les locations : cellules hachurées brun (`.slot-location`), préfixe 🔑, lien vers la fiche. La sidebar gagne **« Locations » sous « Salles »** et **« Suggestions » désormais épinglée en bas** (hors flux métier, `.side-extra`).
- Tests : nouvelle suite `tests/m8-locations.js` (CRUD, journée→2 séances, récurrente, conflits croisés, planning UNION, cascade delete, aucune fuite vers wp-json — 25/25) + M7-dom étendu (chargement sans erreur des 2 pages, création RÉELLE via la modale en DOM, JOURNÉE→AM+PM en base, filtre, fiche rendue, cellule 🔑 dans salles.html, position sidebar). 97/97. Régression : **417/417** (13 suites).
