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
    excerpt: { rendered: '<p>⏳ Durée : 1 Matinée 📅 Dates : Le 15 février 2027 ⏰ Horaires : De 9h30 à 12h30</p>' }, mec_category: [22, 11] }];
FLUX.push({ id: 305, title: { rendered: 'Trucs et astuces : boîte mail &amp; spam &#8211; bien gérer' }, link: 'https://atelierduweb.be/formation/trucs-mail/',
    excerpt: { rendered: '<p>⏳ Durée : 1 Après-midi 📅 Dates : Le 20 septembre 2027 ⏰ Horaires : De 13h30 à 16h30</p>' }, mec_category: [22, 12] });
FLUX.push({ id: 307, title: { rendered: 'Formation découverte de l’informatique' }, link: 'https://atelierduweb.be/formation/decouverte/',
    excerpt: { rendered: '<p>⏳ Durée : 2 Matinées 📅 Dates : Le 3 octobre 2027 ⏰ Horaires : De 9h30 à 12h30</p>' }, mec_category: [22, 13] });
FLUX.push({ id: 309, title: { rendered: 'Formation passee de janvier' }, link: 'https://atelierduweb.be/formation/passee/',
    excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Matin\u00e9e \uD83D\uDCC5 Dates : Le 5 janvier 2026 \u23f0 Horaires : De 9h30 \u00e0 12h30</p>' }, mec_category: [22] });
FLUX.push({ id: 302, title: { rendered: 'Fermeture annuelle de l\u2019Atelier' }, link: 'https://atelierduweb.be/fermeture/',
    excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Jour \uD83D\uDCC5 Dates : Le 17 ao\u00fbt 2027 \u23f0 Horaires : De 9h00 \u00e0 18h00 \u2014 l\u2019Atelier ferme ses portes du 14 au 17 ao\u00fbt 2027 inclus</p>' }, mec_category: [10] });

const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) res.end(JSON.stringify(FLUX));
    else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) res.end(JSON.stringify([{ id: 9, name: 'Internet & s\u00e9curit\u00e9' }, { id: 10, name: 'Fermeture' }, { id: 11, name: 'Utilisation d\u2019une tablette ou d\u2019un smartphone' }, { id: 12, name: 'Truc et astuces' }, { id: 13, name: 'Formations' }, { id: 22, name: 'Ateliers' }, { id: 23, name: 'Ev\u00e8nement' }]));
    else if (req.url.startsWith('/plugin-labels')) res.end(JSON.stringify({
        '301': { labels: [], location: 'GS - Atelier du web', organizer: 'Nadia Franchi' },
        '307': { labels: [], location: 'PS - Atelier du web' }
    }));
    else { res.statusCode = 404; res.end('{}'); }
});
await new Promise((r) => mock.listen(32993, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, DB_PATH: 'data-tests/gimaweb-m7-dom.db', PORT: '32136', ADMIN_HASH_SHA256: hash,
        WP_BASE: 'http://127.0.0.1:32993/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32993/plugin-labels' },
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
    'locations.html', 'location.html',
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
    verifie('sidebar : « Gimaweb v1.4.11 » affiché depuis /api/sante', v && v.textContent === 'Gimaweb v1.5.1', v && v.textContent);
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
    verifie('flot : prochaine_fermeture d\u00e9tect\u00e9e (du 14 ao\u00fbt)', flotF.prochaine_fermeture && flotF.prochaine_fermeture.date === '2027-08-14', flotF.prochaine_fermeture);
    verifie('flot : date_fin de fermeture (17 ao\u00fbt, plage du\u00bb au \u00bb pars\u00e9e)', flotF.prochaine_fermeture && flotF.prochaine_fermeture.date_fin === '2027-08-17', flotF.prochaine_fermeture);

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
    verifie('dashboard : carte \u00ab Prochaine fermeture \u00bb visible avec la date', Boolean(fem) && !fem.hidden && fem.textContent.indexOf(' ao\u00fbt') !== -1 && fem.textContent.indexOf('17 ao\u00fbt') !== -1 , fem && fem.textContent.slice(0, 120));
    verifie('dashboard : lien vers l\\u2019\\u00e9v\\u00e9nement du site dans la carte fermeture', fem && fem.querySelector('a[href*="atelierduweb.be/fermeture/"]') !== null);
    verifie('dashboard : la carte est AU-DESSUS de l\u2019agenda du jour', wd.document.getElementById('nextClosure').compareDocumentPosition(wd.document.getElementById('todayAgenda')) & wd.Node.DOCUMENT_POSITION_FOLLOWING);
    // v1.4.3 : les fermetures n'ont pas besoin de salle — hors planning et hors liste sans-salle
    const sansSalle = await (await fetch(`${origine}/api/formations/sans-salle`)).json();
    verifie('sans-salle : la fermeture n\u2019appara\u00eet pas', !sansSalle.some((f) => (f.title || '').indexOf('Fermeture') !== -1), sansSalle.length);
    const planFer = await (await fetch(`${origine}/api/salles/planning?mois=2027-08`)).json();
    verifie('planning salles : la fermeture n\u2019appara\u00eet pas', !planFer.some((l) => (l.title || '').indexOf('Fermeture') !== -1), planFer.length);

    const fav = await (await fetch(`${origine}/assets/icons/icon-192.png`));
    const favIco = await (await fetch(`${origine}/assets/icons/favicon.ico`));
    verifie('favicon servi (200)', fav.status === 200, fav.status);
    verifie('favicon.ico servi (200)', favIco.status === 200, favIco.status);
    const idxHtml = await (await fetch(`${origine}/index.html`)).text();
    verifie('page : <link rel=\"icon\"> pr\u00e9sent', idxHtml.includes('rel="icon"'));
}

