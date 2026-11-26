#!/bin/sh
# Gimaweb - certificat TLS auto-sign pour le LAN (WiFi de l'EPN).
# Le trafic passe en HTTPS : le mot de passe admin ne voyage plus en clair sur le reseau.
# Usage : ./tools/generer-certificat.sh [IP-LAN]    (defaut : IP courante de la machine)
# Les fichiers sont ecrits dans data/certs/ (gitignore - jamais committes).
# Validite : 10 ans. Renouvelle : relance ce script et redemarre le service.
set -e
IP="${1:-$(hostname -I | awk '{print $1}')}"
REP="$(dirname "$0")/../data/certs"
mkdir -p "$REP"
echo "[certificat] IP/SAN : $IP (localhost + 127.0.0.1 inclus)"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$REP/gimaweb-key.pem" -out "$REP/gimaweb-cert.pem" \
  -subj "/CN=gimaweb.local/O=Atelier du web" \
  -addext "subjectAltName=DNS:localhost,DNS:gimaweb.local,IP:127.0.0.1,IP:$IP" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
chmod 600 "$REP/gimaweb-key.pem"
echo "[certificat] OK : $REP/gimaweb-cert.pem + gimaweb-key.pem"
echo "[certificat] Ajoute dans .env :"
echo "  TLS_CERT=$REP/gimaweb-cert.pem"
echo "  TLS_KEY=$REP/gimaweb-key.pem"
echo "[certificat] Puis : systemctl restart gimaweb"
echo "[certificat] Sur les postes : accepte l'avertissement 'certificat auto-signe'"
echo "              (ou importe gimaweb-cert.pem dans l'autorite de confiance du poste)."
