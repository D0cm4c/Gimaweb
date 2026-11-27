// Test fonctionnel M5a : frontend servi + client HTTP ADWDatabase contre le serveur réel
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

// Mock atelierduweb.be (formations WP) — boucle locale
const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) {
        res.end(JSON.stringify([
            { id: 501, title: { rendered: 'Anonymat en ligne' }, link: 'https://atelierduweb.be/formation/anonymat/',
              excerpt: { rendered: '<p>⏳ Durée : 1 Matinée 📅 Dates : Le 15 février 2027 ⏰ Horaires : De 9h30 à 12h30</p>' }, mec_category: [9] }
        ]));
    } else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) {
        res.end(JSON.stringify([{ id: 9, name: 'Internet & sécurité' }]));
    } else { res.end('{}'); }
});
await new Promise((r) => mock.listen(32996, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m5a-frontend.db', PORT: '32132', ADMIN_HASH_SHA256: hash, WP_BASE: 'http://127.0.0.1:32996/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32996/inconnu' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const attente = async () => {
    for (let i = 0; i < 50; i++) {
        try { const r = await fetch('http://127.0.0.1:32132/api/sante'); if (r.ok) return; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error('serveur injoignable');
};
await attente();

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`✅ ${label}`); } else { console.log(`❌ ${label}`, extra ?? ''); } };

// ---- 1) Le client HTTP ADWDatabase chargé côté Node, comme le navigateur le ferait ----
const code = fs.readFileSync(path.resolve('public', 'adw-client.js'), 'utf8');
const window = {};
const origine = 'http://127.0.0.1:32132';
const fetchNavigateur = (url, opts) => fetch(String(url).startsWith('http') ? url : origine + url, opts);
new Function('window', 'fetch', code)(window, fetchNavigateur);
const D = window.ADWDatabase;
verifie('client chargé : ADWDatabase exposé', Boolean(D && typeof D.init === 'function'));

// init() (primitive du contrat)
const moi = await D.init();
verifie('init() résout le client', moi === D);

// SQL brut : interdit et explicite
let messageSql = '';
try { await D.queryAll('SELECT 1'); } catch (e) { messageSql = e.message; }
verifie('queryAll SQL refusé avec message de migration', messageSql.includes('SQL brut interdit'), messageSql);
try { await D.run('DELETE FROM members'); } catch (e) { verifie('run SQL refusé', e.message.includes('SQL brut interdit')); }

// Membres (page Membres migrée)
const cree = await D.creerMembre({ firstName: 'Alice', lastName: 'Vandenberghe', subscription: 'monthly', startDate: '2026-11-23', endDate: '2026-12-23', email: 'alice@be.eu' });
verifie('creerMembre → n° 1000', cree.member_no === 1000 && cree.first_name === 'Alice', cree);
const liste = await D.listerMembres();
verifie('listerMembres → fiche enrichie', liste.length === 1 && liste[0].visit_count === 0 && 'print_balance' in liste[0], liste[0]);
const modifie = await D.modifierMembre(cree.id, { phone: '021234567', social_status: 'cpas' });
verifie('modifierMembre', modifie.phone === '021234567' && modifie.social_status === 'cpas', modifie);

// Pointage (double refusé par le SERVEUR)
const visite = await D.pointerVisite(cree.id, 'e-admin');
verifie('pointerVisite → 1 € (sans abo... mensuel = 0)', visite.amount === 0, visite); // abonnement mensuel actif → incluse
let dejaPointe = false;
try { await D.pointerVisite(cree.id); } catch (e) { dejaPointe = e.status === 409; }
verifie('double pointage → 409 remonté au client', dejaPointe);

// Impressions
const imp = await D.ajouterImpression(cree.id, 'bw');
verifie('ajouterImpression → 0,10 € / solde', imp.amount === 0.10 && imp.solde === 0.10, imp);
await D.solderImpressions(cree.id);
const etat = await D.etatImpressions(cree.id);
verifie('solderImpressions → solde 0', etat.solde === 0, etat);

