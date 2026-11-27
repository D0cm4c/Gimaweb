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
## v1.5.1 — parametres.html : carte Formateurs imbriquée dans la carte Équipe technique
- **Fix signalé** : la carte « Formateurs / Animateurs » s'affichait DANS la carte « Équipe technique » — la balise `<section>` de l'équipe n'était pas fermée avant celle des formateurs (le `</section>` manquant déportait la fermeture en fin de carte formateurs, et les deux cartes fusionnaient visuellement).
- Le HTML est rééquilibré : les cartes Équipe technique, Formateurs / Animateurs et Salles de formation sont sœurs dans le groupe « Équipe & salles » (validateur d'appariement des balises OK).
- M7 : vérification par `contains()` — la carte Formateurs ne doit PAS être dans la carte Équipe. 98/98. R\u00e9gression : 418/418.
## v1.5.2 — modale location : les champs dates sortaient de la modale
- **Fix signalé** : dans la modale « Nouvelle location », à partir des champs dates, les champs sortaient de la modale — le fieldset « Créneaux » utilisait `.filter-group` (`display:flex` sans `flex-wrap`) : tous les labels/selects/inputs dates s'alignaient sur UNE ligne qui débordait horizontalement.
- Nouvelle structure : grille `.loc-grid` (`grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`) qui s'enroule, chaque champ en `.form-group` (label au-dessus, comme le reste de la modale) ; les wrappers `#locUniqueWrap`/`#locRecurWrap` en `display:contents` — leurs champs participent à la grille, le JS existant (bascule `none`/`''`) reste inchangé.
- M7 : assertions structurelles (plus de `.filter-group` dans la modale, `.loc-grid` présent) + bascule unique/récurrente rejouée au clic réel (Date masquée ↔ Jour/Du/Au affichés). 101/101. Régression : 421/421.
- (Correctif de test) : le label de version attendu dans m7-dom suit package.json (1.5.2).
## v1.5.3 — modale location : occurrences libres + locations sur le dashboard
- **Demande** : certaines locations ont lieu plusieurs fois par semaine ou à des dates irrégulières — l'ancien mode « date unique OU récurrente chaque semaine » ne suffisait pas. La modale a maintenant un **sélecteur date + créneau avec bouton « + Ajouter »** : chaque clic ajoute une occurrence (chip supprimable par ✕, compteur dans le titre). Journée = AM+PM (2 créneaux, comme avant), doublon exact refusé avec message, la date avance d'un jour après chaque ajout pour enchaîner les occurrences proches.
- **Demande** : les locations doivent apparaître sur le dashboard, « leur utilité majeure ». Deux ajouts : (1) nouvelle carte **« 🔑 Prochaines locations »** dans le style « Prochaine fermeture » (entre fermeture et agenda du jour, liseré brun, les 8 prochains créneaux à venir : locataire, date, animateur, salle, lien vers la fiche) ; (2) une location d'aujourd'hui occupe l'agenda **« Aujourd'hui à l'Atelier »** (barre brune, 🔑, « location »).
- Flot : `prochaines_locations` (8 prochains créneaux) + l'agenda du jour concatène les locations (`type:'location'`).
- Tests : scénario modale rejoué (chips, doublon refusé, ✕, JOURNÉE+PM irrégulier → 3 séances en base) + assertions dashboard (flot, carte, agenda). M7 : 111/111. Régression complète : 431/431 (13 suites).
## v1.5.4 — dashboard épuré + carte « Locations » dans les statistiques
- **Demande** : la carte dashboard « Prochaines locations » est RETIRÉE — les animateurs n'ont pas besoin de l'info en plus, elle vit dans locations.html. La fonction, la section HTML, l'appel de rendu et le champ `prochaines_locations` du flot sont supprimés. L'occupation de l'agenda « Aujourd'hui à l'Atelier » par une location du jour est conservée.
- **Nouveauté** : carte **« 🔑 Locations »** sur statistiques.html, dans le style des autres cartes — 3 KPI : **créneaux loués ce mois**, **locataires à venir** (locations distinctes avec au moins un créneau à venir), **salle la plus louée** (historique complet, avec nombre de créneaux). Servie par `/api/agregats/stats` (`locations: { creneaux_mois, locataires_a_venir, creneaux_total, top_salle }`).
- M7 : assertions carte dashboard retirées, assertions stats ajoutées (API + page rendue + top salle + zéro erreur). 112/112. Régression complète : 432/432 (13 suites).
## v1.5.5 — stats.html : carte Locations rangée en deuxième ligne
- **Demande** : la carte « 🔑 Locations » est rangée juste après « 📈 Rétention des inscrits » — l'ordre de lecture devient Membres | Profil des usagers | Rétention | **Locations** | Motifs…
- M7 : assertion d'ordre des cartes (Locations = 4ᵉ, entre Rétention et Motifs). 113/113. Régression complète : 433/433.
## v1.5.6 — modale location : une salle par occurrence
- **Demande** : une location à dates multiples peut changer de salle selon la date — le sélecteur **Salle déménage dans le picker d'occurrences** (Date | Salle | Créneau | + Ajouter) et **garde sa valeur d'un ajout à l'autre** (la salle choisie pour la 1ʳᵉ date est présélectionnée pour la suivante). Le champ « Salle » global de la modale disparaît ; la salle de la 1ʳᵉ occurrence devient celle de la location (affichée sur les cartes/fiche).
- Serveur : `location_dates.room_id` optionnel (NULL = salle de la location) — **migration idempotente** au démarrage pour la base de production (`ALTER TABLE` gardé par `pragma_table_info`). Validation : salle inconnue par occurrence → 400 « Salle inconnue pour l'occurrence du … ». Salle **effective** (`COALESCE(ld.room_id, l.room_id)`) utilisée partout : planning des salles, conflits location×location et ×formation, agenda dashboard, fiche (chaque séance affiche 🏫 sa salle).
- Doublon refusé au même niveau : même date + même créneau + **même salle**.
- Tests : m8 +7 (salle par date : fiche, planning par date, 400, conflit par salle effective, nettoyage) — 32/32 ; m7-dom +2 (salle sticky conservée après ajout, chip avec salle ; 4 séances et salle par occurrence vérifiées en base) — 116/116. Régression : 443/443 (13 suites).
## v1.5.7 — fiche location : vraie modale « Modifier » (fini les prompt() )
- **Demande** : la fiche location.html a maintenant une **modale d'édition complète** : Locataire, Animateur (liste des organisateurs du site, avec l'animateur actuel ajouté s'il n'y figure pas), Contact, Notes — et le même **picker d'occurrences** que la création (Date | Salle | Créneau | « + Ajouter », chips supprimables, salle sticky) **pré-rempli avec les séances existantes**. Les AM+PM d'une même date et même salle fusionnent en « Journée ». Enregistrer → PUT complet (les dates sont remplacées) puis la fiche se rafraîchit.
- **Fix serveur associé** : dans `PUT /locations/:id`, une propriété présente (même `null`) remplace la valeur ; absente, elle est conservée — jusqu'ici envoyer `animateur: null` (choix « Sans animateur ») gardait l'ancien animateur au lieu de le vider.
- Retiré les `prompt()` en cascade (salle par id technique !) de l'ancien bouton Modifier.
- M7 : 122/122 — modale ouverte par clic réel derrière la garde admin, titre pré-rempli, 3 occurrences pré-remplies (fusion Journée vérifiée), ✕ retire, PUT vérifié en base (titre v2, 3 séances), fiche rafraîchie. Régression complète : 449/449 (13 suites).
## v1.5.8 — animateur PAR occurrence (comme la salle)
- **Demande** : l'animateur se choisit aussi par date — le select **Animateur entre dans le picker d'occurrences** des DEUX modales (création locations.html et édition location.html) : Date | Salle | Créneau | Animateur | « + Ajouter ». Il est sticky (conservé d'un ajout à l'autre) et optionnel (« sans animateur » possible par occurrence). Le champ Animateur global des modales disparaît ; celui de la 1ʳᵉ occurrence devient celui de la location (cartes/fiche).
- Serveur : `location_dates.animateur` optionnel (NULL = animateur de la location), **migration idempotente au boot**. Animateur **effectif** (`COALESCE(ld.animateur, l.animateur)`) servi par la fiche (par séance) et l'agenda dashboard. La fusion AM+PM → « Journée » à la ré-édition exige maintenant même date + même salle + même animateur.
- Chips : la salle ET l'animateur de l'occurrence sont affichés (« 12 nov. Petite salle · Matin Nadia Franchi »).
- Tests : m8 +5 (animateur hérité / surchargé par date, nettoyage) — 37/37 ; m7-dom : sticky animateur, chip, animateur par date vérifié en base — 125/125. Régression complète : 457/457 (13 suites).
## v1.5.9 — HTTPS sur le LAN (le mot de passe admin ne voyage plus en clair sur le WiFi)
- **Demande** : le serveur passe par le WiFi de l'EPN — en HTTP, le mot de passe admin et les données membres transitent en clair. Le serveur écoute maintenant en **HTTPS dès que TLS_CERT + TLS_KEY sont fournis** (sinon HTTP inchangé, avec avertissement explicite au boot si les fichiers sont introuvables).
- `tools/generer-certificat.sh` : certificat auto-signé 10 ans (RSA 2048, SHA-256, SAN localhost + gimaweb.local + 127.0.0.1 + IP LAN de la machine, chmod 600 sur la clé), écrit dans `data/certs/` (gitignoré). `.env.exemple` : TLS_CERT/TLS_KEY. `docs/ADMINISTRATION.md` : procédure complète.
- Tests `tests/m9-https.js` : génération openssl, HTTP sans TLS (inchangé), HTTPS joignable + aucune réponse en clair sur le port + /api/sante 200 + connexion admin (cookie) en TLS, repli HTTP annoncé si fichiers introuvables — 9/9. Régression : 466/466 (14 suites).
## v1.5.10 — salles.html repensée : grille SEMAINE (M1) + agenda à venir (M3)
- **Décision du porteur (comparatif des 4 mockups)** : M1 adoptée avec **deux colonnes par jour (Matin | A-midi)**, et M3 en dessous.
- **Grille semaine** : une **LIGNE PAR SALLE, dynamique** — une salle ajoutée/retirée dans l'admin fait apparaître/disparaître la ligne au rechargement ; **7 colonnes jours × (Matin | A-midi)** = 14 créneaux visibles, tout tient à l'écran. Navigation ◀ semaine précédente / semaine suivante ▶ + Aujourd'hui ; le label affiche « 16 – 22 novembre 2026 » ; jour courant marqué ●, créneau en cours surligné ; couleurs par catégorie et locations 🔑 hachurées brunes conservées.
- **Agenda « À venir — 30 prochains jours » sous la grille (M3)** : uniquement les journées occupées, cartes par jour (jour courant encadré bordeaux), chaque créneau en chip cliquable (Matin/A-midi, formation colorée ou 🔑 location, salle à droite). Le compteur de la barre compte la semaine affichée.
- Le planning multi-mois est géré (une semaine ou la fenêtre agenda peut chevaucher deux mois — les deux appelés puis fusionnés).
- La page mockup publique `/mockups-salles.html` est retirée (choix fait) ; l'archive reste dans docs/mockups/.
- M7-dom : 131/131 — 3 lignes de salles, 14 slot-h, 14 cellules/ligne, label semaine, agenda rendu, location dans grille + agenda, **salle ajoutée en admin → 4 lignes puis retrait → 3 lignes**. Régression complète : 472/472 (14 suites).
## v1.5.11 — rétention span-1, sauvegarde sur le poste, pastilles = alertes seulement
- **stats.html** : la carte « 📈 Rétention des inscrits » passe en **span-1** (elle étirait la grille).
- **parametres.html — « 💾 Sauvegarder maintenant » télécharge la base SUR LE POSTE** : nouveau `GET /api/base/export` (garde admin) — snapshot SQLite cohérent via l'API `backup` (lecteurs concurrents non perturbés), servi en attachment `gimaweb-AAAA-MM-JJ-HH-mm.db`, fichier temporaire nettoyé ; le navigateur propose le téléchargement (à ranger sur clé USB). La sauvegarde nocturne chiffrée AES-256-GCM + Nextcloud continue de tourner côté serveur, elle.
- **notifications** : les **pastilles (cloche topbar + sidebar) ne comptent plus que les ALERTES non lues** — severity `warning`/`danger` + les types alertes de la page (`ticket_urgent`, `error`, `room_needed`, `awaiting_validation`). Le journal d'activité (success/info/sync) reste consultable sans allumer les badges. Décision EPN : danger et warning = agir.
- Bug attrapé en route : `db.backup()` de better-sqlite3 est **asynchrone** — le flux partait avant la création du fichier (serveur tué par un ReadStream ENOENT non géré). Corrigé (await + handler d'erreur).
- Tests : m4 +3 (export 401/200/attachment, magic bytes « SQLite format 3 »), m3 +2 (pastilles : success ne compte pas, warning compte), m5a 42/42 (sémantique compteur). Régression : **478/478** (14 suites).
## v1.5.12 — branchement API M.E. Calendar (issue #52)
- **Sync des formations via l'API RESTful officielle** (`https://atelierduweb.be/wp-json/mec/v1.0`) : auth par header **`mec-token`** (rien d'autre ne marche). `GET /events` (racine `events` indexée par date) puis `GET /events/:id/next-occurrences` par événement : les dates de `formation_dates` viennent désormais de `start.date` (ISO direct, zéro piège de fuseau) et le créneau du champ `start.ampm` (AM/PM) ; `allday` → AM+PM.
- **Clé API stockée côté serveur** : nouvelle table `settings` (clé/valeur). La carte « 🔑 Clé API M.E. Calendar » de parametres.html ne touche plus au localStorage — `GET /api/parametres/cle-mec` renvoie un état masqué (`cle-…7890`, jamais la clé), `PUT` la pose/l'efface (garde admin, clé < 8 caractères refusée). `.env` reste prioritaire (`MEC_API_KEY`), `.env.exemple` documenté.
- **Règles respectées** : lecture seule (le site reste maître), métadonnées wp-json (catégories, lieu, organisateur) conservées par fusion, échec réseau **silencieux** → repli sur le canal public wp-json/RSS, le serveur démarre toujours. Notification de sync enrichie de « — dates via API M.E. Calendar » quand la source a servi.
- Tests `tests/m10-mec-api.js` (18) : mock loopback de l'API MEC (401 si mauvais token), garde admin, clé trop courte, état masqué, **header `mec-token` exact reçu**, occurrences exactes en base, créneau via `ampm`, métadonnées conservées, repli silencieux sur 401, effacement. Régression : **496/496** (15 suites).
## v1.5.13 — sync : l'API M.E. Calendar devient prioritaire sur TOUTES les infos (audit réel)
- **Audit de l'API avec une clé réelle** (27 nov. 2026) : structure consignée dans `docs/AUDIT-API-MEC.md`, outil `tools/audit-mec-api.cjs`. La vraie racine est `events` + `pagination` ; chaque item expose `data.meta` (mec_cost, ids lieu/organisateur), `data.locations/organizers/categories/labels` (noms complets), `data.mec.days` (toutes les séances, y compris passées), `data.permalink`. La pagination du plugin est ignorée (`?start=&offset=` renvoie le même payload) : **un seul GET /events** suffit.
- **Priorité API MEC sur toutes les infos** : tarif (`meta.mec_cost`), lieu (`locations[id].name`), organisateur (`organizers[id].name`), catégories, labels, permalien, horaires (`time`). Le wp-json public ne sert plus que de secours (durée, date_text, événements hors fenêtre MEC) ; le plugin de labels ne comble plus que le vide.
- **Séances complètes** : `next-occurrences` (futures) ∪ `mec.days` (y compris passées) → la carte « Salle & séances » de formation.html montre toutes les séances, plus seulement le futur.
- **Entités HTML décodées** dans les titres et contenus (`&rsquo;` → «'» typographique) — fin des `l&rsquo;IA` dans les fiches.
- **Fermetures : détection par CATÉGORIE uniquement** (décision du porteur) — les labels MEC restent stockés pour l'affichage mais ne servent qu'à la déco du site web.
- Événements présents dans l'API MEC mais absents du flux wp-json : ajoutés par la sync.
- Tests m10 étendus : 27/27 (structure réelle du mock, séances complètes avec date passée, entités, lieu/tarif/organisateur/labels/permalien, event MEC-only, fermeture par catégorie). Régression : 505/505 (15 suites).
## v1.5.14 — correctif : événements hors fenêtre de l'index MEC + dates pourries de mec.days
- **Bug signalé** : « Je maîtrise mon smartphone » (16 déc) ne se synchronisait pas alors que « Initiation à l'IA » (15 déc) oui. Cause : `GET /events` de l'API MEC ne renvoie qu'une **fenêtre fixe d'environ 4 semaines** (l'index s'arrêtait au 15 déc) et sa pagination ignore tous les paramètres. Corrigé : le wp-json public fournit la liste complète des IDs, et chaque événement **absent de l'index est récupéré via `GET /events/:id`** (données riches identiques).
- **`data.mec.days` est démuté de source à secours filtrée** : les événements dupliqués dans WP y gardent les dates d'ORIGINE (ex. 11111 : `mec.days = 2023-03-31` alors que la vraie séance est le 2026-12-16). Maintenant : **`next-occurrences` primaire** (occurrences exactes), `mec.days` en secours **filtré sur le futur**, dates de l'index en dernier recours — les dates pourries n'atteignent plus `formation_dates`.
- Tests m10 : +4 (événement hors fenêtre récupéré via `/events/:id`, occurrence exacte 2027-12-16, `mec.days` 2023 pourri ignoré, tarif/organisateur API) — **30/30**.
## v1.5.15 — héro du dashboard : « Renouveler un abo » + « Ajouter un membre », hero plus haut (rebasé sur v1.5.14 / PR #56)
- **index.html** : dans le héro, « Gérer les membres » et le lien « atelierduweb.be » sont retirés. Deux nouveaux boutons : **♻️ Renouveler un abo** (nouvelle modale de recherche de membre, même modèle que « Pointer une visite » — après sélection du membre, on est envoyé sur `membres.html#member=<id>`, la modale « Fiche de … » qui porte le bouton « Renouveler l'abo ») et **➕ Ajouter un membre** (lien vers `membres.html#add`).
- **app.js (membres.html)** : nouveau deep link `membres.html#add` → la modale « Ajouter un membre » s'ouvre directement (même pattern que `#member=` / `#edit=`, hash nettoyé après ouverture).
- **Hero mieux mis en évidence** : classe `.hero-home` — padding augmenté (2.3rem), liseré bordeaux 4px (`var(--primary)`, micro-dose charte), texte d'accueil remplacé par un résumé des 4 boutons du héro. Charte respectée : pas d'ombre au repos, pas de dégradé, coins ≤ 6px.
- Bumps cache : index.html `styles.css?v=94` + `dashboard.js?v=47` ; membres.html `app.js?v=40`. Version 1.5.15 (les v1.5.13 et v1.5.14 ont été prises par les PR #55 et #56).
- Tests m7-dom : +13 vérifications (boutons du héro présents/retirés, `.hero-home` + texte d'accueil, modale renew : ouverture, liste, recherche, navigation au clic vers `membres.html#member=…`, deep links `#add` / `#member=<id>`, 0 erreur JS). Régression : **521/521 (15 suites)**.
## v1.5.16 — correctif : bouton « 🔄 Actualiser » de formations.html ne marchait pas
- **Bug signalé** : le bouton « Actualiser » de formations.html était inert — son listener a été perdu à la migration M5 (le bouton vivait dans la maquette avec un re-fetch navigateur, devenu obsolète côté serveur).
- Le clic relance maintenant la **synchro serveur** (`POST /api/formations/sync` : API MEC → base unique), affiche le retour (formation(s) dans le flux, ajoutées, mises à jour, retirées) en notification, rafraîchit les pastilles et re-rend la grille. Même pattern que « Resynchroniser » de la fiche. Bouton désactivé + « ⏳ Synchronisation… » pendant l'opération, ré-activé à la fin (succès comme échec).
- `page-formations.js?v=44` (cache busting).
- Test DOM (m7-dom) : clic réel sur le bouton → sync serveur sans erreur JS, bouton ré-activé avec son libellé, notification de synchro constatée côté serveur — 135/135.

### Coordination des versions (autre session IA sur ce dépôt)
- 1.5.14 = PR #56 (API MEC, session serveur). 1.5.15 = PR #57 (héro dashboard, autre session, fusionnée avant coordination).
- **1.5.16 = cette PR** (bouton Actualiser, session serveur).
## v1.5.17 — membres.html : « Pointer une visite » + « Renouveler un abo » dans la barre de filtres, et NOUVELLE modale de renouvellement
- **membres.html** : PAS de nouveau hero (décision porteur) — deux boutons dans `.filters-head` à côté de « + Ajouter un membre » : **✅ Pointer une visite** (`quickCheckinBtn`) et **♻️ Renouveler un abo** (`quickRenewBtn`). Un même picker de recherche de membre s'ouvre ; au clic sur un membre :
  - mode **visite** → la fiche s'ouvre en place et la visite du jour est pointée (bouton de la fiche, 409 géré) ;
  - mode **abo** → la **nouvelle modale `#renewAboModal`** s'ouvre en place.
- **Nouvelle modale « Renouveler un abo »** (demande porteur) = assemblage de la partie « Abonnement » de la modale « Modifier le membre » (radios aucun/mensuel/annuel + dates début/fin, pré-remplies, live comme l'édition) **+** du bouton « ♻️ Renouveler l'abo » de la fiche (double confirmation : 1er clic = aperçu `previewRenewal` + pré-remplissage des nouvelles dates, 2e clic = application `renewSubscription` avec la formule choisie et les dates affichées). Deep link `membres.html#renew=<id>` (le bouton du **hero du dashboard** envoie dessus : `membres.html#renew=<id>` au lieu de `#member=`).
- **app.js** : picker dual-mode + modale renewAbo + deep link `#renew=`. **dashboard.js / index.html** : le picker du hero renvoie vers `#renew=` (cache `dashboard.js?v=48`). Bump membres.html `app.js?v=41`. Aucun CSS modifié. Version 1.5.17 (v1.5.15 → PR #57, v1.5.16 → PR #58).
- Tests m7-dom : +17 vérifications (pas de hero, boutons dans `.filters-head`, picker 2 modes, modale renewAbo en place pré-remplie, aperçu armé = preview API, 2e clic appliqué en base, deep link `#renew=`, visite enregistrée via API, aucune navigation, 0 erreur JS). Régression : **544/544 (15 suites)**.
## v1.5.18 — UNIFICATION des dates d'abo + du renouvellement sur membres.html (fix, décisions porteur : 1b / 2A / 3-oui)
- **Bug** : dans la modale « Renouveler un abo » (v1.5.17), la formule « Annuel/Mensuel » ne recalculait la date de fin que si le champ était vide — or il est pré-rempli → aucun effet.
- **Règle unique (décision 1b : +1 mois/1 an EXACT, sans -1 jour — même règle que le serveur de renouvellement)** : fonction partagée `aboEndDate(sub, début)` (aucun → fin vide ; mensuel → début + 1 mois ; annuel → début + 1 an), utilisée par la modale « Modifier le membre » (`applySubscriptionDates`) ET la modale « Renouveler un abo » (`applyRenewAboDates`, recalcul **toujours** au changement de formule ou de date de début).
- **Flux de renouvellement unifié (décision 2A)** : le bouton « ♻️ Renouveler l'abo » de la modale « Fiche de … » ouvre désormais la modale `#renewAboModal` (logique double inline supprimée) — une seule modale de renouvellement, atteinte depuis la fiche, la barre de filtres ou le deep link `#renew=<id>` (hero dashboard). **Double confirmation conservée** (décision 3-oui : 1er clic = aperçu + pré-remplissage des nouvelles dates, 2e clic = application).
- `membre.html` (fiche complète) laissée telle quelle pour l'instant (hors scope 2A).
- Bump cache : membres.html `app.js?v=42`. Version 1.5.18.
- Tests m7-dom : +7 vérifications (règle exacte annuelle/mensuelle/aucune dans la modale renew, bouton fiche → modale renew, même règle dans `#edit=`). Régression : **551/551 (15 suites)**.
## v1.5.19 — « Pointer une visite » de membres.html renvoie au dashboard (index.html#visite)
- **membres.html** : le bouton « ✅ Pointer une visite » de la barre de filtres devient un simple lien `<a href="index.html#visite">` — la modale de pointage vit UNE SEULE fois, sur le dashboard.
- **dashboard (index.html/dashboard.js)** : nouveau deep link `index.html#visite` → ouvre directement la modale « Pointer une visite » (`openCheckin`, hash nettoyé). Bump `dashboard.js?v=49`.
- **Nettoyage (code inutile retiré)** : le picker `#renewModal` de membres.html ne sert plus que le renouvellement — suppression du mode checkin (`pickMode`, `openPick(mode)`, auto-clic sur `detailCheckinBtn`, hint dynamique). Le picker au clic ouvre uniquement `#renewAboModal` en place. Bump membres.html `app.js?v=43`.
- Tests m7-dom : +4/-5 vérifications (lien `index.html#visite` + navigation au clic, `index.html#visite` ouvre la modale checkin avec sa liste). Régression : **551/551 (15 suites)**.
