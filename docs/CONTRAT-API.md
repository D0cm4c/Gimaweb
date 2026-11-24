# Gimaweb — contrat API (miroir de l'issue app #150)

> **Issue miroir** demandée par le brief de transmission ([app #150](https://github.com/D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web/issues/150), §7).
> Le frontend (copie de la maquette) ne fait jamais de SQL direct : tout passe par l'objet `window.ADWDatabase`.
> Côté serveur, **chaque méthode devient un endpoint REST** (ou une commande serveur pour ce qui n'est plus du navigateur).

## Primitives → primitives HTTP

| Primitive maquette | Équivalent serveur | Notes |
|---|---|---|
| `init()` | néant (connexion au démarrage du serveur) | WAL activé |
| `queryAll(sql, params)` | `GET`/`POST` endpoints dédiés | **jamais de SQL passager par le réseau** (injection/abstraction) |
| `run(sql, params)` | endpoints dédiés (`POST/PUT/DELETE`) | idem |
| `persist()` / `flush()` | néant | persistance = le fichier SQLite du serveur |

## Endpoints REST (base `/api`)

### Membres
| Méthode maquette | Endpoint |
|---|---|
| CRUD dispersé + `nextMemberNo()` | `GET /api/membres` · `POST /api/membres` (n° auto #1000…) · `PUT /api/membres/:id` |
| `deleteMemberCompletely(id)` | `DELETE /api/membres/:id` — **cascade** visites+prints+inscriptions (RGPD) |
| `previewRenewal(id)` | `GET /api/membres/:id/renouvellement` |
| `renewSubscription(id, …)` | `POST /api/membres/:id/renouvellement` |
| `purgeAllPersonalData()` | `POST /api/rgpd/purge` — ⚠️ garde admin obligatoire |

### Visites & impressions
| Rôle | Endpoint |
|---|---|
| pointage (refus double pointage côté serveur) | `POST /api/visites` |
| **visite anonyme** (passage sans inscription, 1 €, motif baromètre FRB) | `POST /api/visites` `{anonyme: true, reason}` — `member_id` NULL en base (nullable depuis M5c) |
| historique visites d'un membre | `GET /api/membres/:id/visites` |
| impressions (solde, solder, effacer) | `POST /api/impressions` · `POST /api/membres/:id/impressions/solder` · `DELETE /api/membres/:id/impressions` |

### Membres — import XML (base Access)
| Rôle | Endpoint |
|---|---|
| aperçu sans écriture (modale d'import) | `POST /api/membres/import` `{xml, essai: true}` → `{analyses, avertissements}` |
| import réel (transaction, doublons `member_no` ignorés, notification `import_membres`) | `POST /api/membres/import` `{xml}` → 201 `{analyses, importes, doublons, avertissements}` |

Parseur serveur sans dépendance (`server/import-xml.js`), mappings identiques à la maquette (tags Access `_xHHHH_`, STATUS_MAP `orbem`→`cpas` etc., dates FR, âge, email). Garde : 401 sans session admin · 400 XML manquant/invalide · 413 > 50 Mo.

### Formations
| Méthode | Endpoint |
|---|---|
| `syncFormations(events)` | `POST /api/formations/sync` (le serveur fetch lui-même le flux WP — hors navigateur) |
| `listFormations()` | `GET /api/formations` |
| `getFormation(id)` / `getFormationByEventId(eid)` | `GET /api/formations/:id` (id interne ou event_id MEC) |
| `registerMemberToFormation` / `unregisterMemberFromFormation` | `POST` / `DELETE /api/formations/:fid/inscrits` |
| `getFormationAttendees(fid)` / `getMemberFormations(mid)` | `GET /api/formations/:fid/inscrits` · `GET /api/membres/:mid/formations` |
| `setFormationRoom` / `setFormationDates` / `getFormationDates` | `PUT /api/formations/:fid/salle` · `PUT /api/formations/:fid/dates` · inclus dans `GET /api/formations/:id` |
| `getRoomPlanning(mois)` / `getRoomConflicts(fid, rid)` | `GET /api/salles/planning?mois=YYYY-MM` · `GET /api/formations/:fid/conflits?salle=…` |
| `formationsWithoutRoom()` | `GET /api/formations/sans-salle` |
| `listFormationTitlesDistinct()` / `normalizeTitle(t)` | `GET /api/formations/titres` (normalisation faite serveur) |

### Listes d'attente
`addToWaitlist` · `removeFromWaitlist` · `getWaitlist` · `getMostWaitedFormations` · `getMemberWaitlist` · `matchWaitlistForFormation` · `migratePastFormationWaitlists` · `markWaitlistContacted`
→ `GET/POST/DELETE /api/listes-attente` · `POST /api/formations/:fid/liste-attente/match` · `PUT /api/listes-attente/:id/contacte`

### Inscriptions & paiements
`getPaymentLog` → `GET /api/formations/:fid/paiements` · `setFmPayment` / `setFmAttendance` → `PUT /api/formations/:fid/inscrits/:mid` (payment/attendance) — journal `fm_payment_log` côté serveur.

### Notifications
`notify` · `listNotifications` · `listNotificationsPreview` · `unreadNotificationsCount` · `markNotificationRead` · `markAllNotificationsRead` · `clearReadNotifications` · `clearNotifications`
→ `GET/POST /api/notifications` · `GET /api/notifications/avant-premiere` · `GET /api/notifications/non-lues` · `PUT /api/notifications/:id/lu` · `PUT /api/notifications/lues` · `DELETE /api/notifications/lues` (=tout lu) · `DELETE /api/notifications`.

**Règle gravée** (décision utilisateur) : toute action automatique est notifiée et journalisée ; tout rattachement incertain passe par l'écran de validation humaine.

### Réservations distantes + matching
| Méthode | Rôle |
|---|---|
| `upsertBookings(list)` | réception des réservations MEC — appelé par le **plugin WP** (server-to-server, secret) |
| `listUnprocessedBookings()` | file de validation (🧪 écran Formations) |
| `markBookingProcessed(id, action, memberId)` | traitements (linked/created/ignored/auto_linked) |
| `matchBookingToMember(booking)` | **matching hiérarchique : n° de membre > email exact (LOWER) > nom+prénom (candidats, jamais auto) > création** |
| `applyMirror()` | le site vend, l'app gère : désinscription locale auto quand la résa est annulée côté site — toujours notifiée |

→ `POST /api/bookings/upsert` (protégé par le secret du plugin) · `GET /api/bookings/non-traites` · `PUT /api/bookings/:id/traitement` · matching exécuté serveur.

### Salles, Suggestions, Tickets, Équipe
`listRooms/addRoom/renameRoom/deleteRoom` → `GET/POST/PUT/DELETE /api/salles` · `addSuggestion/listSuggestions/openSuggestionsCount/setSuggestionStatus` → `/api/suggestions` · `addTicket/getTicket/listTickets/updateTicket/deleteTicket/addTicketComment/listTicketComments` → `/api/tickets` (+ `/comments`) · `listTeamMembers/addTeamMember/deleteTeamMember` → `/api/equipe`.

### Agrégats (M5c — pages dashboard & statistiques)
| Rôle | Endpoint |
|---|---|
| dashboard en UN appel (KPI du jour/mois, agenda du jour, 6 visites récentes, impressions dues + top 3, tickets) | `GET /api/agregats/flot` |
| page Statistiques en UN appel (membres, visites/revenus, rétention, profil CP, motifs FRB, inclusion, statuts, cp_top10, genres, rapport annuel, heatmap 12 semaines, graphique 14 jours + 12 mois) | `GET /api/agregats/stats` |
| recherche globale topbar | `GET /api/recherche?q=…` (≥ 2 caractères) |

### Import / remplacement
`sauvegardeChiffree()` → `POST /api/base/sauvegarde` (AES-256-GCM, dépôt WebDAV Nextcloud, timer systemd 02:30). `replaceDatabase(fichier)` → `POST /api/base/remplacement` `{fichier_base64}` (JSON — `.db` SQLite ou `.aes` chiffré) — validation d'en-tête SQLite + `integrity_check`, adoption au redémarrage avec purge des `-wal`/`-shm` ; garde admin.

## Le schéma

Consolidé dans [`server/schema.sql`](../server/schema.sql) — 16 tables de la maquette, migrations historiques incluses. Une base de la maquette (export `.db`) doit s'ouvrir **telle quelle** sur le serveur.
