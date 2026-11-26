// Test fonctionnel M5c : agrégats (flot dashboard + stats), recherche globale, visites anonymes
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

// Mock atelierduweb.be minimal (aucune formation attendue ici)
const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) res.end(JSON.stringify([]));
    else res.end('{}');
});
await new Promise((r) => mock.listen(32997, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m5c-agregats.db', PORT: '32133', ADMIN_HASH_SHA256: hash, WP_BASE: 'http://127.0.0.1:32997/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32997/inconnu' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const attente = async () => {
    for (let i = 0; i < 50; i++) {
        try { const r = await fetch('http://127.0.0.1:32133/api/sante'); if (r.ok) return; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error('serveur injoignable');
};
await attente();

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`✅ ${label}`); } else { console.log(`❌ ${label}`, extra ?? ''); } };

// Client HTTP chargé côté Node, comme le navigateur
const window = {};
const origine = 'http://127.0.0.1:32133';
const fetchNavigateur = (url, opts) => fetch(String(url).startsWith('http') ? url : origine + url, opts);
new Function('window', 'fetch', fs.readFileSync('public/adw-client.js', 'utf8'))(window, fetchNavigateur);
const D = window.ADWDatabase;
await D.init();

// ---- Données de travail ----
const alice = await D.creerMembre({ firstName: 'Alice', lastName: 'Vandenberghe', subscription: 'monthly', startDate: '2026-11-23', endDate: '2026-12-23', email: 'alice@be.eu' });
const bob = await D.creerMembre({ firstName: 'Bob', lastName: 'Peeters', subscription: 'none', startDate: '2026-11-01', endDate: '2026-11-10', email: 'bob@be.eu' });
await D.modifierMembre(bob.id, { social_status: 'cpas', postal_code: '1060' });
verifie('deux membres créés', Boolean(alice.id && bob.id), { alice, bob });

// ---- 1) Visites anonymes ----
const anon = await D.pointerVisite('anon', 'e-administration');
verifie('pointerVisite(anon) → visite anonyme 1 €', anon && anon.anonyme === true && anon.amount === 1, anon);
const anon2 = await D.pointerVisite(null, 'courrier');
verifie('pointerVisite(null) → anonyme aussi (pas de 409 sur les anonymes)', anon2 && anon2.anonyme === true && anon2.id !== anon.id, anon2);

// ---- 2) Flot dashboard ----
const flot = await D.agregatsFlot();
verifie('agregatsFlot : KPI présents', flot && flot.kpi && typeof flot.kpi.visites_aujourdhui === 'number', flot && flot.kpi);
verifie('agregatsFlot : visitesdu jour = 2 anonymes', flot.kpi.visites_aujourdhui >= 2, flot.kpi.visites_aujourdhui);
verifie('agregatsFlot : impressions structurées', flot.impressions && typeof flot.impressions.total === 'number' && Array.isArray(flot.impressions.top), flot.impressions);
verifie('agregatsFlot : agenda du jour = []', Array.isArray(flot.agenda) && flot.agenda.length === 0, flot.agenda);

// ---- 3) Stats (page Statistiques) ----
const s = await D.agregatsStats();
verifie('agregatsStats : membres.total = 2', s.membres && s.membres.total === 2, s.membres);
verifie('agregatsStats : actifs = 1 (Alice)', s.membres.actifs === 1, s.membres.actifs);
verifie('agregatsStats : expirés = 1 (Bob)', s.membres.expires === 1, s.membres.expires);
verifie('agregatsStats : nouveaux ce mois = 2', s.membres.nouveaux_mois === 2, s.membres.nouveaux_mois);
verifie('agregatsStats : visites du mois = 2', s.visites.mois === 2, s.visites.mois);
verifie('agregatsStats : revenus du mois = 2 €', s.visites.revenus_mois === 2, s.visites.revenus_mois);
verifie('agregatsStats : rétention (2 jamais venus)', s.retention.jamais === 2 && s.retention.total_visites === 0, s.retention);
verifie('agregatsStats : profil CP (Bob 1060)', s.profil.cp_total === 1 && s.profil.cp_top.length === 1 && s.profil.cp_top[0].postal_code === '1060', s.profil);
verifie('agregatsStats : motifs (2 visites motivées)', s.motifs.total === 2 && s.motifs.top.length === 2, s.motifs);
verifie('agregatsStats : inclusion CPAS = 1', s.inclusion.cpas === 1 && s.inclusion.vulnerables === 1, s.inclusion);
verifie('agregatsStats : statuts sociaux = [cpas]', s.statuts.length === 1 && s.statuts[0].social_status === 'cpas', s.statuts);
verifie('agregatsStats : graph_jours couvre aujourd\u2019hui', (s.graph_jours || []).some(r => Number(r.c) === 2), s.graph_jours);
verifie('agregatsStats : rapport annuel', s.rapport.annee === new Date().getFullYear() && s.rapport.visites_annee >= 2, s.rapport);
verifie('agregatsStats : cp_top10 + genres présents', Array.isArray(s.cp_top10) && Array.isArray(s.genres), { cp: s.cp_top10, g: s.genres });

// ---- 4) Visites nommées : la rétention bouge ----
await D.pointerVisite(alice.id, 'emploi');
const s2 = await D.agregatsStats();
verifie('rétention recalculée après visite d\u2019Alice', s2.retention.jamais === 1 && s2.retention.total_visites === 1, s2.retention);

// ---- 5) Recherche globale ----
const r1 = await D.rechercheGlobale('vandenberghe');
verifie('rechercheGlobale trouve Alice', r1.membres.length === 1 && r1.membres[0].first_name === 'Alice', r1.membres);
const r2 = await D.rechercheGlobale('zzzinexistant');
verifie('rechercheGlobale sans résultat', r2.membres.length === 0 && r2.formations.length === 0, r2);
const r3 = await D.rechercheGlobale('a');
verifie('rechercheGlobale < 2 chars → vide', r3.membres.length === 0, r3);

// ---- 6) Pages servies (stats + ticket référencent le client HTTP) ----
for (const p of ['stats.html', 'ticket.html']) {
    const r = await fetch(`${origine}/${p}`);
    const html = await r.text();
    verifie(`${p} servi + adw-client.js`, r.status === 200 && html.includes('adw-client.js'), r.status);
}

if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
mock.close();
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
