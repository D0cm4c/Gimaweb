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
            var salle = prompt('Salle (id) — salle actuelle : ' + (loc.room_name || '?') + ' :', loc.room_id || '');
            if (salle === null) return;
            var animateur = prompt('Animateur (nom, ou vide pour salle seule) :', loc.animateur || '');
            if (animateur === null) return;
            window.ADWDatabase.updateLocation(loc.id, {
                room_id: salle || null,
                animateur: animateur || null
            }).then(function () { return charge(loc.id); })
              .catch(function (err) { alert('Erreur : ' + err.message); });
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
