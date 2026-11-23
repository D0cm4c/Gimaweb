// Gimaweb — serveur M0 : squelette Express + base SQLite (schéma 16 tables) + /api/sante
// Rôle A : servir les fichiers statiques du frontend (public/ — copie chartée de la maquette, livrée en M5)
// Rôle B : l'API /api/… (contrat docs/CONTRAT-API.md — endpoints métier dès M1)
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { creerApiMembres } from './api-membres.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(RACINE, 'data', 'gimaweb.db');
const MOT_DE_PASSE_HASH = process.env.ADMIN_HASH_SHA256 || '';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 min, comme la maquette

// Sûreté de démarrage : le mot de passe admin doit être configuré (aucun secret par défaut)
if (!MOT_DE_PASSE_HASH) {
    console.error('[gimaweb] ERREUR : définir ADMIN_HASH_SHA256 dans .env (sha256 du mot de passe admin).');
    process.exit(1);
}

// ---- Base SQLite unique (WAL multi-postes) ----
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(RACINE, 'server', 'schema.sql'), 'utf8'));

// Salles par défaut au premier démarrage (seed — cf. maquette)
const salles = db.prepare('SELECT COUNT(*) AS n FROM rooms').get();
if (salles.n === 0) {
    const seed = db.prepare('INSERT INTO rooms (id, name, capacity, sort_order) VALUES (?, ?, ?, ?)');
    seed.run('room-grande', 'Grande salle', 15, 1);
    seed.run('room-petite', 'Petite salle', 8, 2);
    seed.run('room-cyber', 'Cyber-espace', 25, 3);
}

// ---- Auth : mot de passe unique partagé + cookie de session (décision figée n° 1) ----
const sessions = new Map(); // token -> expire
const cookieHeader = (res, token, maxAgeS) => {
    res.setHeader('Set-Cookie', `gimaweb_session=${token}; HttpOnly; Path=/; Max-Age=${maxAgeS}; SameSite=Lax`);
};
const auth = express.Router();
auth.post('/connexion', (req, res) => {
    const passe = String((req.body && req.body.password) || '');
    const hash = crypto.createHash('sha256').update(passe, 'utf8').digest('hex');
    if (hash !== MOT_DE_PASSE_HASH) {
        return res.status(401).json({ erreur: 'Mot de passe incorrect.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_DURATION_MS);
    cookieHeader(res, token, Math.round(SESSION_DURATION_MS / 1000));
    res.json({ ok: true, duree_minutes: SESSION_DURATION_MS / 60000 });
});
auth.post('/deconnexion', (req, res) => {
    const token = (req.headers.cookie || '').match(/gimaweb_session=([a-f0-9]+)/);
    if (token) sessions.delete(token[1]);
    cookieHeader(res, '', 0);
    res.json({ ok: true });
});
const sessionValide = (req) => {
    const m = (req.headers.cookie || '').match(/gimaweb_session=([a-f0-9]+)/);
    if (!m) return false;
    const expire = sessions.get(m[1]);
    if (!expire || expire < Date.now()) {
        sessions.delete(m[1]);
        return false;
    }
    return true;
};
// Garde admin pour les endpoints sensibles (purge RGPD, remplacement de base, réglages)
const gardeAdmin = (req, res, next) => {
    if (sessionValide(req)) return next();
    res.status(401).json({ erreur: 'Session admin requise.' });
};

// ---- Application ----
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/api/sante', (req, res) => {
    const salleCount = db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
    res.json({
        status: 'ok',
        service: 'gimaweb',
        version: '0.1.0',
        phase: 'M0 — squelette',
        base: path.basename(DB_PATH),
        salles: salleCount
    });
});
app.use('/api/auth', auth);
// Endpoints métier par phase (docs/CONCEPTION.md §6) — M1a : membres
app.use('/api', creerApiMembres(db, { sessionValide }));
app.use('/api', (req, res) => res.status(501).json({ erreur: 'Endpoint non encore livré (phase M2+).' }));

// Rôle A : fichiers statiques du frontend (public/ — livré en M5)
app.use(express.static(path.join(RACINE, 'public')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[gimaweb] http://0.0.0.0:${PORT} — base ${DB_PATH}`);
});
