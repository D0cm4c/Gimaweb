// Gimaweb — API M2a : formations (sync serveur, lectures, inscriptions, paiements/présence)
// Logique reprise de la maquette : syncFormations (maj/ajout/retrait + dates/creneaux),
// registerMemberToFormation (sortie de liste d'attente), setFmPayment (journal d'audit).
import express from 'express';
import crypto from 'crypto';
import { chargerFormations } from './mec.js';

const nouvelId = (p) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const maintenant = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// Titre normalisé : minuscules, sans la partie dates, sans ponctuation (maquette)
export const normaliserTitre = (titre) => String(titre || '')
    .toLowerCase()
    .replace(/\s*\b(les?|du)\s+\d{1,2}(\s*[,\u2013-]\s*\d{1,2})*\s*(\w+)?\b.*$/g, '')
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const creerApiFormations = (db) => {
    const api = express.Router();

    // ---- Sync : le serveur fetch le site lui-même (plus jamais le navigateur) ----
    // Retire les formations disparues du flux (et leurs inscriptions via CASCADE).
    const synchroniser = async () => {
        const events = await chargerFormations();
        const now = new Date().toISOString();
        const keptIds = [];
        let ajoutees = 0, misesAJour = 0;
        for (const ev of events) {
            const existing = db.prepare('SELECT id FROM formations WHERE event_id = ?').get(String(ev.id));
            const categories = (ev.categories || []).join(', ');
            if (existing) {
                db.prepare(
                    `UPDATE formations SET title = ?, start_date = ?, date_text = ?, time_label = ?, duration = ?, excerpt = ?,
                     url = ?, categories = ?, price = COALESCE(?, price), location = COALESCE(?, location),
                     organizer = COALESCE(?, organizer), labels = COALESCE(?, labels), synced_at = ? WHERE event_id = ?`
                ).run(
                    ev.title, ev.startDate || null, ev.dateText || null, ev.timeLabel || null, ev.duration || null, ev.excerpt || null,
                    ev.url || null, categories || null, ev.price || null, ev.location || null, ev.organizer || null,
                    (ev.labels || []).join(', ') || null, now, String(ev.id)
                );
                misesAJour += 1;
                keptIds.push(existing.id);
            } else {
                const formationId = nouvelId('f');
                db.prepare(
                    `INSERT INTO formations (id, event_id, title, start_date, date_text, time_label, duration, excerpt, url,
                                             categories, price, location, organizer, labels, room_id, synced_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                    formationId, String(ev.id), ev.title, ev.startDate || null, ev.dateText || null, ev.timeLabel || null,
                    ev.duration || null, ev.excerpt || null, ev.url || null, categories || null,
                    ev.price || null, ev.location || null, ev.organizer || null, (ev.labels || []).join(', ') || null, null, now
                );
                ajoutees += 1;
                keptIds.push(formationId);
            }
            // Dates + créneaux pour le planning des salles (remplacées à chaque sync)
            if (ev.dates && ev.dates.length) {
                const slot = ev.slot || 'AM';
                db.prepare('DELETE FROM formation_dates WHERE formation_id = ?').run(keptIds[keptIds.length - 1]);
                const ins = db.prepare('INSERT OR IGNORE INTO formation_dates (id, formation_id, date, slot) VALUES (?, ?, ?, ?)');
                for (const d of ev.dates) ins.run(nouvelId('fd'), keptIds[keptIds.length - 1], d, slot);
            }
        }
        let retirees = 0;
        if (keptIds.length) {
            const placeholders = keptIds.map(() => '?').join(', ');
            const info = db.prepare(`DELETE FROM formations WHERE id NOT IN (${placeholders})`).run(...keptIds);
            retirees = info.changes;
        }
        // Journal (règle : toute action automatique est notifiée)
        if (events.length) {
            db.prepare('INSERT INTO notifications (id, type, severity, message, details) VALUES (?, ?, ?, ?, ?)').run(
                nouvelId('n'), 'sync_formations', 'success',
                `🔄 Sync formations : ${events.length} dans le flux — ${ajoutees} ajoutée(s), ${misesAJour} mise(s) à jour, ${retirees} retirée(s).`,
                JSON.stringify({ total: events.length, ajoutees, misesAJour, retirees })
            );
        }
        return { total: events.length, ajoutees, misesAJour, retirees };
    };

    // Mémoire de sync : 15 min (TTL maquette). let DERNIERE_SYNC ici pour rester simple.
    let derniereSync = 0;
    const SYNC_TTL = 15 * 60 * 1000;

    api.post('/formations/sync', async (req, res) => {
        try {
            const resultat = await synchroniser();
            derniereSync = Date.now();
            res.json(resultat);
        } catch (e) {
            res.status(502).json({ erreur: `Sync impossible (site injoignable ?) : ${e.message}` });
        }
    });

    const resolverFormation = (req, res) => {
        // id interne OU event_id MEC (la maquette référence les deux)
        const cle = String(req.params.id);
        const f = db.prepare('SELECT * FROM formations WHERE id = ? OR event_id = ?').get(cle, cle);
        if (!f) {
            res.status(404).json({ erreur: 'Formation introuvable.' });
            return null;
        }
        return f;
    };

    api.get('/formations', async (req, res) => {
        // Auto-sync si les données sont périmées (> 15 min) — transparent pour le lecteur
        if (Date.now() - derniereSync > SYNC_TTL) {
            try {
                await synchroniser();
                derniereSync = Date.now();
            } catch { /* site injoignable : on sert les données en base */ }
        }
        const formations = db.prepare(
            `SELECT f.*,
             (SELECT COUNT(*) FROM formations_members fm WHERE fm.formation_id = f.id) AS attendee_count,
             (SELECT COUNT(*) FROM formations_members fm WHERE fm.formation_id = f.id AND fm.payment IS NOT NULL) AS paid_count
             FROM formations f ORDER BY f.start_date ASC`
        ).all();
        res.json(formations);
    });

    api.get('/formations/:id', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const dates = db.prepare('SELECT date, slot FROM formation_dates WHERE formation_id = ? ORDER BY date ASC').all(f.id);
        const inscrits = db.prepare('SELECT COUNT(*) AS n FROM formations_members WHERE formation_id = ?').get(f.id).n;
        res.json({ ...f, dates, inscrits });
    });

    // ---- Inscriptions locales ----
    api.post('/formations/:id/inscrits', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const memberId = req.body?.member_id;
        if (!memberId) return res.status(400).json({ erreur: 'member_id requis.' });
        if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) {
            return res.status(404).json({ erreur: 'Membre introuvable.' });
        }
        // L'inscription retire de la liste d'attente (event_id + attentes génériques du même titre)
        db.prepare('DELETE FROM waitlist WHERE member_id = ? AND formation_event_id = ?').run(memberId, String(f.event_id || ''));
        const nt = normaliserTitre(f.title);
        if (nt && nt.length >= 4) {
            const generiques = db.prepare('SELECT id, formation_title FROM waitlist WHERE member_id = ? AND formation_event_id IS NULL').all(memberId);
            for (const g of generiques) {
                if (normaliserTitre(g.formation_title) === nt) db.prepare('DELETE FROM waitlist WHERE id = ?').run(g.id);
            }
        }
        const deja = db.prepare('SELECT id FROM formations_members WHERE formation_id = ? AND member_id = ?').get(f.id, memberId);
        if (deja) return res.status(409).json({ erreur: 'Déjà inscrit.', lien: deja.id });
        const rid = nouvelId('fm');
        db.prepare('INSERT INTO formations_members (id, formation_id, member_id) VALUES (?, ?, ?)').run(rid, f.id, memberId);
        res.status(201).json({ id: rid, formation_id: f.id, member_id: memberId });
    });

    api.delete('/formations/:id/inscrits/:memberId', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        db.prepare('DELETE FROM formations_members WHERE formation_id = ? AND member_id = ?').run(f.id, req.params.memberId);
        res.status(204).end();
    });

    api.get('/formations/:id/inscrits', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const inscrits = db.prepare(
            `SELECT m.id, m.first_name, m.last_name, m.member_no, m.email, m.phone,
                    fm.registered_at, fm.payment, fm.payment_at, fm.attendance
             FROM formations_members fm JOIN members m ON m.id = fm.member_id
             WHERE fm.formation_id = ? ORDER BY m.last_name ASC`
        ).all(f.id);
        res.json(inscrits);
    });

    // Formations d'un membre (fiche membre)
    api.get('/membres/:id/formations', (req, res) => {
        if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.params.id)) {
            return res.status(404).json({ erreur: 'Membre introuvable.' });
        }
        const formations = db.prepare(
            `SELECT f.id, f.event_id, f.title, f.start_date, f.date_text, f.time_label, f.url, f.categories,
                    fm.payment, fm.attendance
             FROM formations_members fm JOIN formations f ON f.id = fm.formation_id
             WHERE fm.member_id = ? ORDER BY f.start_date DESC`
        ).all(req.params.id);
        res.json(formations);
    });

    // ---- Suivi paiement / présence (fiche formation) ----
    api.put('/formations/:id/inscrits/:memberId', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const lien = db.prepare('SELECT id FROM formations_members WHERE formation_id = ? AND member_id = ?').get(f.id, req.params.memberId);
        if (!lien) return res.status(404).json({ erreur: 'Inscription introuvable.' });
        const body = req.body || {};
        if (body.payment !== undefined) {
            const paiement = body.payment === null ? null : String(body.payment);
            if (paiement !== null && !['bancontact', 'cash'].includes(paiement)) {
                return res.status(400).json({ erreur: "Paiement invalide (bancontact | cash | null)." });
            }
            db.prepare('UPDATE formations_members SET payment = ?, payment_at = ? WHERE formation_id = ? AND member_id = ?')
                .run(paiement, paiement ? maintenant() : null, f.id, req.params.memberId);
            // Journal d'audit : chaque clic (paiement ou annulation) est tracé
            db.prepare('INSERT INTO fm_payment_log (formation_id, member_id, action, method) VALUES (?, ?, ?, ?)')
                .run(f.id, req.params.memberId, paiement ? 'paid' : 'cleared', paiement || null);
        }
        if (body.attendance !== undefined) {
            const presence = body.attendance === null ? null : String(body.attendance);
            if (presence !== null && !['present', 'canceled'].includes(presence)) {
                return res.status(400).json({ erreur: "Présence invalide (present | canceled | null)." });
            }
            db.prepare('UPDATE formations_members SET attendance = ? WHERE formation_id = ? AND member_id = ?')
                .run(presence, f.id, req.params.memberId);
        }
        const maj = db.prepare('SELECT payment, payment_at, attendance FROM formations_members WHERE formation_id = ? AND member_id = ?')
            .get(f.id, req.params.memberId);
        res.json(maj);
    });

    api.get('/formations/:id/inscrits/:memberId/paiements', (req, res) => {
        const f = resolverFormation(req, res);
        if (!f) return;
        const journal = db.prepare(
            'SELECT action, method, created_at FROM fm_payment_log WHERE formation_id = ? AND member_id = ? ORDER BY created_at ASC, id ASC'
        ).all(f.id, req.params.memberId);
        res.json(journal);
    });

    // Intitulés distincts (dropdown des intérêts — une entrée par formation réelle)
    api.get('/formations/titres/distincts', (req, res) => {
        const rows = db.prepare('SELECT event_id, title, start_date FROM formations ORDER BY start_date DESC').all();
        const vus = new Set();
        const out = [];
        for (const f of rows) {
            const cle = (f.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
            if (!cle || vus.has(cle)) continue;
            vus.add(cle);
            out.push({ event_id: f.event_id, title: f.title });
        }
        out.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
        res.json(out);
    });

    return api;
};
