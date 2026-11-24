// Gimaweb — API M5c : agrégats pour le dashboard (et la recherche globale).
// Règle du contrat : aucun SQL par le réseau — les agrégats vivent côté serveur.
import express from 'express';

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const moisCourant = () => aujourdhui().slice(0, 7);

export const creerApiAgregats = (db) => {
    const api = express.Router();

    // ---- Flot dashboard : tous les KPI + listes du tableau de bord en UN appel ----
    api.get('/agregats/flot', (req, res) => {
        const ajd = aujourdhui();
        const mois = moisCourant();

        const un = (sql, params = [], col = 'v') => {
            const r = db.prepare(sql).get(...params);
            return r ? (r[col] ?? 0) : 0;
        };

        // Agenda du jour (formations programmées aujourd'hui, avec salle + inscrits)
        const agenda = db.prepare(
            `SELECT f.title, f.event_id, f.time_label, f.categories, f.room_id, fd.slot,
             (SELECT name FROM rooms r WHERE r.id = f.room_id) AS room_name,
             (SELECT COUNT(*) FROM formations_members fm WHERE fm.formation_id = f.id) AS attendee_count
             FROM formation_dates fd JOIN formations f ON f.id = fd.formation_id
             WHERE fd.date = ? AND lower(coalesce(f.categories, '')) NOT LIKE '%fermeture%'
             ORDER BY fd.slot ASC, f.title ASC`
        ).all(ajd);

        // Visites récentes (6 dernières, avec identités et motifs)
        const visitesRecentes = db.prepare(
            `SELECT v.visit_date, v.reason, m.first_name, m.last_name, m.member_no, v.amount
             FROM visits v JOIN members m ON m.id = v.member_id
             ORDER BY v.visit_date DESC, v.created_at DESC LIMIT 6`
        ).all();

        // Nouveaux aujourd'hui : première visite de leur vie = nouveaux usagers du jour
        const nouveaux = db.prepare(
            `SELECT COUNT(*) AS v FROM (SELECT member_id, MIN(visit_date) AS prem FROM visits GROUP BY member_id)
             WHERE prem = date('now')`
        ).get().v;

        // Impressions dues : total, débiteurs, top 3 par dernière impression
        const impTotal = un('SELECT COALESCE(SUM(amount), 0) v FROM prints WHERE paid = 0');
        const impCompte = un('SELECT COUNT(DISTINCT member_id) v FROM prints WHERE paid = 0');
        const impTop = db.prepare(
            `SELECT m.id, m.first_name, m.last_name, m.member_no,
             COALESCE((SELECT SUM(amount) FROM prints p WHERE p.member_id = m.id AND paid = 0), 0) AS balance,
             (SELECT MAX(print_date) FROM prints p WHERE p.member_id = m.id AND paid = 0) AS last_print
             FROM members m
             WHERE (SELECT SUM(amount) FROM prints p WHERE p.member_id = m.id AND paid = 0) > 0
             ORDER BY last_print DESC, balance DESC LIMIT 3`
        ).all();

        // Tickets : ouverts / urgents / urgents non assignés
        const ticketsOuverts = un("SELECT COUNT(*) v FROM tickets WHERE status IN ('open', 'in_progress')");
        const ticketsUrgents = un("SELECT COUNT(*) v FROM tickets WHERE status IN ('open', 'in_progress') AND priority = 'urgent'");
        const ticketsUrgentsNonAssignes = un(
            "SELECT COUNT(*) v FROM tickets WHERE status IN ('open', 'in_progress') AND priority = 'urgent' AND (assignee IS NULL OR assignee = '')"
        );

        // Prochaine fermeture : événement du site de catégorie « fermeture » (date la plus proche à venir)
        const fermeture = db.prepare(
            `SELECT f.title, f.event_id, f.time_label, MIN(fd.date) AS date, MAX(fd.date) AS date_fin
             FROM formations f JOIN formation_dates fd ON fd.formation_id = f.id
             WHERE lower(coalesce(f.categories, '')) LIKE '%fermeture%' AND fd.date >= date('now')
             GROUP BY f.id ORDER BY date ASC LIMIT 1`
        ).get() || null;

        res.json({
            prochaine_fermeture: fermeture,
            kpi: {
                visites_aujourdhui: un('SELECT COUNT(*) v FROM visits WHERE visit_date = ?', [ajd]),
                visites_mois: un('SELECT COUNT(*) v FROM visits WHERE strftime(\'%Y-%m\', visit_date) = ?', [mois]),
                derniere_visite: un('SELECT MAX(visit_date) v FROM visits') || null,
                nouveaux_aujourdhui: nouveaux,
                en_attente: un('SELECT COUNT(*) v FROM waitlist'),
                tickets_ouverts: ticketsOuverts,
                tickets_urgents: ticketsUrgents,
                tickets_urgents_non_assignes: ticketsUrgentsNonAssignes,
                impressions_dues_total: impTotal,
                impressions_dues_debiteurs: impCompte
            },
            agenda,
            visites_recentes: visitesRecentes,
            impressions: { total: impTotal, compte: impCompte, top: impTop },
            date: ajd
        });
    });

    // ---- Stats : tous les agrégats de la page Statistiques en UN appel ----
    api.get('/agregats/stats', (req, res) => {
        const moi = moisCourant();
        const annee = Number(new Date().getFullYear());

        const un = (sql, params = [], col = 'v') => {
            const r = db.prepare(sql).get(...params);
            return r ? (r[col] ?? 0) : 0;
        };

        const membres = {
            total: un('SELECT COUNT(*) v FROM members'),
            actifs: un("SELECT COUNT(*) v FROM members WHERE date(end_date) >= date('now') OR end_date IS NULL"),
            expires: un("SELECT COUNT(*) v FROM members WHERE date(end_date) < date('now') AND end_date IS NOT NULL"),
            mensuels: un("SELECT COUNT(*) v FROM members WHERE subscription = 'monthly'"),
            annuels: un("SELECT COUNT(*) v FROM members WHERE subscription = 'yearly'"),
            nouveaux_mois: un("SELECT COUNT(*) v FROM members WHERE date(created_at) >= date('now', 'start of month')")
        };

        const visites = {
            mois: un('SELECT COUNT(*) v FROM visits WHERE strftime(\'%Y-%m\', visit_date) = ?', [moi]),
            revenus_mois: un('SELECT COALESCE(SUM(amount), 0) v FROM visits WHERE strftime(\'%Y-%m\', visit_date) = ?', [moi])
        };

        // Régression/rétention : agrégée serveur depuis le per-member
        const perMember = db.prepare(
            `SELECT m.id AS id,
             (SELECT COUNT(*) FROM visits v WHERE v.member_id = m.id) AS visits,
             (SELECT MAX(visit_date) FROM visits v WHERE v.member_id = m.id) AS last_visit
             FROM members m`
        ).all();
        const ret = { reguliers: 0, uniques: 0, jamais: 0, silencieux: 0, total_visites: 0, reguliers_visites: 0 };
        const seuilSilence = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        perMember.forEach((r) => {
            ret.total_visites += r.visits;
            if (r.visits >= 5) { ret.reguliers++; ret.reguliers_visites += r.visits; }
            else if (r.visits === 1) ret.uniques++;
            else if (r.visits === 0) ret.jamais++;
            if (r.visits > 0 && r.last_visit && r.last_visit < seuilSilence) ret.silencieux++;
        });

        const profil = {
            cp_top: db.prepare(
                "SELECT postal_code, COUNT(*) c FROM members WHERE postal_code IS NOT NULL AND postal_code != '' GROUP BY postal_code ORDER BY c DESC LIMIT 4"
            ).all(),
            cp_total: un("SELECT COUNT(*) v FROM members WHERE postal_code IS NOT NULL AND postal_code != ''"),
            bruxelles: un("SELECT COUNT(*) v FROM members WHERE postal_code IN ('1000','1020','1030','1040','1050','1060','1070','1080','1090','1100','1120','1130','1140','1150','1160','1170','1180','1190','1200','1210')")
        };

        const motifs = {
            top: db.prepare(
                "SELECT reason, COUNT(*) c FROM visits WHERE reason IS NOT NULL AND reason != '' GROUP BY reason ORDER BY c DESC LIMIT 6"
            ).all(),
            total: un("SELECT COUNT(*) v FROM visits WHERE reason IS NOT NULL AND reason != ''")
        };

        const inclusion = {
            vulnerables: un("SELECT COUNT(*) v FROM members WHERE social_status IN ('cpas', 'mutuelle', 'interim', 'actiris')"),
            cpas: un("SELECT COUNT(*) v FROM members WHERE social_status = 'cpas'"),
            sans_abonnement: un("SELECT COUNT(*) v FROM members WHERE subscription = 'none' OR subscription IS NULL")
        };

        const statuts = db.prepare(
            "SELECT social_status, COUNT(*) c FROM members WHERE social_status IS NOT NULL AND social_status != '' GROUP BY social_status ORDER BY c DESC"
        ).all();
        const cpTop10 = db.prepare(
            "SELECT postal_code, COUNT(*) c FROM members WHERE postal_code IS NOT NULL AND postal_code != '' GROUP BY postal_code ORDER BY c DESC LIMIT 10"
        ).all();
        const genres = db.prepare(
            "SELECT gender, COUNT(*) c FROM members WHERE gender IS NOT NULL AND gender != '' GROUP BY gender"
        ).all();

        const rapport = {
            annee,
            total: membres.total,
            actifs: membres.actifs,
            mensuels: membres.mensuels,
            annuels: membres.annuels,
            visites_annee: un("SELECT COUNT(*) v FROM visits WHERE strftime('%Y', visit_date) = ?", [String(annee)]),
            visiteurs_uniques: un("SELECT COUNT(DISTINCT member_id) v FROM visits WHERE strftime('%Y', visit_date) = ?", [String(annee)]),
            vulnerables: inclusion.vulnerables,
            seniors: un('SELECT COUNT(*) v FROM members WHERE age >= 65')
        };

        const heatmap = db.prepare(
            "SELECT visit_date, COUNT(*) c FROM visits WHERE visit_date >= date('now', '-83 days') GROUP BY visit_date"
        ).all();
        const graphJours = db.prepare(
            "SELECT visit_date, COUNT(*) c FROM visits WHERE visit_date >= date('now', '-13 days') GROUP BY visit_date"
        ).all();
        const graphMois = db.prepare(
            "SELECT strftime('%Y-%m', visit_date) ym, COUNT(*) c FROM visits WHERE visit_date >= date('now', '-11 months', 'start of month') GROUP BY ym"
        ).all();

        res.json({
            membres, visites, retention: ret, profil, motifs, inclusion,
            statuts, cp_top10: cpTop10, genres, rapport,
            heatmap, graph_jours: graphJours, graph_mois: graphMois,
            date: aujourdhui()
        });
    });

    // ---- Recherche globale (topbar) : membres + formations + suggestions + tickets ----
    api.get('/recherche', (req, res) => {
        const q = String(req.query.q || '').trim().toLowerCase();
        if (q.length < 2) return res.json({ q, membres: [], formations: [], suggestions: [], tickets: [] });
        const like = `%${q}%`;
        const membres = db.prepare(
            `SELECT id, first_name, last_name, member_no FROM members
             WHERE CAST(member_no AS TEXT) LIKE ? OR lower(first_name || ' ' || last_name) LIKE ?
             ORDER BY last_name COLLATE NOCASE LIMIT 5`
        ).all(like, like);
        const formations = db.prepare(
            'SELECT id, event_id, title FROM formations WHERE lower(title) LIKE ? ORDER BY start_date LIMIT 5'
        ).all(like);
        const suggestions = db.prepare(
            "SELECT id, message FROM suggestions WHERE lower(message) LIKE ? ORDER BY created_at DESC LIMIT 3"
        ).all(like);
        const tickets = db.prepare(
            'SELECT id, title FROM tickets WHERE lower(title) LIKE ? ORDER BY created_at DESC LIMIT 3'
        ).all(like);
        res.json({ q, membres, formations, suggestions, tickets });
    });

    return api;
};
