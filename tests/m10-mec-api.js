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
            // Structure RÉELLE observée (docs/AUDIT-API-MEC.md, 27 nov. 2026) :
            // racine « events » indexée par date, items {ID, date, data:{title, content, permalink,
            // meta:{mec_cost, mec_location_id, mec_organizer_id, mec_allday}, mec:{days}, time,
            // tickets, categories, labels, locations, organizers}} + pagination (ignorée : un seul GET).
            return res.end(JSON.stringify({
                events: {
                    '2027-03-10': [{
                        ID: 501,
                        date: { start: { date: '2027-03-10', hour: '09', minutes: '30', ampm: 'am', timestamp: 1 }, end: {} },
                        data: {
                            ID: 501, title: 'Initiation à l&rsquo;API MEC', content: '<p>Formation test via API officielle</p>',
                            permalink: 'https://atelierduweb.be/formation/initiation-api-mec/',
                            meta: { mec_cost: '15', mec_location_id: '24', mec_organizer_id: '190', mec_allday: '0' },
                            mec: { days: '2026-06-01:2026-06-01:09-30-AM:12-30-PM,2027-03-10:2027-03-10:09-30-AM:12-30-PM,2027-03-11:2027-03-11:01-30-PM:04-30-PM,' },
                            time: { start: '9h30', end: '12h30' },
                            tickets: { '1': { name: 'R\u00e9duction CPAS', price: '5' }, '2': { name: 'Formation (15\u20ac)', price: '15' } },
                            categories: { '22': { id: 22, name: 'Ateliers' } },
                            labels: { '73': { id: 73, name: 'Niveau débutant' } },
                            locations: { '24': { id: 24, name: "L'Atelier du web", address: '37 Rue du Fort' } },
                            organizers: { '190': { id: 190, name: 'Matthieu de Cartier d\u2019Yves', email: 'test@stgilles.brussels', url: '/equipe/matthieu/' } }
                        }
                    }],
                    '2027-03-12': [{
                        ID: 502,
                        date: { start: { date: '2027-03-12', hour: '08', minutes: '00', ampm: 'am', timestamp: 3 }, end: {} },
                        data: {
                            ID: 502, title: 'Fermé (test API)', content: '<p>Fermeture annuelle test</p>',
                            permalink: 'https://atelierduweb.be/formation/fermeture-test-api/',
                            meta: { mec_cost: '', mec_location_id: '1', mec_organizer_id: '1', mec_allday: '1' },
                            mec: { days: '2027-03-12:2027-03-12:08-00-AM:06-00-PM' },
                            time: { start: 'Journée entière', end: '' },
                            tickets: {},
                            categories: { '10': { id: 10, name: 'Fermeture' }, '45': { id: 45, name: 'Evènement' } },
                            labels: { '74': { id: 74, name: 'Fermeture', color: '#ff3a3a' } },
                            locations: { '1': { id: 1, name: 'L\u2019Atelier du web' } },
                            organizers: { '1': { id: 1, name: 'Atelier du web' } }
                        }
                    }],
                    '2027-03-20': [{
                        ID: 503, // présent UNIQUEMENT dans l'API MEC (pas dans wp-json)
                        date: { start: { date: '2027-03-20', hour: '13', minutes: '30', ampm: 'pm', timestamp: 9 }, end: {} },
                        data: {
                            ID: 503, title: 'Repair Café spécial API', content: '<p>Permanence test</p>',
                            permalink: 'https://atelierduweb.be/formation/repair-api/',
                            meta: { mec_cost: '0', mec_location_id: '24', mec_organizer_id: '190', mec_allday: '0' },
                            mec: { days: '2027-03-20:2027-03-20:01-30-PM:04-30-PM' },
                            time: { start: '13h30', end: '16h30' },
                            tickets: {},
                            categories: { '22': { id: 22, name: 'Ateliers' } },
                            labels: { '75': { id: 75, name: 'Permanence' } },
                            locations: { '24': { id: 24, name: "L'Atelier du web" } },
                            organizers: { '190': { id: 190, name: 'Matthieu de Cartier d\u2019Yves' } }
                        }
                    }]
                },
                pagination: { next_date: '2027-03-20', next_offset: 1, has_more_events: true, found: 3 }
            }));
        }
        if (u === '/wp-json/mec/v1.0/events/503/next-occurrences') {
            return res.end(JSON.stringify({ success: 1, occurrences: [
                { start: { date: '2027-03-20', hour: '01', minutes: '30', ampm: 'PM', timestamp: 9 }, end: {}, allday: '0', past: 0 }
            ] }));
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
    verifie('avec cl\u00e9 : s\u00e9ances COMPL\u00c8TES (next-occurrences \u222a mec.days, y compris pass\u00e9e)', dates501.body.length === 3 && dates501.body.map((d) => d.date).join(',') === '2026-06-01,2027-03-10,2027-03-11', dates501.body);
    verifie('avec cl\u00e9 : cr\u00e9neau d\u00e9duit du champ ampm (AM pour la 1\u02b3\u1d49 occurrence)', dates501.body.every((d) => d.slot === 'AM'), dates501.body);
    f501 = (await fetchApi('/api/formations')).body.find((f) => String(f.event_id) === '501');
    verifie('titre : entit\u00e9s HTML d\u00e9cod\u00e9es (rsquo \u2192 apostrophe typographique)', f501 && f501.title.includes('l\u2019API') && !f501.title.includes('&rsquo;'), f501 && f501.title);
    verifie('tarif depuis meta.mec_cost (priorit\u00e9 API MEC)', f501 && Number(f501.price) === 15, f501 && f501.price);
    verifie('lieu depuis locations[id].name', f501 && /Atelier du web/i.test(f501.location || ''), f501 && f501.location);
    verifie('organisateur depuis organizers[id].name', f501 && /Matthieu/i.test(f501.organizer || ''), f501 && f501.organizer);
    verifie('labels depuis data.labels', f501 && (f501.labels || '').includes('Niveau d\u00e9butant'), f501 && f501.labels);
    verifie('permalien depuis data.permalink', f501 && String(f501.url || '').includes('initiation-api-mec'), f501 && f501.url);
    const f503 = (await fetchApi('/api/formations')).body.find((f) => String(f.event_id) === '503');
    verifie('event MEC-only (absent de wp-json) : ajout\u00e9 par la sync', !!f503 && f503.title === 'Repair Caf\u00e9 sp\u00e9cial API', f503 && f503.title);
    verifie('event MEC-only : cr\u00e9neau PM via ampm', f503 && (await fetchApi('/api/formations/503/dates')).body.every((d) => d.slot === 'PM'), f503 && f503.slot);
    const f502 = (await fetchApi('/api/formations')).body.find((f) => String(f.event_id) === '502');
    verifie('fermeture : d\u00e9tection par CAT\u00c9GORIE MEC (les labels = d\u00e9co site)', f502 && (f502.categories || '').includes('Fermeture'), f502 && f502.categories);
    verifie('fermeture : labels conserv\u00e9s pour la d\u00e9co, sans effet sur la d\u00e9tection', f502 && (f502.labels || '').includes('Fermeture'), f502 && f502.labels);
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
