// Test fonctionnel M2b : salles (attribution, planning, conflits, admin) + listes d'attente (option C)
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data', { recursive: true, force: true });

// Mock WP : une formation à deux dates AM
const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) {
        res.end(JSON.stringify([
            { id: 201, title: { rendered: 'Anonymat et vie privée' }, link: 'https://atelierduweb.be/formation/vie-privee/',
              excerpt: { rendered: '<p>⏳ Durée : 2 Matinées 📅 Dates : Les 05 et 12 février 2027 ⏰ Horaires : De 9h30 à 12h30</p>' }, mec_category: [3] }
        ]));
    } else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) {
        res.end(JSON.stringify([{ id: 3, name: 'Internet' }]));
    } else { res.end('{}'); }
});
await new Promise((r) => mock.listen(32998, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, PORT: '32127', ADMIN_HASH_SHA256: hash, WP_BASE: 'http://127.0.0.1:32998/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32998/inconnu' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32127${path}`, opts);
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
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

try {
    await attente();
    const co = await fetchApi('/api/auth/connexion', json('POST', { password: 'chantier' }));
    const cookie = co.cookies.split(';')[0];

    const sallesBase = await fetchApi('/api/salles');
    verifie('3 salles seedées (15/8/25)', sallesBase.status === 200 && sallesBase.body.length === 3 && sallesBase.body.map(s => s.capacity).join(',') === '15,8,25', sallesBase.body);

    // Ajout salle — garde admin
    const salleSansDroits = await fetchApi('/api/salles', json('POST', { name: 'Bureau' }));
    verifie('POST salle sans session → 401', salleSansDroits.status === 401);
    const salleNouvelle = await fetchApi('/api/salles', { ...json('POST', { name: 'Bureau', capacity: 2 }), headers: { 'Content-Type': 'application/json', Cookie: cookie } });
    verifie('POST salle avec session → 201', salleNouvelle.status === 201 && salleNouvelle.body.capacity === 2, salleNouvelle.body);
    const renommee = await fetchApi(`/api/salles/${salleNouvelle.body.id}`, { ...json('PUT', { name: 'Box' }), headers: { 'Content-Type': 'application/json', Cookie: cookie } });
    verifie('PUT salle → renommée', renommee.status === 200 && renommee.body.name === 'Box', renommee.body);

    // Formation sync + attribution
    await fetchApi('/api/formations/sync', json('POST'));
    const sansSalle = await fetchApi('/api/formations/sans-salle');
    verifie('formation sans salle → 1', sansSalle.status === 200 && sansSalle.body.length === 1, sansSalle.body);
    const salleInconnue = await fetchApi('/api/formations/201/salle', json('PUT', { room_id: 'room-xxx' }));
    verifie('attribution salle inconnue → 400', salleInconnue.status === 400);
    const attribution = await fetchApi('/api/formations/201/salle', json('PUT', { room_id: 'room-grande' }));
    verifie('attribution Grande salle', attribution.status === 200 && attribution.body.room_id === 'room-grande', attribution.body);

    // Suppression d'une salle occupée : refus
    const delOccupee = await fetchApi('/api/salles/room-grande', { method: 'DELETE', headers: { Cookie: cookie } });
    verifie('suppression salle occupée → 409', delOccupee.status === 409, delOccupee.body);
    const delLibre = await fetchApi(`/api/salles/${salleNouvelle.body.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    verifie('suppression salle libre → 204', delLibre.status === 204);

    // Dates de la formation (sync les a remplies) + planning + conflits
    const dates = await fetchApi('/api/formations/201/dates');
    verifie('dates sync : 05 et 12 février 2027 AM', dates.status === 200 && dates.body.length === 2 && dates.body[0].date === '2027-02-05' && dates.body.every(d => d.slot === 'AM'), dates.body);
    const manuelles = await fetchApi('/api/formations/201/dates', json('PUT', { dates: [{ date: '2027-02-05', slot: 'AM' }, { date: '2027-02-12', slot: 'AM' }, { date: '2027-02-12', slot: 'PM' }] }));
    verifie('PUT dates manuelles : 3 créneaux dont PM', manuelles.status === 200 && manuelles.body.length === 3, manuelles.body);
    const datesInvalides = await fetchApi('/api/formations/201/dates', json('PUT', { dates: [{ date: '05/02/2027', slot: 'AM' }] }));
    verifie('dates invalides → 400', datesInvalides.status === 400);

    const planning = await fetchApi('/api/salles/planning?mois=2027-02');
    verifie('planning février → 3 occupations', planning.status === 200 && planning.body.length === 3, planning.body.length);
    const planningVide = await fetchApi('/api/salles/planning?mois=2027-03');
    verifie('planning mars vide', planningVide.body.length === 0);
    const planningInvalide = await fetchApi('/api/salles/planning?mois=2027-3');
    verifie('planning mois invalide → 400', planningInvalide.status === 400);

    // Conflit : une autre formation sur la même salle/date/créneau
    const Database = (await import('better-sqlite3')).default;
    const dbD = new Database('data/gimaweb.db');
    dbD.prepare(`INSERT INTO formations (id, event_id, title, start_date, room_id) VALUES ('f-conf', '999', 'formation conflit', '2027-02-05', 'room-grande')`).run();
    dbD.prepare("INSERT INTO formation_dates (id, formation_id, date, slot) VALUES ('fd-conf', 'f-conf', '2027-02-05', 'AM')").run();
    dbD.close();
    const conflits = await fetchApi('/api/formations/201/conflits');
    verifie('conflit détecté : même salle × date × créneau', conflits.status === 200 && conflits.body.length === 1 && conflits.body[0].fid === 'f-conf', conflits.body);

    // ---- Listes d'attente ----
    const membre1 = await fetchApi('/api/membres', json('POST', { first_name: 'Nora', last_name: 'Beaumont' }));
    const membre2 = await fetchApi('/api/membres', json('POST', { first_name: 'Oscar', last_name: 'Delvaux' }));

    const attenteEvent = await fetchApi('/api/listes-attente', json('POST', { member_id: membre1.body.id, formation_event_id: '201', formation_title: 'Anonymat et vie privée' }));
    verifie('attente par event_id → 201', attenteEvent.status === 201, attenteEvent.body);
    const attenteDoux = await fetchApi('/api/listes-attente', json('POST', { member_id: membre1.body.id, formation_event_id: '201', formation_title: 'Anonymat et vie privée' }));
    verifie('attente doublon → déjà inscrit (200)', attenteDoux.status === 200 && attenteDoux.body.deja_inscrit === true, attenteDoux.body);
    const attenteSujet = await fetchApi('/api/listes-attente', json('POST', { member_id: membre2.body.id, formation_title: 'anonymat et vie privée — le sujet' }));
    verifie('attente sujet générique → 201', attenteSujet.status === 201, attenteSujet.body);

    const match = await fetchApi('/api/formations/201/liste-attente/match');
    verifie('matching : attente event + sujet générique (titre normalisé)', match.status === 200 && match.body.length === 2, match.body.length);
    const parMembre = await fetchApi(`/api/membres/${membre1.body.id}/listes-attente`);
    verifie('GET attentes du membre → 1', parMembre.body.length === 1, parMembre.body);

    const contacte = await fetchApi(`/api/listes-attente/${attenteEvent.body.id}/contacte`, json('PUT'));
    verifie('marquer contactée', contacte.status === 204);
    const top = await fetchApi('/api/listes-attente/top?limite=5');
    verifie('top attentes → 1 groupe, 1 contactée', top.status === 200 && top.body.length >= 1 && top.body.some(t => t.contacted === 1), top.body);

    // Inscription → sortie de la liste d'attente (déjà couvert M2a) — ici : suppression manuelle
    const suppr = await fetchApi(`/api/listes-attente/${attenteSujet.body.id}`, { method: 'DELETE' });
    verifie('DELETE attente → 204', suppr.status === 204);

    // ---- Option C : l'attente survit à la session ----
    const dbC = new Database('data/gimaweb.db');
    dbC.prepare("INSERT INTO formations (id, event_id, title, start_date, room_id) VALUES ('f-passee', '555', ' Excel initiAtion', '2026-01-10', 'room-petite')").run();
    dbC.prepare("INSERT INTO formations (id, event_id, title, start_date) VALUES ('f-autre', '556', 'Totale autre EXCEL', '2027-05-05')").run();
    dbC.prepare("INSERT INTO waitlist (id, member_id, formation_event_id, formation_title) VALUES ('w-passee', ?, '555', ' Excel initiAtion')").run(membre1.body.id);
    dbC.prepare("INSERT INTO waitlist (id, member_id, formation_event_id, formation_title) VALUES ('w-orpheline', ?, '777', 'Formation')").run(membre2.body.id);
    dbC.close();

    const migration = await fetchApi('/api/listes-attente/migrer', json('POST'));
    verifie('migration option C : 1 passée migrée + 1 orpheline', migration.status === 200 && migration.body.migrees === 2, migration.body);

    const dbV = new Database('data/gimaweb.db');
    const migree = dbV.prepare('SELECT formation_event_id, formation_title FROM waitlist WHERE id = ?').get('w-passee');
    const generique = dbV.prepare('SELECT formation_title FROM waitlist WHERE id = ?').get('w-orpheline');
    const notifSync = dbV.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'sync'").get().n;
    dbV.close();
    verifie('attente de session passée → générique (event_id NULL)', migree && migree.formation_event_id === null && migree.formation_title === ' Excel initiAtion', migree);
    verifie('attente orpheline → générique sur son titre', generique && generique.formation_title === 'Formation', generique);
    verifie('migration notifiée (journal)', notifSync === 1, notifSync);

    const nonLivree = await fetchApi('/api/tickets');
    verifie('endpoint non livré → 501', nonLivree.status === 501);
} catch (e) {
    console.log('❌ échec du test :', e.message);
}
if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
mock.close();
await new Promise(r => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
