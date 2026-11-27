// Gimaweb — API M3a : notifications (journal des actions automatiques)
// Règle gravée : toute action automatique est notifiée et journalisée.
import express from 'express';
import crypto from 'crypto';

const nouvelId = () => `n-${crypto.randomUUID()}`;

export const creerNotification = (db) => (type, message, severite = 'info', details = null) => {
    const id = nouvelId();
    db.prepare('INSERT INTO notifications (id, type, severity, message, details) VALUES (?, ?, ?, ?, ?)')
        .run(id, type, severite, message, details ? JSON.stringify(details) : null);
    return id;
};

export const creerApiNotifications = (db) => {
    const api = express.Router();

    // Aperçu cloche : les non-lues d'abord, complétées par les récentes (SQL, pas de filtrage JS)
    api.get('/notifications/avant-premiere', (req, res) => {
        const limite = Math.min(parseInt(req.query.limite, 10) || 8, 50);
        const nonLues = db.prepare('SELECT * FROM notifications WHERE is_read = 0 ORDER BY created_at DESC, id DESC LIMIT ?').all(limite);
        if (nonLues.length < limite) {
            const vus = new Set(nonLues.map((n) => n.id));
            const recentes = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?').all(limite);
            for (const n of recentes) {
                if (nonLues.length >= limite) break;
                if (!vus.has(n.id)) { nonLues.push(n); vus.add(n.id); }
            }
        }
        res.json(nonLues);
    });

    // v1.5.11 : les pastilles ne comptent que les ALERTES non lues (decision EPN —
    // danger/warning + les types alertes de la page notifications) ; le journal
    // d'activite (success/info/sync) reste consultable sans allumer les badges.
    api.get('/notifications/non-lues', (req, res) => {
        const c = db.prepare(
            `SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0 AND (
                severity IN ('warning', 'danger')
                OR type IN ('ticket_urgent', 'error', 'room_needed', 'awaiting_validation')
            )`
        ).get().c;
        res.json({ non_lues: c });
    });

    api.get('/notifications', (req, res) => {
        const limite = Math.min(parseInt(req.query.limite, 10) || 50, 200);
        res.json(db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?').all(limite));
    });

    api.post('/notifications', (req, res) => {
        const type = String(req.body?.type || 'info');
        const message = String(req.body?.message || '').trim();
        if (!message) return res.status(400).json({ erreur: 'message requis.' });
        const id = creerNotification(db)(type, message, req.body?.severity || 'info', req.body?.details || null);
        res.status(201).json({ id });
    });

    api.put('/notifications/:id/lu', (req, res) => {
        const info = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
        if (!info.changes) return res.status(404).json({ erreur: 'Notification introuvable.' });
        res.status(204).end();
    });

    api.put('/notifications/lues', (req, res) => {
        db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
        res.status(204).end();
    });

    api.delete('/notifications/lues', (req, res) => {
        db.prepare('DELETE FROM notifications WHERE is_read = 1').run();
        res.status(204).end();
    });

    api.delete('/notifications', (req, res) => {
        db.prepare('DELETE FROM notifications').run();
        res.status(204).end();
    });

    return api;
};
