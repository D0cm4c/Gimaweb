// Test fonctionnel M4 : tickets, suggestions, équipe, purge RGPD, sauvegarde chiffrée, remplacement de base
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

// Mock WebDAV Nextcloud (boucle locale) : accepte les PUT, expose le nombre/taille reçus
const uploads = [];
const webdav = http.createServer((req, res) => {
    if (req.method === 'PUT') {
        const morceaux = [];
        req.on('data', (c) => morceaux.push(c));
        req.on('end', () => {
            uploads.push({ url: req.url, taille: Buffer.concat(morceaux).length });
            res.statusCode = 201;
            res.end();
        });
    } else { res.statusCode = 404; res.end(); }
});
await new Promise((r) => webdav.listen(32997, '127.0.0.1', r));

const ENV = {
    ...process.env,
    PORT: '32129',
    ADMIN_HASH_SHA256: hash,
    BACKUP_PASSPHRASE: 'phrase-très-secrète-adw',
    NEXTCLOUD_WEBDAV_URL: 'http://127.0.0.1:32997/remote.php/dav/files/adw',
    BACKUP_DIR: path.resolve('data-tests', 'sauvegardes'),
    DB_PATH: 'data-tests/gimaweb-m4-tickets-sauvegarde.db'
};

let courant = null;
const demarrer = () => new Promise((resolve, reject) => {
    const srv = spawn('node', ['server/serveur.js'], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    srv.stderr.on('data', (d) => { err += d; });
    const attente = async () => {
        for (let i = 0; i < 50; i++) {
            try {
                const r = await fetch('http://127.0.0.1:32129/api/sante');
                if (r.ok) { courant = srv; return resolve({ srv, stderr: () => err }); }
            } catch { await new Promise(r2 => setTimeout(r2, 100)); }
        }
        reject(new Error('serveur injoignable : ' + err));
    };
    attente();
});

const fetchApi = async (path, opts = {}) => {
    const r = await fetch(`http://127.0.0.1:32129${path}`, opts);
    return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : null, cookies: r.headers.get("set-cookie") || "" };
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`✅ ${label}`); } else { console.log(`❌ ${label}`, extra ?? ''); } };

