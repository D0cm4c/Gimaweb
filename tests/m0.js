// Test fonctionnel M0 (loopback unique) : démarrage réel du serveur + vérifications
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');

// base neuve pour un test reproductible
fs.rmSync('data-tests', { recursive: true, force: true });

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m0.db', PORT: '32123', ADMIN_HASH_SHA256: hash },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts) => {
    const r = await fetch(`http://127.0.0.1:32123${path}`, opts);
    let cookies = r.headers.get('set-cookie') || '';
    return { status: r.status, body: await r.json(), cookies };
};

const attente = async () => {
    for (let i = 0; i < 50; i++) {
        try { return await fetchApi('/api/sante'); } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error('serveur injoignable');
};

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`✅ ${label}`); } else { console.log(`❌ ${label}`, extra ?? ''); } };

try {
    const sante = await attente();
    verifie('GET /api/sante → 200 ok', sante.status === 200 && sante.body.status === 'ok', sante.body);
    verifie('salles seedées (3)', sante.body.salles === 3, sante.body.salles);

    const mauvaise = await fetchApi('/api/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'faux' }) });
    verifie('mauvais mot de passe → 401', mauvaise.status === 401);

    const bonne = await fetchApi('/api/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'chantier' }) });
    verifie('bon mot de passe → 200 + cookie', bonne.status === 200 && /gimaweb_session=/.test(bonne.cookies), bonne.cookies);

    const cookie = bonne.cookies.split(';')[0];
    const deco = await fetchApi('/api/auth/deconnexion', { method: 'POST', headers: { Cookie: cookie } });
    verifie('déconnexion → 200 + cookie effacé', deco.status === 200 && /Max-Age=0/.test(deco.cookies));

    const nonLivree = await fetchApi('/api/quelquechose');
    verifie('endpoint non livré → 501', nonLivree.status === 501);
} catch (e) {
    console.log('❌ échec du test :', e.message);
}
if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();

await new Promise(r => setTimeout(r, 300));
const Database = (await import('better-sqlite3')).default;
const db = new Database('data-tests/gimaweb-m0.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
verifie('19 tables créées (v1.5.12 : + settings)', tables.length === 19 && tables.includes('settings') && tables.includes('locations') && tables.includes('location_dates'), tables.join(','));
const salles = db.prepare('SELECT name, capacity FROM rooms ORDER BY sort_order').all();
verifie('salles 15/8/25', salles.map(s => s.capacity).join(',') === '15,8,25', JSON.stringify(salles));

console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
