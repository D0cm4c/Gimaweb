# Gimaweb — l'app serveur de l'Atelier du web

**Version serveur** (produit final) de la gestion des membres, formations et inscriptions de l'[Atelier du web](https://atelierduweb.be) (EPN de Saint-Gilles) : **une seule base SQLite partagée**, servie aux postes de l'asbl en HTTP sur le réseau local.

> La maquette de développement reste sur GitHub Pages : [`D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web`](https://github.com/D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web) (labo). Le contrat de transmission entre les deux : [issue app #150](https://github.com/D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web/issues/150) + [docs/CONTRAT-API.md](docs/CONTRAT-API.md).

## Documentation

| Doc | Rôle |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Mémoire du projet (première lecture) |
| [`CHANGELOG.md`](CHANGELOG.md) | **Gimaweb v1.1.0** — versions, incrémentées à chaque mise en production |
| [`AGENTS.md`](AGENTS.md) | Règles pour les sessions IA |
| [`docs/CONCEPTION.md`](docs/CONCEPTION.md) | Phase de pré-production : architecture, options pesées, décisions figées / à valider, plan M0→M5 |
| [`docs/CONTRAT-API.md`](docs/CONTRAT-API.md) | Contrat de l'API REST (miroir de l'issue app #150) |
| [`server/schema.sql`](server/schema.sql) | Schéma SQLite consolidé (16 tables, base de départ) |
| [`docs/CHARTE-GRAPHIQUE.html`](docs/CHARTE-GRAPHIQUE.html) | La charte design qui fait foi |
| [`docs/ADMINISTRATION.md`](docs/ADMINISTRATION.md) | Installation serveur, systemd + sauvegarde nocturne 02:30, restauration |

## État du chantier (M6, fusionné)

Toutes les pages maquette sont migrées sur le client HTTP (`public/adw-client.js`) : **zéro SQL navigateur** — agrégats dashboard/stats calculés serveur, import XML Access (`POST /api/membres/import`), visites anonymes (1 €), sauvegarde chiffrée + restauration. Régression : **293/293** (`npm test`, 11 suites fonctionnelles en boucle locale).
