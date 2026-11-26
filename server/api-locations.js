// Gimaweb — API v1.5.0 : locations de salles (locations.html / location.html)
// L'Atelier loue ses salles à des tiers, avec ou sans animateur. Interne à Gimaweb :
// ces locations ne remontent JAMAIS vers le site public (aucune inscription, aucune sync
// ascendante — le serveur est pull-only de toute façon). Elles partagent avec les
// formations la grille des créneaux (AM 9h30-12h30 / PM 13h30-16h30) et la détection
// de conflits du planning des salles.
import express from 'express';
import crypto from 'crypto';

const nouvelId = (p) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const creerApiLocations = (db, { sessionValide = () => false, notifier = () => {} } = {}) => {
    const api = express.Router();

    const validerDates = (dates) => {
        if (!Array.isArray(dates) || !dates.length) return { erreur: 'Au moins une date est requise.' };
        if (dates.length > 400) return { erreur: 'Trop de dates (400 max).' };
        for (const d of dates) {
            if (!d || !RE_DATE.test(String(d.date)) || !['AM', 'PM'].includes(d.slot)) {
                return { erreur: 'Chaque date doit être { date: AAAA-MM-JJ, slot: AM|PM }.' };
            }
        }
        return null;
    };

    // ---- Liste (filtre toutes / à venir côté client via premiere_date) ----
    api.get('/locations', (req, res) => {
        const rows = db.prepare(
            `SELECT l.*, r.name AS room_name,
                    (SELECT MIN(date) FROM location_dates WHERE location_id = l.id) AS premiere_date,
                    (SELECT MAX(date) FROM location_dates WHERE location_id = l.id) AS derniere_date,
                    (SELECT COUNT(*) FROM location_dates WHERE location_id = l.id) AS nb_seances,
                    EXISTS (SELECT 1 FROM location_dates WHERE location_id = l.id AND date >= date('now')) AS a_venir
             FROM locations l LEFT JOIN rooms r ON r.id = l.room_id
             ORDER BY premiere_date ASC`
        ).all();
        res.json(rows);
    });

    api.post('/locations', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const titre = String(req.body?.titre || '').trim();
        if (!titre) return res.status(400).json({ erreur: 'Le titre (locataire/intitulé) est requis.' });
        const room = req.body?.room_id ? db.prepare('SELECT * FROM rooms WHERE id = ?').get(String(req.body.room_id)) : null;
        if (!room) return res.status(400).json({ erreur: 'Salle inconnue — choisis une salle de l\u2019Atelier.' });
        const probleme = validerDates(req.body?.dates);
        if (probleme) return res.status(400).json(probleme);

        const id = nouvelId('loc');
        db.prepare('INSERT INTO locations (id, titre, room_id, animateur, contact, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(id, titre, room.id,
                String(req.body?.animateur || '').trim() || null,
                String(req.body?.contact || '').trim() || null,
                String(req.body?.notes || '').trim() || null,
                new Date().toISOString());
        const ins = db.prepare('INSERT OR IGNORE INTO location_dates (id, location_id, date, slot) VALUES (?, ?, ?, ?)');
        for (const d of req.body.dates) ins.run(nouvelId('ld'), id, d.date, d.slot);
        notifier('location_creee', `\uD83D\uDD11 Location cr\u00e9\u00e9e : \u00ab ${titre} \u00bb en ${room.name} (${req.body.dates.length} cr\u00e9neau${req.body.dates.length > 1 ? 'x' : ''}).`,
            'success', JSON.stringify({ location_id: id }));
        res.status(201).json(db.prepare('SELECT * FROM locations WHERE id = ?').get(id));
    });

    // ---- Fiche ----
    api.get('/locations/:id', (req, res) => {
        const l = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
        if (!l) return res.status(404).json({ erreur: 'Location introuvable.' });
        l.dates = db.prepare('SELECT date, slot FROM location_dates WHERE location_id = ? ORDER BY date ASC, slot ASC').all(l.id);
        const room = l.room_id ? db.prepare('SELECT name FROM rooms WHERE id = ?').get(l.room_id) : null;
        l.room_name = room ? room.name : null;
        res.json(l);
    });

    api.put('/locations/:id', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const l = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
        if (!l) return res.status(404).json({ erreur: 'Location introuvable.' });
        const titre = String(req.body?.titre ?? l.titre).trim();
        if (!titre) return res.status(400).json({ erreur: 'Le titre est requis.' });
        let roomId = l.room_id;
        if (req.body?.room_id !== undefined) {
            const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(String(req.body.room_id));
            if (!room) return res.status(400).json({ erreur: 'Salle inconnue.' });
            roomId = room.id;
        }
        db.prepare('UPDATE locations SET titre = ?, room_id = ?, animateur = ?, contact = ?, notes = ? WHERE id = ?')
            .run(titre, roomId,
                String(req.body?.animateur ?? l.animateur ?? '').trim() || null,
                String(req.body?.contact ?? l.contact ?? '').trim() || null,
                String(req.body?.notes ?? l.notes ?? '').trim() || null,
                l.id);
        if (req.body?.dates) {
            const probleme = validerDates(req.body.dates);
            if (probleme) return res.status(400).json(probleme);
            db.prepare('DELETE FROM location_dates WHERE location_id = ?').run(l.id);
            const ins = db.prepare('INSERT OR IGNORE INTO location_dates (id, location_id, date, slot) VALUES (?, ?, ?, ?)');
            for (const d of req.body.dates) ins.run(nouvelId('ld'), l.id, d.date, d.slot);
        }
        notifier('location_modifiee', `\uD83D\uDD11 Location modifi\u00e9e : \u00ab ${titre} \u00bb.`, 'info', JSON.stringify({ location_id: l.id }));
        res.json(db.prepare('SELECT * FROM locations WHERE id = ?').get(l.id));
    });

    api.delete('/locations/:id', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const l = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
        if (!l) return res.status(404).json({ erreur: 'Location introuvable.' });
        db.prepare('DELETE FROM location_dates WHERE location_id = ?').run(l.id);
        db.prepare('DELETE FROM locations WHERE id = ?').run(l.id);
        notifier('location_supprimee', `\uD83D\uDD11 Location supprim\u00e9e : \u00ab ${l.titre} \u00bb.`, 'warning', JSON.stringify({ location_id: l.id }));
        res.status(204).end();
    });

    // ---- Conflits : mêmes créneaux occupés par une autre location ou une formation ----
    api.get('/locations/:id/conflits', (req, res) => {
        const l = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
        if (!l) return res.status(404).json({ erreur: 'Location introuvable.' });
        const dates = db.prepare('SELECT date, slot FROM location_dates WHERE location_id = ?').all(l.id);
        const conflits = [];
        for (const d of dates) {
            const autresLocs = db.prepare(
                `SELECT l2.titre, ld.date, ld.slot FROM location_dates ld JOIN locations l2 ON l2.id = ld.location_id
                 WHERE ld.location_id != ? AND l2.room_id = ? AND ld.date = ? AND ld.slot = ?`
            ).all(l.id, l.room_id, d.date, d.slot);
            for (const o of autresLocs) conflits.push({ type: 'location', ...o });
            const formations = db.prepare(
                `SELECT f.title, f.event_id, fd.date, fd.slot FROM formation_dates fd JOIN formations f ON f.id = fd.formation_id
                 WHERE f.room_id = ? AND fd.date = ? AND fd.slot = ?`
            ).all(l.room_id, d.date, d.slot);
            for (const f of formations) conflits.push({ type: 'formation', titre: f.title, date: f.date, slot: f.slot, event_id: f.event_id });
        }
        res.json(conflits);
    });

    return api;
};
