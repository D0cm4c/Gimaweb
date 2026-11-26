(function () {
    'use strict';

    // Page Statistiques (stats.html) — le pilotage de la directrice :
    // KPI membres/inscriptions/revenus, stats détaillées, rétention, profil,
    // inclusion, graphiques visites + heatmap, rapport annuel.
    // Migrée M5c : tous les agrégats viennent de GET /api/agregats/stats (un seul appel).
    // Dépend de : adw-client.js (window.ADWDatabase), escape.js.

    function escapeHtml(str) { return window.ADWEscape.html(str); }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }

    var stats = null; // payload /api/agregats/stats
    var chartMode = 'days';
    var chartDaysBtn = document.getElementById('chartDaysBtn');
    var chartMonthsBtn = document.getElementById('chartMonthsBtn');
    var annualReportBtn = document.getElementById('annualReportBtn');

    // Couleurs et libellés des statuts sociaux (donut inclusion) — extraits de dashboard.js
    var STATUS_COLORS = {
        cpas: '#2F9BE4',
        actiris: '#6C5CE7',
        travailleur: '#18A55F',
        etudiant: '#EFA02C',
        pensionne: '#E8734A',
        mutuelle: '#B57BD6',
        interim: '#4ECDC4',
        enfant: '#95A5B8'
    };
    var STATUS_NAMES = {
        cpas: 'CPAS / Orbem', actiris: 'Actiris', travailleur: 'Travailleur.se',
        etudiant: 'Étudiant', pensionne: 'Pensionné', mutuelle: 'Mutuelle',
        interim: 'Intérim', enfant: 'Enfant'
    };

    function eur(v) { return Number(v).toFixed(2).replace('.', ',') + ' €'; }

    // ===== KPI + carte Membres (stats détaillées) =====
    function renderLocationsStats(s) {
        var l = s && s.locations;
        if (!l) return;
        var mois = document.getElementById('statLocMonth');
        var up = document.getElementById('statLocUpcoming');
        var top = document.getElementById('statLocTopRoom');
        if (mois) mois.textContent = l.creneaux_mois + ' cr\u00e9neau' + (l.creneaux_mois > 1 ? 'x' : '');
        if (up) up.textContent = l.locataires_a_venir;
        if (top) top.textContent = l.top_salle ? (l.top_salle.name + ' (' + l.top_salle.c + ')') : '\u2014';
    }

    function renderMembersStats(s) {
        var m = s.membres;
        setText('statVisitsMonth', s.visites.mois);
        setText('statTotal', m.total);
        setText('statActive', m.actifs);
        setText('statExpired', m.expires);
        setText('statNewMonth', m.nouveaux_mois);
        setText('statMonthly', m.mensuels);
        setText('statYearly', m.annuels);
        setText('statActivePct', (m.total ? Math.round((m.actifs / m.total) * 100) : 0) + ' %');
        var rev = document.getElementById('statRevenueMonth');
        if (rev) rev.textContent = eur(s.visites.revenus_mois);
    }

    // ===== Rétention =====
    function renderRetention(s) {
        var r = s.retention;
        setText('retRegulars', r.reguliers + ' membres (' + (r.total_visites ? Math.round((r.reguliers_visites / r.total_visites) * 100) : 0) + ' % des visites)');
        setText('retOneshot', String(r.uniques));
        setText('retNever', String(r.jamais));
        setText('retSilent', String(r.silencieux));
    }

    // ===== Profil socio-spatial =====
    function renderProfile(s) {
        var p = s.profil;
        var pl = document.getElementById('profileList');
        if (pl) {
            pl.innerHTML = p.cp_top.map(function (r) {
                var pct = p.cp_total ? Math.round((r.c / p.cp_total) * 100) : 0;
                return '<li><strong>' + escapeHtml(r.postal_code) + '</strong> : ' + r.c + ' membres (' + pct + ' %)</li>';
            }).join('') || '<li class="form-hint">Aucun code postal renseigné.</li>';
        }
        setText('profileHint', p.cp_total ? Math.round((p.bruxelles / p.cp_total) * 100) + ' % des usagers viennent de la Région de Bruxelles-Capitale' : 'Renseignez les codes postaux pour activer cette analyse.');
    }

    // ===== Motifs de visite (vocabulaire du Zoom Baromètre de l'inclusion numérique 2026, FRB) =====
    function renderVisitReasons(s) {
        var mo = s.motifs;
        var rl = document.getElementById('reasonsList');
        if (rl) {
            rl.innerHTML = mo.top.map(function (r) {
                var pct = mo.total ? Math.round((r.c / mo.total) * 100) : 0;
                return '<li><strong>' + escapeHtml(r.reason) + '</strong> : ' + r.c + ' (' + pct + ' %)</li>';
            }).join('') || '<li class="form-hint">Aucun motif renseigné — pointez des visites avec raison.</li>';
        }
        setText('reasonsHint', mo.total ? mo.total + ' visites avec motif — source : Zoom Baromètre inclusion numérique 2026 (FRB).' : 'Les motifs se collectent au pointage des visites (dashboard).');
    }

    // ===== Inclusion numérique =====
    function renderInclusion(s) {
        var totalM = s.membres.total;
        var inc = s.inclusion;
        var pct = function (v) { return totalM ? Math.round((v / totalM) * 100) : 0; };
        setText('inclVulnerable', inc.vulnerables + ' membres (' + pct(inc.vulnerables) + ' %)');
        setText('inclCpas', pct(inc.cpas) + ' %');
        setText('inclFree', inc.sans_abonnement + ' membres (' + pct(inc.sans_abonnement) + ' %)');
        setText('inclHint', 'CPAS/Orbem, mutuellistes, intérimaires et accompagnés Actiris : le public prioritaire de la médiation numérique.');
    }

    function buildAnnualReport(s) {
        var year = s.rapport.annee;
        var sep = ';';
        var lines = [];
        var add = function (k, v) { lines.push('"' + String(k).replace(/"/g, '""') + '"' + sep + '"' + String(v).replace(/"/g, '""') + '"'); };
        var total = s.membres.total;
        var rap = s.rapport;

        lines.push('"Rapport annuel ' + year + ' — Atelier du Web (EPN)"');
        add('Généré le', new Date().toLocaleDateString('fr-BE'));
        lines.push('');
        lines.push('"Usagers"');
        add('Membres enregistrés (total)', rap.total);
        add('Inscriptions actives', rap.actifs);
        add('Abonnements mensuels', rap.mensuels);
        add('Abonnements annuels', rap.annuels);
        lines.push('');
        lines.push('"Fréquentation ' + year + '"');
        add('Visites de l\u2019année', rap.visites_annee);
        add('Usagers uniques ayant visité', rap.visiteurs_uniques);
        lines.push('');
        lines.push('"Inclusion numérique"');
        add('Usagers publics vulnérables (CPAS/Orbem, mutuelle, intérim, Actiris)', rap.vulnerables);
        add('Usagers seniors (65+)', rap.seniors);
        lines.push('');
        lines.push('"Statuts sociaux (répartition)"');
        s.statuts.forEach(function (r) {
            add(r.social_status, r.c + ' (' + (total ? Math.round((r.c / total) * 100) : 0) + ' %)');
        });
        lines.push('');
        lines.push('"Codes postaux (top 10)"');
        s.cp_top10.forEach(function (r) {
            add(r.postal_code, r.c);
        });
        lines.push('');
        lines.push('"Genres"');
        s.genres.forEach(function (r) {
            add(r.gender, r.c);
        });

        var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'rapport-annuel-' + year + '-atelierduweb.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('\uD83D\uDCCA Rapport annuel ' + year + ' téléchargé');
    }

    function renderHeatmap(s) {
        var hm = document.getElementById('heatmap');
        if (!hm) return;
        var byDay = {};
        var max = 1;
        s.heatmap.forEach(function (r) {
            byDay[r.visit_date] = r.c;
            if (r.c > max) max = r.c;
        });

        var today = new Date();
        var start = new Date(today);
        start.setDate(start.getDate() - 83);
        while (start.getDay() !== 1) start.setDate(start.getDate() - 1);

        var frag = document.createDocumentFragment();
        var d = new Date(start);
        var todayIso = today.toISOString().slice(0, 10);
        while (d <= today) {
            var iso = d.toISOString().slice(0, 10);
            var c = byDay[iso] || 0;
            var lvl = c === 0 ? '' : (c <= max * 0.25 ? 'l1' : (c <= max * 0.5 ? 'l2' : (c <= max * 0.75 ? 'l3' : 'l4')));
            var cell = document.createElement('span');
            cell.className = 'heat-cell ' + lvl + (iso === todayIso ? ' today' : '');
            cell.title = d.toLocaleDateString('fr-BE') + ' : ' + c + ' visite' + (c > 1 ? 's' : '');
            frag.appendChild(cell);
            d.setDate(d.getDate() + 1);
        }
        hm.innerHTML = '';
        hm.appendChild(frag);
        hm.setAttribute('aria-label', 'Carte de chaleur de la fréquentation quotidienne sur 12 semaines');
    }

    function renderStatusDonut(s) {
        var donut = document.getElementById('statusDonut');
        var legend = document.getElementById('statusDonutLegend');
        if (!donut || !legend) return;
        var rows = s.statuts;
        var total = 0;
        rows.forEach(function (r) { total += r.c; });
        if (!total) {
            donut.style.background = 'var(--bg)';
            legend.innerHTML = '<li class="form-hint">Renseignez les statuts sociaux pour voir la répartition.</li>';
            return;
        }
        var stops = [];
        var acc = 0;
        rows.forEach(function (r) {
            var from = (acc / total) * 100;
            acc += r.c;
            var to = (acc / total) * 100;
            var color = STATUS_COLORS[r.social_status] || '#95A5A8';
            stops.push(color + ' ' + from + '% ' + to + '%');
        });
        donut.style.background = 'conic-gradient(' + stops.join(', ') + ')';
        legend.innerHTML = rows.slice(0, 6).map(function (r) {
            var color = STATUS_COLORS[r.social_status] || '#95A5A8';
            return '<li><span class="donut-dot" style="background:' + color + '"></span>' +
                escapeHtml(STATUS_NAMES[r.social_status] || r.social_status) +
                ' <strong>' + Math.round((r.c / total) * 100) + ' %</strong></li>';
        }).join('');
    }

    function renderChart(mode) {
        chartMode = mode || chartMode;
        var chart = document.getElementById('visitsChart');
        if (!chart || !stats) return;
        var chartCard = document.getElementById('visitsChartCard');
        if (chartCard) chartCard.removeAttribute('hidden');
        if (chartDaysBtn) chartDaysBtn.classList.toggle('active', chartMode === 'days');
        if (chartMonthsBtn) chartMonthsBtn.classList.toggle('active', chartMode === 'months');

        var buckets = [];
        var now = new Date();
        var i, key, label;

        if (chartMode === 'days') {
            for (i = 13; i >= 0; i--) {
                var d = new Date(now);
                d.setDate(d.getDate() - i);
                key = d.toISOString().slice(0, 10);
                label = d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
                buckets.push({ key: key, label: label });
            }
            var byKey = {};
            stats.graph_jours.forEach(function (r) { byKey[r.visit_date] = r.c; });
            buckets.forEach(function (b) { b.count = byKey[b.key] || 0; });
        } else {
            for (i = 11; i >= 0; i--) {
                var m = new Date(now.getFullYear(), now.getMonth() - i, 1);
                key = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
                label = m.toLocaleDateString('fr-BE', { month: 'short' });
                buckets.push({ key: key, label: label });
            }
            var byKeyM = {};
            stats.graph_mois.forEach(function (r) { byKeyM[r.ym] = r.c; });
            buckets.forEach(function (b) { b.count = byKeyM[b.key] || 0; });
        }

        var max = 1;
        buckets.forEach(function (b) { if (b.count > max) max = b.count; });

        chart.innerHTML = '';
        var frag = document.createDocumentFragment();
        buckets.forEach(function (b) {
            var col = document.createElement('div');
            col.className = 'chart-col';
            col.title = b.label + ' : ' + b.count + ' visite' + (b.count > 1 ? 's' : '');
            col.innerHTML =
                '<span class="chart-value">' + (b.count || '') + '</span>' +
                '<span class="chart-bar" style="height:' + Math.max(4, Math.round((b.count / max) * 100)) + '%"></span>' +
                '<span class="chart-label">' + escapeHtml(b.label) + '</span>';
            frag.appendChild(col);
        });
        chart.appendChild(frag);
    }

    // ===== Init =====
    window.ADWDatabase.init().then(function () {
        return window.ADWDatabase.agregatsStats();
    }).then(function (s) {
        stats = s;
        renderMembersStats(s);
        renderRetention(s);
        renderProfile(s);
        renderVisitReasons(s);
        renderInclusion(s);
        renderLocationsStats(s);
        renderStatusDonut(s);
        renderChart();
        renderHeatmap(s);

        if (chartDaysBtn) chartDaysBtn.addEventListener('click', function () { renderChart('days'); });
        if (chartMonthsBtn) chartMonthsBtn.addEventListener('click', function () { renderChart('months'); });
        if (annualReportBtn) annualReportBtn.addEventListener('click', function () { buildAnnualReport(stats); });

        var cards = document.querySelectorAll('.stat-card, .kpi-card, .chart-card');
        cards.forEach(function (c) { c.removeAttribute('hidden'); });
        var loading = document.getElementById('dashLoading');
        if (loading) loading.hidden = true; // cacher le loader dans le chemin de SUCCES aussi
    }).catch(function (err) {
        var loading = document.getElementById('dashLoading');
        if (loading) loading.hidden = true;
        console.error('Erreur stats :', err);
    });
})();
