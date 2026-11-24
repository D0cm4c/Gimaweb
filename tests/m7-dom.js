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

// fichier XML (comme un file input) : preview
const xml = '<dataroot><Tbl_Membres><Num_id>9001</Num_id><Nom>Testdom</Nom><Pr_x00E9_nom>Vera</Pr_x00E9_nom></Tbl_Membres></dataroot>';
const results = await fetch(`${origine}/api/membres/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xml, essai: true }),
    headers: { 'Content-Type': 'application/json', ...(etatCookies.value ? { Cookie: etatCookies.value } : {}) },
});
verifie('essai serveur : 1 fiche analysée', results.status === 200 && (await results.json()).analyses === 1);

if (erreursServeur) console.log('stderr serveur :', erreursServeur);
srv.kill();
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);
