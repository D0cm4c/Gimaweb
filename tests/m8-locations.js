// Test fonctionnel M8 (v1.5.0) : locations de salles — CRUD, journ\u00e9e (AM+PM), r\u00e9currence,
// conflits location\u00d7location et location\u00d7formation, planning UNION, jamais de fuite vers le site public.
// R\u00e8gle m\u00e9tier : les locations sont internes \u00e0 Gimaweb, elles ne remontent JAMAIS vers wp-json.
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

// Mock WP : une formation \u00e0 une date AM (pour le test conflit location courteous\u00d7formation)
// + compteur : on trace TOUT ce que le serveur demande au mock. Aucune requ\u00eate ne doit contenir
// de donn\u00e9e de location (les locations ne partent jamais vers le site public).
let requetesVersLeSite = [];
const mock = http.createServer((req, res) => {
    requetesVersLeSite.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) {
        res.end(JSON.stringify([
            { id: 901, title: { rendered: 'Initiation oui' }, link: 'https://atelierduweb.be/formation/initiation/',
              excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Matin\u00e9e \ud83d\udcc5 Dates : le 15 septembre 2026 \u23f0 Horaires : De 9h30 \u00e0 12h30</p>' }, mec_category: [3] }
        ]));
    } else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) {
        res.end(JSON.stringify([{ id: 3, name: 'Internet' }]));
    } else { res.end('{}'); }
});
await new Promise((r) => mock.listen(32999, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m8-locations.db', PORT: '32137', ADMIN_HASH_SHA256: hash, WP_BASE: 'http://127.0.0.1:32999/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32999/inconnu' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32137${path}`, opts);
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

    // ---- Garde admin ----
    const sansSession = await fetchApi('/api/locations', json('POST', { titre: 'X', room_id: 'room-grande', dates: [{ date: '2026-09-01', slot: 'AM' }] }));
    verifie('POST location sans session \u2192 401', sansSession.status === 401);

    // ---- Validations ----
    const sansTitre = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: '', room_id: 'room-grande', dates: [{ date: '2026-09-01', slot: 'AM' }] })));
    verifie('POST sans titre \u2192 400', sansTitre.status === 400);
    const salleInconnue = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'X', room_id: 'room-xxx', dates: [{ date: '2026-09-01', slot: 'AM' }] })));
    verifie('POST salle inconnue \u2192 400', salleInconnue.status === 400);
    const slotInvalide = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'X', room_id: 'room-grande', dates: [{ date: '2026-09-01', slot: 'XX' }] })));
    verifie('POST slot invalide \u2192 400', slotInvalide.status === 400);
    const sansDates = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'X', room_id: 'room-grande', dates: [] })));
    verifie('POST sans dates \u2192 400', sansDates.status === 400);

    // ---- Cr\u00e9ation JOURN\u00c9E : 1 date \u2192 2 s\u00e9ances AM+PM ----
    const journee = await fetchApi('/api/locations', avecCookie(cookie, json('POST', {
        titre: 'Asso Voisins', room_id: 'room-grande', animateur: 'Nadia', contact: 'nadia@exemple.be',
        dates: [{ date: '2026-09-02', slot: 'AM' }, { date: '2026-09-02', slot: 'PM' }]
    })));
    verifie('POST journ\u00e9e \u2192 201', journee.status === 201 && journee.body.room_id === 'room-grande', journee.body);
    const ficheJ = await fetchApi(`/api/locations/${journee.body.id}`);
    verifie('fiche : 2 s\u00e9ances (AM+PM le m\u00eame jour)', ficheJ.status === 200 && ficheJ.body.dates.length === 2 && ficheJ.body.dates.map(d => d.slot).join(',') === 'AM,PM', ficheJ.body);

    // ---- Cr\u00e9ation r\u00e9currente : chaque lundi entre le 07 et le 21 septembre ----
    const recurrent = await fetchApi('/api/locations', avecCookie(cookie, json('POST', {
        titre: 'Cours de yoga', room_id: 'room-petite',
        dates: [{ date: '2026-09-07', slot: 'PM' }, { date: '2026-09-14', slot: 'PM' }, { date: '2026-09-21', slot: 'PM' }]
    })));
    verifie('POST r\u00e9currente (3 lundis PM) \u2192 201', recurrent.status === 201, recurrent.body);

    // ---- Liste + agr\u00e9gats ----
    const liste = await fetchApi('/api/locations');
    const lJ = liste.body.find(l => l.id === journee.body.id);
    const lR = liste.body.find(l => l.id === recurrent.body.id);
    verifie('liste : nb_seances 2 et premiere/derniere date', liste.status === 200 && lJ.nb_seances === 2 && lJ.premiere_date === '2026-09-02' && lJ.derniere_date === '2026-09-02', lJ);
    verifie('liste : r\u00e9currente 3 s\u00e9ances, du 07 au 21/09', lR.nb_seances === 3 && lR.premiere_date === '2026-09-07' && lR.derniere_date === '2026-09-21', lR);

    // ---- PUT : changement d'animateur ----
    const modifiee = await fetchApi(`/api/locations/${journee.body.id}`, avecCookie(cookie, json('PUT', { animateur: 'Marco' })));
    verifie('PUT animateur \u2192 Marco', modifiee.status === 200 && modifiee.body.animateur === 'Marco', modifiee.body);
    const sansDroitsPut = await fetchApi(`/api/locations/${journee.body.id}`, json('PUT', { animateur: 'Y' }));
    verifie('PUT sans session \u2192 401', sansDroitsPut.status === 401);

    // ---- Conflits : formation sync puis location sur le m\u00eame cr\u00e9neau ----
    await fetchApi('/api/formations/sync', avecCookie(cookie, json('POST')));
    const att = await fetchApi('/api/formations/901/salle', avecCookie(cookie, json('PUT', { room_id: 'room-grande' })));
    verifie('formation 901 attribu\u00e9e \u00e0 la grande salle', att.status === 200, att.body);
    const conflictuelle = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'R\u00e9p\u00e9tition th\u00e9\u00e2tre', room_id: 'room-grande', dates: [{ date: '2026-09-15', slot: 'AM' }] })));
    const conflits = await fetchApi(`/api/locations/${conflictuelle.body.id}/conflits`);
    verifie('conflit location\u00d7formation signal\u00e9', conflits.status === 200 && conflits.body.length === 1 && conflits.body[0].type === 'formation' && conflits.body[0].slot === 'AM', conflits.body);

    // Conflit location\u00d7location : m\u00eame salle, m\u00eame cr\u00e9neau, autre locataire
    const doublon = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'Chorale', room_id: 'room-grande', dates: [{ date: '2026-09-15', slot: 'AM' }] })));
    const conflitsLoc = await fetchApi(`/api/locations/${doublon.body.id}/conflits`);
    const conflitLoc = conflitsLoc.body.filter(c => c.type === 'location');
    verifie('conflit location\u00d7location signal\u00e9', conflitLoc.length === 1 && conflitLoc[0].titre === 'R\u00e9p\u00e9tition th\u00e9\u00e2tre', conflitsLoc.body);

    // Pas de conflit invent\u00e9 : autre salle, m\u00eame cr\u00e9neau
    const paisible = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'R\u00e9union tranquille', room_id: 'room-petite', dates: [{ date: '2026-09-15', slot: 'AM' }] })));
    const conflitsRien = await fetchApi(`/api/locations/${paisible.body.id}/conflits`);
    verifie('autre salle \u2192 aucun conflit', conflitsRien.status === 200 && conflitsRien.body.length === 0, conflitsRien.body);

    // ---- Planning UNION : les locations occupent la grille ----
    const planning = await fetchApi('/api/salles/planning?mois=2026-09');
    const locPlanning = planning.body.filter(p => p.type === 'location');
    const formPlanning = planning.body.filter(p => p.type === 'formation');
    verifie('planning 09/2026 : 2 types pr\u00e9sents', planning.status === 200 && formPlanning.length === 1 && locPlanning.length === 8, planning.body);
    verifie('planning : la journ\u00e9e compte AM+PM', locPlanning.filter(p => p.date === '2026-09-02').length === 2, locPlanning);
    verifie('planning : ligne location bien form\u00e9e (fid=location_id, event_id, room)', (() => { const l = locPlanning.find(p => p.date === '2026-09-02'); return l && l.title === 'Asso Voisins' && l.room_id === 'room-grande' && typeof l.event_id === 'string'; })(), locPlanning);

    // ---- Notifications ----
    const notifs = await fetchApi('/api/notifications');
    verifie('notification location_creee \u00e9mise', notifs.status === 200 && notifs.body.some(n => n.type === 'location_creee'), notifs.body?.slice?.(0, 3));

    // ---- DELETE + garde + cascade location_dates ----
    const sansDroitsDel = await fetchApi(`/api/locations/${doublon.body.id}`, { method: 'DELETE' });
    verifie('DELETE sans session \u2192 401', sansDroitsDel.status === 401);
    const supprimee = await fetchApi(`/api/locations/${doublon.body.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    verifie('DELETE location \u2192 204', supprimee.status === 204);
    const apres = await fetchApi(`/api/locations/${doublon.body.id}`);
    verifie('fiche supprim\u00e9e \u2192 404', apres.status === 404);
    const planningApres = await fetchApi('/api/salles/planning?mois=2026-09');
    verifie('dates de la location supprim\u00e9e retir\u00e9es du planning (cascade)', planningApres.body.filter(p => p.type === 'location' && p.fid === doublon.body.id).length === 0, planningApres.body.filter(p => p.type === 'location' && p.date === '2026-09-15'));

    // ---- v1.5.6 : salle PAR DATE (une location peut changer de salle selon la date) ----
    const mixte = await fetchApi('/api/locations', avecCookie(cookie, json('POST', {
        titre: 'Loc mixte salles', room_id: 'room-grande',
        dates: [{ date: '2026-09-24', slot: 'AM' }, { date: '2026-09-25', slot: 'AM', room_id: 'room-petite' }]
    })));
    verifie('POST salle par date \u2192 201', mixte.status === 201, mixte.body);
    const ficheMixte = await fetchApi(`/api/locations/${mixte.body.id}`);
    verifie('fiche : s\u00e9ance du 24 en Grande (room de la location)', ficheMixte.body.dates[0].room_id === 'room-grande' && ficheMixte.body.dates[0].room_name === 'Grande salle', ficheMixte.body.dates[0]);
    verifie('fiche : s\u00e9ance du 25 SURCHARG\u00c9E en Petite salle', ficheMixte.body.dates[1].room_id === 'room-petite' && ficheMixte.body.dates[1].room_name === 'Petite salle', ficheMixte.body.dates[1]);
    const planMixte = await fetchApi('/api/salles/planning?mois=2026-09');
    const row24 = planMixte.body.find((x) => x.type === 'location' && x.title === 'Loc mixte salles' && x.date === '2026-09-24');
    const row25 = planMixte.body.find((x) => x.type === 'location' && x.title === 'Loc mixte salles' && x.date === '2026-09-25');
    verifie('planning : chaque date occupe SA salle (24 grande, 25 petite)', row24 && row24.room_id === 'room-grande' && row25 && row25.room_id === 'room-petite', { row24: row24 && row24.room_id, row25: row25 && row25.room_id });
    const salleInvalOcc = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'X', room_id: 'room-grande', dates: [{ date: '2026-09-24', slot: 'PM', room_id: 'room-xxx' }] })));
    verifie('POST salle par date inconnue \u2192 400', salleInvalOcc.status === 400, salleInvalOcc.body);
    // conflit par salle effective : une autre location petite le 25 AM doit se voir
    const autrePetite = await fetchApi('/api/locations', avecCookie(cookie, json('POST', { titre: 'Petite le 25', room_id: 'room-petite', dates: [{ date: '2026-09-25', slot: 'AM' }] })));
    const conflitsMixte = await fetchApi(`/api/locations/${mixte.body.id}/conflits`);
    verifie('conflits : la salle effective par date compte (petite vs petite le 25)', conflitsMixte.body.length === 1 && conflitsMixte.body[0].type === 'location' && conflitsMixte.body[0].titre === 'Petite le 25', conflitsMixte.body);
    const delMixte = await fetchApi(`/api/locations/${mixte.body.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    const delAutre = await fetchApi(`/api/locations/${autrePetite.body.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    verifie('nettoyage locations mixtes supprim\u00e9es', delMixte.status === 204 && delAutre.status === 204);

    // ---- v1.5.8 : animateur PAR DATE (fallback sur celui de la location si absent) ----
    const animee = await fetchApi('/api/locations', avecCookie(cookie, json('POST', {
        titre: 'Loc animee', room_id: 'room-grande', animateur: 'Marco Polo',
        dates: [{ date: '2026-09-28', slot: 'AM' }, { date: '2026-09-29', slot: 'AM', animateur: 'Nadia Franchi' }]
    })));
    verifie('POST animateur par date \u2192 201', animee.status === 201, animee.body);
    const ficheAn = await fetchApi(`/api/locations/${animee.body.id}`);
    verifie('fiche : animateur h\u00e9rit\u00e9 de la location quand absent de la date', ficheAn.body.dates[0].animateur === 'Marco Polo', ficheAn.body.dates[0]);
    verifie('fiche : animateur SURCHARG\u00c9 par date (Nadia le 29)', ficheAn.body.dates[1].animateur === 'Nadia Franchi', ficheAn.body.dates[1]);
    const agendaJour = await fetchApi('/api/agregats/flot');
    verifie('flot : agenda du jour sans location aujourd\u2019hui (aucun crash du COALESCE)', Array.isArray(agendaJour.body.agenda), agendaJour.body.agenda && agendaJour.body.agenda.length);
    const delAn = await fetchApi(`/api/locations/${animee.body.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    verifie('nettoyage location anim\u00e9e supprim\u00e9e', delAn.status === 204);

    // ---- Aucune fuite vers le site public : le mock n'a re\u00e7u aucune requ\u00eate contenant nos locataires ----
    const fuite = requetesVersLeSite.some(u => /voisins|yoga|th\u00e9\u00e2tre|chorale|location/i.test(decodeURIComponent(u)));
    verifie('aucune donn\u00e9e de location envoy\u00e9e vers wp-json (pull-only)', !fuite, requetesVersLeSite);
} catch (e) {
    console.log('\u274c EXCEPTION', e);
    tout++; 
} finally {
    srv.kill();
    mock.close();
    try { process.kill(srv.pid, 0); } catch {}
    setTimeout(() => { try { process.kill(srv.pid, 'SIGKILL'); } catch {} }, 500);
}

console.log(`\n${ok}/${tout} tests OK`);
if (erreurs && ok < tout) console.log('STDERR:', erreurs.slice(0, 800));
process.exit(ok === tout ? 0 : 1);
