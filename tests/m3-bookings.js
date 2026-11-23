// Test fonctionnel M3 : notifications + réservations du site (secret, matching, miroir, validation humaine)
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data', { recursive: true, force: true });

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, PORT: '32128', ADMIN_HASH_SHA256: hash, BOOKINGS_SECRET: 's3cr3t-adw' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32128${path}`, opts);
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
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
const avecSecret = (opts) => ({ ...opts, headers: { ...opts.headers, Authorization: 'Bearer s3cr3t-adw' } });

try {
    await attente();

    // Setup : membres + une formation en base
    const jean = await fetchApi('/api/membres', json('POST', { first_name: 'Jean', last_name: 'Dupont', email: 'jean.dupont@test.be' }));
    const paul = await fetchApi('/api/membres', json('POST', { first_name: 'Paul', last_name: 'Lambert', email: 'paul@test.be' }));
    const maurice = await fetchApi('/api/membres', json('POST', { first_name: 'Maurice', last_name: 'Carlier', email: 'maurice@test.be' }));
    const Database = (await import('better-sqlite3')).default;
    const dbD = new Database('data/gimaweb.db');
    dbD.prepare("INSERT INTO formations (id, event_id, title, start_date) VALUES ('f-wp', '301', 'WordPress débutant', '2027-03-10')").run();
    dbD.close();
    verifie('setup : 3 membres (#1000-1002) + formation', jean.body.member_no === 1000 && paul.body.member_no === 1001 && maurice.body.member_no === 1002, jean.body);

    // ---- Garde secret ----
    const sansSecret = await fetchApi('/api/bookings/upsert', json('POST', [{ id: 'bk-1' }]));
    verifie('upsert sans secret → 401', sansSecret.status === 401, sansSecret.body);
    const corpsInvalide = await fetchApi('/api/bookings/upsert', avecSecret(json('POST', { id: 'bk-x' })));
    verifie('upsert corps non-tableau avec secret → 400', corpsInvalide.status === 400, corpsInvalide.body);

    // ---- Réception de 4 réservations ----
    const upsert = await fetchApi('/api/bookings/upsert', avecSecret(json('POST', [
        { id: 'bk-1', event_id: '301', member_no: 1000, first_name: 'Jean', last_name: 'Dupont', email: 'autre@test.be', booked_at: '2026-11-20 10:00:00', status: 'confirmed' },
        { id: 'bk-2', event_id: '301', member_no: null, first_name: 'Paul', last_name: 'Lm', email: 'PAUL@test.be', booked_at: '2026-11-20 11:00:00', status: 'confirmed' },
        { id: 'bk-3', event_id: '301', member_no: null, first_name: 'Zoé', last_name: 'Farida', email: 'zoe.farida@test.be', booked_at: '2026-11-21 09:00:00', status: 'confirmed' },
        { id: 'bk-4', event_id: '301', member_no: null, first_name: 'PAUL', last_name: 'LAMBERT', email: 'inconnu@test.be', booked_at: '2026-11-22 15:00:00', status: 'confirmed' }
    ])));
    verifie('upsert → 4 ajoutées + notification réception', upsert.status === 200 && upsert.body.ajoutes === 4, upsert.body);

    const dbC = new Database('data/gimaweb.db');
    const notifRecu = dbC.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'info' AND message LIKE '%réservation(s) récupérée(s)%'").get().n;
    dbC.close();
    verifie('notification de réception journalisée', notifRecu === 1, notifRecu);

    // ---- File de validation avec matching calculé ----
    const queue = await fetchApi('/api/bookings/non-traites');
    verifie('file → 4 non traités', queue.body.length === 4, queue.body.length);
    const q1 = queue.body.find(b => b.id === 'bk-1');
    const q2 = queue.body.find(b => b.id === 'bk-2');
    const q3 = queue.body.find(b => b.id === 'bk-3');
    const q4 = queue.body.find(b => b.id === 'bk-4');
    verifie('bk-1 match certain par n° de membre', q1.match.certain === true && q1.match.method === 'member_no', q1.match);
    verifie('bk-2 match certain par email (LOWER)', q2.match.certain === true && q2.match.method === 'email', q2.match);
    verifie('bk-3 aucun match (method none)', q3.match.method === 'none' && q3.match.certain === false, q3.match);
    verifie('bk-4 candidats par nom/prénom (jamais certain)', q4.match.certain === false && q4.match.method === 'name' && q4.match.candidates.length === 1, q4.match);

    // ---- Auto-traitement des certains ----
    const auto = await fetchApi('/api/bookings/traitement-automatique', json('POST'));
    verifie('auto-traitement → 2 rattachés (bk-1, bk-2)', auto.status === 200 && auto.body.traites === 2, auto.body);
    const dbA = new Database('data/gimaweb.db');
    const autoLinks = dbA.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'auto_link'").get().n;
    const inscritsAvant = dbA.prepare('SELECT COUNT(*) AS n FROM formations_members WHERE formation_id = ?').get('f-wp').n;
    dbA.close();
    verifie('auto-links notifiés ×2', autoLinks === 2, autoLinks);
    verifie('2 inscriptions locales créées', inscritsAvant === 2, inscritsAvant);

    const queue2 = await fetchApi('/api/bookings/non-traites');
    verifie('reste 2 incertains dans la file', queue2.body.length === 2 && queue2.body.every(b => b.match.certain === false), queue2.body.length);

    // ---- Validation humaine : candidat choisi / création / ignore ----
    const lie = await fetchApi('/api/bookings/bk-4/traitement', json('PUT', { action: 'linked', member_id: maurice.body.id }));
    verifie('bk-4 → linked (choix humain)', lie.status === 200 && lie.body.action === 'linked', lie.body);
    const dejaTraitee = await fetchApi('/api/bookings/bk-4/traitement', json('PUT', { action: 'ignored' }));
    verifie('re-traiter → 409', dejaTraitee.status === 409);

    const cree = await fetchApi('/api/bookings/bk-3/traitement', json('PUT', { action: 'created' }));
    verifie('bk-3 → created : membre #1003 créé + inscrit', cree.status === 200 && cree.body.action === 'created' && cree.body.member_no === 1003, cree.body);
    const dbM = new Database('data/gimaweb.db');
    const zoe = dbM.prepare('SELECT first_name, last_name, email FROM members WHERE member_no = 1003').get();
    const mcree = dbM.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'member_created'").get().n;
    dbM.close();
    verifie('membre créé aux données du booking (Zoé Farida)', zoe && zoe.first_name === 'Zoé' && zoe.email === 'zoe.farida@test.be', zoe);
    verifie('création notifiée', mcree === 1, mcree);

    const ignoree = await fetchApi('/api/bookings/bk-2x/traitement', json('PUT', { action: 'ignored' }));
    verifie('traiter un id inconnu → 404', ignoree.status === 404);

    // ---- Miroir : annulation côté site → désinscription locale (notifiée) ----
    const annulation = await fetchApi('/api/bookings/upsert', avecSecret(json('POST', [
        { id: 'bk-1', event_id: '301', member_no: 1000, first_name: 'Jean', last_name: 'Dupont', email: 'autre@test.be', booked_at: '2026-11-20 10:00:00', status: 'canceled' }
    ])));
    verifie('upsert annulation → 1 désinscription miroir', annulation.status === 200 && annulation.body.desinscriptions === 1, annulation.body);
    const dbI = new Database('data/gimaweb.db');
    const jeanInscrit = dbI.prepare("SELECT COUNT(*) AS n FROM formations_members fm JOIN members m ON m.id = fm.member_id WHERE m.first_name = 'Jean'").get().n;
    const autoUnlink = dbI.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'auto_unlink'").get().n;
    const bk1 = dbI.prepare('SELECT processed, processed_action FROM bookings_remote WHERE id = ?').get('bk-1');
    dbI.close();
    verifie('inscription locale de Jean retirée', jeanInscrit === 0, jeanInscrit);
    verifie('désinscription notifiée (auto_unlink)', autoUnlink === 1, autoUnlink);
    verifie('bk-1 re-basculé en ignoré (ne ressuscite jamais)', bk1.processed === 0 || (bk1.processed === 1 && bk1.processed_action === 'ignored'), bk1);

    // Réservation annulée jamais traitée → ignorée directement (file propre)
    await fetchApi('/api/bookings/upsert', avecSecret(json('POST', [
        { id: 'bk-9', event_id: '301', first_name: 'No', last_name: 'Show', email: 'n@test.be', booked_at: '2026-11-22 18:00:00', status: 'canceled' }
    ])));
    const queue3 = await fetchApi('/api/bookings/non-traites');
    verifie('annulée non traitée n\u2019apparaît pas dans la file', queue3.body.every(b => b.id !== 'bk-9'), queue3.body.map(b => b.id));

    // ---- Notifications : lectures/effacement ----
    const count1 = await fetchApi('/api/notifications/non-lues');
    verifie('compteur non-lues > 0', count1.body.non_lues > 0, count1.body);
    const liste = await fetchApi('/api/notifications?limite=30');
    const uneNonLue = liste.body.find(n => n.is_read === 0);
    const marquee = await fetchApi(`/api/notifications/${uneNonLue.id}/lu`, json('PUT'));
    verifie('marquer une notification lue', marquee.status === 204);
    const preview = await fetchApi('/api/notifications/avant-premiere');
    verifie('avant-première : 8 entrées max, non-lues d\u2019abord', preview.body.length <= 8 && preview.body.length > 0, preview.body.length);
    const toutesLues = await fetchApi('/api/notifications/lues', json('PUT'));
    verifie('tout marquer lu', toutesLues.status === 204);
    const clearLues = await fetchApi('/api/notifications/lues', { method: 'DELETE' });
    verifie('effacer les lues → plus rien', clearLues.status === 204);
    const dbN = new Database('data/gimaweb.db');
    const restantes = dbN.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;
    dbN.close();
    verifie('base notifications vide après purge des lues', restantes === 0, restantes);

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
