// Gimaweb — API M2b : salles (attribution, planning, conflits) + listes d'attente
// Logique reprise de la maquette (db.js) : setFormationRoom/setFormationDates,
// getRoomPlanning/getRoomConflicts/formationsWithoutRoom, waitlist + option C (l'attente survit à la session).
import express from 'express';
import crypto from 'crypto';
import { normaliserTitre } from './api-formations.js';

const nouvelId = (p) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const creerApiSalles = (db, { sessionValide = () => false, notifier = () => {} } = {}) => {
    const api = express.Router();

    const resolverFormation = (req, res) => {
        const cle = String(req.params.id);
        const f = db.prepare('SELECT * FROM formations WHERE id = ? OR event_id = ?').get(cle, cle);
        if (!f) {
            res.status(404).json({ erreur: 'Formation introuvable.' });
            return null;
        }
        return f;
    };

    // ---- Attribution salle + dates/créneaux (fiche formation) ----
    api.put('/formations/:id/salle', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const roomId = req.body?.room_id || null;
        if (roomId && !db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) {
            return res.status(400).json({ erreur: 'Salle inconnue.' });
        }
        db.prepare('UPDATE formations SET room_id = ? WHERE id = ?').run(roomId, f.id);
        res.json({ formation_id: f.id, room_id: roomId });
    });

    api.put('/formations/:id/dates', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const dates = req.body?.dates;
        if (!Array.isArray(dates) || !dates.length) return res.status(400).json({ erreur: 'dates : [{ date, slot }] requis.' });
        for (const d of dates) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '') || !['AM', 'PM'].includes(d.slot)) {
                return res.status(400).json({ erreur: 'Chaque date : { date: AAAA-MM-JJ, slot: AM|PM }.' });
            }
        }
        db.transaction(() => {
            db.prepare('DELETE FROM formation_dates WHERE formation_id = ?').run(f.id);
            const ins = db.prepare('INSERT INTO formation_dates (id, formation_id, date, slot) VALUES (?, ?, ?, ?)');
            for (const d of dates) ins.run(nouvelId('fd'), f.id, d.date, d.slot);
        })();
        res.json(db.prepare('SELECT date, slot FROM formation_dates WHERE formation_id = ? ORDER BY date ASC').all(f.id));
    });

    api.get('/formations/:id/dates', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        res.json(db.prepare('SELECT date, slot FROM formation_dates WHERE formation_id = ? ORDER BY date ASC').all(f.id));
    });

    // Grille du mois : toutes les occupations (date, slot, salle) avec la formation
    api.get('/salles/planning', (req, res) => {
        const mois = String(req.query.mois || aujourdhui().slice(0, 7)); // YYYY-MM
        if (!/^\d{4}-\d{2}$/.test(mois)) return res.status(400).json({ erreur: 'mois : AAAA-MM.' });
        const debut = `${mois}-01`;
        const fin = `${mois}-31`;
        const formations = db.prepare(
            `SELECT fd.date, fd.slot, fd.formation_id AS fid, f.title, f.event_id, f.categories, f.room_id
             FROM formation_dates fd JOIN formations f ON f.id = fd.formation_id
             WHERE fd.date >= ? AND fd.date <= ? AND lower(coalesce(f.categories, '')) NOT LIKE '%fermeture%'
             ORDER BY fd.date ASC, fd.slot ASC`
        ).all(debut, fin).map((r) => ({ ...r, type: 'formation' }));
        // v1.5.0 : les LOCATIONS de salles occupent aussi des créneaux du planning
        const locations = db.prepare(
            `SELECT ld.date, ld.slot, ld.location_id AS fid, l.titre AS title, l.id AS event_id, NULL AS categories, l.room_id
             FROM location_dates ld JOIN locations l ON l.id = ld.location_id
             WHERE ld.date >= ? AND ld.date <= ?
             ORDER BY ld.date ASC, ld.slot ASC`
        ).all(debut, fin).map((r) => ({ ...r, type: 'location' }));
        res.json(formations.concat(locations));
    });

    // Conflits : même salle × même date × même créneau (non bloquants — notifications côté client, décision maquette)
    api.get('/formations/:id/conflits', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const roomId = req.query.salle || f.room_id;
        if (!roomId) return res.json([]);
        const dates = db.prepare('SELECT date, slot FROM formation_dates WHERE formation_id = ?').all(f.id);
        const conflits = [];
        for (const d of dates) {
            const lignes = db.prepare(
                `SELECT fd.formation_id AS fid, f.title, fd.date, fd.slot
                 FROM formation_dates fd JOIN formations f ON f.id = fd.formation_id
                 WHERE f.room_id = ? AND fd.date = ? AND fd.slot = ? AND fd.formation_id != ?`
            ).all(roomId, d.date, d.slot, f.id);
            conflits.push(...lignes);
        }
        res.json(conflits);
    });

    api.get('/formations/sans-salle', (req, res) => {
        const sansSalle = db.prepare(
            `SELECT f.*, (SELECT COUNT(*) FROM formation_dates fd WHERE fd.formation_id = f.id) AS date_count
             FROM formations f WHERE f.room_id IS NULL
                 AND lower(coalesce(f.categories, '')) NOT LIKE '%fermeture%'
             ORDER BY f.start_date ASC`
        ).all();
        res.json(sansSalle);
    });

    // ---- Administration des salles (derrière session admin) ----
    api.get('/salles', (req, res) => {
        res.json(db.prepare('SELECT * FROM rooms ORDER BY sort_order ASC').all());
    });

    api.post('/salles', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const nom = String(req.body?.name || '').trim();
        if (!nom) return res.status(400).json({ erreur: 'Le nom de la salle est requis.' });
        const ordre = Number(req.body?.sort_order) || (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM rooms').get().m + 1);
        const id = nouvelId('room');
        db.prepare('INSERT INTO rooms (id, name, capacity, sort_order) VALUES (?, ?, ?, ?)')
            .run(id, nom, req.body?.capacity != null ? Number(req.body.capacity) : null, ordre);
        res.status(201).json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
    });

    api.put('/salles/:id', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const salle = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
        if (!salle) return res.status(404).json({ erreur: 'Salle introuvable.' });
        const nom = req.body?.name != null ? String(req.body.name).trim() : salle.name;
        const capacite = req.body?.capacity != null ? Number(req.body.capacity) : salle.capacity;
        const ordre = req.body?.sort_order != null ? Number(req.body.sort_order) : salle.sort_order;
        if (!nom) return res.status(400).json({ erreur: 'Le nom de la salle est requis.' });
        db.prepare('UPDATE rooms SET name = ?, capacity = ?, sort_order = ? WHERE id = ?').run(nom, capacite, ordre, req.params.id);
        res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
    });

    api.delete('/salles/:id', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        const occupee = db.prepare('SELECT COUNT(*) AS n FROM formations WHERE room_id = ?').get(req.params.id).n;
        if (occupee > 0) {
            return res.status(409).json({ erreur: `Suppression refusée : ${occupee} formation(s) attribuée(s) à cette salle.` });
        }
        const info = db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
        if (!info.changes) return res.status(404).json({ erreur: 'Salle introuvable.' });
        res.status(204).end();
    });

    // ---- Listes d'attente ----
    api.post('/listes-attente', (req, res) => {
        const memberId = req.body?.member_id;
        const eventId = req.body?.formation_event_id || null;
        const titre = String(req.body?.formation_title || '').trim();
        if (!memberId) return res.status(400).json({ erreur: 'member_id requis.' });
        if (!eventId && !titre) return res.status(400).json({ erreur: 'formation_event_id ou formation_title requis.' });
        if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) {
            return res.status(404).json({ erreur: 'Membre introuvable.' });
        }
        // Anti-doublon : même membre pour la même formation (event_id ou intitulé) = une seule entrée
        const dup = db.prepare(
            'SELECT id FROM waitlist WHERE member_id = ? AND (formation_event_id = ? OR (formation_event_id IS NULL AND LOWER(formation_title) = LOWER(?)))'
        ).get(memberId, eventId || '', titre);
        if (dup) return res.status(200).json({ id: dup.id, deja_inscrit: true });
        const id = nouvelId('w');
        db.prepare('INSERT INTO waitlist (id, member_id, formation_event_id, formation_title) VALUES (?, ?, ?, ?)')
            .run(id, memberId, eventId, titre || null);
        res.status(201).json({ id, deja_inscrit: false });
    });

    api.delete('/listes-attente/:id', (req, res) => {
        const info = db.prepare('DELETE FROM waitlist WHERE id = ?').run(req.params.id);
        if (!info.changes) return res.status(404).json({ erreur: 'Entrée introuvable.' });
        res.status(204).end();
    });

    api.get('/listes-attente', (req, res) => {
        const eventId = req.query.event_id || '';
        const titre = req.query.titre || '';
        const lignes = db.prepare(
            `SELECT w.*, m.first_name, m.last_name, m.member_no, m.email, m.phone
             FROM waitlist w JOIN members m ON m.id = w.member_id
             WHERE (formation_event_id = ? OR (formation_event_id IS NULL AND LOWER(formation_title) = LOWER(?)))
             ORDER BY w.created_at ASC`
        ).all(eventId, titre);
        res.json(lignes);
    });

    api.get('/listes-attente/top', (req, res) => {
        const limite = Math.min(parseInt(req.query.limite, 10) || 5, 50);
        const lignes = db.prepare(
            `SELECT COALESCE(formation_event_id, formation_title) AS fkey,
             MAX(formation_title) AS title, MAX(formation_event_id) AS event_id,
             COUNT(*) AS waiting,
             SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted
             FROM waitlist
             GROUP BY COALESCE(formation_event_id, formation_title)
             ORDER BY waiting DESC, title ASC LIMIT ${limite}`
        ).all();
        res.json(lignes);
    });

    api.get('/membres/:id/listes-attente', (req, res) => {
        if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.params.id)) {
            return res.status(404).json({ erreur: 'Membre introuvable.' });
        }
        res.json(db.prepare('SELECT * FROM waitlist WHERE member_id = ? ORDER BY created_at ASC').all(req.params.id));
    });

    // Matching synchro : membres en attente pour une formation (event_id OU titre normalisé)
    // Garde critique (maquette) : un titre normalisé vide ne doit JAMAIS matcher tout
    api.get('/formations/:id/liste-attente/match', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const norm = normaliserTitre(f.title);
        const base = 'SELECT w.*, m.first_name, m.last_name, m.member_no, m.email, m.phone FROM waitlist w JOIN members m ON m.id = w.member_id';
        if (!norm || norm.length < 4) {
            return res.json(db.prepare(`${base} WHERE formation_event_id = ? ORDER BY w.created_at ASC`).all(String(f.event_id || '')));
        }
        res.json(db.prepare(
            `${base} WHERE formation_event_id = ? OR (formation_event_id IS NULL AND LOWER(formation_title) LIKE ?) ORDER BY w.created_at ASC`
        ).all(String(f.event_id || ''), `%${norm}%`));
    });

    api.put('/listes-attente/:id/contacte', (req, res) => {
        const info = db.prepare("UPDATE waitlist SET status = 'contacted', contacted_at = datetime('now') WHERE id = ?").run(req.params.id);
        if (!info.changes) return res.status(404).json({ erreur: 'Entrée introuvable.' });
        res.status(204).end();
    });

    // Option C (décision EPN) — l'attente survit à la session : les attentes des
    // sessions passées ou disparues deviennent GÉNÉRIQUES (le sujet, sans event_id).
    const migrerAttentesPassees = () => {
        const today = aujourdhui();
        let migrees = 0, supprimees = 0;
        const genericiser = (entree, titre) => {
            const dup = db.prepare(
                'SELECT id FROM waitlist WHERE member_id = ? AND formation_event_id IS NULL AND formation_title = ?'
            ).get(entree.member_id, titre);
            if (dup) {
                db.prepare('DELETE FROM waitlist WHERE id = ?').run(entree.id);
                supprimees += 1;
            } else {
                db.prepare('UPDATE waitlist SET formation_event_id = NULL, formation_title = ? WHERE id = ?').run(titre, entree.id);
                migrees += 1;
            }
        };
        const passees = db.prepare(
            `SELECT DISTINCT f.event_id, f.title FROM formations f
             JOIN waitlist w ON w.formation_event_id = f.event_id
             WHERE f.start_date IS NOT NULL AND f.start_date < ?`
        ).all(today);
        for (const pf of passees) {
            for (const e of db.prepare('SELECT * FROM waitlist WHERE formation_event_id = ?').all(pf.event_id)) genericiser(e, pf.title);
        }
        const orphelines = db.prepare(
            `SELECT w.* FROM waitlist w WHERE w.formation_event_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM formations f WHERE f.event_id = w.formation_event_id)`
        ).all();
        for (const e of orphelines) genericiser(e, e.formation_title || 'Formation');
        if (migrees + supprimees > 0) {
            notifier('sync',
                `🔄 Sessions passées : ${migrees} attente(s) transférée(s) sur le sujet — ces membres seront rattachés automatiquement à la prochaine session du même titre.`,
                'info', { migrees, supprimees });
        }
        return { migrees, supprimees };
    };

    api.post('/listes-attente/migrer', (req, res) => {
        res.json(migrerAttentesPassees());
    });

    return { api, migrerAttentesPassees };
};
