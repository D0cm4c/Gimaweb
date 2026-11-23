// Gimaweb — sauvegarde nocturne : snapshot SQLite → chiffrement AES-256-GCM → export WebDAV (Nextcloud)
// Configuration par .env : DB_PATH, BACKUP_DIR, BACKUP_PASSPHRASE,
// NEXTCLOUD_WEBDAV_URL (+ NEXTCLOUD_USER / NEXTCLOUD_PASS en Basic auth).
// Usage manuel : node server/sauvegarde.js
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Clé dérivée du mot de passe (scrypt) — le secret ne quitte jamais .env
export const deriveCle = (passPhrase, selHex) => {
    const sel = selHex ? Buffer.from(selHex, 'hex') : crypto.randomBytes(16);
    const cle = crypto.scryptSync(passPhrase, sel, 32);
    return { cle, sel };
};

// Chiffre un buffer (AES-256-GCM) → buffer { sel(16) | iv(12) | tag(16) | données }
export const chiffrer = (donnees, passPhrase) => {
    const { cle, sel } = deriveCle(passPhrase);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cle, iv);
    const chiffre = Buffer.concat([cipher.update(donnees), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([sel, iv, tag, chiffre]);
};

// Déchiffre le format ci-dessus
export const dechiffrer = (blob, passPhrase) => {
    const sel = blob.subarray(0, 16);
    const iv = blob.subarray(16, 28);
    const tag = blob.subarray(28, 44);
    const chiffre = blob.subarray(44);
    const { cle } = deriveCle(passPhrase, sel.toString('hex'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', cle, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(chiffre), decipher.final()]);
};

// Format attendu du fichier : gimeweb-AAAA-MM-JJ-HHmm.db.aes (alphanumérique, triable)
const nomFichier = (instant = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `gimaweb-${instant.getFullYear()}-${p(instant.getMonth() + 1)}-${p(instant.getDate())}-${p(instant.getHours())}${p(instant.getMinutes())}.db.aes`;
};

export async function faireSauvegarde(options = {}) {
    const cheminBase = options.cheminBase || process.env.DB_PATH || path.join(process.cwd(), 'data', 'gimaweb.db');
    const dirSortie = options.dirSortie || process.env.BACKUP_DIR || path.join(process.cwd(), 'data', 'sauvegardes');
    const passPhrase = options.passPhrase || process.env.BACKUP_PASSPHRASE || '';
    const webdavUrl = options.webdavUrl || process.env.NEXTCLOUD_WEBDAV_URL || '';
    const webdavUser = options.webdavUser || process.env.NEXTCLOUD_USER || '';
    const webdavPass = options.webdavPass || process.env.NEXTCLOUD_PASS || '';

    if (!passPhrase) {
        return { ok: false, erreur: 'BACKUP_PASSPHRASE non configuré (refus de sauvegarde en clair).' };
    }
    if (!fs.existsSync(cheminBase)) {
        return { ok: false, erreur: `Base introuvable : ${cheminBase}` };
    }

    // Snapshot cohérent via l'API backup de better-sqlite3 (pas une copie de fichier à chaud)
    const fichierChiffre = path.join(dirSortie, nomFichier());
    const dir = path.dirname(fichierChiffre);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(cheminBase, { readonly: true });
    await db.backup(fichierChiffre.replace(/\.aes$/, '.db.tmp'));
    db.close();

    const clair = fs.readFileSync(fichierChiffre.replace(/\.aes$/, '.db.tmp'));
    const blob = chiffrer(clair, passPhrase);
    fs.writeFileSync(fichierChiffre, blob);
    fs.rmSync(fichierChiffre.replace(/\.aes$/, '.db.tmp'));

    const resultat = { ok: true, fichier: fichierChiffre, taille: blob.length, televerse: null };

    // Export WebDAV (Nextcloud) — silencieusement ignoré si non configuré
    if (webdavUrl) {
        const distant = webdavUrl.replace(/\/+$/, '') + '/gimaweb/' + path.basename(fichierChiffre);
        const auth = webdavUser ? 'Basic ' + Buffer.from(`${webdavUser}:${webdavPass}`).toString('base64') : '';
        const reponse = await fetch(distant, {
            method: 'PUT',
            headers: auth ? { Authorization: auth } : {},
            body: blob
        });
        if (!reponse.ok) {
            return { ok: false, erreur: `Export WebDAV échoué (HTTP ${reponse.status}) : ${await reponse.text().catch(() => '')}`, fichier: fichierChiffre };
        }
        resultat.televerse = distant;
    }
    return resultat;
}

// Injection dans l'API (garde admin) + exécution CLI
import express from 'express';
export const creerApiSauvegarde = (options = {}) => {
    const { sessionValide = () => false, notifier = () => {}, dbPath } = options;
    const api = express.Router();
    api.post('/base/remplacement', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const b64 = req.body?.fichier_base64;
        if (!b64) return res.status(400).json({ erreur: 'fichier_base64 requis (contenu SQLite).' });
        let bytes;
        try { bytes = Buffer.from(String(b64), 'base64'); } catch { return res.status(400).json({ erreur: 'fichier_base64 illisible.' }); }
        const r = deposerRemplacement(bytes, options.dbPath);
        if (!r.ok) return res.status(400).json({ erreur: r.erreur });
        notifier('info', '♻️ Remplacement de base déposé : appliqué au prochain démarrage du serveur (base validée par integrity_check).', 'warning');
        res.json({ ok: true, redemarrage_requis: true });
    });

    api.post('/base/sauvegarde', async (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const r = await faireSauvegarde();
        if (!r.ok) return res.status(500).json({ erreur: r.erreur });
        notifier('info', `💾 Sauvegarde chiffrée créée : ${path.basename(r.fichier)}${r.televerse ? ' — exportée vers Nextcloud.' : '.'}`, 'success', { fichier: path.basename(r.fichier), televerse: r.televerse });
        res.json({ fichier: path.basename(r.fichier), taille: r.taille, televerse: r.televerse });
    });
    return api;
};

// Remplacement de base (restauration) : validation en base temporaire, application au redémarrage.
// Évite d'écraser la base ouverte : le fichier candidat est déposé, le serveur l'adopte au prochain
// démarrage (et seulement s'il passe integrity_check). Jamais de base cassée en place (maquette).
export const deposerRemplacement = (bytes, dbPath) => {
    const dir = path.dirname(dbPath);
    const temporaire = path.join(dir, 'remplacement-pending.db');
    fs.writeFileSync(temporaire, bytes);
    try {
        const verif = new Database(temporaire, { readonly: true });
        const verdict = verif.pragma('integrity_check', { simple: true });
        verif.close();
        if (verdict !== 'ok') {
            fs.rmSync(temporaire);
            return { ok: false, erreur: `Fichier corrompu (integrity_check : ${verdict}).` };
        }
    } catch (e) {
        fs.rmSync(temporaire);
        return { ok: false, erreur: `Fichier illisible (pas une base SQLite) : ${e.message}` };
    }
    return { ok: true, temporaire, redemarrage_requis: true };
};

export const adopterRemplacementAuDemarrage = (dbPath) => {
    const dir = path.dirname(dbPath);
    const temporaire = path.join(dir, 'remplacement-pending.db');
    if (!fs.existsSync(temporaire)) return false;
    let verdict = 'error';
    try {
        const verif = new Database(temporaire, { readonly: true });
        verdict = verif.pragma('integrity_check', { simple: true });
        verif.close();
    } catch { fs.rmSync(temporaire); return false; }
    if (verdict !== 'ok') { fs.rmSync(temporaire); return false; }
    fs.copyFileSync(temporaire, dbPath);
    fs.rmSync(temporaire);
    // Piège WAL : un -wal/-shm résiduel de l'ancienne base rejouerait les anciennes
    // transactions PAR-DESSUS la base restaurée — toujours les purger.
    for (const suffixe of ['-wal', '-shm']) {
        try { fs.rmSync(dbPath + suffixe, { force: true }); } catch { /* rien */ }
    }
    return true;
};

const estCLI = (() => {
    try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; }
})();

if (estCLI) {
    faireSauvegarde().then((r) => {
        if (r.ok) console.log('✅ Sauvegarde :', r.fichier, r.televerse ? `→ ${r.televerse}` : '');
        else { console.error('❌', r.erreur); process.exit(1); }
    });
}