// Formations (serveur auto-sync au GET)
const formations = await D.listFormations();
verifie('listFormations → synchro serveur automatique', formations.length === 1 && formations[0].title === 'Anonymat en ligne', formations.length);
verifie('catégories résolues côté serveur', formations[0].categories === 'Internet & sécurité', formations[0].categories);
const parEvent = await D.getFormationByEventId('501');
verifie('getFormationByEventId', parEvent && String(parEvent.event_id) === '501', parEvent && parEvent.event_id);
const insc = await D.registerMemberToFormation(parEvent.id, cree.id);
verifie('registerMemberToFormation → 201', insc && insc.formation_id === parEvent.id, insc);
const inscrits = await D.getFormationAttendees(parEvent.id);
verifie('getFormationAttendees → Alice', inscrits.length === 1 && inscrits[0].first_name === 'Alice', inscrits);
const mesFormations = await D.getMemberFormations(cree.id);
verifie('getMemberFormations', mesFormations.length === 1 && mesFormations[0].title === 'Anonymat en ligne');

// Liste d'attente + notification
const attente2 = await D.addToWaitlist(cree.id, '999', 'formation future');
verifie('addToWaitlist (sujet générique)', attente2 && attente2.id, attente2);
const notifs = await D.listNotifications();
verifie('listNotifications non vide (sync notifiée)', (notifs || []).some(n => n.type === 'sync_formations'), notifs && notifs.length);
// v1.5.11 : les pastilles ne comptent que les ALERTES (warning/danger + types alertes)
const nonLuesAvant = await D.unreadNotificationsCount();
verifie('unreadNotificationsCount = 0 sans alerte (journal sans pastille)', nonLuesAvant === 0, nonLuesAvant);
await D.notify('info', 'Alerte de test M5a (warning)', 'warning');
const nonLues = await D.unreadNotificationsCount();
verifie('unreadNotificationsCount compte les alertes', nonLues === 1, nonLues);

// Salles
const salles = await D.listRooms();
verifie('listRooms → 3 seedées', salles.length === 3 && salles.map((s) => s.capacity).join(',') === '15,8,25', salles);
try {
    await D.setFormationRoom(parEvent.id, 'room-grande');
    const plan = await D.getRoomPlanning('2027-02');
    verifie('setFormationRoom + getRoomPlanning', plan.length === 1, plan.length);
} catch (e) { verifie('setFormationRoom + getRoomPlanning', false, e.message); }
const titres = await D.listFormationTitlesDistinct();
verifie('listFormationTitlesDistinct', titres.length === 1 && String(titres[0].event_id) === '501', titres);

// Déconnexion (purge de session) : la session expire, l'API l'annonce
await fetch('http://127.0.0.1:32132/api/auth/deconnexion', { method: 'POST' });
const resDel = await fetch(`${origine}/api/membres/${cree.id}`, { method: 'DELETE' });
verifie('deleteMemberCompletely sans session → 401 (garde RGPD)', resDel.status === 401);

// ---- 2) Pages servies par le serveur (rôle A) ----
const pageHtml = await fetch('http://127.0.0.1:32132/membres.html');
const html = await pageHtml.text();
verifie('GET /membres.html → 200', pageHtml.status === 200);
verifie('membres.html charge adw-client.js (plus db.js)', html.includes('adw-client.js?v=') && !html.includes('db.js?v='), 'script');
verifie('membres.html : plus de import/demo-data/backup', !html.includes('import.js') && !html.includes('demo-data.js') && !html.includes('backup.js'));
const css = await fetch('http://127.0.0.1:32132/styles.css');
verifie('GET /styles.css → 200', css.status === 200);
const index = await fetch('http://127.0.0.1:32132/');
verifie('GET / (index.html) → 200', index.status === 200);
for (const p of ['formations.html', 'formation.html', 'membre.html', 'salles.html', 'tickets.html', 'stats.html', 'notifications.html', 'suggestions.html', 'parametres.html']) {
    const r = await fetch(`http://127.0.0.1:32132/${p}`);
    verifie(`GET /${p} servi`, r.status === 200, r.status);
}
const client42 = await fetch('http://127.0.0.1:32132/adw-client.js');
verifie('adw-client.js servi', client42.status === 200);
const icone = await fetch('http://127.0.0.1:32132/index.html');
verifie('assets servis (index recharge)', icone.status === 200);

// L'API reste de l'JSON (pas d'erreur HTML du catch-all)
const inconnu = await fetch('http://127.0.0.1:32132/api/inconnu');
verifie('API inconnue → 501 JSON', inconnu.status === 501 && (await inconnu.json()).erreur);

if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
mock.close();
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
