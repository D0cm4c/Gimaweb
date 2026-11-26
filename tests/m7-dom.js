// Test fonctionnel M7 : les pages en VRAI DOM (jsdom) — chaque page se charge sans erreur,
// et les interactions clés (bouton Importer XML de membres.html notamment) fonctionnent.
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data-tests', { recursive: true, force: true });

import http from 'http';
const FLUX = [{ id: 301, title: { rendered: 'Secret de mot de passe solide' }, link: 'https://atelierduweb.be/formation/motdepasse/',
    excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Matin\u00e9e \uD83D\uDCC5 Dates : Le 15 f\u00e9vrier 2027 \u23f0 Horaires : De 9h30 \u00e0 12h30</p>' }, mec_category: [9] }];
FLUX.push({ id: 302, title: { rendered: 'Fermeture annuelle de l\u2019Atelier' }, link: 'https://atelierduweb.be/fermeture/',
    excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Jour \uD83D\uDCC5 Dates : Les 15 et 16 ao\u00fbt 2027 \u23f0 Horaires : De 9h00 \u00e0 18h00</p>' }, mec_category: [10] });

const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) res.end(JSON.stringify(FLUX));
    else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) res.end(JSON.stringify([{ id: 9, name: 'Internet & s\u00e9curit\u00e9' }, { id: 10, name: 'Fermeture' }]));
    else { res.statusCode = 404; res.end('{}'); }
});
await new Promise((r) => mock.listen(32993, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m7-dom.db', PORT: '32136', ADMIN_HASH_SHA256: hash,
        WP_BASE: 'http://127.0.0.1:32993/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32993/inconnu' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreursServeur = '';
srv.stderr.on('data', (d) => { erreursServeur += d; });
for (let i = 0; i < 50; i++) {
    try { const r = await fetch('http://127.0.0.1:32136/api/sante'); if (r.ok) break; } catch { await new Promise(r => setTimeout(r, 100)); }
}

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`\u2705 ${label}`); } else { console.log(`\u274c ${label}`, extra ?? ''); } };

const origine = 'http://127.0.0.1:32136';
const etatCookies = { value: '', url: '' };

// Chargement d'une page : JS exécuté, fetch/git vers le serveur, erreurs page collectées
async function chargerPage(page) {
    const html = await (await fetch(`${origine}/${page}`)).text();
    const errors = [];
    const navigations = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => {
        if (String(e && e.message || '').includes('navigation')) navigations.push(String(e.message));
        else errors.push('jsdomError: ' + (e && e.message));
    });
    const dom = new JSDOM(html, {
        url: `${origine}/${page}`,
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole: vc
    });
    const { window } = dom;
    // Cookie jar partagé : le fetch de la page se comporte comme un navigateur (session admin)
    etatCookies.url = `${origine}/${page}`;
    const alertes = [];
    window.alert = (m) => { alertes.push(String(m)); };
    window.confirm = () => true;
    window.fetch = (u, o) => {
        const url = new URL(String(u), `${origine}/`).href;
        const entetes = { ...((o && o.headers) || {}) };
        if (etatCookies.value) entetes.Cookie = etatCookies.value;
        o = { ...(o || {}), headers: entetes };
        return fetch(url, o).then((rep) => {
            const sc = rep.headers.get('set-cookie');
            if (sc) etatCookies.value = sc.split(';')[0];
            return rep;
        });
    };
    window.console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' '));
    window.addEventListener('error', (e) => errors.push('error event: ' + (e.error && e.error.stack || e.message)));
    // APIs navigateur que jsdom ne fournit pas
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {} }));
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:fake';
    window.HTMLAnchorElement.prototype.click = function () { if (this.href) window.location.href = this.href; }; // liens jouables

    const scripts = [...window.document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
    for (const src of scripts) {
        const code = await (await fetch(new URL(src, `${origine}/`).href)).text();
        try {
            dom.window.eval(code);
        } catch (e) {
            errors.push(`script ${src}: ${e.message}`);
        }
    }
    // laisse tourner les promesses d'init
    await new Promise((r) => setTimeout(r, 700));
    return { dom, window, errors, scripts, alertes, navigations };
}

const PAGES = ['index.html', 'membres.html', 'formations.html', 'formation.html', 'membre.html', 'salles.html',
    'tickets.html', 'ticket.html', 'stats.html', 'notifications.html', 'suggestions.html', 'parametres.html'];

// ---- 1) Chaque page se charge sans erreur JS ----
const etats = {};
for (const p of PAGES) {
    const { errors, scripts } = await chargerPage(p);
    etats[p] = errors;
    verifie(`${p} charge sans erreur JS (scripts: ${scripts.length})`, errors.length === 0, errors.join(' | '));
}

