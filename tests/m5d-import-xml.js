// Test fonctionnel M5d : import XML de l'ancienne base Access (endpoint serveur + parseur)
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data', { recursive: true, force: true });

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, PORT: '32134', ADMIN_HASH_SHA256: hash },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });
for (let i = 0; i < 50; i++) {
    try { const r = await fetch('http://127.0.0.1:32134/api/sante'); if (r.ok) break; } catch { await new Promise(r => setTimeout(r, 100)); }
}

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`✅ ${label}`); } else { console.log(`❌ ${label}`, extra ?? ''); } };

const fetchApi = async (pathAp, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32134${pathAp}`, opts);
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null, cookies: r.headers.get('set-cookie') || '' };
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

const co = await fetchApi('/api/auth/connexion', json('POST', { password: 'chantier' }));
const cookie = co.cookies.split(';')[0];
const avecCookie = (opts) => ({ ...opts, headers: { ...opts.headers, Cookie: cookie } });

// XML façon export Access : tags échappés _xHHHH_, statuts anciens, email pollué, dates FR, champs vides
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dataroot>
  <Tbl_Membres><Num_id>7777</Num_id><Nom>Dupont</Nom><Pr_x00E9_nom>Marie</Pr_x00E9_nom><Adresse>Rue Fontainas 3</Adresse><Code_x0020_Postal>1060</Code_x0020_Postal><Ann_x00E9_e_x0020_de_x0020_naissance>1978</Ann_x00E9_e_x0020_de_x0020_naissance><Sexe>femme</Sexe><N_x00B0_T_x00E9_l_x00E9_phone_x0020_(GSM)>0475123456</N_x00B0_T_x00E9_l_x00E9_phone_x0020_(GSM)><Statut_x0020_Social>orbem</Statut_x0020_Social><Date_x0020_d_x00E9_but_x0020_Abonnement>01/09/2025</Date_x0020_d_x00E9_but_x0020_Abonnement><Date_x0020_fin_x0020_Abonnement>31/08/2026</Date_x0020_fin_x0020_Abonnement><Adresse_x0020_E_x0020_Mail>dupont@skynet.be # anciennes coordonn\u00e9es</Adresse_x0020_E_x0020_Mail><ABO_x0020_mensuel>1</ABO_x0020_mensuel><ABO_x0020_annuel>0</ABO_x0020_annuel><ABO_x0020_annuel_x0020_CPAS>0</ABO_x0020_annuel_x0020_CPAS></Tbl_Membres>
  <Tbl_Membres><Num_id>7778</Num_id><Nom>Peeters</Nom><Pr_x00E9_nom>Jan</Pr_x00E9_nom><Code_x0020_Postal>1000</Code_x0020_Postal><Sexe>homme</Sexe><Statut_x0020_Social>seniors</Statut_x0020_Social><Date_x0020_fin_x0020_Abonnement>quand m_x00EA_me</Date_x0020_fin_x0020_Abonnement><Adresse_x0020_E_x0020_Mail>pas-un-email</Adresse_x0020_E_x0020_Mail><ABO_x0020_annuel>-1</ABO_x0020_annuel></Tbl_Membres>
  <Tbl_Membres><Num_id>7779</Num_id><Nom>Sans</Nom><Pr_x00E9_nom>Statut</Pr_x00E9_nom><Statut_x0020_Social>dragon de komodo</Statut_x0020_Social></Tbl_Membres>
  <Tbl_Membres><Nom>PasDeNumero</Nom></Tbl_Membres>
</dataroot>`;

// ---- Garde : la session admin est requise ----
const sansSession = await fetchApi('/api/membres/import', json('POST', { xml }));
verifie('import sans session → 401', sansSession.status === 401, sansSession.status);
const sansXml = await fetchApi('/api/membres/import', avecCookie(json('POST', {})));
verifie('import sans xml → 400', sansXml.status === 400, sansXml.status);

// ---- Mode essai (aperçu : rien n'est écrit) ----
const essai = await fetchApi('/api/membres/import', avecCookie(json('POST', { xml, essai: true })));
verifie('essai : 3 fiches analysées (pas de n° ignoré)', essai.status === 200 && essai.body.essai === true && essai.body.analyses === 3, essai.body);
verifie('essai : 1 statut non mappé', essai.body.avertissements.non_mappe_statut === 1, essai.body.avertissements);
verifie('essai : 1 email illisible + 1 date invalide', essai.body.avertissements.email_illisible === 1 && essai.body.avertissements.date_fin_invalide === 1, essai.body.avertissements);
const listeApresEssai = await fetchApi('/api/membres');
verifie('essai : RIEN écrit', listeApresEssai.body.length === 0, listeApresEssai.body.length);

// ---- Import réel ----
const imp = await fetchApi('/api/membres/import', avecCookie(json('POST', { xml })));
verifie('import réel : 3 membres insérés', imp.status === 201 && imp.body.importes === 3 && imp.body.doublons === 0, imp.body);
const liste = await fetchApi('/api/membres');
verifie('3 membres en base', liste.body.length === 3, liste.body.length);
const marie = liste.body.find((m) => m.member_no === 7777);
verifie('Marie : prénom décodé, status orbem→cpas', marie && marie.first_name === 'Marie' && marie.social_status === 'cpas', marie);
verifie('Marie : email nettoyé du #', marie && marie.email === 'dupont@skynet.be', marie && marie.email);
verifie('Marie : dates FR converties, abonnement mensuel', marie && marie.start_date === '2025-09-01' && marie.end_date === '2026-08-31' && marie.subscription === 'monthly', marie);
const jan = liste.body.find((m) => m.member_no === 7778);
verifie('Jan : seniors→pensionné, abo annuel, date illisible ignorée (X genre)', jan && jan.social_status === 'pensionne' && jan.subscription === 'yearly' && jan.end_date === null && jan.gender === 'M', jan);
verifie('Jan : email illisible ignoré', jan && jan.email === null, jan);
const sans = liste.body.find((m) => m.member_no === 7779);
verifie('Statut non mappé → null', sans && sans.social_status === null, sans);

// ---- Idempotence : ré-import = 3 doublons ----
const reimp = await fetchApi('/api/membres/import', avecCookie(json('POST', { xml })));
verifie('ré-import : 3 doublons ignorés', reimp.status === 201 && reimp.body.importes === 0 && reimp.body.doublons === 3, reimp.body);

// ---- Notification ----
const notifs = await fetchApi('/api/notifications');
verifie('notification import_membres', (notifs.body || []).some((n) => n.type === 'import_membres'), notifs.body && notifs.body.length);

// ---- Volumétrie réelle : le XML des 3806 membres dépasse 2 Mo (limite JSON globale)
// → le body-parser dédié de la route d'import doit accepter (fix v1.2.1 : express.json 2mb rejetait en 413 AVANT l'endpoint)
const recs = [];
for (let i = 9000; i < 9050; i++) {
    recs.push('<Tbl_Membres><Num_id>' + i + '</Num_id><Nom>Nomplutotlong' + i + '</Nom><Pr_x00E9_nom>Prenomcompose' + i + '</Pr_x00E9_nom><Adresse>Rue de la Longueur Padding Padding Padding ' + i + '</Adresse><Statut_x0020_Social>cpas</Statut_x0020_Social></Tbl_Membres>');
}
const gros = '<dataroot>' + recs.join('') + '</dataroot>' + '  <!-- ' + 'x'.repeat(8 * 1024 * 1024) + ' -->';
verifie('XML volumineux (> 8 Mo) accepté', gros.length > 8 * 1024 * 1024, gros.length);
const grosEssai = await fetchApi('/api/membres/import', avecCookie(json('POST', { xml: gros, essai: true })));
verifie('essai sur gros XML : 50 fiches analysées, pas de 413', grosEssai.status === 200 && grosEssai.body.analyses === 50, { status: grosEssai.status, body: grosEssai.body });

// ---- XML cassé → 400 ----
const casse = await fetchApi('/api/membres/import', avecCookie(json('POST', { xml: '<dataroot><pas_fermé>' })));
verifie('XML invalide → 400 avec message', casse.status === 400 && /XML invalide/.test(casse.body.erreur || ''), casse.body);
const pasXml = await fetchApi('/api/membres/import', avecCookie(json('POST', { xml: 'hello je ne suis pas du xml' })));
verifie('texte non-XML → 400', pasXml.status === 400, pasXml.status);

if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
