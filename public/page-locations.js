// Gimaweb — page locations.html : liste des locations de salles (+ modale de création).
// Les locations sont internes (jamais sur le site public) et partagent les créneaux
// AM/PM avec les formations ; elles apparaissent dans le planning des salles.
(function () {
    'use strict';

    function esc(v) { return window.ADWEscape ? window.ADWEscape.html(String(v == null ? '' : v)) : String(v); }

    var grid = document.getElementById('locationsGrid');
    var emptyState = document.getElementById('emptyState');
    var statusBox = document.getElementById('statusBox');
    var todayStr = new Date().toISOString().slice(0, 10);
    var toutes = [];      // locations brutes
    var visibles = [];
    var period = 'upcoming';

    function status(msg) {
        statusBox.hidden = !msg;
        if (msg) statusBox.querySelector('p').textContent = msg;
    }

    // ---- Filtre "à venir / toutes" (comme formations.html) ----
    document.querySelectorAll('[data-period]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('[data-period]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            period = btn.getAttribute('data-period');
            applyFilter();
        });
    });
    function applyFilter() {
        visibles = toutes.filter(function (l) {
            if (period === 'upcoming') return l.a_venir === 1 || l.a_venir === true;
            return true;
        }).sort(function (a, b) { return String(a.premiere_date || '').localeCompare(String(b.premiere_date || '')); });
        render();
    }

    function fmt(d) {
        if (!d) return '';
        return new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    function fmtCourt(d) {
        if (!d) return '';
        return new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
    }

    function render() {
        grid.innerHTML = '';
        emptyState.hidden = visibles.length > 0;
        visibles.forEach(function (l) {
            var card = document.createElement('article');
            card.className = 'f-card f-card-link loc-card';
            card.setAttribute('data-goto-lid', esc(l.id));
            var passe = !(l.a_venir === 1 || l.a_venir === true);
            if (passe) card.classList.add('f-card-canceled');
            var replay = '';
            if (l.nb_seances > 1) replay = '<span class="badge badge-sub-yearly">\uD83D\uDD01 ' + l.nb_seances + ' séances</span>';
            card.innerHTML =
                '<div class="f-card-banner loc-banner">' +
                    '<div class="f-card-dateinfo">' +
                        '<div class="f-card-weekday">' + fmt(l.premiere_date) + (l.derniere_date && l.derniere_date !== l.premiere_date ? ' → ' + fmtCourt(l.derniere_date) : '') + '</div>' +
                        '<div class="f-card-time">🔑 ' + esc(l.room_name || 'Sans salle') + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="f-card-body">' +
                    '<h3 class="f-card-title">' + esc(l.titre) + ' ' + replay + '</h3>' +
                    '<div class="f-card-meta"><span>\uD83E\uDDD1\u200D\uD83C\uDFEB ' + (l.animateur ? esc(l.animateur) : 'Sans animateur — salle seule') + '</span></div>' +
                    (l.contact ? '<p class="f-card-desc">\uD83D\uDCDE ' + esc(l.contact) + '</p>' : '') +
                    '<div class="f-card-foot">' +
                        (passe ? '<span class="badge badge-sub-none">Passée</span>' : '<span class="badge badge-ok">À venir</span>') +
                    '</div>' +
                '</div>';
            card.addEventListener('click', function () {
                location.href = 'location.html?id=' + encodeURIComponent(l.id);
            });
            grid.appendChild(card);
        });
    }

    // ---- Modale de création ----
    var modal = document.getElementById('locationModal');
    var openBtn = document.getElementById('newLocationBtn');

    function ouvrirModale() {
        Promise.all([
            window.ADWDatabase.listRooms().catch(function () { return []; }),
            window.ADWDatabase.listOrganisateurs().catch(function () { return []; })
        ]).then(function (sources) {
            var salles = sources[0] || [];
            var organisateurs = sources[1] || [];
            var selSalle = document.getElementById('locSalle');
            selSalle.innerHTML = '';
            salles.forEach(function (r) {
                var o = document.createElement('option');
                o.value = r.id;
                o.textContent = r.name;
                selSalle.appendChild(o);
            });
            var selA = document.getElementById('locAnimateur');
            selA.innerHTML = '<option value="">— Sans animateur (salle seule) —</option>';
            organisateurs.forEach(function (org) {
                var o = document.createElement('option');
                o.value = org.nom;
                o.textContent = org.nom;
                selA.appendChild(o);
            });
            // valeurs par défaut
            document.getElementById('locDate').value = todayStr;
            document.getElementById('locDu').value = todayStr;
            modal.hidden = false;
            document.getElementById('locTitre').focus();
        });
    }

    if (openBtn) openBtn.addEventListener('click', function () {
        window.ADWAuth.ensureUnlocked('Créer une location — action réservée à l\u2019équipe.').then(function (ok) {
            if (ok) ouvrirModale();
        });
    });
    document.getElementById('locCancel').addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

    // Basculer unique / récurrente
    document.getElementById('locMode').addEventListener('change', function () {
        var rec = this.value === 'recurrent';
        document.getElementById('locUniqueWrap').style.display = rec ? 'none' : '';
        document.getElementById('locRecurWrap').style.display = rec ? '' : 'none';
    });

    // Générer les dates depuis le formulaire (créneaux AM/PM, jamais de créneau flottant)
    function datesDuFormulaire() {
        var creneau = document.getElementById('locCreneau').value;
        var slots = creneau === 'JOURNEE' ? ['AM', 'PM'] : [creneau];
        var dates = [];
        if (document.getElementById('locMode').value === 'unique') {
            var d = document.getElementById('locDate').value;
            if (!d) return { erreur: 'Choisis une date.' };
            slots.forEach(function (s) { dates.push({ date: d, slot: s }); });
        } else {
            var jour = Number(document.getElementById('locJour').value);
            var du = document.getElementById('locDu').value;
            var au = document.getElementById('locAu').value;
            if (!du || !au || au < du) return { erreur: 'Plage de répétition invalide (du → au).' };
            var cur = new Date(du + 'T12:00:00');
            var fin = new Date(au + 'T12:00:00');
            var garde = 0;
            while (cur <= fin && garde < 200) {
                if (cur.getDay() === jour) {
                    var iso = cur.toISOString().slice(0, 10);
                    slots.forEach(function (s) { dates.push({ date: iso, slot: s }); });
                }
                cur.setDate(cur.getDate() + 1);
                garde += 1;
            }
            if (!dates.length) return { erreur: 'Aucun ' + ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][jour] + ' dans cette plage.' };
        }
        return { dates: dates };
    }

    document.getElementById('locSave').addEventListener('click', function () {
        var titre = document.getElementById('locTitre').value.trim();
        if (!titre) { document.getElementById('locTitre').focus(); return; }
        var gen = datesDuFormulaire();
        if (gen.erreur) { alert(gen.erreur); return; }
        window.ADWDatabase.createLocation({
            titre: titre,
            room_id: document.getElementById('locSalle').value,
            animateur: document.getElementById('locAnimateur').value || null,
            contact: document.getElementById('locContact').value.trim() || null,
            notes: document.getElementById('locNotes').value.trim() || null,
            dates: gen.dates
        }).then(function () {
            modal.hidden = true;
            if (window.ADWNotifications) {
                window.ADWNotifications.push('location_creee', '🔑 Location créée : \u00AB ' + titre + ' \u00BB — visible dans le planning des salles.', 'success');
            }
            load();
        }).catch(function (err) { window.ADWAuth.ensureUnlocked('Créer une location — action réservée à l\u2019équipe.').then(function (ok) { if (ok) alert('Erreur : ' + err.message); }); });
    });

    function load() {
        status('⏳ Chargement des locations…');
        window.ADWDatabase.listLocations().then(function (rows) {
            toutes = rows || [];
            status('');
            applyFilter();
        }).catch(function (err) {
            status('');
            emptyState.hidden = false;
            emptyState.querySelector('p').textContent = 'Erreur de chargement : ' + err.message;
        });
    }

    window.ADWDatabase.init().then(load).catch(function () {
        emptyState.hidden = false;
        emptyState.querySelector('p').textContent = 'Serveur injoignable.';
    });
})();