// ---- 1bis) La sidebar affiche le nom et la version (au-dessus du lien atelierduweb.be) ----
{
    const { dom: d2, window: w2 } = await chargerPage('membres.html');
    const v = w2.document.getElementById('adwVersion');
    const footer = v && v.parentElement;
    const lien = footer && footer.querySelector('a.side-external');
    const ordre = footer && [...footer.children].indexOf(v) < [...footer.children].indexOf(lien);
    verifie('sidebar : bloc version présent avant le lien atelierduweb.be', Boolean(v && lien && ordre), v && v.textContent);
    verifie('sidebar : « Gimaweb v1.4.3 » affiché depuis /api/sante', v && v.textContent === 'Gimaweb v1.4.3', v && v.textContent);
}

// ---- 1ter) membre.html?id=… avec un VRAI membre : la fiche se rend sans erreur
// (bug production v1.2.3 : listFormationTitlesDistinct() promesse non attendue → « allFormations.map is not a function »)
{
    const co = await fetch(`${origine}/api/auth/connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'chantier' }) });
    const ck = (co.headers.get('set-cookie') || '').split(';')[0];
    const cree = await (await fetch(`${origine}/api/membres`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
        body: JSON.stringify({ first_name: 'Domi', last_name: 'Niqueur', subscription: 'none', start_date: '2027-01-05', end_date: '2027-02-05' })
    })).json();
    const { errors: erreursFiche, window: wf, alertes: alertesFiche } = await chargerPage(`membre.html?id=${encodeURIComponent(cree.id)}`);
    await new Promise((r) => setTimeout(r, 500));
    const selecteur = wf.document.getElementById('interestPick');
    verifie('membre.html?id : fiche rendue sans erreur (intérêts inclus)', erreursFiche.length === 0, erreursFiche.join(' | '));
    verifie('membre.html?id : sélecteur de formations présent (allFormations résolu)', Boolean(selecteur), selecteur && selecteur.tagName);
    const delBtn = wf.document.getElementById('deleteMemberBtn');
    const wrapp = delBtn && delBtn.closest('.detail-head-actions');
    verifie('membre.html?id : boutons groupés sous l’identité (.detail-head-actions, 4)', Boolean(wrapp) && wrapp.querySelectorAll('button').length === 4, wrapp && wrapp.querySelectorAll('button').length);
    wf.document.getElementById('renewSubBtn').click();
    await new Promise((r) => setTimeout(r, 900));
    verifie('membre.html?id : clic « Renouveler l’abo » fonctionne (alerte de confirmation)', alertesFiche.some((m) => m.includes('Abonnement renouvel')), alertesFiche.join(' | '));
}

// ---- 1quater) formations.html : cartes cliquables (fiche) + bouton Réserver (sélecteur membre)
{
    const { errors: erreursF, window: wf, navigations } = await chargerPage('formations.html');
    await new Promise((r) => setTimeout(r, 1500));
    const carte = wf.document.querySelector('.f-card.f-card-link');
    verifie('formations.html : au moins une carte formation rendue', Boolean(carte));
    if (carte) {
        navigations.length = 0;
        carte.click();
        await new Promise((r) => setTimeout(r, 400));
        verifie('formations.html : clic carte → navigation vers formation.html?id', navigations.length > 0, navigations.join(' | '));
    }
    const book = wf.document.querySelector('.bk-open');
    if (book) {
        book.click();
        await new Promise((r) => setTimeout(r, 500));
        const modale = wf.document.querySelector('#bookingSearchInput');
        verifie('formations.html : bouton Réserver → sélecteur de membre ouvert', Boolean(modale) && modale.closest('.modal-overlay') && !modale.closest('.modal-overlay').hidden);
    } else {
        verifie('formations.html : bouton Réserver présent (bk-open)', false, 'aucun .bk-open');
    }
    verifie('formations.html charge sans erreur JS', erreursF.length === 0, erreursF.join(' | '));
    // Filtres : recherche + période (régression v1.2.5 — listeners perdus à la migration)
    const avant = wf.document.querySelectorAll('.f-card.f-card-link').length;
    const si = wf.document.getElementById('searchInput');
    si.value = 'zzzz-inexistant';
    si.dispatchEvent(new wf.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const apresRecherche = wf.document.querySelectorAll('.f-card.f-card-link').length;
    verifie('formations.html : la recherche filtre les cartes', apresRecherche === 0 && avant > 0, avant + ' -> ' + apresRecherche);
    si.value = '';
    si.dispatchEvent(new wf.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const btnToutes = wf.document.querySelector('[data-period="all"]');
    const navigations2 = navigations; // réutilise le même collecteur
    btnToutes.click();
    await new Promise((r) => setTimeout(r, 300));
    verifie('formations.html : bascule période « Toutes » fonctionnelle (bouton actif)', btnToutes.classList.contains('active'));
    si.value = 'mot de passe';
    si.dispatchEvent(new wf.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    verifie('formations.html : recherche à nouveau trouvée', wf.document.querySelectorAll('.f-card.f-card-link').length >= 1);
    // Modale « Inscriptions du site » : ouverture par clic réel + fermeture par clic-fond
    wf.document.getElementById('bookingsBtn').click();
    await new Promise((r) => setTimeout(r, 600));
    const bm = wf.document.getElementById('bookingsModal');
    verifie('formations.html : modale Inscriptions du site ouverte par clic', Boolean(bm) && !bm.hidden);
    bm.click(); // clic sur le fond (overlay)
    await new Promise((r) => setTimeout(r, 200));
    verifie('formations.html : fermeture par clic sur le fond', bm.hidden === true);
}

// ---- 1quinquies) tickets.html : modale « Signaler un incident » ouvre/ferme ----
{
    const { window: wt } = await chargerPage('tickets.html');
    await new Promise((r) => setTimeout(r, 400));
    const tm = wt.document.getElementById('ticketModal');
    wt.document.getElementById('newTicketBtn').click();
    await new Promise((r) => setTimeout(r, 200));
    const ouvert = tm && !tm.hidden;
    verifie('tickets.html : clic « Signaler un incident » ouvre la modale', ouvert);
    wt.document.getElementById('tkTitle').value = 'Reservation test M10';
    wt.document.getElementById('tkSave').click();
    await new Promise((r) => setTimeout(r, 800));
    verifie('tickets.html : soumission du ticket ferme la modale', tm.hidden === true);
    const surServeur = await (await fetch(`${origine}/api/tickets`)).json();
    verifie('tickets.html : le ticket créé est en base', surServeur.some((t) => t.title === 'Reservation test M10'), surServeur.length);
}

// ---- 1sexies) formation.html?id=<vraie formation> : la fiche se rend sans erreur
// (bug v1.3.1 : loadMecLabels is not defined — appel fantôme d'une fonction supprimée à la migration)
{
    const { errors: erreursFo, window: wfo, navigations: navFo } = await chargerPage('formation.html?id=301');
    await new Promise((r) => setTimeout(r, 1200));
    const titre = wfo.document.getElementById('pageTitle');
    verifie('formation.html?id : fiche rendue sans erreur', erreursFo.length === 0 && Boolean(titre), erreursFo.join(' | '));
    // Bouton Réserver sur le site (v1.4.2 : booking.js manquait sur cette page)
    const book = wfo.document.getElementById('bookBtn');
    verifie('formation.html : bouton Réserver présent', Boolean(book));
    if (book) {
        book.click();
        await new Promise((r) => setTimeout(r, 400));
        const modaleB = wfo.document.querySelector('#bookingSearchInput');
        verifie('formation.html : clic Réserver → sélecteur de membre ouvert', Boolean(modaleB) && modaleB.closest('.modal-overlay') && !modaleB.closest('.modal-overlay').hidden);
    }
}

// ---- 1septies) fermetures (v1.4.0) : exclusion de la page formations + carte dashboard ----
{
    const flotF = await (await fetch(`${origine}/api/agregats/flot`)).json();
    verifie('flot : prochaine_fermeture d\u00e9tect\u00e9e (15 ao\u00fbt 2027)', flotF.prochaine_fermeture && flotF.prochaine_fermeture.date === '2027-08-15', flotF.prochaine_fermeture);
    verifie('flot : date_fin de fermeture (16 ao\u00fbt)', flotF.prochaine_fermeture && flotF.prochaine_fermeture.date_fin === '2027-08-16', flotF.prochaine_fermeture);

    const { window: wff } = await chargerPage('formations.html');
    await new Promise((r) => setTimeout(r, 1500));
    const cartes = [...wff.document.querySelectorAll('.f-card-title')].map((t) => t.textContent);
    verifie('formations.html : la fermeture N\u2019appara\u00eet pas dans la liste', !cartes.some((t) => t.indexOf('Fermeture') !== -1), cartes.join(' | '));
    verifie('formations.html : la formation normale reste visible', cartes.some((t) => t.indexOf('Secret') !== -1), cartes.join(' | '));
    const selCat = [...wff.document.getElementById('catSelect').options].map((o) => o.textContent);
    verifie('formations.html : filtre cat\u00e9gorie sans \u00ab Fermeture \u00bb', !selCat.some((c) => c.toLowerCase().indexOf('fermeture') !== -1), selCat.join(','));

    const { window: wd } = await chargerPage('index.html');
    await new Promise((r) => setTimeout(r, 900));
    const fem = wd.document.getElementById('nextClosure');
    verifie('dashboard : carte \u00ab Prochaine fermeture \u00bb visible avec la date', Boolean(fem) && !fem.hidden && fem.textContent.indexOf(' ao\u00fbt') !== -1 && fem.textContent.indexOf('16 ao\u00fbt') !== -1 , fem && fem.textContent.slice(0, 120));
    verifie('dashboard : la carte est AU-DESSUS de l\u2019agenda du jour', wd.document.getElementById('nextClosure').compareDocumentPosition(wd.document.getElementById('todayAgenda')) & wd.Node.DOCUMENT_POSITION_FOLLOWING);
    // v1.4.3 : les fermetures n'ont pas besoin de salle — hors planning et hors liste sans-salle
    const sansSalle = await (await fetch(`${origine}/api/formations/sans-salle`)).json();
    verifie('sans-salle : la fermeture n\u2019appara\u00eet pas', !sansSalle.some((f) => (f.title || '').indexOf('Fermeture') !== -1), sansSalle.length);
    const planFer = await (await fetch(`${origine}/api/salles/planning?mois=2027-08`)).json();
    verifie('planning salles : la fermeture n\u2019appara\u00eet pas', !planFer.some((l) => (l.title || '').indexOf('Fermeture') !== -1), planFer.length);

    const fav = await (await fetch(`${origine}/assets/icons/icon-192.png`));
    verifie('favicon servi (200)', fav.status === 200, fav.status);
    const idxHtml = await (await fetch(`${origine}/index.html`)).text();
    verifie('page : <link rel=\"icon\"> pr\u00e9sent', idxHtml.includes('rel="icon"'));
}

// ---- 2) membres.html : le bouton « Importer XML » fonctionne DE BOUT EN BOUT ----
const { dom, window, errors } = await chargerPage('membres.html');
await new Promise((r) => setTimeout(r, 300));
const doc = window.document;
const importBtn = doc.getElementById('importBtn');
verifie('membres.html : bouton Importer XML présent', Boolean(importBtn));
verifie('membres.html : modale d\u2019import présente dans le HTML', Boolean(doc.getElementById('importModal')));

// auth : la garde ensureUnlocked doit montrer l\u2019écran de déverrouillage \u2192 on saisit le mot de passe
importBtn.click();
await new Promise((r) => setTimeout(r, 400));
const unlockVisible = ![...doc.querySelectorAll('.modal-overlay')].every((m) => m.hidden)
    || Boolean(doc.querySelector('input[type="password"]'));
verifie('clic Importer XML : une modale apparait (garde ou import)', unlockVisible);
const pwd = doc.querySelector('input[type="password"]');
if (pwd) {
    pwd.value = 'chantier';
    const form = pwd.closest('form');
    if (form) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    else pwd.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    await new Promise((r) => setTimeout(r, 600));
}
const importModal = doc.getElementById('importModal');
verifie('après déverrouillage : modale d\u2019import visible', Boolean(importModal) && !importModal.hidden);

// ---- 3) Scénario de production v1.2.2 : le serveur redémarre (sessions en mémoire purgées)
// mais le navigateur garde sa mémoire locale « déverrouillé » + un cookie périmé
// → le clic doit RE-ouvrir la modale de mot de passe, pas renvoyer un 401 à l'API ----
await fetch(`${origine}/api/auth/deconnexion`, { method: 'POST', headers: { ...(etatCookies.value ? { Cookie: etatCookies.value } : {}) } });
const memLocale = window.localStorage.getItem('gimaweb_deverrouille_jusquau');
verifie('mémoire locale dit encore « déverrouillé » (scénario reconstitué)', Boolean(memLocale));
importBtn.click();
await new Promise((r) => setTimeout(r, 500));
const pass2 = doc.querySelector('#adw-auth-form input[type="password"]');
verifie('clic après purge de session : la modale de mot de passe RE-apparaît (pas de 401)', Boolean(pass2));
if (pass2) {
    const form2 = pass2.closest('form');
    pass2.value = 'chantier';
    form2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 900));
    verifie('re-déverrouillage : modale d\u2019import à nouveau visible', importModal && !importModal.hidden);
}


// fichier XML (comme un file input) : preview
const xml = '<dataroot><Tbl_Membres><Num_id>9001</Num_id><Nom>Testdom</Nom><Pr_x00E9_nom>Vera</Pr_x00E9_nom></Tbl_Membres></dataroot>';
const results = await fetch(`${origine}/api/membres/import`, {
    method: 'POST',
    body: JSON.stringify({ xml, essai: true }),
    headers: { 'Content-Type': 'application/json', ...(etatCookies.value ? { Cookie: etatCookies.value } : {}) },
});
verifie('essai serveur : 1 fiche analysée', results.status === 200 && (await results.json()).analyses === 1);

if (erreursServeur) console.log('stderr serveur :', erreursServeur);
srv.kill();
mock.close();
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
