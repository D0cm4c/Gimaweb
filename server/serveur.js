// Gimaweb — serveur M0 : squelette Express + base SQLite (schéma 16 tables) + /api/sante
// Rôle A : servir les fichiers statiques du frontend (public/ — copie chartée de la maquette, livrée en M5)
// Rôle B : l'API /api/… (contrat docs/CONTRAT-API.md — endpoints métier dès M1)
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { createRequire } from 'module';
const VERSION = createRequire(import.meta.url)('../package.json').version;
import { creerApiMembres } from './api-membres.js';
import { creerApiVisites } from './api-visites.js';
import { creerApiFormations } from './api-formations.js';
import { creerApiSalles } from './api-salles.js';
import { creerApiNotifications } from './api-notifications.js';
import { creerApiBookings } from './api-bookings.js';
import { creerApiTickets } from './api-tickets.js';
import { creerApiLocations } from './api-locations.js';
import { creerApiAgregats } from './api-agregats.js';
import { creerApiSauvegarde, adopterRemplacementAuDemarrage } from './sauvegarde.js';
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
// Restauration en attente ? (POST /api/base/remplacement — validation integrity_check, jamais de base cassée)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
adopterRemplacementAuDemarrage(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(RACINE, 'server', 'schema.sql'), 'utf8'));

// Migration M5c : visits.member_id devient nullable (visites anonymes) sur les bases existantes
const memberIdNullable = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('visits') WHERE name = 'member_id' AND [notnull] = 0").get();
if (memberIdNullable.n === 0) {
    db.exec(`DROP INDEX IF EXISTS idx_visits_member_date;
        CREATE TABLE visits_mig (
            id TEXT PRIMARY KEY,
            member_id TEXT,
            visit_date TEXT NOT NULL,
            amount REAL DEFAULT 1.0,
            reason TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
        );
        INSERT INTO visits_mig (id, member_id, visit_date, amount, reason, created_at) SELECT id, member_id, visit_date, amount, reason, created_at FROM visits;
        DROP TABLE visits;
        ALTER TABLE visits_mig RENAME TO visits;
        CREATE INDEX IF NOT EXISTS idx_visits_member_date ON visits(member_id, visit_date);`);
    console.log('[gimaweb] migration M5c : visits.member_id nullable (visites anonymes)');
}

// Salles par défaut au premier démarrage (seed — cf. maquette)
const compteSalles = db.prepare('SELECT COUNT(*) AS n FROM rooms').get();
if (compteSalles.n === 0) {
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
// Vérification de session : le navigateur NE FAIT PAS CONFIANCE à sa mémoire locale
// (un redémarrage du serveur purge les sessions en mémoire — erreur production v1.2.2)
auth.get('/verification', (req, res) => {
    res.json({ valide: sessionValide(req) });
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
// Import XML de l'ancienne base Access : le XML des 3 806 membres dépasse largement 2 Mo
// → limite dédiée AVANT le parseur JSON global (le garde 50 Mo reste côté endpoint)
app.use('/api/membres/import', express.json({ limit: '64mb' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/sante', (req, res) => {
    const salleCount = db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
    res.json({
        status: 'ok',
        service: 'gimaweb',
        version: VERSION,
        base: path.basename(DB_PATH),
        salles: salleCount
    });
});
app.use('/api/auth', auth);
// Endpoints métier par phase (docs/CONCEPTION.md §6) — M1a : membres
app.use('/api', creerApiMembres(db, { sessionValide, notifier: (type, message, severite, details) => notifier(type, message, severite, details) }));
app.use('/api', creerApiVisites(db));

// Journal des actions automatiques (règle : tout automatisme est notifié)
const notifier = (type, message, severite = 'info', details = null) => {
    db.prepare('INSERT INTO notifications (id, type, severity, message, details) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), type, severite, message, details ? JSON.stringify(details) : null);
};

const salles = creerApiSalles(db, { sessionValide, notifier });
const prochainNumero = () => {
    const utilises = new Set(db.prepare('SELECT member_no FROM members WHERE member_no IS NOT NULL').all().map((r) => r.member_no));
    let n = 1000;
    while (utilises.has(n)) n += 1;
    return n <= 9999 ? n : null;
};
app.use('/api', creerApiNotifications(db));
app.use('/api', creerApiBookings(db, { notifier, prochainNumero }));
app.use('/api', creerApiTickets(db, { sessionValide, notifier }));
app.use('/api', creerApiLocations(db, { sessionValide, notifier }));
app.use('/api', creerApiAgregats(db));
app.use('/api', creerApiSauvegarde({ sessionValide, notifier, dbPath: DB_PATH }));
app.use('/api', salles.api);
app.use('/api', creerApiFormations(db, { apresSync: salles.migrerAttentesPassees }));
app.use('/api', (req, res) => res.status(501).json({ erreur: 'Endpoint non encore livré (phase M2+).' }));

// Rôle A : fichiers statiques du frontend (public/ — livré en M5)
app.use(express.static(path.join(RACINE, 'public')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[gimaweb] http://0.0.0.0:${PORT} — base ${DB_PATH}`);
});
