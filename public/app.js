(function () {
    'use strict';

    // Page Membres (membres.html) : CRUD fiches, recherche/tri/filtres, visites (pointage),
    // impressions (solde), abonnements, vues cartes/liste, export CSV. Dépend de : db.js, escape.js, layout.js.

    var PREFS_KEY = 'atelierduweb_members_prefs';
    var VISIT_PRICE = 1;

    var todayDateEl = document.getElementById('todayDate');
    if (todayDateEl) {
        todayDateEl.textContent = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    var grid = document.getElementById('membersGrid');
    if (!grid) return;

    var modal = document.getElementById('memberModal');
    var form = document.getElementById('memberForm');
    var addBtn = document.getElementById('addMemberBtn');
    var cancelBtn = document.getElementById('cancelBtn');
    var modalTitle = document.getElementById('modalTitle');
    var searchInput = document.getElementById('searchInput');
    var emptyState = document.getElementById('emptyState');
    var sortSelect = document.getElementById('sortSelect');
    var loading = document.getElementById('loadingState');
    var membersCount = document.getElementById('membersCount');
    var viewGridBtn = document.getElementById('viewGridBtn');
    var viewListBtn = document.getElementById('viewListBtn');
    var exportBtn = document.getElementById('exportBtn');
    var formError = document.getElementById('formError');
    var startDateInput = document.getElementById('startDate');
    var endDateInput = document.getElementById('endDate');
    var detailModal = document.getElementById('detailModal');
    var detailBody = document.getElementById('detailBody');
    var detailTitle = document.getElementById('detailTitle');
    var detailCloseBtn = document.getElementById('detailCloseBtn');
    var detailCheckinBtn = document.getElementById('detailCheckinBtn');
    var detailMember = null;

    var currentFilter = 'all';
    var currentView = 'grid';

    var SUB_LABELS = {
        none: { label: 'Aucun abo', badge: 'badge-sub-none' },
        monthly: { label: 'Abo mensuel · 3 €', badge: 'badge-sub-monthly' },
        yearly: { label: 'Abo annuel · 30 €', badge: 'badge-sub-yearly' }
    };

    var SORTS = {
        'name-asc': 'm.last_name COLLATE NOCASE ASC, m.first_name COLLATE NOCASE ASC',
        'name-desc': 'm.last_name COLLATE NOCASE DESC, m.first_name COLLATE NOCASE DESC',
        'first-name-asc': 'm.first_name COLLATE NOCASE ASC, m.last_name COLLATE NOCASE ASC',
        'first-name-desc': 'm.first_name COLLATE NOCASE DESC, m.last_name COLLATE NOCASE DESC',
        'age-asc': 'm.age IS NULL, m.age ASC',
        'age-desc': 'm.age IS NULL, m.age DESC',
        'start-desc': 'm.start_date IS NULL, m.start_date DESC',
        'start-asc': 'm.start_date IS NULL, m.start_date ASC',
        'end-asc': 'm.end_date IS NULL, m.end_date ASC',
        'end-desc': 'm.end_date IS NULL, m.end_date DESC',
        'visits-desc': 'visit_count DESC, m.last_name COLLATE NOCASE ASC',
        'created-desc': 'm.created_at DESC'
    };

    var FILTERS = {
        all: null,
        // Actifs / Expirés : uniquement les membres AVEC abonnement (exclut les inactifs — décision EPN)
        active: "(m.subscription IS NOT NULL AND m.subscription != 'none') AND (date(m.end_date) >= date('now') OR m.end_date IS NULL)",
        expired: "(m.subscription IS NOT NULL AND m.subscription != 'none') AND date(m.end_date) < date('now') AND m.end_date IS NOT NULL",
        subscribed: 'm.subscription != \'none\'',
        inactive: "(m.subscription = 'none' OR m.subscription IS NULL)",
        'prints-due': '(SELECT COALESCE(SUM(amount), 0) FROM prints p WHERE p.member_id = m.id AND paid = 0) > 0'
    };

    function loadPrefs() {
        try {
            var prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
            if (prefs.sort && SORTS[prefs.sort]) sortSelect.value = prefs.sort;
            if (prefs.filter && FILTERS[prefs.filter]) currentFilter = prefs.filter;
            if (prefs.view === 'list' || prefs.view === 'grid') currentView = prefs.view;
            if (typeof prefs.search === 'string') searchInput.value = prefs.search;
        } catch (e) { /* best effort */ }
        syncFilterButtons();
        syncViewButtons();
    }

    function savePrefs() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify({
                sort: sortSelect.value, filter: currentFilter,
                view: currentView, search: searchInput.value
            }));
        } catch (e) { /* best effort */ }
    }

    function syncFilterButtons() {
        document.querySelectorAll('.filters-bar [data-filter]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-filter') === currentFilter);
        });
    }

    function syncViewButtons() {
        viewGridBtn.classList.toggle('active', currentView === 'grid');
        viewListBtn.classList.toggle('active', currentView === 'list');
    }

    function escapeHtml(str) { return window.ADWEscape.html(str); }

    var GENDER_LABELS = { F: 'Femme', M: 'Homme', X: 'Autre / Non-binaire' };
    var STATUS_LABELS = {
        travailleur: 'Travailleur.se', interim: 'Intérim', actiris: 'Actiris',
        mutuelle: 'Mutuelle', cpas: 'CPAS', pensionne: 'Pensionné',
        etudiant: 'Étudiant', enfant: 'Enfant'
    };

    function initPostalCodes() {
        var dl = document.getElementById('postalCodesList');
        if (!dl || typeof ADW_POSTAL_CODES === 'undefined') return;
        var frag = document.createDocumentFragment();
        ADW_POSTAL_CODES.forEach(function (pc) {
            var opt = document.createElement('option');
            opt.value = pc[0] + ' — ' + pc[1];
            frag.appendChild(opt);
        });
        dl.appendChild(frag);
    }

    function normalizePostalCode(input) {
        if (!input) return '';
        var m = String(input).match(/\b(\d{4})\b/);
        return m ? m[1] : '';
    }

    initPostalCodes();

    function isExpired(member) {
        if (!member.end_date) return false;
        return new Date(member.end_date) < new Date(new Date().toDateString());
    }

    function initials(member) {
        return ((member.first_name || '?').charAt(0) + (member.last_name || '?').charAt(0)).toUpperCase();
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('fr-BE');
    }

    // Migré Gimaweb : le filtre/tri/recherche tourne côté client sur la liste
    // complète renvoyée par GET /api/membres (déjà enrichie : visit_count, print_balance).
    var TRI_CLIENT = {
        'name-asc': function (a, b) { return (a.last_name || '').localeCompare(b.last_name || '', 'fr') || (a.first_name || '').localeCompare(b.first_name || '', 'fr'); },
        'name-desc': function (a, b) { return (b.last_name || '').localeCompare(a.last_name || '', 'fr') || (b.first_name || '').localeCompare(a.first_name || '', 'fr'); },
        'first-name-asc': function (a, b) { return (a.first_name || '').localeCompare(b.first_name || '', 'fr') || (a.last_name || '').localeCompare(b.last_name || '', 'fr'); },
        'first-name-desc': function (a, b) { return (b.first_name || '').localeCompare(a.first_name || '', 'fr') || (b.last_name || '').localeCompare(a.last_name || '', 'fr'); },
        'age-asc': function (a, b) { return (a.age == null) - (b.age == null) || (a.age || 0) - (b.age || 0); },
        'age-desc': function (a, b) { return (a.age == null) - (b.age == null) || (b.age || 0) - (a.age || 0); },
        'start-desc': function (a, b) { return !a.start_date - !b.start_date || String(b.start_date || '').localeCompare(String(a.start_date || '')); },
        'start-asc': function (a, b) { return !a.start_date - !b.start_date || String(a.start_date || '').localeCompare(String(b.start_date || '')); },
        'end-asc': function (a, b) { return !a.end_date - !b.end_date || String(a.end_date || '').localeCompare(String(b.end_date || '')); },
        'end-desc': function (a, b) { return !a.end_date - !b.end_date || String(b.end_date || '').localeCompare(String(a.end_date || '')); },
        'visits-desc': function (a, b) { return (b.visit_count || 0) - (a.visit_count || 0) || (a.last_name || '').localeCompare(b.last_name || '', 'fr'); },
        'created-desc': function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }
    };
    var FILTRES_CLIENT = {
        all: null,
        active: function (m) { return (m.subscription || 'none') !== 'none' && (m.end_date || '') >= new Date().toISOString().slice(0, 10); },
        expired: function (m) { return (m.subscription || 'none') !== 'none' && m.end_date && m.end_date < new Date().toISOString().slice(0, 10); },
        subscribed: function (m) { return (m.subscription || 'none') !== 'none'; },
        inactive: function (m) { return (m.subscription || 'none') === 'none'; },
        'prints-due': function (m) { return (m.print_balance || 0) > 0; }
    };

    function getMembers() {
        return ADWDatabase.listerMembres().then(function (membres) {
            var filtre = FILTRES_CLIENT[currentFilter];
            if (filtre) membres = membres.filter(filtre);
            var query = (searchInput.value || '').trim().toLowerCase();
            if (query) {
                membres = membres.filter(function (m) {
                    if (/^\d+$/.test(query)) return String(m.member_no || '').indexOf(query) !== -1;
                    return ((m.first_name || '') + ' ' + (m.last_name || '') + ' ' + (m.email || '') + ' ' +
                            (m.phone || '') + ' ' + (m.address || '')).toLowerCase().indexOf(query) !== -1;
                });
            }
            var tri = TRI_CLIENT[sortSelect.value] || TRI_CLIENT['name-asc'];
            return membres.slice().sort(tri);
        });
    }

    function subBadge(member) {
        var s = SUB_LABELS[member.subscription] || SUB_LABELS.none;
        return '<span class="badge ' + s.badge + '">' + s.label + '</span>';
    }

    function statusBadge(member) {
        // « Aucun abo » = pas d'inscription dans le temps : ni Active ni Expirée
        // (décision EPN oct. 2026) — badge neutre « Sans abo ».
        if ((member.subscription || 'none') === 'none') {
            return '<span class="badge badge-sub-none">Inactif</span>';
        }
        var expired = isExpired(member);
        return '<span class="badge ' + (expired ? 'expired' : 'active-member') + '">' +
            (expired ? 'Expirée' : 'Active') + '</span>';
    }

    function cardHTML(member) {
        return '<div class="card-top">' +
                '<div class="member-avatar" aria-hidden="true">' + escapeHtml(initials(member)) + '</div>' +
                '<div class="member-idblock">' +
                    '<div class="member-name">' + escapeHtml(member.first_name) + ' ' + escapeHtml(member.last_name) + ' <span class="member-no">#' + (member.member_no || '—') + '</span></div>' +
                    '<div class="member-badges">' + statusBadge(member) + subBadge(member) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="member-meta">' +
                (member.age ? '<span>🎂 ' + escapeHtml(member.age) + ' ans' +
                    (member.gender ? ' · ' + (GENDER_LABELS[member.gender] || member.gender) : '') + '</span>' : (member.gender ? '<span>' + (GENDER_LABELS[member.gender] || member.gender) + '</span>' : '')) +
                (member.postal_code ? '<span>🏠 ' + escapeHtml(member.postal_code) + '</span>' : '') +
                (member.social_status ? '<span>💼 ' + escapeHtml(STATUS_LABELS[member.social_status] || member.social_status) + '</span>' : '') +
                (member.email ? '<span>✉️ <a href="mailto:' + escapeHtml(member.email) + '">' + escapeHtml(member.email) + '</a></span>' : '') +
                (member.phone ? '<span>📞 <a href="tel:' + escapeHtml(member.phone.replace(/\s/g, '')) + '">' + escapeHtml(member.phone) + '</a></span>' : '') +
                (member.address ? '<span>📍 ' + escapeHtml(member.address) + '</span>' : '') +
            '</div>' +
            '<div class="member-visits">' +
                '<span>Visites : <strong>' + member.visit_count + '</strong>' +
                (member.visited_today ? ' <span class="badge badge-ok">✓ aujourd\'hui</span>' : '') + '</span>' +
                (member.print_balance > 0 ? '<span class="print-balance">🖨️ ' + member.print_balance.toFixed(2).replace('.', ',') + ' € dus</span>' : '') +
                '<span class="dates-cell">du ' + escapeHtml(formatDate(member.start_date)) + ' au ' + escapeHtml(formatDate(member.end_date)) + '</span>' +
            '</div>';
    }

    function rowHTML(member) {
        return '<div class="list-cell avatar-cell"><span class="member-avatar small" aria-hidden="true">' + escapeHtml(initials(member)) + '</span></div>' +
            '<div class="list-cell name-cell">' + escapeHtml(member.first_name) + ' ' + escapeHtml(member.last_name) + ' <span class="member-no">#' + (member.member_no || '—') + '</span></div>' +
            '<div class="list-cell">' + (member.age ? escapeHtml(member.age) + ' ans' : '—') + '</div>' +
            '<div class="list-cell">' + subBadge(member) + '</div>' +
            '<div class="list-cell">' + (member.email ? escapeHtml(member.email) : '—') + '</div>' +
            '<div class="list-cell">' + escapeHtml(member.visit_count) + ' visite' + (member.visit_count > 1 ? 's' : '') + '</div>' +
            '<div class="list-cell dates-cell">' + statusBadge(member) + '</div>';
    }

    var RENDER_CAP = 200;

    function render() {
        getMembers().then(function (members) { renderListe(members); }).catch(function (err) {
            grid.innerHTML = '';
            emptyState.hidden = false;
            emptyState.querySelector('p').textContent = 'Erreur de chargement : ' + err.message;
        });
    }

    function renderListe(members) {
        grid.className = currentView === 'list' ? 'members-list' : 'members-grid';
        grid.innerHTML = '';
        emptyState.hidden = members.length > 0;
        membersCount.textContent = members.length + ' membre' + (members.length > 1 ? 's' : '');
        var shown = members.slice(0, RENDER_CAP);

        shown.forEach(function (member) {
            var expired = isExpired(member);
            var item = document.createElement('div');
            var inactive = (member.subscription || 'none') === 'none';
            item.className = (currentView === 'list' ? 'member-row' : 'member-card') +
                (expired ? ' expired' : '') + (inactive ? ' inactive' : '');
            item.innerHTML = currentView === 'list' ? rowHTML(member) : cardHTML(member);

            // UX refonte : une seule porte d'entrée — clic sur la carte/ligne → modale fiche
            // (plus de bouton Modifier dans la liste ; l'édition vit dans la modale fiche)
            item.addEventListener('click', function (e) {
                if (e.target.closest('button, a')) return;
                openDetail(member.id);
            });
            grid.appendChild(item);
        });

        if (members.length > RENDER_CAP) {
            var more = document.createElement('div');
            more.className = 'empty-state';
            more.style.border = 'none';
            more.style.boxShadow = 'none';
            more.innerHTML = '<p>' + (members.length - RENDER_CAP) + ' membre' + (members.length - RENDER_CAP > 1 ? 's' : '') +
                ' supplémentaire' + (members.length - RENDER_CAP > 1 ? 's' : '') +
                ' non affiché' + (members.length - RENDER_CAP > 1 ? 's' : '') +
                ' — affinez la recherche ou le tri.</p>';
            grid.appendChild(more);
        }
    }

    /* ---------- Fiche détail ---------- */

    // Format date dd/mm/aa (ex. 16/11/26) — aperçus de renouvellement
    function fmtDMY(iso) {
        if (!iso || iso.length < 10) return iso || '';
        return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4);
    }

    function openDetail(id) {
        return Promise.all([
            ADWDatabase.getMembre(id),
            ADWDatabase.getMemberFormations(id).catch(function () { return []; })
        ]).then(function (resultat) {
        var member = resultat[0];
        var memberFormations = resultat[1] || [];
        if (!member) return;
        detailMember = member;

        detailTitle.textContent = 'Fiche de ' + member.first_name + ' ' + member.last_name;
        var s = SUB_LABELS[member.subscription] || SUB_LABELS.none;
        var expired = isExpired(member);

        var html = '<div class="detail-head">' +
                '<div class="member-avatar">' + escapeHtml(initials(member)) + '</div>' +
                '<div><div class="member-name">' + escapeHtml(member.first_name) + ' ' + escapeHtml(member.last_name) + '</div>' +
                '<div class="member-no-detail">N° de membre : <strong>' + (member.member_no || '—') + '</strong></div>' +
                '<div class="member-badges">' + statusBadge(member) + subBadge(member) + '</div></div>' +
            '</div>' +
            '<dl class="detail-list">' +
                '<div><dt>Âge</dt><dd>' + (member.age ? escapeHtml(member.age) + ' ans' : 'Non renseigné') + '</dd></div>' +
                '<div><dt>Genre</dt><dd>' + (member.gender ? escapeHtml(GENDER_LABELS[member.gender] || member.gender) : 'Non renseigné') + '</dd></div>' +
                '<div><dt>Code postal</dt><dd>' + (member.postal_code
                    ? escapeHtml(member.postal_code) + (typeof ADW_POSTAL_CODES !== 'undefined' && ADW_POSTAL_CODES.some(function (p) { return p[0] === member.postal_code; }) ? ' — ' + escapeHtml(ADW_POSTAL_CODES.filter(function (p) { return p[0] === member.postal_code; })[0][1]) : '')
                    : 'Non renseigné') + '</dd></div>' +
                '<div><dt>Statut social</dt><dd>' + (member.social_status ? escapeHtml(STATUS_LABELS[member.social_status] || member.social_status) : 'Non renseigné') + '</dd></div>' +
                (member.email ? '<div><dt>Email</dt><dd><a href="mailto:' + escapeHtml(member.email) + '">' + escapeHtml(member.email) + '</a></dd></div>' : '') +
                (member.phone ? '<div><dt>Téléphone</dt><dd><a href="tel:' + escapeHtml(member.phone.replace(/\s/g, '')) + '">' + escapeHtml(member.phone) + '</a></dd></div>' : '') +
                (member.address ? '<div><dt>Adresse</dt><dd>' + escapeHtml(member.address) + '</dd></div>' : '') +
                '<div><dt>Inscription</dt><dd>du ' + escapeHtml(formatDate(member.start_date)) + ' au ' + escapeHtml(formatDate(member.end_date)) + '</dd></div>' +
            '</dl>'; // historique des visites volontairement absent de la modale — sur la fiche complète (membre.html)

        html += '<div class="detail-prints">' +
            '<div class="chart-header">' +
                '<h4>🎓 Inscriptions aux formations <span class="members-count">' + memberFormations.length + '</span></h4>' +
            '</div>';
        if (memberFormations.length) {
            html += '<ul class="visits-list">';
            memberFormations.forEach(function (f) {
                var dLabel = f.start_date ? escapeHtml(formatDate(f.start_date)) : 'date à confirmer';
                html += '<li style="display:flex;flex-direction:column;gap:0.15rem;">' +
                    '<span style="font-weight:600;">🎓 ' + escapeHtml(f.title) + '</span>' +
                    '<span class="detail-meta">' +
                    '<span class="form-hint">📅 ' + dLabel + (f.time_label ? ' · ⏰ ' + escapeHtml(f.time_label) : '') + '</span>' +
                    '<span style="margin-left:auto;display:inline-flex;gap:0.6rem;">' +
                    '<a href="formation.html?id=' + encodeURIComponent(f.id) + '" class="detail-link">Fiche →</a>' +
                    (f.url ? '<a href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener" class="detail-link">Site ↗</a>' : '') +
                    '</span></span></li>';
            });
            html += '</ul>';
        } else {
            html += '<p class="form-hint">Aucune inscription à une formation. <a href="formations.html">Inscrire à une formation →</a></p>';
        }
        html += '</div>';

        var balance = member.print_balance || 0;
        html += '<div class="detail-prints">' +
            '<div class="chart-header">' +
                '<h4>🖨️ Impressions ' +
                (balance > 0
                    ? '<span class="badge badge-sub-none">' + balance.toFixed(2).replace('.', ',') + ' € dus</span>'
                    : '<span class="badge badge-ok">✓ rien à payer</span>') +
                '</h4>' +
                '<div class="print-actions-btns">' +
                    '<button type="button" class="btn btn-secondary btn-small" data-print="bw">+ 1 N&B (0,10 €)</button>' +
                    '<button type="button" class="btn btn-secondary btn-small" data-print="color">+ 1 Couleur (0,50 €)</button>' +
                    (balance > 0 ? '<button type="button" class="btn btn-primary btn-small" data-print="pay">💰 Solder ' + balance.toFixed(2).replace('.', ',') + ' €</button>' : '') +
                    (balance > 0 ? '<button type="button" class="btn btn-danger btn-small" data-print="delete" title="Supprimer le solde en cas d\'erreur">🗑️ Erreur de saisie</button>' : '') +
                '</div>' +
            '</div>';

        html += '</div>';

        detailBody.innerHTML = html;
        var detailFullBtn = document.getElementById('detailFullBtn');
        if (detailFullBtn) detailFullBtn.href = 'membre.html?id=' + encodeURIComponent(member.id);
        detailModal.hidden = false;
        });
    }

    function closeDetail() {
        detailModal.hidden = true;
        detailMember = null;
    }

    if (detailCloseBtn) detailCloseBtn.addEventListener('click', closeDetail);
    detailModal.addEventListener('click', function (e) {
        if (e.target === detailModal) closeDetail();
    });

    detailBody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-print]');
        if (!btn || !detailMember) return;
        var action = btn.getAttribute('data-print');
        var today = new Date().toISOString().slice(0, 10);
        if (action === 'bw' || action === 'color') {
            var amount = action === 'bw' ? 0.10 : 0.50;
            ADWDatabase.ajouterImpression(detailMember.id, action, amount).then(function () {
                showToast('🖨️ Impression ' + (action === 'bw' ? 'N&B' : 'couleur') + ' ajoutée (' + amount.toFixed(2).replace('.', ',') + ' €)', 'success');
                render();
                openDetail(detailMember.id);
            });
        } else if (action === 'pay') {
            ADWDatabase.solderImpressions(detailMember.id).then(function () {
                showToast('💰 Impressions soldées', 'success');
                render();
                openDetail(detailMember.id);
            });
        } else if (action === 'delete') {
            if (confirm('Supprimer le solde d\'impressions de ' + detailMember.first_name + ' ? (en cas d\'erreur de saisie)')) {
                ADWDatabase.effacerSoldeImpressions(detailMember.id).then(function () {
                    showToast('🗑️ Solde d\'impressions supprimé', 'success');
                    render();
                    openDetail(detailMember.id);
                });
            }
        }
    });

    // Renouveler depuis la modale fiche : on délègue à la modale « Renouveler un abo »
    // (v1.5.18 — flux UNIFIÉ : une seule modale de renouvellement, plus de logique en double ici)
    var detailRenewBtn = document.getElementById('detailRenewBtn');
    if (detailRenewBtn) detailRenewBtn.addEventListener('click', function () {
        if (!detailMember) return;
        var id = detailMember.id;
        closeDetail();
        openRenewAbo(id);
    });

    var detailEditBtn = document.getElementById('detailEditBtn');
    if (detailEditBtn) detailEditBtn.addEventListener('click', function () {
        if (!detailMember) return;
        openModal(detailMember); // AVANT closeDetail — sinon detailMember est remis à null → « Ajouter un membre »
        closeDetail();
    });

    detailCheckinBtn.addEventListener('click', function () {
        if (!detailMember) return;
        ADWDatabase.pointerVisite(detailMember.id).then(function (visite) {
            showToast(visite.amount ? 'Visite enregistrée (' + visite.amount + ' €)' : 'Visite enregistrée (incluse abonnement)', 'success');
            render();
            openDetail(detailMember.id);
        }).catch(function (err) {
            if (err.status === 409) {
                showToast('⚠️ Visite déjà pointée aujourd\'hui pour ce membre', 'error');
            } else {
                showToast('Erreur : ' + err.message, 'error');
            }
        });
    });

    /* ---------- Renouveler un abo (bouton du héro) ---------- */
    // Même modèle que le dashboard (recherche membre), mais au clic on ouvre la fiche
    // EN PLACE via openDetail — on est DÉJÀ sur membres.html, aucune navigation vers #member=.
    var renewModal = document.getElementById('renewModal');
    var renewTitle = document.getElementById('renewTitle');
    var renewHint = document.getElementById('renewHint');
    var quickCheckinBtn = document.getElementById('quickCheckinBtn');
    var quickRenewBtn = document.getElementById('quickRenewBtn');
    var renewCloseBtn = document.getElementById('renewCloseBtn');
    var renewSearch = document.getElementById('renewSearch');
    var renewResults = document.getElementById('renewResults');
    var renewActive = -1;
    var pickMode = 'renew'; // 'renew' | 'checkin' — la modale du héro sert les deux boutons

    function searchMembersRenew(q, apres) {
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

    function openPick(mode) {
        pickMode = mode === 'checkin' ? 'checkin' : 'renew';
        if (!renewModal) return;
        renewModal.hidden = false;
        if (renewTitle) renewTitle.textContent = pickMode === 'checkin' ? '✅ Pointer une visite' : '♻️ Renouveler un abo';
        if (renewHint) renewHint.textContent = pickMode === 'checkin'
            ? 'Sélectionnez le membre : sa fiche s\'ouvre ici et la visite du jour est pointée.'
            : 'Sélectionnez le membre : la modale « Renouveler un abo » s\'ouvre ici.';
        if (renewSearch) {
            renewSearch.value = '';
            renewSearch.focus();
        }
        searchMembersRenew('', afficherResultatsRenew);
    }

    function openRenew() { openPick('renew'); }

    function closeRenew() {
        if (renewModal) renewModal.hidden = true;
    }

    function setRenewActive(idx) {
        var els = renewResults ? renewResults.querySelectorAll('li.checkin-item') : [];
        if (!els.length) return;
        renewActive = Math.max(0, Math.min(idx, els.length - 1));
        els.forEach(function (el, i) { el.classList.toggle('bk-active', i === renewActive); });
        // Garde : jsdom (tests) n'implémente pas scrollIntoView
        if (els[renewActive] && typeof els[renewActive].scrollIntoView === 'function') {
            els[renewActive].scrollIntoView({ block: 'nearest' });
        }
    }

    function afficherResultatsRenew(members) {
        if (!renewResults) return;
        renewResults.innerHTML = '';
        renewActive = -1;
        if (!members.length) {
            renewResults.innerHTML = '<li class="form-hint" style="list-style:none;padding:0.6rem 0;">Aucun membre trouvé.</li>';
            return;
        }
        members.forEach(function (m) {
            var li = document.createElement('li');
            li.className = 'checkin-item' + (((m.subscription || 'none') === 'none') ? ' inactive' : (isExpired(m) ? ' expired' : ''));
            li.setAttribute('data-member-id', m.id);
            var fin = m.end_date
                ? '<span class="badge ' + (isExpired(m) ? 'badge-sub-none' : 'badge-ok') + '">fin : ' + escapeHtml(formatDate(m.end_date)) + '</span>'
                : '';
            li.innerHTML =
                '<span class="member-avatar small" aria-hidden="true">' + escapeHtml(initials(m)) + '</span>' +
                '<span class="rv-name">#' + escapeHtml(m.member_no) + ' ' + escapeHtml(m.first_name) + ' ' + escapeHtml(m.last_name) + '</span>' +
                subBadge(m) + fin;
            li.addEventListener('click', function () {
                closeRenew();
                if (pickMode === 'renew') {
                    openRenewAbo(m.id); // nouvelle modale « Renouveler un abo » ouverte EN PLACE
                    return;
                }
                // Mode checkin : fiche ouverte en place, puis pointage via son bouton (même handler, 409 géré)
                var promesse = openDetail(m.id);
                if (promesse && typeof promesse.then === 'function') {
                    promesse.then(function () {
                        if (detailCheckinBtn) detailCheckinBtn.click();
                    });
                }
            });
            renewResults.appendChild(li);
        });
        setRenewActive(0);
    }

    if (quickRenewBtn) quickRenewBtn.addEventListener('click', openRenew);
    if (quickCheckinBtn) quickCheckinBtn.addEventListener('click', function () { openPick('checkin'); });
    if (renewCloseBtn) renewCloseBtn.addEventListener('click', closeRenew);
    if (renewModal) renewModal.addEventListener('click', function (e) {
        if (e.target === renewModal) closeRenew();
    });
    if (renewSearch) {
        renewSearch.addEventListener('input', function () {
            searchMembersRenew(renewSearch.value, afficherResultatsRenew);
        });
        renewSearch.addEventListener('keydown', function (e) {
            var els = renewResults ? renewResults.querySelectorAll('li.checkin-item') : [];
            if (!els.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setRenewActive(renewActive < 0 ? 0 : Math.min(renewActive + 1, els.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setRenewActive(renewActive <= 0 ? 0 : renewActive - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); if (renewActive >= 0 && els[renewActive]) els[renewActive].click(); }
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && renewModal && !renewModal.hidden) closeRenew();
    });

    /* ---------- Modale « Renouveler un abo » ---------- */
    // Assemblage demandé : partie « Abonnement » de la modale « Modifier le membre » (radios + dates)
    // + bouton « Renouveler l'abo » de la fiche (double confirmation avec aperçu des nouvelles dates).
    var renewAboModal = document.getElementById('renewAboModal');
    var renewAboWho = document.getElementById('renewAboWho');
    var renewAboStart = document.getElementById('renewAboStart');
    var renewAboEnd = document.getElementById('renewAboEnd');
    var renewAboBtn = document.getElementById('renewAboBtn');
    var renewAboCloseBtn = document.getElementById('renewAboCloseBtn');
    var renewAboMember = null;
    var renewAboArmed = null;
    var RENEW_ABO_ARMED_MS = 6000;

    function renewAboRadio() {
        var r = renewAboModal ? renewAboModal.querySelector('input[name="renewSubscription"]:checked') : null;
        return r ? r.value : 'none';
    }

    function resetRenewAboBtn() {
        if (!renewAboBtn) return;
        renewAboBtn.textContent = '♻️ Renouveler l\'abo';
        renewAboBtn.classList.remove('btn-danger');
    }

    function openRenewAbo(id) {
        return ADWDatabase.getMembre(id).then(function (m) {
            if (!m || !renewAboModal) return;
            renewAboMember = m;
            renewAboArmed = null;
            resetRenewAboBtn();
            if (renewAboWho) renewAboWho.textContent = '👤 ' + m.first_name + ' ' + m.last_name + ' (n° ' + (m.member_no || '—') + ')';
            // Pré-remplissage = partie « Abonnement » de la modale « Modifier le membre »
            var sub = m.subscription || 'none';
            var radio = renewAboModal.querySelector('input[name="renewSubscription"][value="' + sub + '"]');
            if (radio) radio.checked = true;
            if (renewAboStart) renewAboStart.value = m.start_date || '';
            if (renewAboEnd) renewAboEnd.value = m.end_date || '';
            renewAboModal.hidden = false;
        });
    }

    function closeRenewAbo() {
        if (renewAboModal) renewAboModal.hidden = true;
        renewAboMember = null;
        renewAboArmed = null;
    }

    // Même règle que la modale d'édition (aboEndDate, décision 1b : +1 mois/1 an EXACT) :
    // la fin est TOUJOURS recalculée au changement de formule ou de date de début.
    // (bug v1.5.17 : le calcul ne se faisait que si la fin était vide — or elle est pré-remplie)
    function applyRenewAboDates() {
        if (!renewAboEnd) return;
        // Même règle que la modale d'édition (aboEndDate) — « aucun » vide la fin ici
        renewAboEnd.value = aboEndDate(renewAboRadio(), renewAboStart ? renewAboStart.value : '');
    }
    if (renewAboModal) {
        renewAboModal.querySelectorAll('input[name="renewSubscription"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (radio.checked) applyRenewAboDates();
            });
        });
    }
    if (renewAboStart) renewAboStart.addEventListener('change', applyRenewAboDates);

    if (renewAboBtn) renewAboBtn.addEventListener('click', function () {
        if (!renewAboMember) return;
        var m = renewAboMember;
        if (renewAboArmed) {
            // 2e clic = confirmation : applique la formule choisie + les dates affichées (modifiables)
            clearTimeout(renewAboArmed.timer);
            var r = renewAboArmed;
            renewAboArmed = null;
            resetRenewAboBtn();
            var sub = renewAboRadio();
            var saveFormule = (sub !== (m.subscription || 'none'))
                ? ADWDatabase.modifierMembre(m.id, { subscription: sub })
                : Promise.resolve();
            saveFormule.then(function () {
                return ADWDatabase.renewSubscription(m.id, renewAboStart.value || r.newStart, renewAboEnd.value || r.newEnd);
            }).then(function (res) {
                if (!res) return;
                if (window.ADWNotifications) window.ADWNotifications.push('renew', '♻️ Abonnement renouvelé : du ' + res.newStart + ' au ' + res.newEnd + ' (membre ' + m.member_no + ')', 'success', { member_id: m.id });
                showToast('♻️ Renouvelé — inscription du ' + res.newStart + ' au ' + res.newEnd);
                closeRenewAbo();
                render();
            }).catch(function (e) { showToast('Renouvellement impossible : ' + (e && e.message ? e.message : e), 'error'); });
            return;
        }
        // 1er clic : aperçu (rien n'est écrit) + pré-remplissage des dates du nouveau cycle
        ADWDatabase.previewRenewal(m.id).then(function (r) {
            if (!r) return;
            renewAboArmed = r;
            if (renewAboStart) renewAboStart.value = r.newStart;
            if (renewAboEnd) renewAboEnd.value = r.newEnd;
            renewAboBtn.textContent = '✅ Confirmer : du ' + fmtDMY(r.newStart) + ' au ' + fmtDMY(r.newEnd) + ' ?';
            renewAboBtn.classList.add('btn-danger');
            renewAboArmed.timer = setTimeout(function () {
                renewAboArmed = null;
                resetRenewAboBtn();
            }, RENEW_ABO_ARMED_MS);
        }).catch(function (e) { showToast('Renouvellement impossible : ' + (e && e.message ? e.message : e), 'error'); });
    });
    if (renewAboCloseBtn) renewAboCloseBtn.addEventListener('click', closeRenewAbo);
    if (renewAboModal) renewAboModal.addEventListener('click', function (e) {
        if (e.target === renewAboModal) closeRenewAbo();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && renewAboModal && !renewAboModal.hidden) closeRenewAbo();
    });

    /* ---------- Toast ---------- */

    function showToast(message, type) {
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + (type || 'success');
        toast.setAttribute('role', 'status');
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(function () { toast.classList.add('visible'); });
        setTimeout(function () {
            toast.classList.remove('visible');
            setTimeout(function () { toast.remove(); }, 300);
        }, 2500);
    }

    /* ---------- Formulaire ---------- */

    function openModal(member) {
        form.reset();
        formError.hidden = true;
        document.getElementById('memberId').value = member ? member.id : '';
        document.getElementById('firstName').value = member ? member.first_name : '';
        document.getElementById('lastName').value = member ? member.last_name : '';
        document.getElementById('age').value = member ? (member.age || '') : '';
        document.getElementById('phone').value = member ? (member.phone || '') : '';
        document.getElementById('email').value = member ? (member.email || '') : '';
        document.getElementById('address').value = member ? (member.address || '') : '';
        var sub = member ? (member.subscription || 'none') : 'none';
        var radio = form.querySelector('input[name="subscription"][value="' + sub + '"]');
        if (radio) radio.checked = true;
        document.getElementById('postalCode').value = member && member.postal_code ? member.postal_code : '';
        document.getElementById('gender').value = member && member.gender ? member.gender : '';
        document.getElementById('socialStatus').value = member && member.social_status ? member.social_status : '';
        document.getElementById('startDate').value = member ? (member.start_date || '') : new Date().toISOString().slice(0, 10);
        document.getElementById('endDate').value = member ? (member.end_date || '') : '';
        // « Aucun abo » : date de fin neutre (vide) — pas d'inscription dans le temps
        var noneRadio = form.querySelector('input[name="subscription"][value="none"]');
        if (noneRadio && noneRadio.checked) document.getElementById('endDate').value = '';
        modalTitle.textContent = member ? 'Modifier le membre' : 'Ajouter un membre';
        // Live : le changement de formule d'abonnement ajuste la date de fin
        // — « aucun » la vide (neutre), mensuel/annuel la propose à 1 mois/1 an si vide
        Array.prototype.forEach.call(form.querySelectorAll('input[name="subscription"]'), function (radio) {
            radio.addEventListener('change', function () {
                var endDateInput = document.getElementById('endDate');
                if (radio.value === 'none' && radio.checked) {
                    endDateInput.value = '';
                } else if (radio.checked && !endDateInput.value) {
                    var months = radio.value === 'yearly' ? 12 : 1;
                    var d = new Date();
                    d.setMonth(d.getMonth() + months);
                    endDateInput.value = d.toISOString().slice(0, 10);
                }
            });
        });
        modal.hidden = false;
        document.getElementById('firstName').focus();
    }

    function closeModal() {
        modal.hidden = true;
    }

    function validateDates() {
        var start = startDateInput.value;
        var end = endDateInput.value;
        if (start && end && end < start) {
            formError.textContent = '⚠️ La date de fin doit être postérieure à la date de début.';
            formError.hidden = false;
            return false;
        }
        formError.hidden = true;
        return true;
    }

    startDateInput.addEventListener('change', function () {
        applySubscriptionDates();
        validateDates();
    });

    endDateInput.addEventListener('change', validateDates);

    // Règle UNIQUE de calcul de la date de fin d'abo (v1.5.18 — unifiée, décision porteur 1b) :
    // aucun → fin vide ; mensuel → début + 1 mois EXACT ; annuel → début + 1 an EXACT
    // (même règle que le serveur de renouvellement : ajouterMois, sans -1 jour).
    // Utilisée par « Modifier le membre » (applySubscriptionDates) ET « Renouveler un abo » (applyRenewAboDates).
    function aboEndDate(sub, startStr) {
        if (!sub || sub === 'none') return '';
        var base = startStr ? new Date(startStr) : new Date();
        var d = new Date(base);
        if (sub === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
        return d.toISOString().slice(0, 10);
    }

    function applySubscriptionDates() {
        var checked = form.querySelector('input[name="subscription"]:checked');
        var sub = checked ? checked.value : 'none';
        var end = aboEndDate(sub, startDateInput.value);
        if (!end) return; // « aucun » : la modale d'édition laisse la fin telle quelle (comportement d'origine)
        endDateInput.value = end;
    }

    form.querySelectorAll('input[name="subscription"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            if (document.getElementById('memberId').value) {
                applySubscriptionDates();
            } else if (radio.checked && radio.value !== 'none' && startDateInput.value) {
                applySubscriptionDates();
            }
        });
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateDates()) return;
        var id = document.getElementById('memberId').value;
        var subRadio = form.querySelector('input[name="subscription"]:checked');
        var data = {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            age: document.getElementById('age').value,
            phone: document.getElementById('phone').value.trim(),
            email: document.getElementById('email').value.trim(),
            address: document.getElementById('address').value.trim(),
            startDate: startDateInput.value,
            endDate: endDateInput.value,
            subscription: subRadio ? subRadio.value : 'none',
            postalCode: normalizePostalCode(document.getElementById('postalCode').value),
            gender: document.getElementById('gender').value,
            socialStatus: document.getElementById('socialStatus').value
        };

        var champ = function (v) { return v === '' ? null : v; };
        var promise;
        if (id) {
            promise = ADWDatabase.modifierMembre(id, {
                first_name: data.firstName, last_name: data.lastName,
                age: data.age ? Number(data.age) : null,
                phone: champ(data.phone), email: champ(data.email), address: champ(data.address),
                start_date: champ(data.startDate), end_date: champ(data.endDate),
                subscription: data.subscription,
                postal_code: champ(data.postalCode), gender: champ(data.gender), social_status: champ(data.socialStatus)
            });
        } else {
            promise = ADWDatabase.creerMembre({
                firstName: data.firstName, lastName: data.lastName,
                age: data.age ? Number(data.age) : null,
                phone: data.phone, email: data.email, address: data.address,
                startDate: data.startDate, endDate: data.endDate,
                subscription: data.subscription,
                postalCode: data.postalCode, gender: data.gender, socialStatus: data.socialStatus
            }).catch(function (err) {
                if (err.status === 409) {
                    formError.textContent = '⚠️ ' + err.message;
                    formError.hidden = false;
                    return null;
                }
                throw err;
            });
        }
        if (!promise) return;
        promise.then(function () {
            closeModal();
            render();
            showToast(id ? 'Membre modifié' : 'Membre ajouté', 'success');
        });
    });

    /* ---------- Vue / filtres / tri ---------- */

    function setView(view) {
        currentView = view;
        syncViewButtons();
        savePrefs();
        render();
    }

    function exportCSV() {
        var members = getMembers();
        if (!members.length) return;
        var headers = ['N°', 'Prénom', 'Nom', 'Âge', 'Genre', 'Code postal', 'Statut social', 'Téléphone', 'Email', 'Adresse', 'Abonnement', 'Visites', 'Début inscription', 'Fin inscription'];
        var csvRows = [headers.join(';')];
        members.forEach(function (m) {
            csvRows.push([
                m.member_no || '', m.first_name, m.last_name, m.age || '',
                GENDER_LABELS[m.gender] || '', m.postal_code || '', STATUS_LABELS[m.social_status] || '',
                m.phone || '',
                m.email || '', m.address || '',
                (SUB_LABELS[m.subscription] || SUB_LABELS.none).label,
                m.visit_count, m.start_date || '', m.end_date || ''
            ].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';'));
        });
        var blob = new Blob(['\ufeff' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'membres-atelierduweb.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    addBtn.addEventListener('click', function () { openModal(null); });
    var emptyAddBtn = document.getElementById('emptyAddBtn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', function () { openModal(null); });
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (!modal.hidden) closeModal();
            if (!detailModal.hidden) closeDetail();
        }
    });
    searchInput.addEventListener('input', function () { savePrefs(); render(); });
    sortSelect.addEventListener('change', function () { savePrefs(); render(); });
    viewGridBtn.addEventListener('click', function () { setView('grid'); });
    viewListBtn.addEventListener('click', function () { setView('list'); });
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);

    // Barre de filtres repliable en mobile
    var filtersToggle = document.getElementById('filtersToggle');
    var filtersMore = document.getElementById('filtersMore');
    if (filtersToggle && filtersMore) {
        var MOBILE = window.matchMedia('(max-width: 860px)');
        var syncFiltersToggle = function () {
            filtersToggle.hidden = !MOBILE.matches;
            if (!MOBILE.matches) filtersMore.hidden = false;
        };
        filtersToggle.addEventListener('click', function () {
            var open = filtersToggle.getAttribute('aria-expanded') === 'true';
            filtersToggle.setAttribute('aria-expanded', String(!open));
            filtersToggle.textContent = open ? '\uD83D\uDD3D Filtres & tri' : '\uD83D\uDD3C Filtres & tri';
            filtersMore.hidden = open;
        });
        if (MOBILE.addEventListener) {
            MOBILE.addEventListener('change', syncFiltersToggle);
        } else if (MOBILE.addListener) {
            MOBILE.addListener(syncFiltersToggle);
        }
        syncFiltersToggle();
    }

    document.querySelectorAll('.filters-bar [data-filter]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            currentFilter = btn.getAttribute('data-filter');
            syncFilterButtons();
            savePrefs();
            render();
        });
    });

    loadPrefs();

    try {
        var urlFilter = new URLSearchParams(window.location.search).get('prints');
        if (urlFilter === 'due') {
            currentFilter = 'prints-due';
            syncFilterButtons();
            savePrefs();
        }
    } catch (e) { /* best effort */ }

    /* ---------- Import XML (Access) ---------- */

    var importModal = document.getElementById('importModal');
    var importBtn = document.getElementById('importBtn');
    var importCloseBtn = document.getElementById('importCloseBtn');
    var importCancelBtn = document.getElementById('importCancelBtn');
    var importConfirmBtn = document.getElementById('importConfirmBtn');
    var importFile = document.getElementById('importFile');
    var importPreview = document.getElementById('importPreview');
    var pendingImport = null;

    function closeImport() {
        if (importModal) importModal.hidden = true;
        if (importPreview) importPreview.hidden = true;
        if (importFile) importFile.value = '';
        pendingImport = null;
    }

    function openImport() {
        if (!importModal) return;
        ADWAuth.ensureUnlocked('Importer des membres (XML) — action réservée à l\u2019équipe.').then(function (ok) {
            if (!ok) return;
            doOpenImport();
        });
    }

    function doOpenImport() {
        importModal.hidden = false;
        if (importPreview) importPreview.hidden = true;
        if (importFile) importFile.value = '';
        pendingImport = null;
    }

    function handleImportFile(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            ADWDatabase.importerXml(reader.result, true).then(function (apercu) {
                pendingImport = reader.result;
                var w = apercu.avertissements || {};
                var warnTxt = [];
                if (w.non_mappe_statut) warnTxt.push(w.non_mappe_statut + ' statut(s) non mappé(s) laissé(s) vide(s)');
                if (w.email_illisible) warnTxt.push(w.email_illisible + ' email(s) illisible(s) ignoré(s)');
                if (w.date_fin_invalide) warnTxt.push(w.date_fin_invalide + ' date(s) de fin invalide(s)');
                var el = document.getElementById('impCount');
                if (el) el.textContent = apercu.analyses + ' membres';
                var we = document.getElementById('impWarn');
                if (we) we.textContent = warnTxt.length ? warnTxt.join(' · ') : 'Aucun problème détecté.';
                if (importPreview) importPreview.hidden = false;
            }).catch(function (e) {
                alert('Erreur de lecture du XML : ' + (e && e.message ? e.message : e));
            });
        };
        reader.readAsText(file);
    }

    function confirmImport() {
        if (!pendingImport) return;
        ADWDatabase.importerXml(pendingImport, false).then(function (result) {
            closeImport();
            render();
            showToast('📥 ' + result.importes + ' membres importés' +
                (result.doublons ? ' (' + result.doublons + ' doublons ignorés)' : ''), 'success');
        }).catch(function (e) {
            alert('Import impossible : ' + (e && e.message ? e.message : e));
        });
    }
    if (importBtn) importBtn.addEventListener('click', openImport);
    if (importCloseBtn) importCloseBtn.addEventListener('click', closeImport);
    if (importCancelBtn) importCancelBtn.addEventListener('click', closeImport);
    if (importConfirmBtn) importConfirmBtn.addEventListener('click', confirmImport);
    if (importFile) importFile.addEventListener('change', function () {
        handleImportFile(importFile.files && importFile.files[0]);
    });
    if (importModal) importModal.addEventListener('click', function (e) {
        if (e.target === importModal) closeImport();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && importModal && !importModal.hidden) closeImport();
    });

    ADWDatabase.init().then(function () {
        loading.hidden = true;
        render();
        // Lien direct vers une fiche : membres.html#member=<id>
        var m = location.hash.match(/^#member=(.+)$/);
        if (m) {
            openDetail(decodeURIComponent(m[1]));
            // Nettoie le hash pour ne pas rouvrir la fiche au rechargement
            history.replaceState(null, '', location.pathname + location.search);
        }
        // Lien direct vers l'édition : membres.html#edit=<id> — ouvre le formulaire pré-rempli
        var me = location.hash.match(/^#edit=(.+)$/);
        if (me) {
            var mid = decodeURIComponent(me[1]);
            ADWDatabase.getMembre(mid).then(function (m) { if (m) openModal(m); });
            history.replaceState(null, '', location.pathname + location.search);
        }
        // Lien direct vers le formulaire vierge : membres.html#add — ouvre « Ajouter un membre »
        if (location.hash === '#add') {
            openModal(null);
            history.replaceState(null, '', location.pathname + location.search);
        }
        // Lien direct vers la modale « Renouveler un abo » : membres.html#renew=<id>
        var mr = location.hash.match(/^#renew=(.+)$/);
        if (mr) {
            openRenewAbo(decodeURIComponent(mr[1]));
            history.replaceState(null, '', location.pathname + location.search);
        }
    }).catch(function (err) {
        loading.hidden = true;
        emptyState.hidden = false;
        emptyState.querySelector('p').textContent = 'Erreur de chargement de la base de données : ' + err.message;
    });
})();
