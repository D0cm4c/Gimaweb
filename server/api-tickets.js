// Gimaweb — API M4a : tickets (incidents du cyberespace), suggestions, équipe
// Logique reprise de la maquette : tickets (catégories/priorités/statuts consacrés, assigné texte
// libre, commentaires), suggestions (statuts open|done|discarded), équipe (suppression refusée
// si tickets assignés), purge RGPD derrière session admin.
import express from 'express';
import crypto from 'crypto';

const nouvelId = (p) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

export const CATEGORIES_TICKETS = ['computer', 'printer', 'network', 'software', 'furniture', 'other'];
export const PRIORITES_TICKETS = ['low', 'normal', 'high', 'urgent'];
export const STATUTS_TICKETS = ['open', 'in_progress', 'resolved', 'closed'];

export const creerApiTickets = (db, { sessionValide = () => false, notifier = () => {} } = {}) => {
    const api = express.Router();

    // ---- Tickets ----
    api.post('/tickets', (req, res) => {
        const titre = String(req.body?.title || '').trim();
        if (!titre) return res.status(400).json({ erreur: 'Le titre est requis.' });
        const categorie = CATEGORIES_TICKETS.includes(req.body?.category) ? req.body.category : 'other';
        const priorite = PRIORITES_TICKETS.includes(req.body?.priority) ? req.body.priority : 'normal';
        const id = nouvelId('tk');
        db.prepare(
            `INSERT INTO tickets (id, title, description, category, equipment, priority, status, assignee, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
        ).run(id, titre, req.body?.description || null, categorie, req.body?.equipment || null,
              priorite, req.body?.assignee || null, req.body?.created_by || null);
        res.status(201).json(db.prepare('SELECT * FROM tickets WHERE id = ?').get(id));
    });

    api.get('/tickets', (req, res) => {
        const tickets = db.prepare('SELECT * FROM tickets ORDER BY status ASC, priority DESC, created_at DESC').all();
        res.json(tickets);
    });

    api.get('/tickets/:id', (req, res) => {
        const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
        if (!t) return res.status(404).json({ erreur: 'Ticket introuvable.' });
        res.json(t);
    });

    api.put('/tickets/:id', (req, res) => {
        const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
        if (!t) return res.status(404).json({ erreur: 'Ticket introuvable.' });
        const corps = req.body || {};
        const maj = { ...t };
        if (corps.title !== undefined) {
            if (!String(corps.title).trim()) return res.status(400).json({ erreur: 'Le titre ne peut pas être vide.' });
            maj.title = String(corps.title).trim();
        }
        if (corps.description !== undefined) maj.description = corps.description;
        if (corps.category !== undefined) {
            if (!CATEGORIES_TICKETS.includes(corps.category)) return res.status(400).json({ erreur: `category : ${CATEGORIES_TICKETS.join(' | ')}.` });
            maj.category = corps.category;
        }
        if (corps.equipment !== undefined) maj.equipment = corps.equipment;
        if (corps.priority !== undefined) {
            if (!PRIORITES_TICKETS.includes(corps.priority)) return res.status(400).json({ erreur: `priority : ${PRIORITES_TICKETS.join(' | ')}.` });
            maj.priority = corps.priority;
        }
        if (corps.status !== undefined) {
            if (!STATUTS_TICKETS.includes(corps.status)) return res.status(400).json({ erreur: `status : ${STATUTS_TICKETS.join(' | ')}.` });
            maj.status = corps.status;
            maj.resolved_at = ['resolved', 'closed'].includes(corps.status) ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
        }
        if (corps.assignee !== undefined) maj.assignee = corps.assignee;
        db.prepare(
            `UPDATE tickets SET title = ?, description = ?, category = ?, equipment = ?, priority = ?, status = ?, assignee = ?, resolved_at = ?, updated_at = datetime('now')
             WHERE id = ?`
        ).run(maj.title, maj.description, maj.category, maj.equipment, maj.priority, maj.status, maj.assignee, maj.resolved_at, req.params.id);
        res.json(db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id));
    });

    api.delete('/tickets/:id', (req, res) => {
        // Suppression derrière garde admin (décision utilisateur, maquette)
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        db.prepare('DELETE FROM ticket_comments WHERE ticket_id = ?').run(req.params.id);
        const info = db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
        if (!info.changes) return res.status(404).json({ erreur: 'Ticket introuvable.' });
        res.status(204).end();
    });

    api.post('/tickets/:id/commentaires', (req, res) => {
        if (!db.prepare('SELECT 1 FROM tickets WHERE id = ?').get(req.params.id)) {
            return res.status(404).json({ erreur: 'Ticket introuvable.' });
        }
        const message = String(req.body?.message || '').trim();
        if (!message) return res.status(400).json({ erreur: 'Le message est requis.' });
        const id = nouvelId('tc');
        db.prepare('INSERT INTO ticket_comments (id, ticket_id, author, message) VALUES (?, ?, ?, ?)')
            .run(id, req.params.id, req.body?.author || null, message);
        res.status(201).json(db.prepare('SELECT * FROM ticket_comments WHERE id = ?').get(id));
    });

    api.get('/tickets/:id/commentaires', (req, res) => {
        if (!db.prepare('SELECT 1 FROM tickets WHERE id = ?').get(req.params.id)) {
            return res.status(404).json({ erreur: 'Ticket introuvable.' });
        }
        res.json(db.prepare('SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC, id ASC').all(req.params.id));
    });

    // ---- Suggestions ----
    api.post('/suggestions', (req, res) => {
        const message = String(req.body?.message || '').trim();
        if (!message) return res.status(400).json({ erreur: 'Le message est requis.' });
        const id = nouvelId('s');
        db.prepare('INSERT INTO suggestions (id, message, page, author) VALUES (?, ?, ?, ?)')
            .run(id, message, req.body?.page || null, req.body?.author || null);
        res.status(201).json({ id });
    });

    api.get('/suggestions', (req, res) => {
        const statut = req.query.statut;
        const lignes = statut
            ? db.prepare('SELECT * FROM suggestions WHERE status = ? ORDER BY created_at DESC').all(statut)
            : db.prepare('SELECT * FROM suggestions ORDER BY created_at DESC').all();
        res.json(lignes);
    });

    api.get('/suggestions/ouvertes', (req, res) => {
        res.json({ ouvertes: db.prepare("SELECT COUNT(*) AS c FROM suggestions WHERE status = 'open'").get().c });
    });

    api.put('/suggestions/:id/statut', (req, res) => {
        const statut = req.body?.status;
        if (!['open', 'done', 'discarded'].includes(statut)) {
            return res.status(400).json({ erreur: 'status : open | done | discarded.' });
        }
        const info = db.prepare("UPDATE suggestions SET status = ?, handled_at = datetime('now') WHERE id = ?").run(statut, req.params.id);
        if (!info.changes) return res.status(404).json({ erreur: 'Suggestion introuvable.' });
        res.status(204).end();
    });

    // ---- Équipe (animateurs — pas de comptes) ----
    api.get('/equipe', (req, res) => {
        res.json(db.prepare('SELECT * FROM team_members ORDER BY sort_order ASC, name ASC').all());
    });

    api.post('/equipe', (req, res) => {
        const nom = String(req.body?.name || '').trim();
        if (!nom) return res.status(400).json({ erreur: 'Le nom est requis.' });
        const id = nouvelId('tm');
        const ordre = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS v FROM team_members').get().v + 1;
        db.prepare('INSERT INTO team_members (id, name, sort_order) VALUES (?, ?, ?)').run(id, nom, ordre);
        res.status(201).json(db.prepare('SELECT * FROM team_members WHERE id = ?').get(id));
    });

    api.delete('/equipe/:id', (req, res) => {
        const membre = db.prepare('SELECT name FROM team_members WHERE id = ?').get(req.params.id);
        if (!membre) return res.status(404).json({ erreur: 'Membre introuvable.' });
        // Suppression refusée si des tickets sont assignés à ce nom (maquette)
        const bloquants = db.prepare('SELECT title FROM tickets WHERE assignee = ?').all(membre.name);
        if (bloquants.length) {
            return res.status(409).json({ erreur: `Suppression refusée : ${bloquants.length} ticket(s) assigné(s).`, bloquants });
        }
        db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
        res.status(204).end();
    });

    // ---- RGPD : purge globale derrière session admin (périmètre exact de la maquette) ----
    api.post('/rgpd/purge', (req, res) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        let supprimes = 0;
        db.transaction(() => {
            for (const table of ['visits', 'prints', 'formations_members', 'members', 'bookings_remote', 'suggestions', 'waitlist', 'fm_payment_log']) {
                const info = db.prepare(`DELETE FROM ${table}`).run();
                supprimes += info.changes;
            }
        })();
        notifier('info', '🧹 Purge RGPD effectuée : toutes les données personnelles supprimées (formations/salles conservées).', 'warning', { supprimes });
        res.json({ supprimes });
    });

    return api;
};
