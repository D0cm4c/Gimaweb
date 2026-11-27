(function () {
    'use strict';

    // Page Paramètres (parametres.html) : cartes du dashboard (tuiles), administration des salles,
    // purge RGPD. Expose window.ADWSettings. Dépend de : db.js, escape.js.


    // ============ Gestion des salles (page Paramètres) ============

    var dbReady = null;
    function ensureDb() {
        if (!dbReady) dbReady = window.ADWDatabase.init();
        return dbReady;
    }

    function initRoomsAdmin() {
        var list = document.getElementById('roomsList');
        var nameInput = document.getElementById('newRoomName');
        var capInput = document.getElementById('newRoomCapacity');
        var addBtn = document.getElementById('addRoomBtn');
        if (!list || !addBtn || !window.ADWDatabase) return;

        function esc(v) { return window.ADWEscape.html(v); }

        function render() {
            window.ADWDatabase.listRooms().then(function (rooms) {
            rooms = rooms || [];
            if (!rooms.length) {
                list.innerHTML = '<li class="form-hint" style="padding:0.5rem 0;">Aucune salle — ajoute-en une ci-dessous.</li>';
                return;
            }
            list.innerHTML = '';
            rooms.forEach(function (r) {
                var li = document.createElement('li');
                li.innerHTML =
                    '<span class="grow" style="font-weight:600;">' + esc(r.name) + '</span>' +
                    '<span class="room-cap">' + (r.capacity ? esc(r.capacity) + ' place' + (r.capacity > 1 ? 's' : '') : 'capacité libre') + '</span>';

                var renameBtn = document.createElement('button');
                renameBtn.className = 'btn btn-secondary btn-small';
                renameBtn.textContent = '✏️';
                renameBtn.title = 'Renommer la salle';
                renameBtn.addEventListener('click', function () {
                    var newName = prompt('Nouveau nom de la salle :', r.name);
                    if (newName && newName.trim()) {
                        window.ADWDatabase.renameRoom(r.id, newName).then(render).catch(function (err) { alert('Erreur : ' + err.message); });
                    }
                });

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger btn-small';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = 'Supprimer la salle';
                deleteBtn.addEventListener('click', function () {
                    window.ADWDatabase.deleteRoom(r.id).then(render).catch(function (err) {
                        alert('Impossible de supprimer « ' + r.name + ' » : ' +
                            (err && err.message ? err.message : err) + '\n' +
                            'Réattribue-les depuis la page Salles d’abord.');
                    });
                });

                li.appendChild(renameBtn);
                li.appendChild(deleteBtn);
                list.appendChild(li);
            });
            }).catch(function () { list.innerHTML = '<li class="form-hint">Salles indisponibles (serveur injoignable).</li>'; });
        }

        addBtn.addEventListener('click', function () {
            var name = (nameInput.value || '').trim();
            if (!name) { nameInput.focus(); return; }
            window.ADWDatabase.addRoom(name, capInput.value).then(function () {
                nameInput.value = '';
                capInput.value = '';
                render();
            }).catch(function (err) { alert('Erreur : ' + err.message); });
        });

        ensureDb().then(render).catch(function () { /* base indisponible : liste vide */ });
    }

    // ============ Clé API M.E. Calendar (page Paramètres — v1.5.12) ============
    // La clé vit dans la base serveur (table settings, garde admin) : la sync
    // M.E. Calendar l'utilise via le header « mec-token » (issue #52). Elle n'est
    // JAMAIS retournée par l'API — seulement masquée (abcd…wxyz).

    function initMecKey() {
        var input = document.getElementById('mecApiKey');
        var saveBtn = document.getElementById('mecKeySaveBtn');
        var clearBtn = document.getElementById('mecKeyClearBtn');
        var statusEl = document.getElementById('mecKeyStatus');
        if (!input || !saveBtn || !clearBtn) return;

        function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

        function rafraichir() {
            fetch('/api/parametres/cle-mec', { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (etat) {
                    if (!etat) { setStatus('⚠️ Session admin requise pour lire l’état de la clé.'); return; }
                    input.value = '';
                    if (etat.presente) setStatus('✓ Clé enregistrée côté serveur (' + etat.masquee + ', ' + (etat.source === 'env' ? 'via .env' : 'base') + ') — la sync des dates utilise l’API M.E. Calendar.');
                    else setStatus('Aucune clé posée — la sync utilise le canal public wp-json.');
                })
                .catch(function () { setStatus('⚠️ Serveur injoignable.'); });
        }

        saveBtn.addEventListener('click', function () {
            var val = (input.value || '').trim();
            if (!val) { input.focus(); setStatus('Colle d’abord la clé dans le champ.'); return; }
            saveBtn.disabled = true;
            fetch('/api/parametres/cle-mec', {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cle: val })
            }).then(function (r) {
                if (!r.ok) throw r;
                return r.json();
            }).then(function (etat) {
                input.value = '';
                setStatus('✓ Clé enregistrée côté serveur (' + etat.masquee + ') — la prochaine sync lira les dates via l’API officielle du site.');
                if (window.ADWNotifications) window.ADWNotifications.refresh();
            }).catch(function (r) {
                setStatus(r && r.status === 401 ? '⚠️ Session admin requise.' : '⚠️ Enregistrement refusé.');
            }).then(function () { saveBtn.disabled = false; });
        });

        clearBtn.addEventListener('click', function () {
            fetch('/api/parametres/cle-mec', {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cle: '' })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (etat) {
                input.value = '';
                setStatus('Clé effacée — la sync revient au canal public wp-json.');
              })
              .catch(function () { setStatus('⚠️ Serveur injoignable.'); });
        });

        rafraichir();
    }

    if (document.readyState !== 'loading') initRoomsAdmin();
    else document.addEventListener('DOMContentLoaded', initRoomsAdmin);

    // ============ Secret du plugin ADW MEC API (page Paramètres) ============
    // Même pattern que la clé MEC : stockage navigateur en attendant le serveur Node,
    // qui l'utilisera pour appeler l'endpoint inscriptions du plugin WordPress.

    var ADW_SECRET_STORAGE = 'atelierduweb_adw_plugin_secret';

    function initAdwSecret() {
        var input = document.getElementById('adwPluginSecret');
        var saveBtn = document.getElementById('adwSecretSaveBtn');
        var clearBtn = document.getElementById('adwSecretClearBtn');
        var statusEl = document.getElementById('adwSecretStatus');
        if (!input || !saveBtn || !clearBtn) return;

        function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

        var stored = '';
        try { stored = localStorage.getItem(ADW_SECRET_STORAGE) || ''; } catch (e) { /* stockage indisponible */ }
        if (stored) {
            input.value = stored;
            setStatus('✓ Secret enregistré dans ce navigateur (' + stored.slice(0, 4) + '…' + stored.slice(-4) + ')');
        }

        saveBtn.addEventListener('click', function () {
            var val = (input.value || '').trim();
            if (!val) { input.focus(); setStatus('Colle d\u2019abord le secret dans le champ.'); return; }
            try {
                localStorage.setItem(ADW_SECRET_STORAGE, val);
                setStatus('✓ Secret enregistré dans ce navigateur (' + val.slice(0, 4) + '…' + val.slice(-4) + ')');
            } catch (e) {
                setStatus('⚠️ Impossible d\u2019enregistrer (stockage indisponible).');
            }
        });

        clearBtn.addEventListener('click', function () {
            input.value = '';
            try { localStorage.removeItem(ADW_SECRET_STORAGE); } catch (e) { /* ignore */ }
            setStatus('Secret effacé de ce navigateur.');
        });
    }

    if (document.readyState !== 'loading') initAdwSecret();
    else document.addEventListener('DOMContentLoaded', initAdwSecret);

    if (document.readyState !== 'loading') initMecKey();
    else document.addEventListener('DOMContentLoaded', initMecKey);

    // ============ Équipe technique (page Paramètres → assignation des incidents) ============

    function initTeamAdmin() {
        var list = document.getElementById('teamList');
        var nameInput = document.getElementById('newTeamMemberName');
        var addBtn = document.getElementById('addTeamMemberBtn');
        if (!list || !addBtn || !window.ADWDatabase) return;

        function esc(v) { return window.ADWEscape.html(v); }

        function render() {
            window.ADWDatabase.listTeamMembers().then(function (team) {
                team = team || [];
                list.innerHTML = '';
                team.forEach(function (m) {
                    var li = document.createElement('li');
                    li.innerHTML = '<span class="grow" style="font-weight:600;">' + esc(m.name) + '</span>';
                    var rm = document.createElement('button');
                    rm.className = 'btn btn-danger btn-small';
                    rm.textContent = '🗑';
                    rm.title = 'Retirer de l\u2019équipe';
                    rm.addEventListener('click', function () {
                        window.ADWDatabase.deleteTeamMember(m.id).then(render).catch(function (err) {
                            alert(err.status === 409 ? 'Impossible : des tickets sont assignés à ce nom.' : 'Erreur : ' + err.message);
                        });
                    });
                    li.appendChild(rm);
                    list.appendChild(li);
                });
            }).catch(function () { list.innerHTML = '<li class="form-hint">Équipe indisponible.</li>'; });
        }

        addBtn.addEventListener('click', function () {
            var name = (nameInput.value || '').trim();
            if (!name) { nameInput.focus(); return; }
            window.ADWDatabase.addTeamMember(name).then(function () {
                nameInput.value = '';
                render();
            }).catch(function (err) { alert('Erreur : ' + err.message); });
        });

        window.ADWDatabase.init().then(render).catch(function () { /* serveur indisponible */ });
    }

    // Formateurs / animateurs : liste automatique des organisateurs des \u00e9v\u00e9nements du site (\u00e0 venir)
    function initFormateurs() {
        var list = document.getElementById('formateursListe');
        if (!list || !window.ADWDatabase) return;
        function esc(v) { return window.ADWEscape ? window.ADWEscape.html(v) : v; }
        window.ADWDatabase.listOrganisateurs().then(function (organisateurs) {
            organisateurs = organisateurs || [];
            list.innerHTML = '';
            if (!organisateurs.length) {
                list.innerHTML = '<li class="form-hint" style="padding:0.5rem 0;">Aucun organisateur pour l\u2019instant \u2014 la liste se remplit avec les \u00e9v\u00e9nements \u00e0 venir du site.</li>';
                return;
            }
            organisateurs.forEach(function (o) {
                var li = document.createElement('li');
                var d = o.prochaine ? new Date(o.prochaine + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' }) : '';
                li.innerHTML = '<span class="grow" style="font-weight:600;">' + esc(o.nom) + '</span>' +
                    '<span class="badge badge-ok">' + o.seances + ' \u00e0 venir' + (o.seances > 1 ? 's' : '') + '</span>' +
                    (d ? '<span class="form-hint" style="margin-left:0.5rem;">d\u00e8s le ' + d + '</span>' : '');
                list.appendChild(li);
            });
        }).catch(function () { list.innerHTML = '<li class="form-hint">Organisateurs indisponibles.</li>'; });
    }

    if (document.readyState !== 'loading') { initTeamAdmin(); initFormateurs(); }
    else document.addEventListener('DOMContentLoaded', function () { initTeamAdmin(); initFormateurs(); });

    // ============ Sauvegarde de la base — SERVEUR (chiffrée AES-GCM, timer nocturne) ============
    function initBackupCard() {
        var chooseBtn = document.getElementById('backupChooseBtn');
        var saveBtn = document.getElementById('backupSaveBtn');
        var restoreBtn = document.getElementById('backupRestoreBtn');
        var statusEl = document.getElementById('backupStatus');
        if (!saveBtn || !window.ADWDatabase) return;

        function setStatus(html) { if (statusEl) statusEl.innerHTML = html; }

        if (chooseBtn) { chooseBtn.hidden = true; } // plus d'emplacement local : le serveur décide (data/sauvegardes + Nextcloud)

        // v1.5.11 : « Sauvegarder maintenant » télécharge la base sur LE POSTE
        // (téléchargement navigateur du snapshot SQLite — la sauvegarde nocturne
        // chiffrée AES-256-GCM + Nextcloud continue de tourner côté serveur, elle).
        saveBtn.addEventListener('click', function () {
            saveBtn.disabled = true;
            setStatus('⏳ Préparation de la base à télécharger…');
            window.ADWAuth.ensureUnlocked('Sauvegarder la base — téléchargement du fichier SQLite.').then(function (ok) {
                if (!ok) { saveBtn.disabled = false; return; }
                fetch('/api/base/export', { credentials: 'same-origin' }).then(function (rep) {
                    if (!rep.ok) throw Object.assign(new Error('Export refusé'), { status: rep.status });
                    var nom = 'gimaweb-export.db';
                    var cd = rep.headers.get('Content-Disposition') || '';
                    var m = cd.match(/filename="?([^";]+)"?/);
                    if (m) nom = m[1];
                    setStatus('⏳ Téléchargement de <strong>' + nom + '</strong>…');
                    return rep.blob().then(function (blob) {
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url; a.download = nom;
                        document.body.appendChild(a); a.click(); a.remove();
                        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                        setStatus('✓ Base téléchargée : <strong>' + nom + '</strong> (' + Math.round(blob.size / 1024) + ' Ko) — range-la sur une clé USB. La sauvegarde nocturne chiffrée continue de tourner côté serveur.');
                    });
                }).catch(function (err) {
                    setStatus('⚠ ' + (err.status === 401 ? 'Session admin requise.' : err.message));
                }).then(function () { saveBtn.disabled = false; });
            });
        });

        if (restoreBtn) restoreBtn.addEventListener('click', function () {
            window.ADWAuth.ensureUnlocked('Restaurer une base — validation integrity_check puis redémarrage.').then(function (ok) {
                if (!ok) return;
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = '.db,.aes';
                input.addEventListener('change', function () {
                    var fichier = input.files && input.files[0];
                    if (!fichier) return;
                    setStatus('⏳ Validation du fichier (integrity_check)…');
                    fichier.arrayBuffer().then(function (buf) {
                        var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
                        return window.ADWDatabase.remplacerBase(b64);
                    }).then(function (res) {
                        setStatus('♻ Base validée — elle sera appliquée au <strong>redémarrage du service gimaweb</strong> (systemctl restart gimaweb).');
                    }).catch(function (err) {
                        setStatus('⚠ ' + err.message);
                    });
                });
                input.click();
            });
        });

        setStatus('La sauvegarde nocturne chiffrée tourne côté serveur (timer systemd 02:30) — le bouton déclenche une sauvegarde immédiate.');
    }

    if (document.readyState !== 'loading') initBackupCard();
    else document.addEventListener('DOMContentLoaded', initBackupCard);

    // Garde admin : la page Paramètres est réservée à l'équipe (session serveur)
    function guardSettingsPage() {
        if (!window.ADWAuth) return;
        window.ADWEscape && document.body.setAttribute('data-garde', '1');
        window.ADWAuth.ensureUnlocked('Page Paramètres — action réservée à l\u2019équipe.');
    }
    if (document.readyState !== 'loading') guardSettingsPage();
    else document.addEventListener('DOMContentLoaded', guardSettingsPage);

    // Changement du mot de passe admin (carte « Mot de passe admin » de parametres.html)
    function initAuthCard() {
        var oldInput = document.getElementById('authOldPass');
        var newInput = document.getElementById('authNewPass');
        var changeBtn = document.getElementById('authChangeBtn');
        var statusEl = document.getElementById('authStatus');
        if (!changeBtn || !window.ADWAuth) return;

        function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

        changeBtn.addEventListener('click', function () {
            var oldPass = (oldInput.value || '').trim();
            var newPass = (newInput.value || '').trim();
            if (!oldPass || !newPass) { setStatus('Remplis les deux champs.'); return; }
            if (newPass.length < 4) { setStatus('Le nouveau mot de passe doit faire au moins 4 caractères.'); return; }
            window.ADWAuth.verify(oldPass).then(function (ok) {
                if (!ok) { setStatus('⚠️ Mot de passe actuel incorrect.'); oldInput.focus(); return; }
                return window.ADWAuth.setPassword(newPass).then(function () {
                    oldInput.value = '';
                    newInput.value = '';
                    setStatus('✓ Mot de passe modifié.');
                });
            });
        });
    }
    if (document.readyState !== 'loading') initAuthCard();
    else document.addEventListener('DOMContentLoaded', initAuthCard);

    window.ADWSettings = {};
})();
