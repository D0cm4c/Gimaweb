// Test fonctionnel M9 (v1.5.9) : HTTPS sur le LAN \u2014 certificat auto-sign\u00e9 g\u00e9n\u00e9r\u00e9 par tools/generer-certificat.sh,
// le serveur \u00e9coute en HTTPS quand TLS_CERT/TLS_KEY sont fournis et valides, et reste en HTTP sinon.
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certificat auto-signé du LAN — comme un poste qui accepte l'avertissement

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`\u2705 ${label}`); } else { console.log(`\u274c ${label}`, extra ?? ''); } };

// G\u00e9n\u00e9ration du certificat exactement comme tools/generer-certificat.sh (mais dans data-tests)
const REP = 'data-tests/certs';
fs.mkdirSync(REP, { recursive: true });
await new Promise((res, rej) => {
    const o = spawn('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
        '-keyout', `${REP}/key.pem`, '-out', `${REP}/cert.pem`,
        '-subj', '/CN=gimaweb.local/O=Atelier du web',
        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-addext', 'basicConstraints=critical,CA:FALSE',
        '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
        '-addext', 'extendedKeyUsage=serverAuth']);
    o.on('close', (c) => (c === 0 ? res() : rej(new Error('openssl exit ' + c))));
});
verifie('certificat auto-sign\u00e9 g\u00e9n\u00e9r\u00e9 (openssl)', fs.existsSync(`${REP}/cert.pem`) && fs.existsSync(`${REP}/key.pem`));

const ENV = (port, tls) => ({
    ...process.env, PORT: String(port), ADMIN_HASH_SHA256: hash,
    DB_PATH: 'data-tests/gimaweb-m9-https.db',
    WP_BASE: 'http://127.0.0.1:9/inconnu', ADW_LABELS_URL: 'http://127.0.0.1:9/inconnu',
    ...(tls ? { TLS_CERT: `${REP}/cert.pem`, TLS_KEY: `${REP}/key.pem` } : {})
});

const demarrer = (port, tls) => new Promise((resolve) => {
    const srv = spawn('node', ['server/serveur.js'], { env: ENV(port, tls), stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    srv.stdout.on('data', (d) => { sortie += d; });
    srv.stderr.on('data', (d) => { sortie += d; });
    const attente = async () => {
        for (let i = 0; i < 50; i++) {
            try {
                const r = await fetch(`http${tls ? 's' : ''}://127.0.0.1:${port}/api/sante`);
                if (r.ok) return resolve({ srv, sortie: () => sortie });
            } catch { /* en attente */ }
            await new Promise(r2 => setTimeout(r2, 100));
        }
        resolve({ srv, sortie: () => sortie, injoignable: true });
    };
    attente();
});

// ---- 1) Sans TLS : HTTP (comportement inchang\u00e9) ----
{
    const { srv, sortie: fsortie } = await demarrer(32140, false);
    verifie('sans TLS_CERT : serveur HTTP joignable', !fsortie().includes('TLS OK'));
    verifie('sans TLS_CERT : le boot annonce http://', fsortie().includes('http://0.0.0.0:32140'), fsortie().trim().split('\n')[0]);
    srv.kill();
}

// ---- 2) Avec TLS : HTTPS ----
{
    const { srv, sortie: fsortie, injoignable } = await demarrer(32141, true);
    await new Promise(r => setTimeout(r, 500)); // laisser le log de boot arriver dans le pipe stdout
    verifie('avec TLS_CERT : serveur HTTPS joignable', !injoignable, fsortie().slice(0, 200));
    verifie('avec TLS_CERT : le boot annonce https:// + TLS OK', fsortie().includes('https://0.0.0.0:32141') && fsortie().includes('TLS OK'), fsortie().trim().split('\n')[0]);
    // HTTP classique refus\u00e9 sur le m\u00eame port (il n\u2019y a plus d\u2019\u00e9coute en clair)
    let httpRepondu = false;
    try { const r = await fetch(`http://127.0.0.1:32141/api/sante`, { signal: AbortSignal.timeout(1500) }); httpRepondu = r.ok; } catch { /* attendu */ }
    verifie('avec TLS : pas de r\u00e9ponse HTTP en clair sur le port', !httpRepondu);
    // l\u2019API fonctionne en HTTPS (agent tol\u00e9rant l\u2019auto-sign\u00e9, comme un navigateur qui accepte l\u2019avertissement)
    const sante = await fetch('https://127.0.0.1:32141/api/sante');
    const corps = await sante.json();
    verifie('API /api/sante en HTTPS : 200 + version', sante.status === 200 && corps.version, corps);
    // connexion admin en HTTPS (le mot de passe ne voyage plus en clair sur le WiFi)
    const co = await fetch('https://127.0.0.1:32141/api/auth/connexion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'chantier' }),
    });
    verifie('connexion admin en HTTPS : 200 + cookie de session', co.status === 200 && (co.headers.get('set-cookie') || '').includes('gimaweb_session'), co.status);
    srv.kill();
}

// ---- 3) TLS configur\u00e9 mais fichier introuvable : repli HTTP + avertissement ----
{
    const srv = spawn('node', ['server/serveur.js'], { env: { ...ENV(32142, false), TLS_CERT: '/tmp/inexistant.pem', TLS_KEY: '/tmp/inexistant.pem' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    srv.stdout.on('data', (d) => { sortie += d; });
    srv.stderr.on('data', (d) => { sortie += d; });
    await new Promise(r => setTimeout(r, 1500));
    verifie('TLS introuvable : repli HTTP annonc\u00e9 explicitement', sortie.includes('repli HTTP'), sortie.trim().split('\n')[0]);
    srv.kill();
}

console.log(`\n${ok}/${tout} tests OK`);
setTimeout(() => process.exit(ok === tout ? 0 : 1), 300);
