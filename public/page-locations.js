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
            var selA = document.getElementById('locAnimateurOcc');
            selA.innerHTML = '<option value="">— Sans animateur (salle seule) —</option>';
            organisateurs.forEach(function (org) {
                var o = document.createElement('option');
                o.value = org.nom;
                o.textContent = org.nom;
                selA.appendChild(o);
            });
            // valeurs par défaut + occurrences à vide
            document.getElementById('locDate').value = todayStr;
            seances = [];
            rendChips();
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

    // ---- Occurrences (v1.5.3) : l'équipe ajoute date + créneau un par un —
    // ça couvre les répétitions hebdo multiples ET les dates irrégulières. ----
    var seances = []; // [{ date: 'AAAA-MM-JJ', salle: 'room-id', creneau: 'AM'|'PM'|'JOURNEE' }]
    var creneauLabel = { AM: 'Matin', PM: 'Après-midi', JOURNEE: 'Journée' };

    var selSalle = document.getElementById('locSalle');

    function rendChips() {
        var ul = document.getElementById('locChips');
        ul.innerHTML = '';
        seances.sort(function (a, b) { return a.date === b.date ? String(a.creneau).localeCompare(String(b.creneau)) : a.date.localeCompare(b.date); });
        seances.forEach(function (occ, i) {
            var li = document.createElement('li');
            var salleNom = occ.salle;
            var optS = selSalle && selSalle.querySelector('option[value="' + esc(occ.salle) + '"]');
            if (optS) salleNom = optS.textContent;
            li.className = 'loc-chip';
            li.innerHTML = '<strong>' + fmtCourt(occ.date) + '</strong> ' + esc(salleNom) + ' · ' + creneauLabel[occ.creneau] +
                (occ.animateur ? ' <em style="font-style:normal;opacity:0.75;">' + esc(occ.animateur) + '</em>' : '') +
                ' <button type="button" class="loc-chip-x" title="Retirer cette occurrence" aria-label="Retirer l’occurrence du ' + esc(occ.date) + '">✕</button>';
            li.querySelector('.loc-chip-x').addEventListener('click', function () {
                seances.splice(i, 1);
                rendChips();
            });
            ul.appendChild(li);
        });
        document.getElementById('locOccCount').textContent = seances.length;
    }

    document.getElementById('locAddDate').addEventListener('click', function () {
        var err = document.getElementById('locOccErreur');
        err.style.display = 'none';
        var d = document.getElementById('locDate').value;
        var c = document.getElementById('locCreneau').value;
        var r = selSalle.value;
        if (!r) { err.textContent = 'Choisis une salle avant d\u2019ajouter une occurrence.'; err.style.display = ''; selSalle.focus(); return; }
        if (!d) {
            err.textContent = 'Choisis une date avant d\u2019ajouter une occurrence.';
            err.style.display = '';
            document.getElementById('locDate').focus();
            return;
        }
        var doublon = seances.some(function (o) { return o.date === d && o.creneau === c && o.salle === r; });
        if (doublon) {
            err.textContent = 'Cette occurrence existe déjà (même date, même créneau).';
            err.style.display = '';
            return;
        }
        var selAnim = document.getElementById('locAnimateurOcc');
        var anim = selAnim && selAnim.value ? selAnim.value : null;
        seances.push({ date: d, salle: r, creneau: c, animateur: anim });
        rendChips();
        // avancer d'un jour pour enchaîner les occurrences proches
        var plus = new Date(d + 'T12:00:00');
        plus.setDate(plus.getDate() + 1);
        document.getElementById('locDate').value = plus.toISOString().slice(0, 10);
        document.getElementById('locDate').focus();
    });

    // Générer les dates depuis les occurrences (créneaux AM/PM, jamais de créneau flottant)
    function datesDuFormulaire() {
        if (!seances.length) return { erreur: 'Ajoute au moins une occurrence (date + créneau) avec le bouton « + Ajouter ».' };
        var dates = [];
        seances.forEach(function (occ) {
            var slots = occ.creneau === 'JOURNEE' ? ['AM', 'PM'] : [occ.creneau];
            slots.forEach(function (s) { dates.push({ date: occ.date, slot: s, room_id: occ.salle, animateur: occ.animateur || null }); });
        });
        return { dates: dates };
    }

    document.getElementById('locSave').addEventListener('click', function () {
        var titre = document.getElementById('locTitre').value.trim();
        if (!titre) { document.getElementById('locTitre').focus(); return; }
        var gen = datesDuFormulaire();
        if (gen.erreur) { alert(gen.erreur); return; }
        window.ADWDatabase.createLocation({
            titre: titre,
            room_id: seances.length ? seances[0].salle : document.getElementById('locSalle').value,
            animateur: seances.length ? (seances[0].animateur || null) : null,
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
