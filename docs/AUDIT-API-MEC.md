# Audit de l'API M.E. Calendar — payloads réels observés (27 nov. 2026)

Clé de test temporaire fournie par le porteur ; dump complet dans `.vibe/mec-audit/` (hors git).
Outil : `node tools/audit-mec-api.cjs <clé>`.

## 1. Auth
- Header **`mec-token: <clé>`** — seule méthode valide (Bearer, token, X-Api-Token, ?key= tous rejetés).
- Mauvaise clé → HTTP 500 `{"code":"invalid_api_token"}` (500, pas 401 !).

## 2. `GET /events` — structure RÉELLE (≠ celle supposée en v1.5.12 !)
```json
{
  "events": {
    "2026-11-30": [
      {
        "ID": 10936,
        "date": { "start": {"date":"2026-11-30","hour":"09","minutes":"30","ampm":"AM","timestamp":…},
                  "end":   {"date":"2026-11-30","hour":"12","minutes":"30","ampm":"PM","timestamp":…} },
        "data": {
          "title": "…", "content": "HTML…", "permalink": "https://…",
          "meta": { "mec_location_id":"24", "mec_organizer_id":"192", "mec_cost":"15",
                    "mec_allday":"0", "mec_date":{…}, "mec_event_status":… },
          "mec": { "days": "2026-11-10:2026-11-10:09-30-AM:12-30-PM,…" },
          "time": { "start":"9h30", "end":"12h30" },
          "tickets": { "1": {"name":"…","price":"15","price_label":"15€"}, … },
          "categories": {"id":{"name":"Formations"}},
          "labels":     {"id":{"name":"Niveau débutant","color":"#…"}},
          "locations":  {"24":{"name":"L'Atelier du web","address":"37 Rue du Fort, 1060 Saint-Gilles"}},
          "organizers": {"192":{"name":"Quentin Garchi","email":"…","url":"/equipe/…","thumbnail":"https://…"}},
          "color": "d63017", "featured_image": …, "tags": …
        }
      }
    ]
  },
  "pagination": {"next_date":"2026-12-15","next_offset":1,"has_more_events":true,"found":12}
}
```
**⚠ La racine est `events` DIRECTEMENT — pas de wrapper `data`** (le code v1.5.12 parse `data.events` → ne voit RIEN de la vraie API ; le mock m10 était calé sur la mauvaise structure).

**⚠ Pagination cassée côté plugin** : `?start=&offset=` est IGNORÉ (payload identique à chaque page). `found:12` compte les items date×event, pas les events uniques (9 vus). Un seul `GET /events` suffit ; ne PAS suivre `has_more_events` (boucle infinie).

## 3. `GET /events/:id/next-occurrences`
```json
{ "success":1, "occurrences":[ { "start":{"date":"2026-11-30","hour":"09","minutes":"30","ampm":"AM","timestamp":…},
  "end":{"date":"2026-11-30","hour":"12","minutes":"30","ampm":"PM","timestamp":…},
  "allday":"0", "hide_time":"0", "past":0 } ] }
```
- Occurrences **futures seulement** (`past:0`). Les dates passées n'y figurent pas → pour les 20 formations passées, garder `data.mec.days` (liste complète, y compris passées : `YYYY-MM-DD:YYYY-MM-DD:HH-MM-AM:HH-MM-PM`) ou le canal wp-json.
- Chaque occurrence de `/events` (racine, clé date) = une occurrence ; un même ID apparaît sous plusieurs dates (ex. 10934 : 08 + 10 déc.).

## 4. Les champs qui manquaient à formation.html
| Champ Gimaweb | Source API MEC | Détail |
|---|---|---|
| **Tarif** | `data.meta.mec_cost` (ex. "15") | + `data.tickets` : tarifs multiples nommés (CPAS 5€, ateliers 5€, formations 30/40€) |
| **Lieu** | `data.locations[id].name` | « L'Atelier du web » (id 24, 37 Rue du Fort) — PAS encore de GS/PS distincts sur les events actuels |
| **Organisateur** | `data.organizers[id].name` + email + photo + url fiche | Quentin Garchi (192), Matthieu de Cartier d'Yves (190) — alimente la carte Formateurs |
| **Catégories** | `data.categories` + `data.labels` | Ateliers / Formations / Evènement + labels (Fermeture id 74 #ff3a3a, Niveau débutant, Truc&Astuces, Smartphone, Permanence) |
| **Dates** | `next-occurrences` (futur) + `data.mec.days` (complet) | `start.date` ISO + `ampm` + `allday` + `past` |
| **Couleur** | `data.color` / `mec_color` | ex. d63017 |
| **Permalien** | `data.permalink` | |

**⚠ Entités HTML dans les titres** : `l&rsquo;` apparaît tel quel (`Maîtriser les fonctions avancées de l&rsquo;IA`) → décoder (`&rsquo; &amp; &#8211; &hellip;`…) avant stockage — c'est le bug « caractères spéciaux ».

## 5. Endpoints secondaires
- `GET /events/:id` → 200, payload single (même structure).
- `GET /config/custom-fields` → `{"success":1,"fields":[]}` — **le champ « Numéro de membre (Optionnel) » n'est PAS encore sorti côté WP** (à surveiller).
- `config/locations|organizers|categories|labels|payment-gateways` → **404 rest_no_route** (n'existent pas dans ce plugin ; les noms vivent dans chaque event).

## 6. Décisions de sync qui en découlent (proposées)
1. Corriger `fetchViaApiMec` : racine `events`, dédup par ID, **un seul GET** (ignorer la pagination du plugin), puis `next-occurrences` par ID.
2. Lieu/tarif/organisateur/catégories/labels/couleur : depuis `data` MEC (prioritaire), fusion avec wp-json en secours.
3. Decoder les entités HTML partout (titre, contenu).
4. Fermetures : label `Fermeture` (id 74) — déjà géré via catégories, mais `labels` est plus fiable.
5. GS/PS : les locations « GS - Atelier du web » / « PS - Atelier du web » n'existent pas encore sur les events réels ; le mécanisme `locations[id].name` est prêt à les capter dès qu'un éditeur les utilisera.
