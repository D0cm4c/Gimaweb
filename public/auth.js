(function () {
    'use strict';

    // Authentification Gimaweb — session SERVEUR (cookie HttpOnly 30 min, décision figée n° 1).
    // Le mot de passe ne vit plus dans le navigateur : il est échangé une fois contre
    // un cookie de session (POST /api/auth/connexion, hash SHA-256 vérifié côté serveur).
    // Même interface que la maquette : ADWAuth.ensureUnlocked(label).then(ok => …)
    // — le point d'appel unique n'a pas bougé, seul l'intérieur a changé.

    var DUREE_LOCALE_MS = 25 * 60 * 1000; // mémoire locale légèrement < serveur (30 min)
    var CLE = 'gimaweb_deverrouille_jusquau';

    function estDeverrouille() {
        try {
            var v = localStorage.getItem(CLE);
            if (!v) return false;
            if (Number(v) < Date.now()) { localStorage.removeItem(CLE); return false; }
            return true;
        } catch (e) { return false; }
    }

    function marquerDeverrouille() {
        try { localStorage.setItem(CLE, String(Date.now() + DUREE_LOCALE_MS)); } catch (e) { /* ignore */ }
    }

    function connexion(password) {
        return fetch('/api/auth/connexion', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        }).then(function (res) {
            if (!res.ok) return res.json().catch(function () { return null; }).then(function (c) {
                throw new Error((c && c.erreur) || 'Connexion refusée.');
            });
            marquerDeverrouille();
            return true;
        });
    }

    var enCours = null;

    function ouvrirModale(label) {
        return new Promise(function (resolve) {
            var existante = document.getElementById('adw-auth-modal');
            if (existante) existante.remove();
            var modale = document.createElement('div');
            modale.id = 'adw-auth-modal';
            modale.className = 'modal-overlay';
            modale.style.zIndex = '1000';
            modale.innerHTML =
                '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="adw-auth-titre">' +
                '<h3 id="adw-auth-titre">🔐 Session admin requise</h3>' +
                '<p class="form-hint">' + (window.ADWEscape ? window.ADWEscape.html(label || '') : (label || '')) + '</p>' +
                '<form id="adw-auth-form">' +
                '<div class="form-group"><input type="password" id="adw-auth-pass" placeholder="Mot de passe admin" autocomplete="current-password" required></div>' +
                '<p class="form-hint" id="adw-auth-erreur" style="color:var(--danger);margin:0.4rem 0 0;" hidden></p>' +
                '<div class="modal-actions">' +
                '<button type="button" class="btn btn-secondary" id="adw-auth-annuler">Annuler</button>' +
                '<button type="submit" class="btn btn-primary">Déverrouiller</button>' +
                '</div></form></div>';
            document.body.appendChild(modale);
            var champ = document.getElementById('adw-auth-pass');
            champ.focus();
            var fermer = function (ok) { modale.remove(); resolve(ok); };
            document.getElementById('adw-auth-annuler').addEventListener('click', function () { fermer(false); });
            modale.addEventListener('click', function (e) { if (e.target === modale) fermer(false); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && document.getElementById('adw-auth-modal')) fermer(false);
            }, { once: true });
            document.getElementById('adw-auth-form').addEventListener('submit', function (e) {
                e.preventDefault();
                var err = document.getElementById('adw-auth-erreur');
                err.hidden = true;
                connexion(champ.value).then(function () { fermer(true); }).catch(function (ex) {
                    err.textContent = ex.message;
                    err.hidden = false;
                    champ.select();
                });
            });
        });
    }

    // La mémoire locale n'est PAS la vérité : un redémarrage du serveur purge les sessions.
    // Donc même «déverrouillé» en local, on vérifie la session côté serveur.
    function verifierSessionServeur() {
        return fetch('/api/auth/verification', { credentials: 'same-origin' })
            .then(function (res) { return res.json(); })
            .then(function (r) { return Boolean(r && r.valide); })
            .catch(function () { return false; });
    }

    var Auth = {
        ensureUnlocked: function (label) {
            if (!estDeverrouille()) {
                if (enCours) return enCours;
                enCours = ouvrirModale(label).then(function (ok) { enCours = null; return ok; });
                return enCours;
            }
            return verifierSessionServeur().then(function (valide) {
                if (valide) return true;
                try { localStorage.removeItem(CLE); } catch (e) { /* ignore */ }
                if (enCours) return enCours;
                enCours = ouvrirModale(label).then(function (ok) { enCours = null; return ok; });
                return enCours;
            });
        },
        isUnlocked: function () { return estDeverrouille(); },
        lock: function () {
            try { localStorage.removeItem(CLE); } catch (e) { /* ignore */ }
            return fetch('/api/auth/deconnexion', { method: 'POST', credentials: 'same-origin' }).catch(function () { /* ignore */ });
        }
    };

    window.ADWAuth = Auth;
})();
