(function () {
    'use strict';

    // Page Tableau de bord (index.html) : KPI temps réel, agenda du jour, alertes,
    // analyses croisées, usagers du jour, rapport annuel, mosaïque de tuiles (drag'n'drop).

    var todayDateEl = document.getElementById('todayDate');
    if (todayDateEl) {
        todayDateEl.textContent = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    /* ---------- Indicateur ouvert / fermé ---------- */
    var OPENING_HOURS = {
        1: [12.5, 17],   // lundi
        2: [9, 17],      // mardi
        3: [9, 17],      // mercredi
        4: [9, 17],      // jeudi
        5: [9, 12],      // vendredi
        6: [9.5, 12]     // samedi
    };

    var MOBILE = window.matchMedia('(max-width: 860px)');

    function updateOpenStatus() {
        var el = document.getElementById('openStatus');
        if (!el) return;
        var now = new Date();
        var day = now.getDay();
        var t = now.getHours() + now.getMinutes() / 60;
        var hours = OPENING_HOURS[day];
        var short = MOBILE.matches;

        if (!hours) {
            el.className = 'open-status closed';
            el.textContent = '🔴 Fermé';
            el.title = 'Fermé aujourd’hui';
            return;
        }
        var fmt = function (h) {
            var hh = Math.floor(h);
            var mm = Math.round((h - hh) * 60);
            return hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
        };
        if (t < hours[0]) {
            el.className = 'open-status closed';
            el.textContent = short ? '🟡 ' + fmt(hours[0]) : '🟡 Ouverture à ' + fmt(hours[0]);
            el.title = 'Ouverture à ' + fmt(hours[0]);
        } else if (t < hours[1]) {
            el.className = 'open-status open';
            el.textContent = short ? '🟢 Ouvert' : '🟢 Ouvert · ferme à ' + fmt(hours[1]);
            el.title = 'Ouvert · ferme à ' + fmt(hours[1]);
        } else {
            el.className = 'open-status closed';
            el.textContent = short ? '🔴 Fermé' : '🔴 Fermé · réouvre demain';
            el.title = 'Fermé · réouvre demain';
        }
    }

    if (MOBILE.addEventListener) {
        MOBILE.addEventListener('change', updateOpenStatus);
    } else if (MOBILE.addListener) {
        MOBILE.addListener(updateOpenStatus);
    }

    updateOpenStatus();
    setInterval(updateOpenStatus, 60000);



    var loading = document.getElementById('dashLoading');
    if (!loading) return;

    function escapeHtml(str) { return window.ADWEscape.html(str); }

    // Gimaweb : les agrégats vivent côté serveur — un seul appel GET /api/agregats/flot
    var flot = { kpi: {}, agenda: [], visites_recentes: [], impressions: {} };

    function obtenirFlot() {
        return ADWDatabase.agregatsFlot().then(function (f) {
            flot = f || { kpi: {}, agenda: [], visites_recentes: [], impressions: {} };
            return flot;
        }).catch(function () { return flot; });
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function showToast(message) {
        var toast = document.createElement('div');
        toast.className = 'toast toast-success visible';
        toast.setAttribute('role', 'status');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function () {
            toast.classList.remove('visible');
            setTimeout(function () { toast.remove(); }, 300);
        }, 2600);
    }

    /* ============ Stats ============ */

    // ============ Agenda du jour ============
    function isoLocal(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function toneFor(name) {
        var str = (name || '').toLowerCase();
        var h = 0;
        for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        return h % 10;
    }
    // Couleur par CATEGORIE (charte, v1.4.6) : on scanne TOUTES les categories de
    // l'evenement (sur le site, la 1re est generique — Ateliers/Formations/Evènement —
    // et la categorie utile arrive derriere) : tablette/smartphone = vert #18A55F,
    // trucs et astuces = ambre #B26A00, formation = bleu #2F9BE4 ;
    // sinon ton deterministe sur la 1re categorie.
    function couleurCategorie(cat) {
        var liste = Array.isArray(cat) ? cat : String(cat || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
        var tous = (list) => {
        var s = (list || []).join(' ').toLowerCase();
        if (s.indexOf('tablette') !== -1 || s.indexOf('smartphone') !== -1 || s.indexOf('mobile') !== -1) return '#18A55F';
        if (s.indexOf('truc') !== -1) return '#B26A00';
        if (list.some(function (c) { return (c || '').toLowerCase().indexOf('formation') === 0; })) return '#2F9BE4';
        return null;
        };
        var direct = tous(liste);
        if (direct) return direct;
        var tone = liste.length ? toneFor(liste[0]) : -1;
        return tone >= 0 ? TONE_SOLID[tone] : '#2F9BE4';
    }
    var TONE_SOLID = ['#0F3D5C', '#6C5CE7', '#2F9BE4', '#18A55F', '#E8734A', '#B26A00', '#D8434B', '#7A5230', '#556B2F', '#4A4E69'];

    function renderNextClosure() {
        var el = document.getElementById('nextClosure');
        if (!el) return;
        var fem = flot.prochaine_fermeture;
        if (!fem || !fem.date) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        var d = new Date(fem.date + 'T12:00:00');
        var dateTxt = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
        if (fem.date_fin && fem.date_fin !== fem.date) {
            var dFin = new Date(fem.date_fin + 'T12:00:00');
            dateTxt += ' au ' + dFin.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
        }
        el.innerHTML = '<div class="stat-card today-agenda" style="border-left:4px solid var(--warning, #EFA02C);">' +
            '<h3>\uD83D\uDD34 Prochaine fermeture</h3>' +
            '<p style="margin:0.2rem 0 0;font-weight:700;">\uD83D\uDCC5 ' + (fem.title ? fem.title.replace(/fermeture/i, 'Fermeture').trim() : 'Fermeture') + '</p>' +
            '<p class="form-hint" style="margin:0.25rem 0 0;">' + dateTxt + (fem.time_label ? ' \u00b7 ' + fem.time_label : '') + ' \u2014 pr\u00E9viens les usagers \u00E0 l\u2019accueil.</p>' +
            '</div>';
        el.hidden = false;
    }

    function renderTodayAgenda() {
        var el = document.getElementById('todayAgenda');
        if (!el) return;
        var rows = flot.agenda || [];
        if (!rows.length) {
            // Journée calme : carte discrète plutôt qu'un trou
            el.innerHTML = '<div class="stat-card today-agenda" style="opacity:0.75;">' +
                '<h3>\ud83d\udcc6 Aujourd\u2019hui \u00e0 l\u2019Atelier</h3>' +
                '<p class="form-hint" style="margin:0;">Aucune formation programm\u00e9e aujourd\u2019hui \u2014 journ\u00e9e calme \ud83c\udf3f</p></div>';
            el.hidden = false;
            return;
        }
        var html = '<div class="stat-card today-agenda" style="">' +
            '<h3>📆 Aujourd\u2019hui à l\u2019Atelier <span class="members-count">' + rows.length + ' formation' + (rows.length > 1 ? 's' : '') + '</span></h3>' +
            '<div class="agenda-list">';
        rows.forEach(function (f) {
            var mainCat = (f.categories || '').split(',').map(function (c) { return c.trim(); }).filter(function (c) { return c && !/^\d+$/.test(c); })[0] || '';
            var tone = mainCat ? toneFor(mainCat) : -1;
            var bg = mainCat ? couleurCategorie(f.categories) : 'var(--primary)';
            html += '<a class="agenda-item" href="formation.html?id=' + encodeURIComponent(f.event_id) + '" style="text-decoration:none;">' +
                '<span class="agenda-slot ' + (f.slot === 'AM' ? 'am' : 'pm') + '">' + (f.slot === 'AM' ? 'Matin' : 'A-midi') + '</span>' +
                '<span class="agenda-bar" style="background:' + bg + ';"></span>' +
                '<span class="agenda-title">' + escapeHtml(f.title) + '</span>' +
                (f.time_label ? '<span class="agenda-time">' + escapeHtml(f.time_label) + '</span>' : '') +
                '<span class="agenda-count' + (f.attendee_count ? ' has-attendees' : '') + '">' + f.attendee_count + ' inscrit' + (f.attendee_count > 1 ? 's' : '') + '</span>' +
                (f.room_name ? '<span class="agenda-room">' + escapeHtml(f.room_name) + '</span>' : '<span class="badge badge-full">sans salle</span>') +
                '</a>';
        });
        html += '</div></div>';
        el.innerHTML = html;
        el.hidden = false;
    }

    // Formations les plus attendues : le classement des listes d'attente (dashboard)
    function renderMostWaited() {
        var el = document.getElementById('mostWaited');
        if (!el) return;
        ADWDatabase.getMostWaitedFormations(5).catch(function () { return []; }).then(_renderMW); return;
        function _renderMW(rows) {
            rows = rows || [];
        if (!rows.length) { el.hidden = true; return; }
        var total = rows.reduce(function (s, r) { return s + r.waiting; }, 0);
        var html = '<div class="stat-card today-agenda" style="">' +
            '<h3>\u{1F3AF} Les formations les plus attendues <span class="members-count">' + total + ' en attente</span></h3>' +
            '<div class="agenda-list">';
        rows.forEach(function (r, i) {
            html += '<a class="agenda-item" href="' + (r.event_id
                ? 'formation.html?id=' + encodeURIComponent(r.event_id)
                : 'formations.html') + '" style="text-decoration:none;">' +
                '<span class="mw-rank">' + (i + 1) + '</span>' +
                '<span class="agenda-title">' + escapeHtml(r.title) + '</span>' +
                '<span class="agenda-count has-attendees">' + r.waiting + ' en attente' +
                (r.contacted ? ' \u00b7 ' + r.contacted + ' contact\u00e9' + (r.contacted > 1 ? 's' : '') : '') +
                '</span>' +
                '</a>';
        });
        html += '</div></div>';
        el.innerHTML = html;
        el.hidden = false;
        }
    }

    // 3 dernières notifications (dashboard) — aperçu du centre, lien vers notifications.html
    function renderLastNotifs() {
        var el = document.getElementById('lastNotifs');
        if (!el) return;
        ADWDatabase.listNotifications(3).catch(function () { return []; }).then(_renderLN); return;
        function _renderLN(items) {
            items = items || [];
        if (!items.length) { el.hidden = true; return; }
        function ago(iso) {
            if (!iso) return '';
            try {
                var d = new Date(String(iso).replace(' ', 'T') + (String(iso).indexOf('Z') === -1 ? 'Z' : ''));
                var mins = Math.round((Date.now() - d.getTime()) / 60000);
                if (isNaN(mins)) return '';
                if (mins < 1) return 'a l\u2019instant';
                if (mins < 60) return 'il y a ' + mins + ' min';
                var h = Math.round(mins / 60);
                if (h < 24) return 'il y a ' + h + ' h';
                return 'il y a ' + Math.round(h / 24) + ' j';
            } catch (e2) { return ''; }
        }
        function icoOf(n) {
            return n.severity === 'success' ? '✅' : n.severity === 'warning' ? '⚠️' : n.severity === 'danger' ? '❌' : 'ℹ️';
        }
        var html = '<div class="stat-card today-agenda" style="">' +
            '<h3>🔔 Derni\u00e8res notifications <a href="notifications.html" class="btn btn-secondary btn-small" style="margin-left:auto;font-size:0.72rem;">Tout voir \u2192</a></h3>' +
            '<div class="agenda-list">';
        items.forEach(function (n) {
            var msg = n.message || '';
            if (msg.length > 110) msg = msg.slice(0, 107) + '\u2026';
            html += '<a class="agenda-item" href="notifications.html" style="text-decoration:none;">' +
                '<span class="notif-ico sev-' + escapeHtml(n.severity) + '">' + icoOf(n) + '</span>' +
                '<span class="agenda-title" style="flex:1;min-width:0;">' + escapeHtml(msg) + '</span>' +
                '<span class="form-hint" style="white-space:nowrap;">' + ago(n.created_at) + '</span>' +
                '</a>';
        });
        html += '</div></div>';
        el.innerHTML = html;
        el.hidden = false;
        }
    }

    function render() {
        obtenirFlot().then(function () {
        renderNextClosure();
        renderTodayAgenda();
        renderMostWaited();
        renderLastNotifs();

        var visitsToday = flot.kpi.visites_aujourdhui;
        var visitsMonth = flot.kpi.visites_mois;
        setText('statVisitsToday', visitsToday);
        setText('statVisitsMonth', visitsMonth);

        var ticketsEl = document.getElementById('statTicketsOpen');
        if (ticketsEl) {
            var openT = flot.kpi.tickets_ouverts || 0;
            var urgentT = flot.kpi.tickets_urgents || 0;
            var unassignedT = flot.kpi.tickets_urgents_non_assignes || 0;
            ticketsEl.textContent = openT;
            ticketsEl.title = openT + ' incident(s) ouvert(s)' +
                (urgentT ? ' \u2014 dont ' + urgentT + ' urgent(s)' : '') +
                (unassignedT ? ' (' + unassignedT + ' non assign\u00e9(s))' : '');
        }

        var lastVisit = flot.kpi.derniere_visite;
        setText('statLastVisit', lastVisit || '\u2014');

        var cards = document.querySelectorAll('.stat-card, .kpi-grid, .chart-card');
        cards.forEach(function (c) { c.removeAttribute('hidden'); });
        if (loading) loading.hidden = true;

        // KPI Nouveaux aujourd'hui (ex-carte flux) + KPI En liste d'attente
        var newToday = flot.kpi.nouveaux_aujourdhui || 0;
        setText('statFluxNew', newToday);
        var waiting = flot.kpi.en_attente || 0;
        setText('statWaiting', waiting);

        renderRecentVisits();
        renderPrintsDue();
        });
    }



    function renderRecentVisits() {
        var recentList = document.getElementById('recentVisits');
        if (!recentList) return;
        var recent = flot.visites_recentes || [];
        if (recent.length) {
            recentList.innerHTML = recent.map(function (r) {
                var d = new Date(r.visit_date);
                var label = isNaN(d.getTime()) ? r.visit_date : d.toLocaleDateString('fr-BE');
                return '<li><span class="rv-name">#' + escapeHtml(r.member_no) + ' ' +
                    escapeHtml(r.first_name) + ' ' + escapeHtml(r.last_name) + '</span>' +
                    '<span class="rv-date">' + escapeHtml(label) + (r.reason && r.reason !== 'Non précisé' ? ' · ' + escapeHtml(r.reason) : '') + '</span>' +
                    '<span class="badge ' + (r.amount > 0 ? 'badge-sub-none' : 'badge-ok') + '">' +
                    (r.amount > 0 ? r.amount.toFixed(2).replace('.', ',') + ' €' : 'abo') + '</span></li>';
            }).join('');
        } else {
            recentList.innerHTML = '<li class="form-hint" style="list-style:none;padding:0.5rem 0;">Aucune visite enregistrée — pointez une visite depuis le bouton « ✅ Pointer une visite ».</li>';
        }
    }

    var PCS = 21;

    function eur(v) {
        return v.toFixed(2).replace('.', ',') + ' \u20AC';
    }



    function renderPrintsDue() {
        var list = document.getElementById('printsDueList');
        var totalEl = document.getElementById('printsDueTotal');
        var card = document.getElementById('printsDueCard');
        if (card) card.removeAttribute('hidden');
        if (!list) return;
        var rows = (flot.impressions && flot.impressions.top) || [];
        var total = (flot.impressions && flot.impressions.total) || 0;
        var count = (flot.impressions && flot.impressions.compte) || 0;

        if (rows.length) {
            list.innerHTML = rows.map(function (r) {
                var d = new Date(r.last_print);
                var label = isNaN(d.getTime()) ? r.last_print : d.toLocaleDateString('fr-BE');
                return '<li><span class="rv-name">#' + escapeHtml(r.member_no) + ' ' +
                    escapeHtml(r.first_name) + ' ' + escapeHtml(r.last_name) + '</span>' +
                    '<span class="rv-date">' + escapeHtml(label) + '</span>' +
                    '<span class="badge badge-sub-none">' + r.balance.toFixed(2).replace('.', ',') + ' €</span></li>';
            }).join('');
        } else {
            list.innerHTML = '<li class="form-hint" style="list-style:none;padding:0.5rem 0;">Aucune impression à solder ✨</li>';
        }
        if (totalEl) {
            totalEl.textContent = count > 0
                ? 'Total dû : ' + total.toFixed(2).replace('.', ',') + ' € (' + count + ' membre' + (count > 1 ? 's' : '') + ')'
                : 'Tout est réglé.';
        }
    }

    /* ============ Rapport annuel exportable ============ */

    var annualReportBtn = document.getElementById('annualReportBtn');



    /* ============ Heatmap fréquentation (12 semaines) ============ */



    /* ============ Donut statuts sociaux ============ */

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



    /* ============ Check-in rapide ============ */


    /* ---------- Navigation clavier des listes de recherche (visites/impressions) ---------- */
    function makeListNavigable(searchInput, resultsEl, opts) {
        // opts.onEnter(itemEl, members, activeIndex, subAction) — valide la ligne ;
        // opts.subActions : liste de selecteurs de sous-boutons (navigation gauche/droite + Entr\u00e9e sur le bouton focus).
        var state = { activeIndex: -1, subIndex: -1, members: [] };
        function items() { return resultsEl.querySelectorAll('li.checkin-item'); }
        function setActive(idx, subIdx) {
            state.activeIndex = idx;
            state.subIndex = (subIdx === undefined ? -1 : subIdx);
            var els = items();
            els.forEach(function (el, i) {
                el.classList.toggle('bk-active', i === state.activeIndex);
            });
            if (state.activeIndex >= 0 && els[state.activeIndex]) {
                els[state.activeIndex].scrollIntoView({ block: 'nearest' });
            }
        }
        searchInput.addEventListener('keydown', function (e) {
            var els = items();
            if (!els.length) return;
            var max = els.length - 1;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(state.activeIndex < 0 ? 0 : Math.min(state.activeIndex + 1, max));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(state.activeIndex <= 0 ? 0 : state.activeIndex - 1);
            } else if (e.key === 'ArrowRight' && opts.subActions && state.activeIndex >= 0) {
                e.preventDefault();
                var btns = els[state.activeIndex].querySelectorAll(opts.subActions);
                state.subIndex = Math.min(state.subIndex + 1, btns.length - 1);
                btns.forEach(function (b, i) { b.classList.toggle('bk-active', i === state.subIndex); });
            } else if (e.key === 'ArrowLeft' && opts.subActions && state.activeIndex >= 0) {
                e.preventDefault();
                var btns = els[state.activeIndex].querySelectorAll(opts.subActions);
                state.subIndex = Math.max(state.subIndex - 1, -1);
                btns.forEach(function (b, i) { b.classList.toggle('bk-active', i === state.subIndex); });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (state.activeIndex >= 0 && state.members[state.activeIndex]) {
                    var el = els[state.activeIndex];
                    var subBtn = state.subIndex >= 0 ? el.querySelectorAll(opts.subActions)[state.subIndex] : null;
                    if (subBtn) { subBtn.click(); }
                    else { el.click(); }
                }
            }
        });
        searchInput.addEventListener('input', function () { setActive(-1); });
        return {
            setMembers: function (members) { state.members = members || []; setActive(state.members.length ? 0 : -1); },
            state: state
        };
    }

    var checkinModal = document.getElementById('checkinModal');
    var quickCheckinBtn = document.getElementById('quickCheckinBtn');
    var checkinCloseBtn = document.getElementById('checkinCloseBtn');
    var checkinSearch = document.getElementById('checkinSearch');
    var checkinResults = document.getElementById('checkinResults');
    var checkinHint = document.getElementById('checkinHint');
    var checkinNav = (checkinSearch && checkinResults) ? makeListNavigable(checkinSearch, checkinResults, {}) : null;

    // La liste /api/membres est déjà enrichie (visited_today, print_balance) — filtre client.
    function searchMembers(q, apres) {
        q = (q || '').trim().toLowerCase();
        ADWDatabase.listerMembres().then(function (tous) {
            tous = tous || [];
            var membres = tous.filter(function (m) {
                if (!q) return true;
                if (/^\d+$/.test(q)) return String(m.member_no || '').indexOf(q) !== -1;
                return ((m.first_name || '') + ' ' + (m.last_name || '')).toLowerCase().indexOf(q) !== -1;
            }).slice(0, 8);
            apres(membres);
        }).catch(function () { apres([]); });
    }

    function openCheckin() {
        if (!checkinModal) return;
        hideReasonStep();
        checkinModal.hidden = false;
        if (checkinSearch) {
            checkinSearch.value = '';
            checkinSearch.focus();
        }
        searchMembers('', afficherResultatsPointage);
    }

    function closeCheckin() {
        if (checkinModal) checkinModal.hidden = true;
    }


    // Classe de statut pour la vignette (même code couleur que membres.html — décision EPN :
    // vert = actif, rouge = expiré, gris foncé = inactif)
    function statusClass(m) {
        if ((m.subscription || 'none') === 'none') return ' inactive';
        var today = new Date().toISOString().slice(0, 10);
        if (m.end_date && m.end_date < today) return ' expired';
        return '';
    }

    function afficherResultatsPointage(members) {
        if (!checkinResults) return;
        checkinResults.innerHTML = '';
        if (!members.length) {
            checkinResults.innerHTML = '<li class="form-hint" style="list-style:none;padding:0.6rem 0;">Aucun membre trouvé.</li>';
            return;
        }
        if (checkinNav) checkinNav.setMembers(members);
        members.forEach(function (m) {
            var li = document.createElement('li');
            li.className = 'checkin-item' + statusClass(m) + (m.visited_today ? ' done' : '');
            li.innerHTML =
                '<span class="member-avatar small" aria-hidden="true">' +
                    escapeHtml(((m.first_name || '?').charAt(0) + (m.last_name || '?').charAt(0)).toUpperCase()) +
                '</span>' +
                '<span class="rv-name">#' + escapeHtml(m.member_no) + ' ' + escapeHtml(m.first_name) + ' ' + escapeHtml(m.last_name) + '</span>' +
                (m.visited_today
                    ? '<span class="badge badge-ok">✓ déjà pointé</span>'
                    : (m.subscription !== 'none'
                        ? '<span class="badge badge-sub-yearly">abo</span>'
                        : '<span class="badge badge-sub-none">1 €</span>'));

            li.addEventListener('click', function () { doCheckin(m); });
            checkinResults.appendChild(li);
        });
    }

    /* ===== Raison de la visite — motifs issus du Zoom Baromètre de l'inclusion numérique 2026 (FRB) ===== */
    var VISIT_REASONS = [
        'Non précisé',
        'Démarches administratives (commune, CSAM, eID, impôts)',
        'Banque / e-banking',
        'Santé / e-santé (RDV, mutualité, résultats)',
        'Emploi / recherche d’emploi (CV, candidatures)',
        'Logement (recherche, candidature)',
        'Formation / e-learning',
        'Mail / communication (courrier, visio, proches)',
        'Achats en ligne / e-commerce',
        'Impression / scan de documents',
        'Accès internet libre',
        'Aide technique / sécurité (appareil, mots de passe, arnaques)',
        'Découverte de l’IA',
        'Apprendre / se perfectionner'
    ];
    var reasonStep = document.getElementById('reasonStep');
    var reasonWho = document.getElementById('reasonWho');
    var visitReason = document.getElementById('visitReason');
    var reasonConfirmBtn = document.getElementById('reasonConfirm');
    var reasonCancelBtn = document.getElementById('reasonCancel');
    var checkinActions = document.getElementById('checkinActions');
    var checkinSearchGroup = document.getElementById('checkinSearchGroup');
    var pendingVisitMember; // null = visite anonyme ; undefined = pas d'étape en cours

    if (visitReason && !visitReason.options.length) {
        VISIT_REASONS.forEach(function (r) {
            var o = document.createElement('option');
            o.value = r;
            o.textContent = r;
            visitReason.appendChild(o);
        });
    }

    function showReasonStep(member) {
        pendingVisitMember = member || null;
        if (reasonWho) {
            reasonWho.textContent = member
                ? '👤 ' + member.first_name + ' ' + member.last_name + ' (#' + member.member_no + ')'
                : '👤 Visite anonyme (1 €)';
        }
        if (reasonStep) reasonStep.hidden = false;
        if (checkinActions) checkinActions.hidden = true;
        if (checkinSearchGroup) checkinSearchGroup.hidden = true;
        if (checkinResults) checkinResults.hidden = true;
        if (visitReason) visitReason.focus();
    }

    function hideReasonStep() {
        pendingVisitMember = undefined;
        if (reasonStep) reasonStep.hidden = true;
        if (checkinActions) checkinActions.hidden = false;
        if (checkinSearchGroup) checkinSearchGroup.hidden = false;
        if (checkinResults) checkinResults.hidden = false;
        if (checkinSearch) checkinSearch.focus();
    }

    if (reasonCancelBtn) reasonCancelBtn.addEventListener('click', hideReasonStep);

    // Entrée = valider et fermer (demande utilisateur) — actif uniquement à l'étape raison.
    // Garde : l'Enter qui SÉLECTIONNE le membre dans la recherche (nav clavier) ne doit pas
    // valider la raison dans le même keydown — on ignore l'Enter tant que le focus est
    // sur un champ de saisie. Après la sélection, le focus passe au select de raison.
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        if (!checkinModal || checkinModal.hidden) return;
        if (!reasonStep || reasonStep.hidden) return;
        // e.target (figé à la frappe) et non activeElement : quand le nav sélectionne
        // le membre, le focus saute au select DANS le même keydown — activeElement
        // serait déjà le select et laisserait passer la validation. La cible de la
        // frappe, elle, dit la vérité : cet Enter vient de la recherche.
        var t = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (t === 'input' || t === 'textarea') return;
        e.preventDefault();
        if (reasonConfirmBtn) reasonConfirmBtn.click();
    });

    // Raccourci P : ouvrir la modale de pointage (hors saisie, modale fermée)
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.key || '').toLowerCase() !== 'p') return;
        if (!checkinModal || !checkinModal.hidden) return;
        var active = document.activeElement;
        if (active && ((active.tagName || '').toLowerCase() === 'input' || (active.tagName || '').toLowerCase() === 'textarea' || (active.tagName || '').toLowerCase() === 'select')) return;
        e.preventDefault();
        openCheckin();
    });

    if (reasonConfirmBtn) reasonConfirmBtn.addEventListener('click', function () {
        if (pendingVisitMember === undefined) return;
        var reason = (visitReason && visitReason.value) || VISIT_REASONS[0];
        var today = new Date().toISOString().slice(0, 10);
        var visitId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        var isAnon = pendingVisitMember === null;
        var amount = isAnon ? 1 : (pendingVisitMember.subscription === 'none' ? 1 : 0);
        ADWDatabase.pointerVisite(isAnon ? 'anon' : pendingVisitMember.id, reason).then(function () {
                hideReasonStep();
                closeCheckin();
                render();
                pulseVisitsKpi();
                if (isAnon) {
                    if (window.ADWNotifications) window.ADWNotifications.push('anon_visit', '👤 Visite anonyme enregistrée (1 €) — ' + reason, 'success');
                    showToast('✅ Visite anonyme pointée (1 €) — ' + reason);
                } else {
                    showToast('✅ Visite de ' + pendingVisitMember.first_name + ' pointée' + (amount ? ' (1 €)' : ' (incluse abonnement)') + ' — ' + reason);
                }
            });
    });

    function doCheckin(member) {
        if (member.visited_today) return;
        showReasonStep(member);
    }


    // Design v4 : pulse du KPI Visites après un pointage (récompense visuelle du geste)
    function pulseVisitsKpi() {
        var kpi = document.querySelector('.kpi-card[data-tile="kpi2"]');
        if (!kpi) return;
        kpi.classList.remove('kpi-pulse');
        void kpi.offsetWidth; // reflow pour relancer l'animation
        kpi.classList.add('kpi-pulse');
    }
    if (quickCheckinBtn) quickCheckinBtn.addEventListener('click', openCheckin);

    // Visite anonyme : passage sans fiche membre — compteur simple à 1 EUR (décision utilisateur).
    // member_id sentinel 'anon' (colonne NOT NULL) — comptée dans les stats visites/revenus.
    var anonVisitBtn = document.getElementById('anonVisitBtn');
    if (anonVisitBtn) anonVisitBtn.addEventListener('click', function () { showReasonStep(null); });
    // Raccourci A : visible seulement modale ouverte (sinon A en saisie libre serait piégé)
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.key || '').toLowerCase() !== 'a') return;
        if (!checkinModal || checkinModal.hidden) return;
        // Si l'utilisateur tape dans le champ de recherche, « a » est une lettre, pas un raccourci
        var active = document.activeElement;
        var typing = active && (active.id === 'checkinSearch' || (active.tagName || '').toLowerCase() === 'input');
        if (typing) return;
        e.preventDefault();
        anonVisitBtn.click();
    });
    if (checkinCloseBtn) checkinCloseBtn.addEventListener('click', closeCheckin);
    if (checkinModal) checkinModal.addEventListener('click', function (e) {
        if (e.target === checkinModal) closeCheckin();
    });
    if (checkinSearch) checkinSearch.addEventListener('input', function () {
        searchMembers(checkinSearch.value, afficherResultatsPointage);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && checkinModal && !checkinModal.hidden) closeCheckin();
    });

    /* ============ Impression rapide ============ */

    var printModal = document.getElementById('printModal');
    var quickPrintBtn = document.getElementById('quickPrintBtn');
    var printCloseBtn = document.getElementById('printCloseBtn');
    var printSearch = document.getElementById('printSearch');
    var printResults = document.getElementById('printResults');
    var printNav = (printSearch && printResults) ? makeListNavigable(printSearch, printResults, { subActions: '[data-print]' }) : null;

    function openPrint() {
        if (!printModal) return;
        printModal.hidden = false;
        if (printSearch) {
            printSearch.value = '';
            printSearch.focus();
        }
        searchMembers('', displayPrintResults);
    }

    function closePrint() {
        if (printModal) printModal.hidden = true;
    }

    function displayPrintResults(members) {
        if (!printResults) return;
        printResults.innerHTML = '';
        if (printNav) printNav.setMembers(members);
        if (!members.length) {
            printResults.innerHTML = '<li class="form-hint" style="list-style:none;padding:0.6rem 0;">Aucun membre trouvé.</li>';
            return;
        }
        members.forEach(function (m) {
            var li = document.createElement('li');
            li.className = 'checkin-item' + statusClass(m);
            li.innerHTML =
                '<span class="member-avatar small" aria-hidden="true">' +
                    escapeHtml(((m.first_name || '?').charAt(0) + (m.last_name || '?').charAt(0)).toUpperCase()) +
                '</span>' +
                '<span class="rv-name">#' + escapeHtml(m.member_no) + ' ' + escapeHtml(m.first_name) + ' ' + escapeHtml(m.last_name) + '</span>' +
                (m.print_balance > 0
                    ? '<span class="badge badge-sub-none">' + m.print_balance.toFixed(2).replace('.', ',') + ' € dus</span>'
                    : '') +
                '<span class="print-actions-btns">' +
                    '<button type="button" class="btn btn-secondary btn-small" data-print="bw">+ N&B (0,10 €)</button>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-print="color">+ Couleur (0,50 €)</button>' +
                '</span>';

            li.querySelectorAll('[data-print]').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var type = btn.getAttribute('data-print');
                    var amount = type === 'bw' ? 0.10 : 0.50;
                    ADWDatabase.ajouterImpression(m.id, type, amount).then(function () {
                        render();
                        showToast('🖨️ Impression ' + (type === 'bw' ? 'N&B' : 'couleur') + ' pour ' + m.first_name + ' (' + amount.toFixed(2).replace('.', ',') + ' €)');
                        searchMembers(printSearch ? printSearch.value : '', displayPrintResults);
                    });
                });
            });
            printResults.appendChild(li);
        });
    }

    if (quickPrintBtn) quickPrintBtn.addEventListener('click', openPrint);
    if (printCloseBtn) printCloseBtn.addEventListener('click', closePrint);
    if (printModal) printModal.addEventListener('click', function (e) {
        if (e.target === printModal) closePrint();
    });
    if (printSearch) printSearch.addEventListener('input', function () {
        searchMembers(printSearch.value, displayPrintResults);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && printModal && !printModal.hidden) closePrint();
    });

    ADWDatabase.init().then(render).catch(function (err) {
        if (loading) {
            loading.hidden = true;
            loading.querySelector('p').textContent = 'Erreur de chargement de la base de données : ' + err.message;
        }
    });
})();
