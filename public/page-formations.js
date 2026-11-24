    (function () {
        'use strict';

        var grid = document.getElementById('eventsGrid');
        var statusBox = document.getElementById('mecStatus');
        var emptyState = document.getElementById('emptyState');
        var countEl = document.getElementById('eventsCount');
        var searchInput = document.getElementById('searchInput');
        var monthSelect = document.getElementById('monthSelect');
        var catSelect = document.getElementById('catSelect');
        var dataSource = document.getElementById('dataSource');

        var events = [];
        var db = null;
        var formationRows = {}; // event_id -> row DB (avec id interne + inscrits)
        var filtered = [];
        var period = 'upcoming';
        var today = new Date();
        var todayStr = today.toISOString().slice(0, 10);

        document.getElementById('todayDate').textContent = today.toLocaleDateString('fr-BE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        function esc(s) { return window.ADWEscape.html(s); }

        function status(msg) {
            statusBox.hidden = !msg;
            if (msg) statusBox.querySelector('p').textContent = msg;
        }

        function fillSelects() {
            var months = {};
            var cats = {};
            events.forEach(function (ev) {
                if (ev.startDate) {
                    var m = ev.startDate.slice(0, 7);
                    months[m] = true;
                }
                (ev.categories || []).forEach(function (c) { cats[c] = true; });
            });
            var mKeys = Object.keys(months).sort();
            mKeys.forEach(function (m) {
                var d = new Date(m + '-01T12:00:00');
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = d.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
                monthSelect.appendChild(opt);
            });
            Object.keys(cats).sort().forEach(function (c) {
                var opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                catSelect.appendChild(opt);
            });
        }

        function applyFilters() {
            var q = searchInput.value.trim().toLowerCase();
            var month = monthSelect.value;
            var cat = catSelect.value;
            filtered = events.filter(function (ev) {
                if (period === 'upcoming' && ev.startDate && ev.startDate < todayStr) return false;
                if (month && ev.startDate && ev.startDate.slice(0, 7) !== month) return false;
                if (cat && (ev.categories || []).indexOf(cat) === -1) return false;
                if (q) {
                    var hay = (ev.title + ' ' + (ev.excerpt || '') + ' ' + (ev.categories || []).join(' ')).toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                return true;
            });
            render();
        }

        function badge(ev) {
            var html = '';
            if (ev.labels && ev.labels.length) {
                ev.labels.forEach(function (l) { html += '<span class="badge badge-new">' + esc(l) + '</span>'; });
            }
            return html;
        }

        // Couleur déterministe par catégorie : hash du nom → ton 0-9
        var TONE_SOLID = ['#0F3D5C', '#6C5CE7', '#2F9BE4', '#18A55F', '#E8734A', '#B26A00', '#D8434B', '#7A5230', '#556B2F', '#4A4E69'];
        // ============ Labels MEC majeurs (annulé/complet/nouveau) sur les cartes ============
        // Fetch asynchrone de la page publique de chaque formation (non bloquant),
        // extraction du bloc « Labels » — même logique que formation.html.
        var MAJOR_LABELS = {
            canceled: /annul/i,
            full: /complet/i,
            fresh: /nouveau|new/i
        };

        function applyMajorLabelToCard(card, labels) {
            var joined = (labels || []).join(' ');
            var isCanceled = MAJOR_LABELS.canceled.test(joined);
            var isFull = !isCanceled && MAJOR_LABELS.full.test(joined);
            var isFresh = MAJOR_LABELS.fresh.test(joined);
            // badges dans le bandeau
            var banner = card.querySelector('.f-card-banner');
            if (banner) {
                var badges = '';
                if (isCanceled) badges += '<span class="fm-label fm-label-canceled">Annulé</span>';
                if (isFull) badges += '<span class="fm-label fm-label-full">Complet</span>';
                if (isFresh) badges += '<span class="fm-label fm-label-new">Nouveau</span>';
                if (badges) banner.insertAdjacentHTML('beforeend', badges);
            }
            // réactions : résa désactivée (annulé/complet), carte grisée (annulé)
            var book = card.querySelector('.f-card-book');
            if (isCanceled || isFull) {
                if (book) {
                    book.classList.add('is-locked');
                    book.setAttribute('aria-disabled', 'true');
                    if (book.tagName === 'A') book.removeAttribute('href');
                    book.title = isCanceled ? 'Formation annulée — réservation fermée' : 'Formation complète — réservation fermée';
                    book.innerHTML = isCanceled ? '🚫 Annulée' : '⛔ Complète';
                }
                if (isCanceled) card.classList.add('f-card-canceled');
            }
        }

        function loadCardLabels(ev, card) {
            // Source unique : les labels du flux — venus de l'endpoint public du plugin
            // (ADWMec.enrichFromPlugin). Le fetch direct des pages HTML est bloqué par
            // CORS depuis GitHub Pages (testé) : pas de fallback navigateur possible.
            if (ev.labels && ev.labels.length) {
                applyMajorLabelToCard(card, ev.labels);
            }
        }

        // Re-résolution des catégories : le cache ou la base locale peuvent contenir des IDs
        // numériques non résolus (fenêtre d'erreur réseau/échec de résolution) — on repasse
        // par resolveCategories pour garantir les noms (et donc les couleurs par catégorie).
        // Gimaweb : les catégories sont résolues côté SERVEUR à la synchro (jamais d'ID
        // numérique en base) — ce garde-fou navigateur n'a plus de travail.
        function ensureCategoryNames(events, fallback) {
            return Promise.resolve(events);
        }

        function toneFor(name) {
            var s = (name || '').toLowerCase();
            var h = 0;
            for (var i = 0; i < s.length; i++) {
                h = (h * 31 + s.charCodeAt(i)) >>> 0;
            }
            return h % 10;
        }

        function render() {
            grid.innerHTML = '';
            emptyState.hidden = filtered.length > 0;
            countEl.textContent = filtered.length + ' formation' + (filtered.length > 1 ? 's' : '');

            // Tri par date puis regroupement par mois
            var sorted = filtered.slice().sort(function (a, b) {
                return (a.startDate || '9999').localeCompare(b.startDate || '9999');
            });
            var byMonth = {};
            var monthOrder = [];
            sorted.forEach(function (ev) {
                var key = ev.startDate ? ev.startDate.slice(0, 7) : 'nodate';
                if (!byMonth[key]) { byMonth[key] = []; monthOrder.push(key); }
                byMonth[key].push(ev);
            });

            monthOrder.forEach(function (monthKey) {
                var group = document.createElement('section');
                group.className = 'month-group';
                var header = document.createElement('h2');
                header.className = 'month-header';
                if (monthKey === 'nodate') {
                    header.innerHTML = 'Dates à confirmer <span class="month-count">' + byMonth[monthKey].length + '</span>';
                } else {
                    var label = new Date(monthKey + '-01T12:00:00').toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
                    var dotCat = (byMonth[monthKey][0].categories && byMonth[monthKey][0].categories[0]) || '';
                    var dot = dotCat ? '<span class="month-dot" style="background:' + TONE_SOLID[toneFor(dotCat)] + '"></span>' : '';
                    header.innerHTML = dot + esc(label) + ' <span class="month-count">' + byMonth[monthKey].length + '</span>';
                }
                group.appendChild(header);

                var wrap = document.createElement('div');
                wrap.className = 'month-cards';
                group.appendChild(wrap);

                byMonth[monthKey].forEach(function (ev) {
                    var url = ev.url || 'https://atelierduweb.be/nos-formations-et-ateliers/';
                    var day = '', mon = '', weekday = '', timeShort = ev.timeLabel || '';
                    if (ev.startDate) {
                        var d = new Date(ev.startDate + 'T12:00:00');
                        day = d.getDate();
                        mon = d.toLocaleDateString('fr-BE', { month: 'short' }).replace('.', '');
                        weekday = d.toLocaleDateString('fr-BE', { weekday: 'long' });
                    }
                    var dateInfo = ev.dateText || weekday;
                    var mainCat = (ev.categories && ev.categories.length) ? ev.categories[0] : '';
                    var tone = mainCat ? toneFor(mainCat) : -1;
                    var row = formationRows[String(ev.id)] || null;

                    var li = document.createElement('article');
                    li.className = 'f-card f-card-link';
                    if (tone >= 0) li.setAttribute('data-tone', tone);
                    li.setAttribute('data-goto-evid', esc(ev.id));
                    li.innerHTML =
                        '<div class="f-card-banner' + (ev.startDate ? '' : ' no-date') + '">' +
                        '<div class="f-card-date">' +
                        (ev.startDate
                            ? '<span class="day">' + day + '</span><span class="mon">' + esc(mon) + '</span>'
                            : 'date à confirmer') +
                        '</div>' +
                        '<div class="f-card-dateinfo">' +
                        (dateInfo ? '<div class="f-card-weekday">' + esc(dateInfo) + '</div>' : '') +
                        '<div class="f-card-time">' + (timeShort ? esc(timeShort) : '') + '</div>' +
                        '</div>' +
                        (row ? '<a class="f-card-count' + (row.attendee_count ? ' has-attendees' : '') + '" href="formation.html?id=' + encodeURIComponent(ev.id) + '" title="' + row.attendee_count + ' inscrit' + (row.attendee_count > 1 ? 's' : '') + ' \u00b7 ' + (row.paid_count || 0) + ' pay\u00e9' + ((row.paid_count || 0) > 1 ? 's' : '') + ' \u2014 voir la fiche"><span class="f-count-num">' + row.attendee_count + '/' + (row.paid_count || 0) + '</span></a>' : '') +
                        '</div>' +
                        '<div class="f-card-body">' +
                        '<h3 class="f-card-title">' + esc(ev.title) + '</h3>' +
                        (ev.duration ? '<div class="f-card-meta"><span>⏳ ' + esc(ev.duration) + '</span></div>' : '') +
                        (ev.excerpt ? '<p class="f-card-desc">' + esc(ev.excerpt) + '</p>' : '') +
                        '<div class="f-card-foot">' +
                        (ev.categories || []).map(function (c, idx) {
                            var cls = 'tag' + (idx === 0 && tone >= 0 ? ' tag-tone-' + tone : '');
                            return '<span class="' + cls + '">' + esc(c) + '</span>';
                        }).join('') +
                        badge(ev) +
                        '</div>' +
                        (row
                        ? '<button class="btn btn-primary f-card-book bk-open" data-evid="' + esc(ev.id) + '" title="Choisir un membre et réserver sur atelierduweb.be">Réserver sur le site</button>'
                        : '<a class="btn btn-primary f-card-book" href="' + esc(url) + '" target="_blank" rel="noopener">Réserver sur le site</a>') +
                        '</div>';
                    wrap.appendChild(li);
                    loadCardLabels(ev, li);
                });
                grid.appendChild(group);
            });
        }

        // Filtres : recherche, mois, catégorie, période (réintégrés de la maquette — perdus à la migration)
        document.querySelectorAll('[data-period]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('[data-period]').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                period = btn.getAttribute('data-period');
                applyFilters();
            });
        });
        searchInput.addEventListener('input', applyFilters);
        monthSelect.addEventListener('change', applyFilters);
        catSelect.addEventListener('change', applyFilters);

        // Carte cliquable -> fiche formation ; bouton Réserver -> sélecteur de membre (booking.js)
        // (réintégré de la maquette — perdus lors de la migration serveur, v1.2.5)
        grid.addEventListener('click', function (e) {
            if (e.target.closest('.bk-open, a, button')) return;
            var card = e.target.closest('.f-card-link');
            if (!card) return;
            var evid = card.getAttribute('data-goto-evid');
            if (evid) location.href = 'formation.html?id=' + encodeURIComponent(evid);
        });

        grid.addEventListener('click', function (e) {
            var btn = e.target.closest('.bk-open');
            if (!btn) return;
            window.ADWDatabase.getFormationByEventId(btn.getAttribute('data-evid')).then(function (f) {
                if (f && window.ADWBooking) window.ADWBooking.openPicker(f);
            }).catch(function (err) { alert('Erreur : ' + err.message); });
        });

        // Modale inscriptions du site : ouvrir / fermer / clic-fond (réintégrés de la maquette)
        var bookingsModal = document.getElementById('bookingsModal');
        document.getElementById('bookingsBtn').addEventListener('click', function () {
            renderBookingsQueue();
            bookingsModal.hidden = false;
        });
        document.getElementById('bookingsCloseBtn').addEventListener('click', function () { bookingsModal.hidden = true; });
        bookingsModal.addEventListener('click', function (e) { if (e.target === bookingsModal) bookingsModal.hidden = true; });

        function loadEvents() {
            // Gimaweb : la synchro avec atelierduweb.be vit côté SERVEUR (GET /api/formations,
            // auto-sync 15 min) — le navigateur lit la base unique, il ne fetch plus le site.
            status('⏳ Chargement des formations…');
            grid.innerHTML = '';
            emptyState.hidden = true;
            window.ADWDatabase.listFormations().then(function (rows) {
                rows = rows || [];
                formationRows = {};
                rows.forEach(function (r) { formationRows[r.event_id] = r; });
                events = rows.map(function (r) {
                    return {
                        id: r.event_id,
                        title: r.title,
                        url: r.url,
                        excerpt: r.excerpt,
                        duration: r.duration,
                        startDate: r.start_date || '',
                        dateText: r.date_text,
                        timeLabel: r.time_label,
                        categories: (r.categories || '').split(', ').filter(function (c) { return c && !/^\d+$/.test(c); })
                    };
                });
                dataSource.textContent = events.length + ' formation(s) - synchronisées via le serveur (base unique).';
                ensureCategoryNames(events, function (evs) { return evs; }).then(function () {
                    status('');
                    fillSelects();
                    applyFilters();
                    updateBookingsBadge();
                });
            }).catch(function (err) {
                status('');
                emptyState.hidden = false;
                dataSource.textContent = 'Erreur de chargement : ' + err.message;
            });
        }

        function updateBookingsBadge() {
            window.ADWDatabase.listUnprocessedBookings().then(function (pending) {
                pending = pending || [];
                bookingsPendingBadge.textContent = pending.length;
                bookingsPendingBadge.hidden = pending.length === 0;
            }).catch(function () {});
        }

        function bookingCardLabel(eventId) {
            var f = formationRows[eventId];
            return f ? f.title : 'Formation inconnue (n° ' + eventId + ')';
        }

        // Le serveur calcule le matching (n° membre > email > nom). À l'ouverture :
        // on traite d'abord automatiquement les matches CERTAINS (notifiés serveur),
        // puis la file n'affiche plus que les incertains — validation humaine.
        function renderBookingsQueue() {
            window.ADWDatabase.traitementAutomatiqueBookings().then(function () {
                return window.ADWDatabase.listUnprocessedBookings();
            }).then(function (queue) {
                queue = queue || [];
                updateBookingsBadge();
                bookingsQueue.innerHTML = queue.length ? '' : '<p class="form-hint" style="padding:1rem;">Aucune inscription en attente. Les nouvelles réservations du site apparaîtront ici (sync plugin WP → serveur).</p>';
                queue.forEach(function (b) {
                    var match = b.match || { certain: false, method: 'none' };
                    var li = document.createElement('div');
                    li.className = 'checkin-item';
                    li.style.flexWrap = 'wrap';
                    var renvEM = function (h) { return window.ADWEscape ? window.ADWEscape.html(h) : h; };
                    var head = '<div style="flex:1;min-width:0;"><strong>' + renvEM((b.last_name || '').toUpperCase() + ' ' + (b.first_name || '')) + '</strong>' +
                        (b.member_no ? ' <span class="member-no">#' + renvEM(b.member_no) + '</span>' : '') +
                        '<div class="form-hint">' + renvEM(b.email || "pas d'email") + ' · 🎓 ' + renvEM(bookingCardLabel(b.event_id)) +
                        ' · ' + renvEM((b.booked_at || '').slice(0, 10)) + (b.status ? ' · ' + renvEM(b.status) : '') + '</div></div>';
                    if (match.candidates && match.candidates.length) {
                        li.innerHTML = head + '<div class="bk-actions" data-bid="' + renvEM(b.id) + '"></div>';
                    } else {
                        li.innerHTML = head +
                            '<div class="bk-actions" data-bid="' + renvEM(b.id) + '">' +
                            '<button type="button" class="btn btn-primary btn-small" data-action="created">➕ Créer le membre et inscrire</button>' +
                            '<button type="button" class="btn btn-danger btn-small" data-action="ignored">⏭ Ignorer</button></div>';
                    }
                    bookingsQueue.appendChild(li);
                    var wrap2 = li.querySelector('.bk-actions');
                    (match.candidates || []).slice(0, 3).forEach(function (cand) {
                        var cb = document.createElement('button');
                        cb.className = 'btn btn-secondary btn-small';
                        cb.innerHTML = '🔗 ' + renvEM(cand.first_name + ' ' + cand.last_name) + (cand.member_no ? ' #' + cand.member_no : '');
                        cb.addEventListener('click', function () {
                            window.ADWDatabase.markBookingProcessed(b.id, 'linked', cand.id).then(function () {
                                renderBookingsQueue();
                                applyFilters();
                            }).catch(function (err) { alert('Erreur : ' + err.message); });
                        });
                        wrap2.appendChild(cb);
                    });
                    if (match.candidates && match.candidates.length) {
                        var ig = document.createElement('button');
                        ig.className = 'btn btn-danger btn-small';
                        ig.textContent = '⏭ Ignorer';
                        ig.addEventListener('click', function () {
                            window.ADWDatabase.markBookingProcessed(b.id, 'ignored').then(function () { renderBookingsQueue(); });
                        });
                        wrap2.appendChild(ig);
                        var nw = document.createElement('button');
                        nw.className = 'btn btn-primary btn-small';
                        nw.textContent = '➕ Nouveau membre';
                        nw.addEventListener('click', function () {
                            window.ADWDatabase.markBookingProcessed(b.id, 'created').then(function (r) {
                                window.ADWNotifications.push('member_created',
                                    '➕ Nouveau membre créé (#' + (r && r.member_no) + ') et inscrit à « ' + bookingCardLabel(b.event_id) + ' »',
                                    'success');
                                renderBookingsQueue();
                                applyFilters();
                            }).catch(function (err) { alert('Erreur : ' + err.message); });
                        });
                        wrap2.appendChild(nw);
                    } else {
                        wrap2.querySelectorAll('[data-action]').forEach(function (btn) {
                            btn.addEventListener('click', function () {
                                var action = btn.getAttribute('data-action');
                                window.ADWDatabase.markBookingProcessed(b.id, action).then(function () {
                                    if (action === 'created') {
                                        window.ADWNotifications.push('member_created',
                                            '➕ Nouveau membre créé et inscrit à « ' + bookingCardLabel(b.event_id) + ' »', 'success');
                                    }
                                    renderBookingsQueue();
                                    applyFilters();
                                }).catch(function (err) { alert('Erreur : ' + err.message); });
                            });
                        });
                    }
                });
            }).catch(function (err) {
                bookingsQueue.innerHTML = '<p class="form-hint" style="padding:1rem;">Erreur : ' + err.message + '</p>';
            });
        }

        // ============ Initialisation ============
        window.ADWDatabase.init().then(function (D) {
            db = D;
            if (window.ADWNotifications) window.ADWNotifications.refresh();
            loadEvents();
        }).catch(function () {
            loadEvents(); // mode dégradé sans DB (affichage seul)
        });
    })();
