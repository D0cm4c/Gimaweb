// Test fonctionnel M7 : les pages en VRAI DOM (jsdom) — chaque page se charge sans erreur,
// et les interactions clés (bouton Importer XML de membres.html notamment) fonctionnent.
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data', { recursive: true, force: true });

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, PORT: '32136', ADMIN_HASH_SHA256: hash },
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
    const dom = new JSDOM(html, {
        url: `${origine}/${page}`,
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const { window } = dom;
    // Cookie jar partagé : le fetch de la page se comporte comme un navigateur (session admin)
    etatCookies.url = `${origine}/${page}`;
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
    return { dom, window, errors, scripts };
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
    verifie('sidebar : « Gimaweb v1.2.3 » affiché depuis /api/sante', v && v.textContent === 'Gimaweb v1.2.3', v && v.textContent);
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
    const { errors: erreursFiche, window: wf } = await chargerPage(`membre.html?id=${encodeURIComponent(cree.id)}`);
    await new Promise((r) => setTimeout(r, 500));
    const selecteur = wf.document.getElementById('interestPick');
    verifie('membre.html?id : fiche rendue sans erreur (intérêts inclus)', erreursFiche.length === 0, erreursFiche.join(' | '));
    verifie('membre.html?id : sélecteur de formations présent (allFormations résolu)', Boolean(selecteur), selecteur && selecteur.tagName);
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
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
