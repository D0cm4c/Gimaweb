# AGENTS.md — Instructions pour toute session d'assistance (IA/agent) sur Gimaweb

> ⚠️ **Première action obligatoire : lire [`CONTEXT.md`](CONTEXT.md)** (mémoire du projet), puis [`docs/CONCEPTION.md`](docs/CONCEPTION.md) et [`docs/CONTRAT-API.md`](docs/CONTRAT-API.md).
> Ce dépôt est le **produit final serveur** ; la maquette GitHub Pages (`D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web`) est la source du contrat (issue app #150).

## Workflow

1. Lire `CONTEXT.md`, `docs/CONCEPTION.md`, `docs/CONTRAT-API.md`.
2. Vérifier `git status`, `git log`, les PRs et les issues ouvertes (ce dépôt + les issues `pour-serveur` du dépôt app).
3. **Aucun code métier tant que les décisions marquées ⚠️ dans CONCEPTION.md §5 ne sont pas figées** (skill pre-production : conception avant code).
4. Livraison : branche `vibe/<slug>`, commits en français préfixés (`feat:`, `fix:`, `docs:`, `perf:`), PR draft puis ready. La fusion est faite par le propriétaire (« go »).
5. `CONTEXT.md` mis à jour dans la même PR que le travail livré (état, historique, leçons).

## Architectures et conventions (figées)

- Node 22 LTS + Express + better-sqlite3 (WAL), schéma dans `server/schema.sql` — une base maquette doit s'ouvrir telle quelle.
- Le frontend ne fait jamais de SQL par le réseau : l'API expose des endpoints métier (contrat CONTRAT-API.md), pas de SQL brut.
- Requêtes toujours paramétrées ; IDs TEXT (uuid) comme dans la maquette.
- Pull deployment : le serveur ne pousse jamais sur GitHub ; aucun secret côté serveur dans le dépôt (`.env` gitignoré).
- Design : la charte `docs/CHARTE-GRAPHIQUE.html` fait foi (exigence du brief app #150).

## Interdits

- Commettre des secrets, des données membres réelles, ou la base `.db`.
- Casser la compatibilité du schéma maquette (une base exportée de la maquette doit marcher).
- Prendre une décision de conception en silence : 2–4 options à l'utilisateur.

## Vérifications par PR

- `node --check` sur les JS ajoutés/modifiés.
- La CI (à créer en M0) rejouera : syntaxe, démarrage serveur, `/api/sante`, ouverture du schéma sur base vierge.
