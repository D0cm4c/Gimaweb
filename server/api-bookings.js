// Gimaweb — API M3b : réservations du site (bookings_remote) + matching + miroir
// Miroir gravé : « le site vend, l'app gère » — une réservation annulée côté site
// retire automatiquement l'inscription locale (toujours notifiée, jamais silencieuse).
// Matching hiérarchique : n° de membre > email exact (LOWER) > nom+prénom (candidats — jamais auto).
import express from 'express';
import crypto from 'crypto';

const nouvelId = (p) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

const normaliserNom = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export const creerApiBookings = (db, { notifier = () => {}, prochainNumero = () => null } = {}) => {
    const api = express.Router();

    // ---- Garde : endpoint appelé par le plugin WP avec un secret server-to-server ----
    const BOOKINGS_SECRET = process.env.BOOKINGS_SECRET || '';
    const secretOk = (req) => {
        if (!BOOKINGS_SECRET) return false;
        const auth = req.headers.authorization || '';
        return auth === `Bearer ${BOOKINGS_SECRET}` || req.get('x-adw-secret') === BOOKINGS_SECRET;
    };

    // ---- Matching hiérarchique (maquette matchBookingToMember) ----
    const matcherMembre = (booking) => {
        if (booking.member_no != null && booking.member_no !== '') {
            const parNo = db.prepare('SELECT * FROM members WHERE member_no = ? LIMIT 2').all(Number(booking.member_no));
            if (parNo.length === 1) return { member: parNo[0], method: 'member_no', certain: true };
        }
        if (booking.email) {
            const parEmail = db.prepare('SELECT * FROM members WHERE LOWER(email) = LOWER(?) LIMIT 2').all(booking.email);
            if (parEmail.length === 1) return { member: parEmail[0], method: 'email', certain: true };
            if (parEmail.length > 1) return { candidates: parEmail, method: 'email', certain: false };
        }
        const candidats = db.prepare('SELECT * FROM members WHERE LOWER(last_name) = ? AND LOWER(first_name) = ?')
            .all(normaliserNom(booking.last_name), normaliserNom(booking.first_name));
        if (candidats.length) return { candidates: candidats, method: 'name', certain: false };
        return { method: 'none', certain: false };
    };

    // Inscription locale du member à la formation du booking (event_id → formation)
    const inscrireDuBooking = (b, memberId) => {
        const f = db.prepare('SELECT id, title FROM formations WHERE event_id = ?').get(String(b.event_id || ''));
        if (!f) return null;
        const deja = db.prepare('SELECT id FROM formations_members WHERE formation_id = ? AND member_id = ?').get(f.id, memberId);
        if (deja) return f;
        db.prepare('INSERT INTO formations_members (id, formation_id, member_id) VALUES (?, ?, ?)').run(nouvelId('fm'), f.id, memberId);
        // L'inscription retire de la liste d'attente (event_id)
        db.prepare('DELETE FROM waitlist WHERE member_id = ? AND formation_event_id = ?').run(memberId, String(b.event_id || ''));
        return f;
    };

    // ---- Miroir : annulations côté site → désinscription locale (notifiée) ----
    // Les bookings traités et annulés : reset + suppression de l'inscription locale.
    // Les non-traités annulés : ignorés (file de validation non polluée) — décision maquette.
    const appliquerMiroir = () => {
        const retraits = [];
        const annulesTraites = db.prepare(
            "SELECT * FROM bookings_remote WHERE processed = 1 AND processed_action != 'ignored' AND UPPER(status) IN ('CANCELED', 'CANCELLED', 'TRASH', 'REJECTED')"
        ).all();
        const resetIds = [];
        for (const b of annulesTraites) {
            if (b.local_member_id) {
                const formation = db.prepare('SELECT id, title FROM formations WHERE event_id = ?').get(String(b.event_id || ''));
                const membre = db.prepare('SELECT id, first_name, last_name FROM members WHERE id = ?').get(b.local_member_id);
                if (formation && membre) {
                    db.prepare('DELETE FROM formations_members WHERE formation_id = ? AND member_id = ?').run(formation.id, membre.id);
                    retraits.push({ booking_id: b.id, membre: `${membre.first_name} ${membre.last_name}`, formation: formation.title });
                    notifier('auto_unlink',
                        `🔴 Désinscription automatique : ${membre.first_name} ${membre.last_name} — « ${formation.title} » (réservation annulée sur le site).`,
                        'warning', { booking: b.id, member: membre.id, formation: formation.id });
                }
            }
            db.prepare('UPDATE bookings_remote SET processed = 0, processed_action = NULL, processed_at = NULL, local_member_id = NULL WHERE id = ?').run(b.id);
            resetIds.push(b.id);
        }
        if (resetIds.length) {
            const placeholders = resetIds.map(() => '?').join(', ');
            db.prepare(
                `UPDATE bookings_remote SET processed = 1, processed_action = 'ignored', processed_at = datetime('now')
                 WHERE processed = 0 AND id NOT IN (${placeholders}) AND UPPER(status) IN ('CANCELED', 'CANCELLED', 'TRASH', 'REJECTED')`
            ).run(...resetIds);
        } else {
            db.prepare(
                "UPDATE bookings_remote SET processed = 1, processed_action = 'ignored', processed_at = datetime('now') WHERE processed = 0 AND UPPER(status) IN ('CANCELED', 'CANCELLED', 'TRASH', 'REJECTED')"
            ).run();
        }
        return retraits;
    };

    // ---- Réception (plugin WP, server-to-server, secret) ----
    api.post('/bookings/upsert', (req, res) => {
        if (!BOOKINGS_SECRET) {
            return res.status(503).json({ erreur: 'BOOKINGS_SECRET non configuré sur le serveur.' });
        }
        if (!secretOk(req)) return res.status(401).json({ erreur: 'Secret invalide.' });
        const bookings = req.body;
        if (!Array.isArray(bookings) || !bookings.length) {
            return res.status(400).json({ erreur: 'bookings : [{ id, event_id, first_name, last_name, email, booked_at, status, member_no? }] requis.' });
        }
        const now = new Date().toISOString();
        let ajoutes = 0, misAJour = 0;
        db.transaction(() => {
            for (const b of bookings) {
                if (!b.id) continue;
                const existing = db.prepare('SELECT id FROM bookings_remote WHERE id = ?').get(String(b.id));
                if (existing) {
                    db.prepare(
                        `UPDATE bookings_remote SET event_id = ?, member_no = ?, first_name = ?, last_name = ?, email = ?, booked_at = ?, status = ?, synced_at = ?
                         WHERE id = ?`
                    ).run(String(b.event_id || ''), b.member_no ?? null, b.first_name || '', b.last_name || '', b.email || '', b.booked_at || '', b.status || '', now, String(b.id));
                    misAJour += 1;
                } else {
                    db.prepare(
                        'INSERT INTO bookings_remote (id, event_id, member_no, first_name, last_name, email, booked_at, status, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(String(b.id), String(b.event_id || ''), b.member_no ?? null, b.first_name || '', b.last_name || '', b.email || '', b.booked_at || '', b.status || '', now);
                    ajoutes += 1;
                }
            }
        })();
        const retraits = appliquerMiroir();
        notifier('info', `📥 ${ajoutes} réservation(s) récupérée(s) du site (${misAJour} mise(s) à jour).`, 'info', { ajoutes, misAJour });
        res.json({ ajoutes, misAJour, desinscriptions: retraits.length, retraits });
    });

    // ---- File de validation (écran humain) : chaque item avec son match calculé ----
    api.get('/bookings/non-traites', (req, res) => {
        const queue = db.prepare('SELECT * FROM bookings_remote WHERE processed = 0 ORDER BY booked_at ASC').all();
        res.json(queue.map((b) => ({ ...b, match: matcherMembre(b) })));
    });

    // Traitement manuel : linked (membre choisi), created (nouveau membre), ignored
    api.put('/bookings/:id/traitement', (req, res) => {
        const b = db.prepare('SELECT * FROM bookings_remote WHERE id = ?').get(req.params.id);
        if (!b) return res.status(404).json({ erreur: 'Réservation introuvable.' });
        if (b.processed) return res.status(409).json({ erreur: 'Réservation déjà traitée.' });
        const action = req.body?.action;
        if (!['linked', 'created', 'ignored'].includes(action)) {
            return res.status(400).json({ erreur: 'action : linked | created | ignored.' });
        }
        if (action === 'linked') {
            const memberId = req.body.member_id;
            if (!memberId) return res.status(400).json({ erreur: 'member_id requis pour linked.' });
            const m = db.prepare('SELECT id, first_name, last_name FROM members WHERE id = ?').get(memberId);
            if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
            const f = inscrireDuBooking(b, memberId);
            if (!f) {
                db.prepare('UPDATE bookings_remote SET processed = 1, processed_action = ?, processed_at = ?, local_member_id = ? WHERE id = ?')
                    .run('ignored', new Date().toISOString(), null, b.id);
                notifier('awaiting_validation', `⚠️ Réservation de ${b.first_name} ${b.last_name} ignorée : formation inconnue (n° ${b.event_id}).`, 'warning');
                return res.json({ action: 'ignored', raison: 'formation inconnue' });
            }
            db.prepare('UPDATE bookings_remote SET processed = 1, processed_action = ?, processed_at = ?, local_member_id = ? WHERE id = ?')
                .run('linked', new Date().toISOString(), memberId, b.id);
            notifier('auto_link', `🔗 ${m.first_name} ${m.last_name} rattaché·e à « ${f.title} » (validation manuelle).`, 'success', { booking: b.id, member: memberId });
            return res.json({ action: 'linked', member_id: memberId });
        }
        if (action === 'created') {
            const numero = prochainNumero();
            const id = nouvelId('mb');
            db.prepare('INSERT INTO members (id, first_name, last_name, email, start_date, member_no) VALUES (?, ?, ?, ?, ?, ?)')
                .run(id, b.first_name || '', b.last_name || '', b.email || '', (b.booked_at || '').slice(0, 10), numero);
            const f = inscrireDuBooking(b, id);
            db.prepare('UPDATE bookings_remote SET processed = 1, processed_action = ?, processed_at = ?, local_member_id = ? WHERE id = ?')
                .run('created', new Date().toISOString(), id, b.id);
            if (f) {
                notifier('member_created', `➕ Nouveau membre créé : ${b.first_name} ${b.last_name} (#${numero}) et inscrit·e à « ${f.title} ».`, 'success', { booking: b.id, member: id });
            }
            return res.json({ action: 'created', member_id: id, member_no: numero });
        }
        // ignored — silencieux (décision maquette)
        db.prepare('UPDATE bookings_remote SET processed = 1, processed_action = ?, processed_at = ? WHERE id = ?')
            .run('ignored', new Date().toISOString(), b.id);
        res.json({ action: 'ignored' });
    });

    // Auto-traitement des matches certains (n° membre / email exact) — l'équivalent serveur
    // de l'ouverture de l'écran de validation. Les incertains restent dans la file pour l'humain.
    api.post('/bookings/traitement-automatique', (req, res) => {
        const queue = db.prepare('SELECT * FROM bookings_remote WHERE processed = 0 ORDER BY booked_at ASC').all();
        const resultats = [];
        for (const b of queue) {
            const match = matcherMembre(b);
            if (!match.certain || !match.member) continue;
            const f = inscrireDuBooking(b, match.member.id);
            if (!f) {
                db.prepare('UPDATE bookings_remote SET processed = 1, processed_action = ?, processed_at = ?, local_member_id = ? WHERE id = ?')
                    .run('ignored', new Date().toISOString(), null, b.id);
                notifier('awaiting_validation', `⚠️ Réservation de ${b.first_name} ${b.last_name} ignorée : formation inconnue (n° ${b.event_id}).`, 'warning');
                resultats.push({ booking: b.id, action: 'ignored', raison: 'formation inconnue' });
                continue;
            }
            db.prepare('UPDATE bookings_remote SET processed = 1, processed_action = ?, processed_at = ?, local_member_id = ? WHERE id = ?')
                .run('auto_linked', new Date().toISOString(), match.member.id, b.id);
            notifier('auto_link',
                `✅ ${match.member.first_name} ${match.member.last_name} rattaché·e automatiquement à « ${f.title} » (match ${match.method === 'member_no' ? 'n° membre' : 'email'}).`,
                'success', { booking: b.id, member: match.member.id, method: match.method });
            resultats.push({ booking: b.id, action: 'auto_linked', member_id: match.member.id, method: match.method });
        }
        res.json({ traites: resultats.length, resultats });
    });

    return api;
};
