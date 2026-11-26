# Administration du serveur Gimaweb (Ubuntu)

Guide de déploiement et d'exploitation sur le portable Ubuntu Server de l'Atelier du web, conforme au brief maquette → serveur (issue app #150, §5).

## 1. Installation (première fois)

```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Le dépôt (pull deployment — le serveur ne pousse JAMAIS sur GitHub)
sudo mkdir -p /opt/gimaweb && sudo chown $USER /opt/gimaweb
git clone https://github.com/D0cm4c/Gimaweb.git /opt/gimaweb
cd /opt/gimaweb && npm ci

# Configuration
cp .env.exemple .env && nano .env
# ADMIN_HASH_SHA256 : echo -n "ton-mot-de-passe" | sha256sum
# BOOKINGS_SECRET :secret server-to-server du plugin WP ADW MEC API
# BACKUP_PASSPHRASE : phrase de passe de sauvegarde (refus de sauvegarder sans elle)

# La base et les sauvegardes vivant hors du dépôt :
mkdir -p data data/sauvegardes
```

## 2. Service systemd

`/etc/systemd/system/gimaweb.service` :

```ini
[Unit]
Description=Gimaweb — gestion Atelier du web (SQLite LAN)
After=network.target

[Service]
WorkingDirectory=/opt/gimaweb
ExecStart=/usr/bin/node server/serveur.js
EnvironmentFile=/opt/gimaweb/.env
Restart=on-failure
User=adw

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gimaweb
```

Les postes accèdent à l'app sur `http://<ip-lan>:3000` (décision figée n° 4).

## 3. Sauvegarde nocturne chiffrée (décision figée n° 2)

`/etc/systemd/system/gimaweb-sauvegarde.service` :

```ini
[Unit]
Description=Sauvegarde chiffrée Gimaweb (SQLite → AES-256-GCM → Nextcloud)

[Service]
Type=oneshot
WorkingDirectory=/opt/gimaweb
EnvironmentFile=/opt/gimaweb/.env
ExecStart=/usr/bin/node server/sauvegarde.js
User=adw
```

`/etc/systemd/system/gimaweb-sauvegarde.timer` :

```ini
[Unit]
Description=Sauvegarde nocturne Gimaweb

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now gimaweb-sauvegarde.timer
# Test immédiat : systemctl start gimaweb-sauvegarde.service && journalctl -u gimaweb-sauvegarde
```

Fichiers produits : `BACKUP_DIR/gimaweb-AAAA-MM-JJ-HHmm.db.aes` + export WebDAV Nextcloud. Le snapshot passe par l'API `.backup` de better-sqlite3 (cohérent même en service). Un `POST /api/base/sauvegarde` (session admin) déclenche la même chose à la demande.

## 4. Mise à jour (pull deployment)

```bash
cd /opt/gimaweb
git pull
npm ci                  # si package-lock.json a changé
sudo systemctl restart gimaweb
```

## 5. Restauration d'une base (remplacement)

1. Déchiffrer hors ligne :
   ```bash
   node --input-type=module -e "import { dechiffrer } from './server/sauvegarde.js'; import fs from 'fs'; fs.writeFileSync('restauration.db', dechiffrer(fs.readFileSync('<fichier>.db.aes'), process.env.BACKUP_PASSPHRASE));"
   ```
   Ou passer par l'app : `POST /api/base/remplacement {fichier_base64}` (session admin).
2. Le serveur **valide** d'abord (`integrity_check`, jamais de base cassée en place), dépose le candidat, et **l'adopte au redémarrage suivant** : `sudo systemctl restart gimaweb`.
3. Les fichiers WAL/SHM résiduels sont purgés à l'adoption (sinon l'ancienne base rejouerait ses transactions par-dessus la restaurée).

## HTTPS sur le LAN (v1.5.9)

L'app est servie aux postes en WiFi : sans HTTPS, le mot de passe admin et les
données membres circulent en clair sur le réseau. Le serveur écoute donc en
**HTTPS dès que le certificat existe**.

Mise en place (une fois, sur la machine serveur) :

1. `./tools/generer-certificat.sh` — génère `data/certs/gimaweb-cert.pem` + `gimaweb-key.pem`
   (auto-signé, 10 ans, SAN : localhost + l'IP LAN de la machine ; jamais committés).
2. Dans `.env` : `TLS_CERT=data/certs/gimaweb-cert.pem` et `TLS_KEY=data/certs/gimaweb-key.pem`.
3. `systemctl restart gimaweb` — le log de boot doit annoncer `https://… TLS OK`.

Sur les postes : accepter l'avertissement « certificat auto-signé » (ou importer
`data/certs/gimaweb-cert.pem` dans les autorités de confiance du poste pour ne
plus le voir). Renouvellement : relancer le script puis redémarrer.

Sans certificat (ou fichiers introuvables), le serveur reste en HTTP et le
signale au boot — utile en développement, à éviter en production WiFi.
