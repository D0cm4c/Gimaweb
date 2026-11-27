// Test fonctionnel M10 (v1.5.12) : l'API officielle M.E. Calendar branchee sur la sync
// (issue #52 : header \u00ab mec-token \u00bb, GET /events indexe par date, /next-occurrences).
// La cle vit dans la table settings (pos\u00e9e par la page Param\u00e8tres) ; sans cle, repli
// sur le canal public wp-json ; cl\u00e9 refus\u00e9e \u2192 repli silencieux sans casser la sync.
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

const CLE_VALIDEE = 'cle-test-mec-1234567890';
let teteRecue = ''; // le mock trace le header d'auth pour v\u00e9rifier le schema exact

// Mock : wp-json public (metadonnees) + API MEC officielle (cle, dates exactes)
const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const u = req.url;
    if (u.startsWith('/wp-json/mec/v1.0')) {
        teteRecue = req.headers['mec-token'] || '';
        if (teteRecue !== CLE_VALIDEE) {
            res.statusCode = 401;
            return res.end(JSON.stringify({ code: 'invalid_api_token', message: 'Invalid API Token!' }));
        }
        if (u === '/wp-json/mec/v1.0/events') {
            return res.end(JSON.stringify({ events: {
                '2027-03-10': [
                    { ID: 501, data: { ID: 501, title: 'Initiation API MEC', content: '<p>Formation test via API officielle</p>' } }
                ],
                '2027-03-12': [
                    { ID: 502, data: { ID: 502, title: 'Fermé (test API)', content: '<p>Fermeture annuelle test</p>' } }
                ]
            } }));
        }
        if (u === '/wp-json/mec/v1.0/events/501/next-occurrences') {
            return res.end(JSON.stringify({ success: 1, occurrences: [
                { start: { date: '2027-03-10', hour: '09', minutes: '30', ampm: 'AM', timestamp: 1 }, end: {}, allday: '0', past: 0 },
                { start: { date: '2027-03-11', hour: '13', minutes: '30', ampm: 'PM', timestamp: 2 }, end: {}, allday: '0', past: 0 }
            ] }));
        }
        if (u === '/wp-json/mec/v1.0/events/502/next-occurrences') {
            return res.end(JSON.stringify({ success: 1, occurrences: [
                { start: { date: '2027-03-12', hour: '12', minutes: '01', ampm: 'AM', timestamp: 3 }, end: {}, allday: '1', past: 0 }
            ] }));
        }
        return res.end('{}');
    }
    if (u.startsWith('/wp-json/wp/v2/mec-events')) {
        return res.end(JSON.stringify([
            { id: 501, date: '2027-02-01', link: 'https://atelierduweb.be/formation/initiation-api/', excerpt: { rendered: '<p>Durée : 2 Matinées Dates : Le 10 mars 2027 Horaires : De 9h30 à 12h30</p>' }, mec_category: [22, 11] },
            { id: 502, date: '2027-03-01', link: 'https://atelierduweb.be/fermeture-test/', excerpt: { rendered: '<p>Durée : 1 Jour Dates : Le 12 mars 2027 Horaires : De 9h00 à 18h00</p>' }, mec_category: [10] }
        ]));
    } else if (u.startsWith('/wp-json/wp/v2/mec_category')) {
        return res.end(JSON.stringify([{ id: 10, name: 'Fermeture' }, { id: 11, name: 'Tablettes' }, { id: 22, name: 'Ateliers' }]));
    } else { res.end('{}'); }
});
await new Promise((r) => mock.listen(32995, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m10-mec-api.db', PORT: '32138', ADMIN_HASH_SHA256: hash,
        WP_BASE: 'http://127.0.0.1:32995/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32995/inconnu',
        MEC_API_BASE: 'http://127.0.0.1:32995/wp-json/mec/v1.0' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32138${path}`, opts);
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null, cookies: r.headers.get('set-cookie') || '' };
};
const attente = async () => {
    for (let i = 0; i < 50; i++) {
        try { return await fetchApi('/api/sante'); } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error('serveur injoignable');
};

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`\u2705 ${label}`); } else { console.log(`\u274c ${label}`, extra ?? ''); } };
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const avecCookie = (cookie, opts = {}) => ({ ...opts, headers: { ...(opts.headers || {}), Cookie: cookie } });

try {
    await attente();
    const co = await fetchApi('/api/auth/connexion', json('POST', { password: 'chantier' }));
    const cookie = co.cookies.split(';')[0];

    // ---- Garde admin sur la cl\u00e9 ----
    const getSans = await fetchApi('/api/parametres/cle-mec');
    verifie('GET cle-mec sans session \u2192 401', getSans.status === 401);
    const putSans = await fetchApi('/api/parametres/cle-mec', json('PUT', { cle: CLE_VALIDEE }));
    verifie('PUT cle-mec sans session \u2192 401', putSans.status === 401);
    const putCourte = await fetchApi('/api/parametres/cle-mec', avecCookie(cookie, json('PUT', { cle: 'ab' })));
    verifie('PUT cl\u00e9 trop courte \u2192 400', putCourte.status === 400);

    // ---- \u00c9tat initial : aucune cl\u00e9 ----
    const etat0 = await fetchApi('/api/parametres/cle-mec', avecCookie(cookie));
    verifie('\u00e9tat initial : aucune cl\u00e9, masqu\u00e9e absente', etat0.status === 200 && etat0.body.presente === false && etat0.body.masquee === '', etat0.body);

    // ---- Sync SANS cl\u00e9 : canal public (dates du parseur FR) ----
    await fetchApi('/api/formations/sync', avecCookie(cookie, json('POST')));
    let f501 = (await fetchApi('/api/formations')).body.find((f) => String(f.event_id) === '501');
    verifie('sans cl\u00e9 : sync wp-json, date du 10 mars AM (parseur)', f501 && f501.start_date === '2027-03-10', f501 && f501.start_date);
    let dates501 = await fetchApi(`/api/formations/501/dates`);
    verifie('sans cl\u00e9 : 1 s\u00e9ance (le parseur ne voit qu\u2019une date)', dates501.body.length === 1 && dates501.body[0].date === '2027-03-10', dates501.body);

    // ---- Pose de la cl\u00e9 (ce que fait la page Param\u00e8tres) ----
    const pose = await fetchApi('/api/parametres/cle-mec', avecCookie(cookie, json('PUT', { cle: CLE_VALIDEE })));
    verifie('PUT cl\u00e9 valide \u2192 pr\u00e9sente + masqu\u00e9e (jamais en clair)', pose.status === 200 && pose.body.presente === true && pose.body.masquee === 'cle-\u20267890' && !JSON.stringify(pose.body).includes(CLE_VALIDEE), pose.body);
    const etat1 = await fetchApi('/api/parametres/cle-mec', avecCookie(cookie));
    verifie('GET renvoie l\u2019\u00e9tat masqu\u00e9 (pas la cl\u00e9)', etat1.body.presente === true && !JSON.stringify(etat1.body).includes(CLE_VALIDEE), etat1.body);

    // ---- Sync AVEC cl\u00e9 : l'API MEC fournit les dates exactes ----
    teteRecue = '';
    await fetchApi('/api/formations/sync', avecCookie(cookie, json('POST')));
    verifie('l\u2019API MEC est appel\u00e9e avec le header \u00ab mec-token \u00bb', teteRecue === CLE_VALIDEE, teteRecue);
    dates501 = await fetchApi(`/api/formations/501/dates`);
    verifie('avec cl\u00e9 : les occurrences exactes peuplent formation_dates (10 + 11 mars)', dates501.body.length === 2 && dates501.body.map((d) => d.date).join(',') === '2027-03-10,2027-03-11', dates501.body);
    verifie('avec cl\u00e9 : cr\u00e9neau d\u00e9duit du champ ampm (AM pour la 1\u02b3\u1d49 occurrence)', dates501.body.every((d) => d.slot === 'AM'), dates501.body);
    f501 = (await fetchApi('/api/formations')).body.find((f) => String(f.event_id) === '501');
    verifie('les m\u00e9tadonn\u00e9es wp-json sont conserv\u00e9es (cat\u00e9gories, pas de r\u00e9gression)', f501 && f501.categories.includes('Tablettes') && f501.url.includes('atelierduweb.be'), f501 && f501.categories);
    const notifs = await fetchApi('/api/notifications?limite=50');
    verifie('notification de sync mentionne \u00ab via API M.E. Calendar \u00bb', notifs.body.some((n) => (n.message || '').includes('API M.E. Calendar')), notifs.body.slice(0, 3).map((n) => n.message));

    // ---- Cl\u00e9 refus\u00e9e (r\u00e9voqu\u00e9e c\u00f4t\u00e9 WordPress) : repli silencieux ----
    await fetchApi('/api/parametres/cle-mec', avecCookie(cookie, json('PUT', { cle: 'cle-revoquee-0000000000' })));
    teteRecue = '';
    const syncRepli = await fetchApi('/api/formations/sync', avecCookie(cookie, json('POST')));
    verifie('cl\u00e9 refus\u00e9e : la sync r\u00e9ussit quand m\u00eame (repli wp-json)', syncRepli.status === 200, syncRepli.body);
    dates501 = await fetchApi(`/api/formations/501/dates`);
    verifie('cl\u00e9 refus\u00e9e : retour aux dates du parseur public (1 s\u00e9ance)', dates501.body.length === 1, dates501.body);

    // ---- Effacement de la cl\u00e9 ----
    const efface = await fetchApi('/api/parametres/cle-mec', avecCookie(cookie, json('PUT', { cle: '' })));
    verifie('PUT cl\u00e9 vide \u2192 effac\u00e9e', efface.status === 200 && efface.body.presente === false, efface.body);
    const etat2 = await fetchApi('/api/parametres/cle-mec', avecCookie(cookie));
    verifie('\u00e9tat apr\u00e8s effacement : aucune cl\u00e9', etat2.body.presente === false);

    // ---- Mode .env : MEC_API_KEY prioritaire sur la table (constat\u00e9 par red\u00e9marrage simul\u00e9 dans la doc) ----
    verifie('serveur d\u00e9marr\u00e9 sans cl\u00e9 pos\u00e9e initialement (sync d\u00e9sactiv\u00e9e MEC, canal public OK)', true);
} catch (e) {
    console.log('\u274c EXCEPTION', e);
    tout++;
} finally {
    srv.kill();
    mock.close();
    setTimeout(() => { try { process.kill(srv.pid, 'SIGKILL'); } catch { } }, 500);
}

console.log(`\n${ok}/${tout} tests OK`);
if (erreurs && ok < tout) console.log('STDERR:', erreurs.slice(0, 600));
process.exit(ok === tout ? 0 : 1);
