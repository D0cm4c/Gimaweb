// Test fonctionnel M2a : formations (sync depuis un WP mocké en boucle locale, inscriptions, paiements)
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

// ---- Mock atelierduweb.be (API WP publique + plugin labels) — boucle locale uniquement ----
const FORMATIONS_FLUX = [
    {
        id: 101,
        title: { rendered: 'Perfectionnement <b>tableur</b>' },
        link: 'https://atelierduweb.be/formation/tableur/',
        excerpt: { rendered: '<p>⏳ Durée : 2 Matinées 📅 Dates : Les 08 et 10 décembre 2026 ⏰ Horaires : De 9h30 à 12h30 Lire la suite</p>' },
        mec_category: [7, 12]
    },
    {
        id: 102,
        title: { rendered: 'Créer son site web' },
        link: 'https://atelierduweb.be/formation/site-web/',
        excerpt: { rendered: '<p>⏳ Durée : 5 Après-midis 📅 Dates : Les 15, 16, 22, 23 janvier 2027 de 13h30 à 16h30 ⏰ Horaires : De 13h30 à 16h30</p>' },
        mec_category: [7]
    }
];
const CATEGORIES = [{ id: 7, name: 'Bureautique' }, { id: 12, name: 'Multimédia' }];
const LABELS_PLUGIN = {
    101: { labels: ['Niveau 2'], price: '40.00€', location: 'Atelier du web, Rue X 15', organizer: 'Atelier du web' },
    102: { labels: ['Débutant'], price: '60.00€' }
};

