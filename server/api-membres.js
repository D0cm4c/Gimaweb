// Gimaweb — API M1-a : membres (CRUD, n° auto, cascade RGPD, renouvellement)
// Logique métier reprise telle quelle de la maquette (db.js / app.js), déplacée côté serveur.
// Contrat : docs/CONTRAT-API.md. IDs TEXT (base36) comme dans la maquette.
import express from 'express';
import crypto from 'crypto';

const CHAMPS = ['first_name', 'last_name', 'age', 'phone', 'email', 'address', 'start_date', 'end_date', 'subscription', 'postal_code', 'gender', 'social_status'];
const SOUSCRIPTIONS = new Set(['none', 'monthly', 'yearly']);

const nouvelId = (prefixe = 'mb') => `${prefixe}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

const nbJours = (dateStr) => {
    // YYYY-MM-DD → ms UTC (dates métier sans heure — format unique AAAA-MM-JJ)
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};

const ajouterMois = (dateStr, mois) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCMonth(base.getUTCMonth() + mois);
    return base.toISOString().slice(0, 10);
};

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const creerApiMembres = (db, { sessionValide = () => false } = {}) => {
    const api = express.Router();

    // N° de membre auto : premier libre à partir de 1000 (gaps comblés), max 9999
    const prochainNumero = () => {
        const utilises = new Set(db.prepare('SELECT member_no FROM members WHERE member_no IS NOT NULL').all().map((r) => r.member_no));
        let n = 1000;
        while (utilises.has(n)) n += 1;
        return n <= 9999 ? n : null;
    };

    const membreExiste = (id) => Boolean(db.prepare('SELECT 1 FROM members WHERE id = ?').get(id));

    const validerCorps = (corps, partiel = false) => {
        const donnees = {};
        for (const c of CHAMPS) {
            if (corps && Object.prototype.hasOwnProperty.call(corps, c)) donnees[c] = corps[c] === '' ? null : corps[c];
        }
        if (!partiel) {
            if (!donnees.first_name || !String(donnees.first_name).trim()) return { erreur: 'Le prénom est obligatoire.' };
            if (!donnees.last_name || !String(donnees.last_name).trim()) return { erreur: 'Le nom est obligatoire.' };
        } else {
            delete donnees.first_name;
            delete donnees.last_name;
        }
        if (donnees.subscription && !SOUSCRIPTIONS.has(donnees.subscription)) {
            return { erreur: "Formule d'abonnement invalide (none | monthly | yearly)." };
        }
        if (donnees.age != null && !Number.isInteger(Number(donnees.age))) return { erreur: "L'âge doit être un nombre entier." };
        return { donnees };
    };

    // Fiche enrichie (parité app.js : compteurs visite, pointage du jour, solde impressions)
    const SELECT_MEMBRE = `SELECT m.*,
        (SELECT COUNT(*) FROM visits v WHERE v.member_id = m.id) AS visit_count,
        (SELECT COUNT(*) FROM visits v WHERE v.member_id = m.id AND v.visit_date = ?) AS visited_today,
        (SELECT COALESCE(SUM(amount), 0) FROM prints p WHERE p.member_id = m.id AND paid = 0) AS print_balance
        FROM members m WHERE m.id = ?`;

    api.get('/membres', (req, res) => {
        const membres = db.prepare(
            `SELECT m.*,
             (SELECT COUNT(*) FROM visits v WHERE v.member_id = m.id) AS visit_count,
             (SELECT COUNT(*) FROM visits v WHERE v.member_id = m.id AND v.visit_date = ?) AS visited_today,
             (SELECT COALESCE(SUM(amount), 0) FROM prints p WHERE p.member_id = m.id AND paid = 0) AS print_balance
             FROM members m
             ORDER BY lower(m.last_name), lower(m.first_name)`
        ).all(aujourdhui());
        res.json(membres);
    });

    api.get('/membres/:id', (req, res) => {
        const m = db.prepare(SELECT_MEMBRE).get(aujourdhui(), req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        res.json(m);
    });

    api.post('/membres', (req, res) => {
        const { donnees, erreur } = validerCorps(req.body);
        if (erreur) return res.status(400).json({ erreur });
        const numero = prochainNumero();
        if (numero === null) return res.status(409).json({ erreur: 'Plus de numéro de membre disponible (1000-9999).' });
        const id = nouvelId();
        db.prepare(
            `INSERT INTO members (id, first_name, last_name, age, phone, email, address, start_date, end_date,
                                   subscription, member_no, postal_code, gender, social_status, first_start_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            id,
            String(donnees.first_name).trim(),
            String(donnees.last_name).trim(),
            donnees.age != null ? Number(donnees.age) : null,
            donnees.phone || null,
            donnees.email || null,
            donnees.address || null,
            donnees.start_date || null,
            donnees.end_date || null,
            donnees.subscription || 'none',
            numero,
            donnees.postal_code || null,
            donnees.gender || null,
            donnees.social_status || null,
            donnees.start_date || null
        );
        res.status(201).json(db.prepare(SELECT_MEMBRE).get(aujourdhui(), id));
    });

    api.put('/membres/:id', (req, res) => {
        if (!membreExiste(req.params.id)) return res.status(404).json({ erreur: 'Membre introuvable.' });
        const { donnees, erreur } = validerCorps(req.body, true);
        if (erreur) return res.status(400).json({ erreur });
        const cles = Object.keys(donnees);
        if (!cles.length) return res.status(400).json({ erreur: 'Aucun champ modifiable fourni.' });
        const set = cles.map((c) => `${c} = ?`).join(', ');
        db.prepare(`UPDATE members SET ${set} WHERE id = ?`).run(...cles.map((c) => donnees[c]), req.params.id);
        res.json(db.prepare(SELECT_MEMBRE).get(aujourdhui(), req.params.id));
    });

    // Suppression en cascade RGPD — même périmètre que deleteMemberCompletely (maquette)
    api.delete('/membres/:id', (req, res, next) => {
        if (!sessionValide(req)) return res.status(401).json({ erreur: 'Session admin requise.' });
        next();
    }, (req, res) => {
        if (!membreExiste(req.params.id)) return res.status(404).json({ erreur: 'Membre introuvable.' });
        db.transaction(() => {
            db.prepare('DELETE FROM fm_payment_log WHERE member_id = ?').run(req.params.id);
            db.prepare('DELETE FROM waitlist WHERE member_id = ?').run(req.params.id);
            db.prepare('DELETE FROM visits WHERE member_id = ?').run(req.params.id);
            db.prepare('DELETE FROM prints WHERE member_id = ?').run(req.params.id);
            db.prepare('DELETE FROM formations_members WHERE member_id = ?').run(req.params.id);
            db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
        })();
        res.status(204).end();
    });

    // Aperçu de renouvellement SANS écriture (double validation UI, maquette)
    api.get('/membres/:id/renouvellement', (req, res) => {
        const m = db.prepare('SELECT subscription, end_date FROM members WHERE id = ?').get(req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        const ajd = aujourdhui();
        const actif = m.end_date && m.end_date >= ajd;
        const base = actif ? m.end_date : ajd;
        const mois = m.subscription === 'yearly' ? 12 : 1;
        const nouveauDebut = actif ? new Date(nbJours(base) + 86400000).toISOString().slice(0, 10) : ajd;
        const nouvelleFin = ajouterMois(base, mois);
        res.json({ nouveau_debut: nouveauDebut, nouvelle_fin: nouvelleFin, actif: Boolean(actif) });
    });

    // Renouvellement effectif : le CYCLE change de dates, first_start_date fige la toute première inscription
    api.post('/membres/:id/renouvellement', (req, res) => {
        const m = db.prepare('SELECT id FROM members WHERE id = ?').get(req.params.id);
        if (!m) return res.status(404).json({ erreur: 'Membre introuvable.' });
        let debut = req.body && req.body.nouveau_debut;
        let fin = req.body && req.body.nouvelle_fin;
        if (!debut || !fin) {
            const p = db.prepare('SELECT subscription, end_date FROM members WHERE id = ?').get(req.params.id);
            const ajd = aujourdhui();
            const actif = p.end_date && p.end_date >= ajd;
            const base = actif ? p.end_date : ajd;
            debut = actif ? new Date(nbJours(base) + 86400000).toISOString().slice(0, 10) : ajd;
            fin = ajouterMois(base, p.subscription === 'yearly' ? 12 : 1);
        }
        db.transaction(() => {
            db.prepare('UPDATE members SET first_start_date = COALESCE(first_start_date, start_date) WHERE id = ?').run(req.params.id);
            db.prepare('UPDATE members SET start_date = ?, end_date = ? WHERE id = ?').run(debut, fin, req.params.id);
        })();
        res.json({ nouveau_debut: debut, nouvelle_fin: fin });
    });

    return api;
};

