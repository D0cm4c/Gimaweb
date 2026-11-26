// Gimaweb — page location.html : fiche d'une location de salle (interne).
// Héritière du style des fiches formation : hero, détails, séances, conflits.
(function () {
    'use strict';

    function esc(v) { return window.ADWEscape ? window.ADWEscape.html(String(v == null ? '' : v)) : String(v); }

    var loading = document.getElementById('loading');
    var notFound = document.getElementById('notFound');
    var content = document.getElementById('locationContent');
    var courante = null;

    function fmt(d) {
        return new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    function slotLabel(s) { return s === 'AM' ? 'Matin (9h30–12h30)' : 'Après-midi (13h30–16h30)'; }

    function render(loc, ctx) {
        // ctx : { salles, organisateurs, conflits }
        var conflits = ctx.conflits || [];
        var html = '<div class="hero" style="background:#7A5230;padding:1.4rem 1.6rem;margin-bottom:1.3rem;position:relative;">' +
            '<h2 style="margin:0;">🔑 ' + esc(loc.titre) + '</h2>' +
            '<p style="opacity:0.95;margin-top:0.4rem;">🏠 ' + esc(loc.room_name || 'Sans salle') +
            ' · ' + (loc.animateur ? '\uD83E\uDDD1\u200D\uD83C\uDFEB ' + esc(loc.animateur) : 'Sans animateur — salle seule') + '</p>' +
            '<p class="form-hint" style="margin:0.4rem 0 0;opacity:0.9;">Location interne — invisible sur le site public (pas d\u2019inscriptions). ' +
            (loc.nb > 1 ? loc.nb + ' séances planifiées.' : 'Une séance.') + '</p>' +
            '</div>';

        html += '<div class="m-cards">';
        // Détails
        html += '<div class="m-card"><h3>\uD83D\uDCCB Détails</h3><dl class="detail-list">' +
            '<div><dt>Locataire</dt><dd>' + esc(loc.titre) + '</dd></div>' +
            '<div><dt>Salle</dt><dd>' + esc(loc.room_name || '—') + '</dd></div>' +
            '<div><dt>Animateur</dt><dd>' + (loc.animateur ? esc(loc.animateur) : 'Aucun (salle seule)') + '</dd></div>' +
            (loc.contact ? '<div><dt>Contact</dt><dd>' + esc(loc.contact) + '</dd></div>' : '') +
            (loc.notes ? '<div><dt>Notes</dt><dd>' + esc(loc.notes) + '</dd></div>' : '') +
            '</dl></div>';

        // Séances
        html += '<div class="m-card"><h3>\uD83D\uDCC5 Séances (' + (loc.dates ? loc.dates.length : 0) + ')</h3><ul class="detail-list" style="list-style:none;padding:0;">';
        (loc.dates || []).slice(0, 40).forEach(function (d) {
            var salleSeance = d.room_name ? ' · 🏫 ' + esc(d.room_name) : '';
            html += '<li style="padding:0.25rem 0;border-bottom:1px solid var(--bg);">📅 ' + fmt(d.date) +
                ' <span class="badge badge-sub-yearly">' + slotLabel(d.slot) + '</span>' + salleSeance + '</li>';
        });
        html += '</ul>';
        if ((loc.dates || []).length > 40) html += '<p class="form-hint">… … et ' + (loc.dates.length - 40) + ' autres.</p>';
        html += '</div>';

        // Conflits
        html += '<div class="m-card"><h3>\u26A0\uFE0F Conflits de créneaux</h3>';
        if (!conflits.length) {
            html += '<p class="badge badge-ok">✓ Aucun conflit — la salle est libre sur tous ces créneaux.</p>';
        } else {
            html += '<p class="form-hint">Créneaux déjà occupés par autre chose — à vérifier avec le planning des salles :</p><ul style="list-style:none;padding:0;">';
            conflits.slice(0, 12).forEach(function (c) {
                html += '<li style="padding:0.25rem 0;border-bottom:1px solid var(--bg);">' + fmt(c.date) +
                    ' (' + slotLabel(c.slot) + ') : \uD83D\uDD11 ' + esc(c.titre || c.type) + '</li>';
            });
            html += '</ul>';
        }
        html += '</div>';
        html += '</div>';

        // Actions
        html += '<div style="display:flex;gap:0.7rem;flex-wrap:wrap;margin-top:1.2rem;">' +
            '<button type="button" class="btn btn-secondary" id="locEditBtn">✏️ Modifier</button>' +
            '<button type="button" class="btn btn-danger" id="locDeleteBtn" style="margin-left:auto;">🗑 Supprimer</button>' +
            '</div>';

        content.innerHTML = html;
        content.hidden = false;
        loading.hidden = true;
        brancherActions(loc);
    }

    function brancherActions(loc) {
        var editBtn = document.getElementById('locEditBtn');
        if (editBtn) editBtn.addEventListener('click', function () {
            window.ADWAuth.ensureUnlocked('Modifier une location \u2014 action r\u00e9serv\u00e9e \u00e0 l\u2019\u00e9quipe.').then(function (ok) {
                if (ok) ouvrirModaleEdition(loc);
            });
        });
        var delBtn = document.getElementById('locDeleteBtn');
        if (delBtn) delBtn.addEventListener('click', function () {
            window.ADWAuth.ensureUnlocked('Supprimer une location — action réservée à l\u2019équipe.').then(function (ok) {
                if (!ok) return;
                if (confirm('Supprimer la location \u00AB ' + loc.titre + ' \u00BB ?\n\nSes séances disparaissent du planning des salles.')) {
                    window.ADWDatabase.deleteLocation(loc.id).then(function () {
                        location.href = 'locations.html';
                    }).catch(function (err) { alert('Erreur : ' + err.message); });
                }
            });
        });
    }

    // ---- v1.5.7 : modale d'\u00e9dition (titre, animateur, contact, notes + occurrences) ----
    var editSeances = [];
    var editCreneauLabel = { AM: 'Matin', PM: 'Apr\u00e8s-midi', JOURNEE: 'Journ\u00e9e' };
    var editModal = document.getElementById('locEditModal');
    var editSelSalle = document.getElementById('editLocSalleOcc');

    function rendEditChips() {
        var ul = document.getElementById('editLocChips');
        ul.innerHTML = '';
        editSeances.sort(function (a, b) { return a.date === b.date ? String(a.creneau).localeCompare(String(b.creneau)) : a.date.localeCompare(b.date); });
        editSeances.forEach(function (occ, i) {
            var li = document.createElement('li');
            li.className = 'loc-chip';
            var salleNom = occ.salle;
            var optS = editSelSalle && editSelSalle.querySelector('option[value="' + esc(occ.salle) + '"]');
            if (optS) salleNom = optS.textContent;
            li.innerHTML = '<strong>' + new Date(occ.date + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' }) + '</strong> ' + esc(salleNom) + ' \u00b7 ' + editCreneauLabel[occ.creneau] +
                ' <button type="button" class="loc-chip-x" title="Retirer cette occurrence">\u2715</button>';
            li.querySelector('.loc-chip-x').addEventListener('click', function () {
                editSeances.splice(i, 1);
                rendEditChips();
            });
            ul.appendChild(li);
        });
        document.getElementById('editLocOccCount').textContent = editSeances.length;
    }

    function ouvrirModaleEdition(loc) {
        Promise.all([
            window.ADWDatabase.listRooms().catch(function () { return []; }),
            window.ADWDatabase.listOrganisateurs().catch(function () { return []; })
        ]).then(function (sources) {
            var salles = sources[0] || [];
            var organisateurs = sources[1] || [];
            editSelSalle.innerHTML = salles.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
            var selA = document.getElementById('editLocAnimateur');
            selA.innerHTML = '<option value="">\u2014 Sans animateur (salle seule) \u2014</option>' +
                organisateurs.map(function (org) { return '<option value="' + esc(org.nom) + '">' + esc(org.nom) + '</option>'; }).join('');
            document.getElementById('editLocTitre').value = loc.titre || '';
            if (loc.animateur) {
                var deja = selA.querySelector('option[value="' + esc(loc.animateur) + '"]');
                if (!deja) { var o = document.createElement('option'); o.value = loc.animateur; o.textContent = loc.animateur; selA.appendChild(o); }
            }
            selA.value = loc.animateur || '';
            document.getElementById('editLocContact').value = loc.contact || '';
            document.getElementById('editLocNotes').value = loc.notes || '';
            document.getElementById('editLocDate').value = new Date().toISOString().slice(0, 10);
            // occurrences existantes : AM+PM m\u00eame date+m\u00eame salle \u2192 JOURNEE
            editSeances = [];
            var vus = {};
            (loc.dates || []).forEach(function (d) {
                var key = d.date + '|' + d.room_id;
                if (vus[key] === 'AM' && d.slot === 'PM') {
                    vus[key] = 'JOURNEE';
                    editSeances = editSeances.map(function (o) { return (o.date === d.date && o.salle === d.room_id) ? { date: o.date, salle: o.salle, creneau: 'JOURNEE' } : o; });
                } else {
                    vus[key] = d.slot;
                    editSeances.push({ date: d.date, salle: d.room_id, creneau: d.slot });
                }
            });
            rendEditChips();
            editModal.hidden = false;
            document.getElementById('editLocTitre').focus();
        });
    }

    document.getElementById('editLocCancel').addEventListener('click', function () { editModal.hidden = true; });
    editModal.addEventListener('click', function (e) { if (e.target === editModal) editModal.hidden = true; });

    document.getElementById('editLocAddDate').addEventListener('click', function () {
        var err = document.getElementById('editLocOccErreur');
        err.style.display = 'none';
        var d = document.getElementById('editLocDate').value;
        var c = document.getElementById('editLocCreneau').value;
        var r = editSelSalle.value;
        if (!r) { err.textContent = 'Choisis une salle avant d\u2019ajouter une occurrence.'; err.style.display = ''; return; }
        if (!d) { err.textContent = 'Choisis une date.'; err.style.display = ''; return; }
        if (editSeances.some(function (o) { return o.date === d && o.creneau === c && o.salle === r; })) {
            err.textContent = 'Cette occurrence existe d\u00e9j\u00e0 (m\u00eame date, m\u00eame cr\u00e9neau, m\u00eame salle).';
            err.style.display = '';
            return;
        }
        editSeances.push({ date: d, salle: r, creneau: c });
        rendEditChips();
        var plus = new Date(d + 'T12:00:00');
        plus.setDate(plus.getDate() + 1);
        document.getElementById('editLocDate').value = plus.toISOString().slice(0, 10);
    });

    document.getElementById('editLocSave').addEventListener('click', function () {
        var titre = document.getElementById('editLocTitre').value.trim();
        if (!titre) { document.getElementById('editLocTitre').focus(); return; }
        if (!editSeances.length) { alert('Ajoute au moins une occurrence, ou supprime la location.'); return; }
        var dates = [];
        editSeances.forEach(function (occ) {
            var slots = occ.creneau === 'JOURNEE' ? ['AM', 'PM'] : [occ.creneau];
            slots.forEach(function (s) { dates.push({ date: occ.date, slot: s, room_id: occ.salle }); });
        });
        window.ADWDatabase.updateLocation(courante.id, {
            titre: titre,
            room_id: editSeances[0].salle,
            animateur: document.getElementById('editLocAnimateur').value || null,
            contact: document.getElementById('editLocContact').value.trim() || null,
            notes: document.getElementById('editLocNotes').value.trim() || null,
            dates: dates
        }).then(function () {
            editModal.hidden = true;
            if (window.ADWNotifications) {
                window.ADWNotifications.push('location_modifiee', '\uD83D\uDD11 Location modifi\u00e9e : \u00AB ' + titre + ' \u00BB.', 'info');
            }
            charge(courante.id);
        }).catch(function (err) { alert('Erreur : ' + err.message); });
    });

    function charge(id) {
        Promise.all([
            window.ADWDatabase.getLocation(id).catch(function (e) { throw e; }),
            window.ADWDatabase.conflitsLocation(id).catch(function () { return []; })
        ]).then(function (r) {
            var loc = r[0];
            var conflits = r[1] || [];
            courante = loc;
            window.document.title = loc.titre + ' — Location — Gimaweb';
            render(loc, { conflits: conflits });
        }).catch(function () {
            loading.hidden = true;
            notFound.hidden = false;
        });
    }

    window.ADWDatabase.init().then(function () {
        var m = location.search.match(/[?&]id=([^&]+)/);
        if (!m) {
            loading.hidden = true;
            notFound.hidden = false;
            notFound.querySelector('p').textContent = 'Aucune location spécifiée dans l\u2019URL.';
            return;
        }
        charge(decodeURIComponent(m[1]));
    });
})();