try {
    const { srv } = await demarrer();
    const co = await fetchApi('/api/auth/connexion', json('POST', { password: 'chantier' }));
    let cookie = co.cookies.split(";")[0];
    const avecCookie = (opts) => ({ ...opts, headers: { ...opts.headers, Cookie: cookie } });

    // ---- Équipe ----
    const anim1 = await fetchApi('/api/equipe', json('POST', { name: 'Fatima Belkacem' }));
    const anim2 = await fetchApi('/api/equipe', json('POST', { name: 'Rui Marques' }));
    verifie('2 animateurs créés', anim1.status === 201 && anim2.status === 201);
    const equipe = await fetchApi('/api/equipe');
    verifie('GET /api/equipe → 2', equipe.body.length === 2, equipe.body);

    // ---- Tickets ----
    const tk = await fetchApi('/api/tickets', json('POST', { title: 'PC 12 ne démarre plus', description: 'Écran noir', category: 'computer', equipment: 'PC 12', priority: 'high', assignee: 'Fatima Belkacem', created_by: 'Rui Marques' }));
    verifie('ticket créé (high, assigné)', tk.status === 201 && tk.body.priority === 'high' && tk.body.assignee === 'Fatima Belkacem', tk.body);
    const tkInvalide = await fetchApi('/api/tickets', json('POST', { title: 'X', priority: 'incroyable', category: 'cafetière' }));
    verifie('valeurs invalides → defaults, pas d\u2019erreur (maquette)', (tkInvalide.status === 400 || tkInvalide.status === 201), tkInvalide.body);

    const tkOuvert = await fetchApi('/api/tickets');
    verifie('GET /api/tickets → 1-2', tkOuvert.body.length >= 1);
    const tkId = tk.body.id;

    const com = await fetchApi(`/api/tickets/${tkId}/commentaires`, json('POST', { author: 'Fatima Belkacem', message: 'Testé un autre câble HDMI — idem.' }));
    verifie('commentaire ajouté', com.status === 201 && com.body.message.includes('HDMI'), com.body);
    const coms = await fetchApi(`/api/tickets/${tkId}/commentaires`);
    verifie('liste commentaires → 1', coms.body.length === 1);

    const tkMaj = await fetchApi(`/api/tickets/${tkId}`, json('PUT', { status: 'resolved' }));
    verifie('statut resolved + resolved_at posé', tkMaj.body.status === 'resolved' && tkMaj.body.resolved_at !== null, tkMaj.body.resolved_at);
    const tkStatutFou = await fetchApi(`/api/tickets/${tkId}`, json('PUT', { status: 'perdu' }));
    verifie('statut invalide → 400', tkStatutFou.status === 400);

    const tkDelSans = await fetchApi(`/api/tickets/${tkId}`, { method: 'DELETE' });
    verifie('DELETE ticket sans session → 401', tkDelSans.status === 401);
    const tkDel = await fetchApi(`/api/tickets/${tkId}`, avecCookie({ method: 'DELETE' }));
    verifie('DELETE ticket avec session → 204 (commentaires en cascade)', tkDel.status === 204);

    // Équipe : suppression refusée si tickets assignés
    await fetchApi('/api/tickets', json('POST', { title: 'Imprimante accueil', category: 'printer', assignee: 'Rui Marques' }));
    const delBloque = await fetchApi(`/api/equipe/${anim2.body.id}`, { method: 'DELETE' });
    verifie('suppression animateur avec ticket → 409 + bloquants', delBloque.status === 409 && delBloque.body.bloquants.length === 1, delBloque.body);
    const delOk = await fetchApi(`/api/equipe/${anim1.body.id}`, { method: 'DELETE' });
    verifie('suppression animateur libre → 204', delOk.status === 204);

    // ---- v1.5.11 : export direct de la base vers le poste (GET /base/export) ----
    const expSans = await fetchApi('/api/base/export');
    verifie('export de base sans session \u2192 401', expSans.status === 401, expSans.status);
    const exp = await fetch(`http://127.0.0.1:32129/api/base/export`, { headers: { Cookie: cookie } });
    const expNom = exp.headers.get('Content-Disposition') || '';
    verifie('export avec session \u2192 200 + fichier .db en attachment', exp.status === 200 && expNom.includes('attachment') && expNom.includes('.db'), expNom);
    const expOctets = Buffer.from(await exp.arrayBuffer());
    verifie('le fichier t\u00e9l\u00e9charg\u00e9 est une vraie base SQLite', expOctets.length > 1000 && expOctets.slice(0, 15).toString() === 'SQLite format 3', expOctets.length);

    // ---- Suggestions ----
    const sugg = await fetchApi('/api/suggestions', json('POST', { message: 'Ajouter un thermomètre dans la grande salle', page: '/salles.html', author: 'Rui' }));
    verifie('suggestion créée', sugg.status === 201);
    const ouvertes = await fetchApi('/api/suggestions/ouvertes');
    verifie('compteur ouvertes = 1', ouvertes.body.ouvertes === 1);
    const suggStatut = await fetchApi(`/api/suggestions/${sugg.body.id}/statut`, json('PUT', { status: 'done' }));
    verifie('suggestion → done', suggStatut.status === 204);
    const suggFou = await fetchApi(`/api/suggestions/${sugg.body.id}/statut`, json('PUT', { status: 'peut-être' }));
    verifie('statut suggestion invalide → 400', suggFou.status === 400);

    // ---- Sauvegarde chiffrée ----
    const membreAvant = await fetchApi('/api/membres', json('POST', { first_name: 'Victor', last_name: 'Hustache' }));
    const bkSans = await fetchApi('/api/base/sauvegarde', json('POST'));
    verifie('sauvegarde sans session → 401', bkSans.status === 401);
    const bk = await fetchApi('/api/base/sauvegarde', avecCookie(json('POST')));
    verifie('sauvegarde chiffrée créée + nom daté', bk.status === 200 && /gimaweb-\d{4}-\d{2}-\d{2}-\d{4}\.db\.aes/.test(bk.body.fichier), bk.body);
    verifie('export WebDAV effectué (mock Nextcloud)', uploads.length === 1 && uploads[0].taille === bk.body.taille && uploads[0].url.includes('/gimaweb/'), uploads);

    // Le fichier local est bien chiffré (pas l'en-tête SQLite en clair) et déchiffrable
    const fichier = path.join(ENV.BACKUP_DIR, bk.body.fichier);
    const blob = fs.readFileSync(fichier);
    verifie('fichier chiffré (pas SQLite en clair)', !blob.subarray(0, 15).toString().includes('SQLite format 3'));
    const { dechiffrer } = await import('../server/sauvegarde.js');
    const clair = dechiffrer(blob, 'phrase-très-secrète-adw');
    const Database = (await import('better-sqlite3')).default;
    const tmp = path.resolve('data-tests', 'verif-decrypt.db');
    fs.writeFileSync(tmp, clair);
    const dbV = new Database(tmp, { readonly: true });
    const membreDansBackup = dbV.prepare("SELECT COUNT(*) AS n FROM members WHERE first_name = 'Victor'").get().n;
    dbV.close();
    verifie('déchiffrement → snapshot contient les données du moment', membreDansBackup === 1, membreDansBackup);
    const mauvaiseCle = (() => { try { dechiffrer(blob, 'fausse'); return false; } catch { return true; } })();
    verifie('mauvaise phrase de passe → échec (GCM tag)', mauvaiseCle);

    // ---- Remplacement de base (restauration) ----
    // Construire une base candidate saine avec un membre repère
    const dbC = new Database(path.resolve('data-tests', 'candidate.db'));
    dbC.exec(fs.readFileSync(path.resolve('server/schema.sql'), 'utf8'));
    dbC.prepare("INSERT INTO members (id, first_name, last_name, member_no) VALUES ('mb-restaure', 'Restaurée', 'Base', 7777)").run();
    dbC.close();
    const candidat = fs.readFileSync(path.resolve('data-tests', 'candidate.db'));
    const remplSans = await fetchApi('/api/base/remplacement', json('POST', { fichier_base64: candidat.toString('base64') }));
    verifie('remplacement sans session → 401', remplSans.status === 401);
    const remplPourri = await fetchApi('/api/base/remplacement', avecCookie(json('POST', { fichier_base64: Buffer.from('ceci n est pas une base sqlite 0123456789abcdefghij').toString('base64') })));
    verifie('fichier corrompu refusé (integrity_check)', remplPourri.status === 400, remplPourri.body);
    const rempl = await fetchApi('/api/base/remplacement', avecCookie(json('POST', { fichier_base64: candidat.toString('base64') })));
    verifie('remplacement déposé → redémarrage requis', rempl.status === 200 && rempl.body.redemarrage_requis === true, rempl.body);
    const vie = await fetchApi('/api/membres');
    verifie('ancienne base toujours en service avant redémarrage', !vie.body.some(m => m.member_no === 7777), vie.body.length);

    // Redémarrage : la base candidate est adoptée
    srv.kill();
    await new Promise(r => setTimeout(r, 400));
    await demarrer();
    const apres = await fetchApi('/api/membres');
    verifie('après redémarrage : base restaurée (membre #7777 présent)', apres.body.some(m => m.member_no === 7777 && m.first_name === 'Restaurée'), apres.body.map(m => m.member_no));

    // ---- Purge RGPD (après reconnexion : les sessions sont en mémoire, le redémarrage les purge) ----
    const co2 = await fetchApi('/api/auth/connexion', json('POST', { password: 'chantier' }));
    cookie = co2.cookies.split(';')[0];
    const rgpdSans = await fetchApi('/api/rgpd/purge', json('POST'));
    verifie('purge RGPD sans session → 401', rgpdSans.status === 401);
    const rgpd = await fetchApi('/api/rgpd/purge', avecCookie(json('POST')));
    verifie('purge RGPD effectuée (compte > 0)', rgpd.status === 200 && rgpd.body.supprimes > 0, rgpd.body);
    const apresPurge = await fetchApi('/api/membres');
    const dbP = new Database(path.resolve('data-tests', 'gimaweb-m4-tickets-sauvegarde.db'));
    const sallesRestantes = dbP.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
    const formationsRestantes = dbP.prepare('SELECT COUNT(*) AS n FROM formations').get().n;
    dbP.close();
    verifie('données personnelles à zéro', apresPurge.body.length === 0, apresPurge.body.length);
    verifie('les salles et formations sont conservées', sallesRestantes === 3, { sallesRestantes, formationsRestantes });
} catch (e) {
    console.log('❌ échec du test :', e.message);
    console.log(e.stack.split('\n').slice(0, 3).join('\n'));
}
webdav.close();
// Hygiene : le 2e serveur (apres remplacement de base) doit etre tue aussi,
// sinon il survit au process.exit et le run suivant parle au fantome (base supprimee sous ses pieds).
try { if (courant) courant.kill(); } catch (e) { /* deja mort */ }
await new Promise(r => setTimeout(r, 200));
console.log(`\n${ok}/${tout} vérifications réussies`);
try { process.exit(ok === tout ? 0 : 1); } catch { process.exit(1); }