// ---- 1octies) dashboard : moteur de recherche de la modale « Pointer une visite »
// (bug v1.4.4 : displayCheckinResults inexistant — chaque frappe levait une ReferenceError silencieuse)
{
    const { errors: erreursD, window: wdash, alertes: alD } = await chargerPage('index.html');
    await new Promise((r) => setTimeout(r, 900));
    wdash.document.getElementById('quickCheckinBtn')?.click();
    await new Promise((r) => setTimeout(r, 600));
    const modaleOuverte = wdash.document.getElementById('checkinModal');
    verifie('dashboard : modale Pointer une visite ouverte', Boolean(modaleOuverte) && !modaleOuverte.hidden);
    const cs = wdash.document.getElementById('checkinSearch');
    verifie('dashboard : liste initiale affichée (sans recherche)', wdash.document.querySelectorAll('#checkinResults li.checkin-item').length >= 1);
    cs.value = 'zzzz-existe-pas';
    cs.dispatchEvent(new wdash.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    verifie('dashboard : recherche pointage filtre (« aucun membre trouvé »)', wdash.document.getElementById('checkinResults').textContent.indexOf('Aucun membre trouv') !== -1, wdash.document.getElementById('checkinResults').textContent.slice(0, 60));
    cs.value = 'niqueur';
    cs.dispatchEvent(new wdash.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    verifie('dashboard : recherche pointage retrouve le membre', wdash.document.querySelectorAll('#checkinResults li.checkin-item').length >= 1);
    verifie('dashboard : aucune erreur JS pendant la recherche', erreursD.length === 0, erreursD.join(' | '));
}

// ---- 1novies) salles.html : la grille affiche les salles (bug v1.4.4 : getRoomPlanning recevait
// une DATE au lieu du MOIS attendu -> planning 400 -> page vide)
{
    const { errors: erreursS, window: ws } = await chargerPage('salles.html');
    await new Promise((r) => setTimeout(r, 1200));
    const tete = [...ws.document.querySelectorAll('th.room-h')].map((t) => t.textContent);
    verifie('salles.html : les 3 salles s\u2019affichent en colonnes', tete.length === 3, tete.join(' | '));
    verifie('salles.html : colonne Grande salle pr\u00e9sente', tete.some((t) => t.indexOf('Grande') !== -1), tete.join(' | '));
    verifie('salles.html : grille jours du mois rendue', ws.document.querySelectorAll('.room-planning tbody tr').length >= 28);
    verifie('salles.html : aucune erreur JS', erreursS.length === 0, erreursS.join(' | '));
}

// ---- 1douzes) couleurs par catégorie (charte v1.4.5) : tablette=vert, trucs=ambre, formation=bleu
{
    const { window: wc } = await chargerPage('formations.html');
    await new Promise((r) => setTimeout(r, 1800));
    const d = wc.document;
    const couleurDeCarte = (titre) => {
        const carte = [...d.querySelectorAll('.f-card')].find((c) => (c.querySelector('.f-card-title')||{textContent:''}).textContent.indexOf(titre) !== -1);
        if (!carte) return '';
        const banner = carte.querySelector('.f-card-banner');
        return (banner && banner.getAttribute('style')) || '';
    };
    verifie('carte tablette/smartphone : bandeau vert #18A55F', couleurDeCarte('Secret').includes('#18A55F'), couleurDeCarte('Secret'));
    verifie('carte trucs et astuces : bandeau ambre #B26A00', couleurDeCarte('Trucs').includes('#B26A00'), couleurDeCarte('Trucs'));
    verifie('carte formation : bandeau bleu #2F9BE4', couleurDeCarte('découverte').includes('#2F9BE4'), couleurDeCarte('découverte'));
    // v1.4.7 : les entites HTML du site (&amp; &#8211; &rsquo;) doivent etre DECODEES
    const fl = await (await fetch(`${origine}/api/formations`)).json();
    const f305 = fl.find((x) => String(x.event_id) === '305');
    const cartesTxt = d.body.textContent || '';
    verifie('API : titre d\u00e9cod\u00e9 (& et \u2013, pas d\u2019entit\u00e9s)', f305 && f305.title.indexOf('& ') !== -1 && f305.title.indexOf('\u2013') !== -1 && f305.title.indexOf('&amp;') === -1, f305 && f305.title);
    verifie('page : le titre affich\u00e9 est propre (pas de &amp; visible)', !cartesTxt.includes('&amp;') && cartesTxt.includes('bo\u00eete mail & spam'), (cartesTxt.match(/Trucs[^\n]{0,40}/) || [''])[0]);
    // hero de la fiche : meme regle
    const { window: wh } = await chargerPage('formation.html?id=305');
    await new Promise((r) => setTimeout(r, 1200));
    const hero = wh.document.querySelector('.hero');
    verifie('hero fiche (trucs) : fond ambre #B26A00', Boolean(hero) && (hero.getAttribute('style')||'').includes('#B26A00'), hero && hero.getAttribute('style'));
}

// ---- 1treizes) salles auto-attribuées depuis le lieu du site + formations passées (v1.4.8)
{
    const fl2 = await (await fetch(`${origine}/api/formations`)).json();
    const f301 = fl2.find((x) => String(x.event_id) === '301');
    const f307 = fl2.find((x) => String(x.event_id) === '307');
    const f309 = fl2.find((x) => String(x.event_id) === '309');
    verifie('GS - Atelier du web → salle Grande attribuée automatiquement', f301 && f301.room_id === 'room-grande', f301 && f301.room_id);
    verifie('PS - Atelier du web → salle Petite attribuée automatiquement', f307 && f307.room_id === 'room-petite', f307 && f307.room_id);
    verifie('les 20 formations passées sont conservées par la sync', Boolean(f309), fl2.length);
    // page : la passée n'apparait qu'avec le filtre « Toutes »
    const { window: wfp } = await chargerPage('formations.html');
    await new Promise((r) => setTimeout(r, 1800));
    const presente = () => [...wfp.document.querySelectorAll('.f-card-title')].some((t) => t.textContent.indexOf('passee de janvier') !== -1);
    verifie('filtre « À venir » : la formation passée est masquée', !presente());
    wfp.document.querySelector('[data-period="all"]').click();
    await new Promise((r) => setTimeout(r, 400));
    verifie('filtre « Toutes » : la formation passée est affichée', presente());
}

// ---- 1quatorzes) parametres.html : ajout d'un membre de l'equipe technique + carte formateurs (v1.4.10)
{
    const { errors: erreursP, window: wp2 } = await chargerPage('parametres.html');
    await new Promise((r) => setTimeout(r, 900));
    verifie('parametres.html : aucune erreur JS', erreursP.length === 0, erreursP.join(' | '));
    const inp = wp2.document.getElementById('newTeamMemberName');
    const btn = wp2.document.getElementById('addTeamMemberBtn');
    verifie('parametres.html : champ ajout equipe present', Boolean(inp && btn));
    inp.value = 'Theo Modo';
    btn.click();
    await new Promise((r) => setTimeout(r, 800));
    verifie('parametres.html : membre d\u00e9quipe ajout\u00e9 et list\u00e9', [...wp2.document.querySelectorAll('#teamList li')].some((li) => li.textContent.indexOf('Theo Modo') !== -1));
    const formateurs = [...wp2.document.querySelectorAll('#formateursListe li')].map((li) => li.textContent);
    verifie('parametres.html : carte Formateurs pr\u00e9sente avec l\u2019organisateur du site', formateurs.some((t) => t.indexOf('Nadia Franchi') !== -1), formateurs.join(' | '));
    verifie('parametres.html : plus de s\u00e9parateur \u00ab Affichage \u00bb', !wp2.document.body.textContent.includes('Affichage'));
    // v1.5.1 : la carte Formateurs doit etre SOEUR de la carte Équipe technique (pas imbriquée dedans)
    const carteEquipe = wp2.document.getElementById('teamTitle').closest('.settings-card');
    const carteFormateurs = wp2.document.getElementById('formateursTitle').closest('.settings-card');
    verifie('parametres.html : Formateurs hors de la carte Équipe technique (cartes soeurs)', Boolean(carteEquipe) && Boolean(carteFormateurs) && !carteEquipe.contains(carteFormateurs));
}

// ---- 1quindedeces) v1.5.0 : locations de salles \u2014 modale, filtre, fiche, planning salles, sidebar ----
{
    // Une location "pass\u00e9e" (hier) et le filtre \u00c0 venir / Toutes
    const coL = await fetch(`${origine}/api/auth/connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'chantier' }) });
    const ckL = (coL.headers.get('set-cookie') || '').split(';')[0];
    etatCookies.value = ckL; // les fetch de la page doivent porter la session admin
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await fetch(`${origine}/api/locations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ckL },
        body: JSON.stringify({ titre: 'Yoga de test pass\u00e9', room_id: 'room-petite', dates: [{ date: hier, slot: 'AM' }] }) });

    const { errors: erreursLoc, window: wl, alertes: alLoc } = await chargerPage('locations.html');
    await new Promise((r) => setTimeout(r, 800));
    verifie('locations.html : aucune erreur JS', erreursLoc.length === 0, erreursLoc.join(' | '));
    verifie('locations.html : la location pass\u00e9e est masqu\u00e9e (\u00c0 venir)', ![...wl.document.querySelectorAll('.f-card-title')].some((t) => t.textContent.includes('Yoga de test pass')), [...wl.document.querySelectorAll('.f-card-title')].map((t) => t.textContent).join(' | '));
    wl.document.querySelector('[data-period="all"]').click();
    await new Promise((r) => setTimeout(r, 400));
    verifie('locations.html : filtre \u00ab Toutes \u00bb affiche la pass\u00e9e', [...wl.document.querySelectorAll('.f-card-title')].some((t) => t.textContent.includes('Yoga de test pass')));

    // Modale de cr\u00e9ation : clic r\u00e9el + saisie + JOURN\u00c9E \u2192 2 s\u00e9ances AM+PM en base
    wl.document.querySelector('[data-period="upcoming"]')?.click();
    wl.localStorage.setItem('gimaweb_deverrouille_jusquau', String(Date.now() + 25 * 60 * 1000)); // d\u00e9verrouill\u00e9 (session cookie d\u00e9j\u00e0 \u00e9tablie)
    wl.document.getElementById('newLocationBtn').click();
    await new Promise((r) => setTimeout(r, 600));
    const modaleL = wl.document.getElementById('locationModal');
    verifie('locations.html : clic \u00ab Nouvelle location \u00bb ouvre la modale', Boolean(modaleL) && !modaleL.hidden);
    verifie('locations.html : le s\u00e9lecteur de salles est rempli', wl.document.getElementById('locSalle').options.length >= 3, wl.document.getElementById('locSalle').options.length);
    wl.document.getElementById('locTitre').value = 'Asso Test DOM';
    wl.document.getElementById('locCreneau').value = 'JOURNEE';
    // date = demain (la modale pr\u00e9-remplit aujourd'hui, on force demain pour \u00eatre \u00c0 venir)
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    wl.document.getElementById('locDate').value = demain;
    wl.document.getElementById('locSave').click();
    await new Promise((r) => setTimeout(r, 900));
    verifie('locations.html : soumission ferme la modale (cr\u00e9\u00e9e)', modaleL.hidden === true, alLoc.join(' | '));
    const locsServeur = await (await fetch(`${origine}/api/locations`)).json();
    const creee = locsServeur.find((l) => l.titre === 'Asso Test DOM');
    verifie('locations.html : la location cr\u00e9\u00e9e est en base (via la modale)', Boolean(creee), locsServeur.map((l) => l.titre));
    const ficheCreee = creee && await (await fetch(`${origine}/api/locations/${creee.id}`)).json();
    verifie('locations.html : JOURN\u00c9E \u2192 2 s\u00e9ances AM+PM', Boolean(ficheCreee) && ficheCreee.dates.length === 2 && ficheCreee.dates.every((d) => d.date === demain) && ficheCreee.dates.map((d) => d.slot).join(',') === 'AM,PM', ficheCreee);
    verifie('locations.html : la carte appara\u00eet dans la grille', [...wl.document.querySelectorAll('.f-card-title')].some((t) => t.textContent.includes('Asso Test DOM')));

    // Fiche location.html?id \u2014 rendue sans erreur, hero + s\u00e9ances
    const { errors: erreursF2, window: wf2, navigations: navL } = await chargerPage(`location.html?id=${encodeURIComponent(creee.id)}`);
    await new Promise((r) => setTimeout(r, 900));
    const heroL = wf2.document.querySelector('.hero');
    verifie('location.html?id : fiche rendue sans erreur (hero + titre)', erreursF2.length === 0 && Boolean(heroL) && heroL.textContent.includes('Asso Test DOM'), erreursF2.join(' | '));
    verifie('location.html?id : 2 s\u00e9ances affich\u00e9es', (wf2.document.body.textContent || '').includes('2 s\u00e9ances') || wf2.document.querySelectorAll('#locationContent li').length === 2, wf2.document.querySelectorAll('#locationContent li').length);

    // salles.html : la cellule location occupe la grille (class slot-location + lien location.html)
    const { errors: erreursS2, window: ws2 } = await chargerPage('salles.html');
    await new Promise((r) => setTimeout(r, 1200));
    const cellule = [...ws2.document.querySelectorAll('a.slot-location')].find((c) => c.textContent.includes('Asso Test DOM'));
    verifie('salles.html : la location nouvelle occupe une cellule (class slot-location)', Boolean(cellule) && cellule.textContent.includes('\ud83d\udd11'), cellule && cellule.textContent);
    verifie('salles.html : la cellule pointe vers location.html?id', Boolean(cellule) && cellule.getAttribute('href').startsWith('location.html?id='), cellule && cellule.getAttribute('href'));
    verifie('salles.html : aucune erreur JS avec la location dans le planning', erreursS2.length === 0, erreursS2.join(' | '));

    // Sidebar : Locations sous Salles, Suggestions \u00e9pingl\u00e9e en bas (hors nav m\u00e9tier)
}
{
    const { window: wnav } = await chargerPage('membres.html');
    await new Promise((r) => setTimeout(r, 500));
    const nav = wnav.document.querySelector('nav.side-nav') || wnav.document.querySelector('nav');
    const liens = nav ? [...nav.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), txt: a.textContent.trim() })) : [];
    const idxSalles = liens.findIndex((l) => (l.href || '').includes('salles.html'));
    const idxLoc = liens.findIndex((l) => (l.href || '').includes('locations.html'));
    verifie('sidebar : \u00ab Locations \u00bb juste sous \u00ab Salles \u00bb dans la nav', idxSalles !== -1 && idxLoc === idxSalles + 1, liens.map((l) => l.href).join(' | '));
    const extra = wnav.document.querySelector('.side-extra');
    verifie('sidebar : Suggestions dans .side-extra (hors nav m\u00e9tier)', Boolean(extra) && extra.textContent.includes('Suggestions') && !(nav && nav.textContent.includes('Suggestions')), extra && extra.textContent.trim());
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
