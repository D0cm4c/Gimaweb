// Gimaweb — API M1b : visites (pointage) + impressions
// Logique métier reprise de la maquette (app.js) : double pointage refusé,
// montant de visite 1 € (0 si abonnement), impressions N&B 0,10 € / couleur 0,50 €.
import express from 'express';
import crypto from 'crypto';

// Tarifs figés de l'Atelier (maquette app.js : VISIT_PRICE, montants d'impression)
export const TARIFS = { visite: 1.0, impression_bw: 0.10, impression_color: 0.50 };

const nouvelId = (prefixe) => `${prefixe}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const creerApiVisites = (db) => {
    const api = express.Router();

    const membreOu404 = (req, res) => {
        const m = db.prepare('SELECT id, subscription FROM members WHERE id = ?').get(req.body?.member_id || req.params.id);
        if (!m) {
            res.status(404).json({ erreur: 'Membre introuvable.' });
            return null;
        }
        return m;
    };

    // ---- Pointage (visite) ----
    api.post('/visites', (req, res) => {
        // Visite anonyme (passage sans inscription — 1 €, motif baromètre FRB)
        if (req.body && req.body.anonyme) {
            const id = nouvelId('v-anon');
            db.prepare('INSERT INTO visits (id, member_id, visit_date, amount, reason) VALUES (?, NULL, ?, ?, ?)')
                .run(id, aujourdhui(), TARIFS.visite, req.body.reason ? String(req.body.reason) : null);
            return res.status(201).json({ id, anonyme: true, visit_date: aujourdhui(), amount: TARIFS.visite, reason: req.body.reason || null });
        }
        const membre = membreOu404(req, res);
        if (!membre) return;
        const jour = aujourdhui();
        const deja = db.prepare('SELECT id FROM visits WHERE member_id = ? AND visit_date = ?').get(membre.id, jour);
        if (deja) {
            return res.status(409).json({ erreur: 'Visite déjà pointée aujourd\u2019hui pour ce membre.', visit_id: deja.id });
        }
        const montant = (req.body && req.body.amount != null) ? Number(req.body.amount)
            : (membre.subscription && membre.subscription !== 'none' ? 0 : TARIFS.visite);
        const motif = req.body && req.body.reason ? String(req.body.reason) : null;
        const id = nouvelId('v');
        db.prepare('INSERT INTO visits (id, member_id, visit_date, amount, reason) VALUES (?, ?, ?, ?, ?)')
            .run(id, membre.id, jour, montant, motif);
        const visites = db.prepare('SELECT COUNT(*) AS n FROM visits WHERE member_id = ?').get(membre.id).n;
        res.status(201).json({
            id,
            member_id: membre.id,
            visit_date: jour,
            amount: montant,
            reason: motif,
            incluse_abonnement: montant === 0,
            total_visites: visites
        });
    });

    // Historique des visites d'un membre (fiche membre)
    api.get('/membres/:id/visites', (req, res) => {
        const m = db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        const visites = db.prepare('SELECT * FROM visits WHERE member_id = ? ORDER BY visit_date DESC, created_at DESC').all(req.params.id);
        res.json(visites);
    });

    // Visites du jour (accueil/dashboard)
    api.get('/visites', (req, res) => {
        const jour = req.query.date || aujourdhui();
        const visites = db.prepare(
            `SELECT v.*, m.first_name, m.last_name, m.member_no
             FROM visits v JOIN members m ON m.id = v.member_id
             WHERE v.visit_date = ? ORDER BY v.created_at DESC`
        ).all(jour);
        res.json(visites);
    });

    // ---- Impressions ----
    // Enregistrement d'une impression (montant par défaut selon le type, comme la modale maquette)
    api.post('/impressions', (req, res) => {
        const membre = membreOu404(req, res);
        if (!membre) return;
        const type = req.body?.type;
        if (type !== 'bw' && type !== 'color') {
            return res.status(400).json({ erreur: "Type d'impression invalide (bw | color)." });
        }
        const montant = req.body && req.body.amount != null ? Number(req.body.amount)
            : (type === 'bw' ? TARIFS.impression_bw : TARIFS.impression_color);
        if (!Number.isFinite(montant) || montant < 0) {
            return res.status(400).json({ erreur: 'Montant invalide.' });
        }
        const id = nouvelId('p');
        db.prepare('INSERT INTO prints (id, member_id, print_date, type, amount, paid) VALUES (?, ?, ?, ?, ?, 0)')
            .run(id, membre.id, aujourdhui(), type, montant);
        const solde = db.prepare('SELECT COALESCE(SUM(amount), 0) AS solde FROM prints WHERE member_id = ? AND paid = 0').get(membre.id).solde;
        res.status(201).json({ id, member_id: membre.id, type, amount: montant, paid: 0, solde });
    });

    // Historique des impressions d'un membre
    api.get('/membres/:id/impressions', (req, res) => {
        const m = db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        const impressions = db.prepare('SELECT * FROM prints WHERE member_id = ? ORDER BY print_date DESC, created_at DESC').all(req.params.id);
        const solde = db.prepare('SELECT COALESCE(SUM(amount), 0) AS solde FROM prints WHERE member_id = ? AND paid = 0').get(req.params.id).solde;
        res.json({ solde, impressions });
    });

    // Solder TOUTES les impressions impayées du membre (maquette : bouton « payer »)
    api.post('/membres/:id/impressions/solder', (req, res) => {
        const m = db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        const info = db.prepare("UPDATE prints SET paid = 1, paid_date = ? WHERE member_id = ? AND paid = 0").run(aujourdhui(), req.params.id);
        res.json({ soudrees: info.changes });
    });

    // Suppression du solde d'impressions (erreur de saisie — maquette : confirm humain côté client)
    api.delete('/membres/:id/impressions', (req, res) => {
        const m = db.prepare('SELECT 1 FROM members WHERE id = ?').get(req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        const reste = db.prepare('SELECT COUNT(*) AS n FROM prints WHERE member_id = ? AND paid = 0').get(req.params.id).n;
        const info = db.prepare('DELETE FROM prints WHERE member_id = ? AND paid = 0').run(req.params.id);
        res.json({ supprimees: info.changes, avant: reste });
    });

    return api;
};
