// Test fonctionnel M1b : visites (pointage, double pointage) + impressions (solde, solder)
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m1b-visites.db', PORT: '32125', ADMIN_HASH_SHA256: hash },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32125${path}`, opts);
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

    // Deux membres : sans abo (visite payante), avec abo annuel (visite incluse)
    const sansAbo = await fetchApi('/api/membres', json('POST', { first_name: 'Anna', last_name: 'Vermeulen' }));
    const avecAbo = await fetchApi('/api/membres', json('POST', { first_name: 'Bruno', last_name: 'Lambert', subscription: 'yearly', start_date: '2026-11-01', end_date: '2027-11-01' }));
    verifie('setup : 2 membres créés', sansAbo.status === 201 && avecAbo.status === 201);

    const vis1 = await fetchApi('/api/visites', json('POST', { member_id: sansAbo.body.id, reason: 'e-admin' }));
    verifie('pointage sans abo → 1,00 € (tarif visite)', vis1.status === 201 && vis1.body.amount === 1.0 && vis1.body.reason === 'e-admin' && vis1.body.total_visites === 1, vis1.body);

    const vis2 = await fetchApi('/api/visites', json('POST', { member_id: sansAbo.body.id }));
    verifie('double pointage refusé → 409', vis2.status === 409, vis2.body);

    const vis3 = await fetchApi('/api/visites', json('POST', { member_id: avecAbo.body.id }));
    verifie('pointage abonné → 0 € (incluse)', vis3.status === 201 && vis3.body.amount === 0 && vis3.body.incluse_abonnement === true, vis3.body);

    const visMembreInconnu = await fetchApi('/api/visites', json('POST', { member_id: 'mb-x' }));
    verifie('pointage membre inconnu → 404', visMembreInconnu.status === 404);

    const historiqueVisites = await fetchApi(`/api/membres/${sansAbo.body.id}/visites`);
    verifie('GET historique visites → 1', historiqueVisites.status === 200 && historiqueVisites.body.length === 1, historiqueVisites.body);

    const journalier = await fetchApi('/api/visites');
    verifie('GET /api/visites (jour) → 2 avec identités', journalier.status === 200 && journalier.body.length === 2 && journalier.body[0].member_no === 1000, journalier.body.length);

    const fiche = await fetchApi(`/api/membres/${sansAbo.body.id}`);
    verifie('fiche enrichie après pointage (visited_today=1)', fiche.body.visit_count === 1 && fiche.body.visited_today === 1, fiche.body.visit_count);

    // Impressions
    const imp1 = await fetchApi('/api/impressions', json('POST', { member_id: sansAbo.body.id, type: 'bw' }));
    const imp2 = await fetchApi('/api/impressions', json('POST', { member_id: sansAbo.body.id, type: 'color' }));
    verifie('imp N&B → 0,10 € / couleur → 0,50 € (défauts)', imp1.status === 201 && imp1.body.amount === 0.10 && imp2.body.amount === 0.50 && imp2.body.solde === 0.60, imp2.body);

    const impInvalide = await fetchApi('/api/impressions', json('POST', { member_id: sansAbo.body.id, type: 'photo' }));
    verifie('type invalide → 400', impInvalide.status === 400);

    const etat = await fetchApi(`/api/membres/${sansAbo.body.id}/impressions`);
    verifie('GET impressions : solde 0,60, 2 lignes', etat.status === 200 && etat.body.solde === 0.60 && etat.body.impressions.length === 2 && etat.body.impressions.every(i => i.paid === 0), etat.body.solde);

    const solder = await fetchApi(`/api/membres/${sansAbo.body.id}/impressions/solder`, json('POST'));
    verifie('solder → 2 impressions payées', solder.status === 200 && solder.body.soudrees === 2, solder.body);
    const apres = await fetchApi(`/api/membres/${sansAbo.body.id}/impressions`);
    verifie('solde repassé à 0 après solder', apres.body.solde === 0 && apres.body.impressions.every(i => i.paid === 1), apres.body.solde);

    // Suppression du solde (erreur de saisie)
    await fetchApi('/api/impressions', json('POST', { member_id: sansAbo.body.id, type: 'bw' }));
    const suppr = await fetchApi(`/api/membres/${sansAbo.body.id}/impressions`, { method: 'DELETE' });
    verifie('DELETE solde impressions → 1 supprimée', suppr.status === 200 && suppr.body.supprimees === 1, suppr.body);

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