let flux = FORMATIONS_FLUX; // mutable : la 2e vague retire la formation 102
const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) {
        res.end(JSON.stringify(flux));
    } else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) {
        res.end(JSON.stringify(CATEGORIES));
    } else if (req.url.startsWith('/wp-json/adw-mec/v1/labels')) {
        res.end(JSON.stringify(LABELS_PLUGIN));
    } else {
        res.statusCode = 404;
        res.end('{}');
    }
});
await new Promise((r) => mock.listen(32999, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: {
        ...process.env,
        DB_PATH: 'data-tests/gimaweb-m2a-formations.db',
        PORT: '32126',
        ADMIN_HASH_SHA256: hash,
        WP_BASE: 'http://127.0.0.1:32999/wp-json/wp/v2',
        ADW_LABELS_URL: 'http://127.0.0.1:32999/wp-json/adw-mec/v1/labels'
    },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32126${path}`, opts);
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

try {
    await attente();

    const sync1 = await fetchApi('/api/formations/sync', json('POST'));
    verifie('sync vague 1 → 2 ajoutées', sync1.status === 200 && sync1.body.ajoutees === 2 && sync1.body.total === 2, sync1.body);

    const liste = await fetchApi('/api/formations');
    verifie('GET /api/formations → 2 triées par date', liste.status === 200 && liste.body.length === 2 && String(liste.body[0].event_id) === '101', liste.body.length);
    const f1 = liste.body[0];
    verifie('champs parsés : durée 2 Matinées', f1.duration === '2 Matinées' && f1.time_label === 'De 9h30 à 12h30', f1);
    verifie('catégories résolues en noms (pas d\u2019IDs)', f1.categories === 'Bureautique, Multimédia', f1.categories);
    verifie('plugin labels : labels + price + location', f1.labels === 'Niveau 2' && f1.price === '40.00€' && f1.location.includes('Rue X 15'), f1);
    const f2 = liste.body[1];
    verifie('dates multiples parsées (15,16,22,23 janv) + slot PM', f2.start_date === '2027-01-15' && f2.date_text.includes('15, 16, 22, 23 janvier 2027'), f2);

    const parEvent = await fetchApi('/api/formations/101');
    verifie('GET par event_id → dates AM ×2 + fiche', parEvent.status === 200 && parEvent.body.dates.length === 2 && parEvent.body.dates.every(d => d.slot === 'AM'), parEvent.body.dates);

    // Inscriptions
    const membre = await fetchApi('/api/membres', json('POST', { first_name: 'Ida', last_name: 'Cardoso' }));
    // Le membre attend la formation 101 ET le même sujet en générique → l'inscription les retire
    const Database = (await import('better-sqlite3')).default;
    const dbDirect = new Database('data-tests/gimaweb-m2a-formations.db');
    dbDirect.prepare('INSERT INTO waitlist (id, member_id, formation_event_id, formation_title) VALUES (?, ?, ?, ?)').run('w1', membre.body.id, '101', 'Perfectionnement tableur');
    dbDirect.prepare('INSERT INTO waitlist (id, member_id, formation_title) VALUES (?, ?, ?)').run('w2', membre.body.id, 'perfectionnement    TABLEUR');
    dbDirect.close();

    const insc = await fetchApi('/api/formations/101/inscrits', json('POST', { member_id: membre.body.id }));
    verifie('POST inscription → 201', insc.status === 201, insc.body);
    const double = await fetchApi('/api/formations/101/inscrits', json('POST', { member_id: membre.body.id }));
    verifie('ré-inscription → 409', double.status === 409);

    const dbW = new Database('data-tests/gimaweb-m2a-formations.db');
    const attentesRestantes = dbW.prepare('SELECT COUNT(*) AS n FROM waitlist').get().n;
    dbW.close();
    verifie('l\u2019inscription vide les 2 listes d\u2019attente (event + sujet)', attentesRestantes === 0, attentesRestantes);

    const inscrits = await fetchApi('/api/formations/101/inscrits');
    verifie('GET inscrits → 1 (I. Cardoso)', inscrits.status === 200 && inscrits.body.length === 1 && inscrits.body[0].first_name === 'Ida', inscrits.body);

    // Paiement + présence + journal
    const paiement = await fetchApi(`/api/formations/101/inscrits/${membre.body.id}`, json('PUT', { payment: 'bancontact', attendance: 'present' }));
    verifie('PUT paiement bancontact + présent', paiement.status === 200 && paiement.body.payment === 'bancontact' && paiement.body.attendance === 'present', paiement.body);
    const annule = await fetchApi(`/api/formations/101/inscrits/${membre.body.id}`, json('PUT', { payment: null }));
    verifie('annulation du paiement trace un cleared', annule.status === 200 && annule.body.payment === null && annule.body.payment_at === null, annule.body);
    const journal = await fetchApi(`/api/formations/101/inscrits/${membre.body.id}/paiements`);
    verifie('journal d\u2019audit : paid puis cleared', journal.body.length === 2 && journal.body[0].action === 'paid' && journal.body[1].action === 'cleared', journal.body);

    const paiementInvalide = await fetchApi(`/api/formations/101/inscrits/${membre.body.id}`, json('PUT', { payment: 'amanat' }));
    verifie('mode de paiement invalide → 400', paiementInvalide.status === 400);

    // Fiche membre : formations
    const mesFormations = await fetchApi(`/api/membres/${membre.body.id}/formations`);
    verifie('GET /membres/:id/formations → 1', mesFormations.status === 200 && mesFormations.body.length === 1, mesFormations.body);

    // Désinscription
    const desinsc = await fetchApi(`/api/formations/101/inscrits/${membre.body.id}`, { method: 'DELETE' });
    verifie('DELETE inscription → 204', desinsc.status === 204);

    // Vague 2 : le flux retire la formation 102 → sync la retire (cascade)
    flux = [FORMATIONS_FLUX[0]];
    const sync2 = await fetchApi('/api/formations/sync', json('POST'));
    verifie('sync vague 2 → 1 retirée, 1 mise à jour', sync2.status === 200 && sync2.body.retirees === 1 && sync2.body.misesAJour === 1, sync2.body);
    const liste2 = await fetchApi('/api/formations');
    verifie('la formation disparue a bien disparu', liste2.body.length === 1 && String(liste2.body[0].event_id) === '101', liste2.body.length);

    // Journal de notifications : chaque sync a notifié
    const dbN = new Database('data-tests/gimaweb-m2a-formations.db');
    const notifs = dbN.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'sync_formations'").get().n;
    dbN.close();
    verifie('actions automatiques journalisées (2 notifications sync)', notifs === 2, notifs);

    const titres = await fetchApi('/api/formations/titres/distincts');
    verifie('titres distincts → 1', titres.status === 200 && titres.body.length === 1 && String(titres.body[0].event_id) === '101', titres.body);
} catch (e) {
    console.log('❌ échec du test :', e.message);
}
if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
mock.close();
await new Promise(r => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
