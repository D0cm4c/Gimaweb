// Test fonctionnel M1-a : membres (CRUD, n° auto, renouvellement, cascade RGPD)
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data', { recursive: true, force: true });

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, PORT: '32124', ADMIN_HASH_SHA256: hash },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32124${path}`, opts);
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null, cookies: r.headers.get('set-cookie') || '' };
};
const attente = async () => {
    for (let i = 0; i < 50; i++) {
        try { return await fetchApi('/api/sante'); } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error('serveur injoignable');
};

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`✅ ${label}`); } else { console.log(`❌ ${label}`, extra ?? ''); } };
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

try {
    await attente();

    // Connexion admin (pour test DELETE)
    const co = await fetchApi('/api/auth/connexion', json('POST', { password: 'chantier' }));
    const cookie = co.cookies.split(';')[0];

    const cree = await fetchApi('/api/membres', json('POST', { first_name: ' Léa ', last_name: 'Dubois', age: 34, subscription: 'yearly', start_date: '2026-01-15', end_date: '2026-12-31', email: 'lea@example.org' }));
    verifie('POST /api/membres → 201, n° 1000, nom trimé', cree.status === 201 && cree.body.member_no === 1000 && cree.body.first_name === 'Léa', cree.body);
    verifie('first_start_date figé à la création', cree.body.first_start_date === '2026-01-15', cree.body.first_start_date);

    const cree2 = await fetchApi('/api/membres', json('POST', { first_name: 'Marc', last_name: 'Nguyen', subscription: 'monthly', start_date: '2026-11-23', end_date: '2026-12-23' }));
    verifie('POST 2e membre → n° 1001', cree2.status === 201 && cree2.body.member_no === 1001, cree2.body.member_no);

    const invalide = await fetchApi('/api/membres', json('POST', { first_name: '', last_name: 'X' }));
    verifie('POST sans prénom → 400', invalide.status === 400, invalide.body);

    const mauvaiseAbo = await fetchApi('/api/membres', json('POST', { first_name: 'A', last_name: 'B', subscription: 'viager' }));
    verifie('POST formule invalide → 400', mauvaiseAbo.status === 400, mauvaiseAbo.body);

    const liste = await fetchApi('/api/membres');
    verifie('GET /api/membres → 2 membres enrichis', liste.status === 200 && liste.body.length === 2 && liste.body[0].visit_count === 0, liste.body.length);

    const modif = await fetchApi(`/api/membres/${cree.body.id}`, json('PUT', { phone: '024567890', social_status: 'cpas' }));
    verifie('PUT /api/membres/:id → téléphone + statut social', modif.status === 200 && modif.body.phone === '024567890' && modif.body.social_status === 'cpas', modif.body);

    const inexistant = await fetchApi('/api/membres/mb-inexistant', json('PUT', { phone: 'x' }));
    verifie('PUT membre inexistant → 404', inexistant.status === 404);

    const preview = await fetchApi(`/api/membres/${cree.body.id}/renouvellement`);
    const ajd = new Date().toISOString().slice(0, 10);
    const actif = '2026-12-31' >= ajd;
    verifie('GET renouvellement : aperçu sans écriture',
        preview.status === 200 &&
        preview.body.actif === actif &&
        (actif ? preview.body.nouveau_debut === '2027-01-01' : preview.body.nouveau_debut === ajd) &&
        preview.body.nouvelle_fin.startsWith(actif ? '2027' : ''),
        preview.body);

    const avant = await fetchApi(`/api/membres/${cree.body.id}`);
    const renouv = await fetchApi(`/api/membres/${cree.body.id}/renouvellement`, json('POST', {}));
    verifie('POST renouvellement fige first_start_date et bouge le cycle',
        renouv.status === 200 &&
        renouv.body.nouvelle_fin !== avant.body.end_date &&
        avant.body.first_start_date === '2026-01-15', renouv.body);
    const apres = await fetchApi(`/api/membres/${cree.body.id}`);
    verifie('cycle déplacé après renouvellement', apres.body.end_date === renouv.body.nouvelle_fin, apres.body.end_date);

    // Cascade RGPD : semer visites/impressions/liens puis supprimer
    const Database = (await import('better-sqlite3')).default;
    const dbDirect = new Database('data/gimaweb.db');
    dbDirect.prepare('INSERT INTO visits (id, member_id, visit_date, amount) VALUES (?, ?, ?, ?)').run('v-test', cree.body.id, '2026-11-20', 1);
    dbDirect.prepare('INSERT INTO prints (id, member_id, print_date, type, amount) VALUES (?, ?, ?, ?, ?)').run('p-test', cree.body.id, ajd, 'bw', 0.5);
    dbDirect.prepare('INSERT INTO formations (id, title) VALUES (?, ?)').run('f-test', 'Formation test');
    dbDirect.prepare('INSERT INTO formations_members (id, formation_id, member_id) VALUES (?, ?, ?)').run('fm-test', 'f-test', cree.body.id);
    dbDirect.close();

    const delSans = await fetchApi(`/api/membres/${cree.body.id}`, { method: 'DELETE' });
    verifie('DELETE sans session → 401', delSans.status === 401);

    const del = await fetchApi(`/api/membres/${cree.body.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    verifie('DELETE avec session → 204', del.status === 204, del.body);
    const db2 = new Database('data/gimaweb.db');
    const restants = {
        visits: db2.prepare('SELECT COUNT(*) n FROM visits WHERE member_id = ?').get(cree.body.id).n,
        prints: db2.prepare('SELECT COUNT(*) n FROM prints WHERE member_id = ?').get(cree.body.id).n,
        fm: db2.prepare('SELECT COUNT(*) n FROM formations_members WHERE member_id = ?').get(cree.body.id).n,
        membre: db2.prepare('SELECT COUNT(*) n FROM members WHERE id = ?').get(cree.body.id).n
    };
    db2.close();
    verifie('cascade RGPD complète (visits, prints, liens, membre)', restants.visits === 0 && restants.prints === 0 && restants.fm === 0 && restants.membre === 0, restants);

    const nonLivree = await fetchApi('/api/inconnu');
    verifie('endpoint inconnu → 501', nonLivree.status === 501);
} catch (e) {
    console.log('❌ échec du test :', e.message);
}
if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
await new Promise(r => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
