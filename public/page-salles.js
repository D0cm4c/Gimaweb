    (function () {
        'use strict';

        var planningWrap = document.getElementById('planningWrap');
        var agendaWrap = document.getElementById('agendaWrap');
        var monthLabel = document.getElementById('monthLabel');
        var monthCount = document.getElementById('monthCount');
        var unassignedBadge = document.getElementById('unassignedBadge');
        var unassignedModal = document.getElementById('unassignedModal');
        var unassignedList = document.getElementById('unassignedList');

        // Semaine affichée : par défaut celle d'aujourd'hui (lundi -> dimanche)
        var view = lundiDe(new Date());

        document.getElementById('todayDate').textContent = new Date().toLocaleDateString('fr-BE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        function esc(s) { return window.ADWEscape.html(s); }

        // Couleur déterministe par catégorie (même logique que formations)
        function toneFor(name) {
            var s = (name || '').toLowerCase();
            var h = 0;
            for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return h % 10;
        }
        var TONE_SOLID = ['#0F3D5C', '#6C5CE7', '#2F9BE4', '#18A55F', '#E8734A', '#B26A00', '#D8434B', '#7A5230', '#556B2F', '#4A4E69'];

        // Format ISO local (YYYY-MM-DD) — toISOString() décalerait d'un jour en UTC+1/+2 !
        function isoLocal(d) {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        function lundiDe(d) {
            var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            var ecart = (x.getDay() + 6) % 7; // lundi = 0
            x.setDate(x.getDate() - ecart);
            return x;
        }
        function mainCatOf(categories) {
            return (categories || '').split(',').map(function (c) { return c.trim(); }).filter(function (c) { return c && !/^\d+$/.test(c); })[0] || '';
        }
        function shortTitle(t) {
            t = t || '';
            return t.length > 22 ? t.slice(0, 20) + '\u2026' : t;
        }

        // Planning multi-mois : la semaine (ou la fenêtre agenda) peut chevaucher deux mois
        function moisNecessaires(debut, fin) {
            var mois = {};
            var cur = new Date(debut.getFullYear(), debut.getMonth(), 1);
            while (cur <= fin) {
                mois[cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0')] = true;
                cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            }
            return Object.keys(mois).sort();
        }

        function render() {
            var weekStart = new Date(view);
            var weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
            var agendaEnd = new Date(weekStart); agendaEnd.setDate(agendaEnd.getDate() + 29);
            var mois = moisNecessaires(weekStart, agendaEnd);

            monthLabel.textContent = weekStart.getDate() + ' \u2013 ' + weekEnd.getDate() + ' ' +
                weekEnd.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

            var chargements = [
                window.ADWDatabase.listRooms().catch(function () { return []; }),
                window.ADWDatabase.formationsWithoutRoom().catch(function () { return []; })
            ].concat(mois.map(function (m) {
                return window.ADWDatabase.getRoomPlanning(m).catch(function () { return []; });
            }));

            Promise.all(chargements).then(function (sources) {
            var rooms = sources[0] || [];
            var withoutData = sources[1] || [];
            var planning = [];
            sources.slice(2).forEach(function (ps) { (ps || []).forEach(function (p) { planning.push(p); }); });

            // Index : date -> [{room, slot, fid, title, event_id, categories, type}]
            var byCell = {};
            var byDay = {};
            planning.forEach(function (p) {
                var cell = { fid: p.fid, title: p.title, event_id: p.event_id, cat: mainCatOf(p.categories), type: p.type || 'formation', room_id: p.room_id, slot: p.slot, date: p.date };
                byCell[p.date + '|' + p.room_id + '|' + p.slot] = cell;
                byDay[p.date] = byDay[p.date] || [];
                byDay[p.date].push(cell);
            });

            var todayStr = isoLocal(new Date());
            var nowH = new Date().getHours() + new Date().getMinutes() / 60;
            var currentSlot = null;
            if (nowH >= 9.5 && nowH < 12.5) currentSlot = 'AM';
            else if (nowH >= 13.5 && nowH < 16.5) currentSlot = 'PM';
            var roomNameById = {};
            rooms.forEach(function (r) { roomNameById[r.id] = r.name; });

            // ---- M1 : grille semaine — une LIGNE PAR SALLE (dynamique : l'admin ajoute/enlève une salle, la ligne suit),
            //      deux colonnes par jour (Matin | A-midi) ----
            var jours = [];
            for (var i = 0; i < 7; i++) {
                var d = new Date(weekStart); d.setDate(d.getDate() + i);
                jours.push(d);
            }
            var occupied = 0;
            var html = '<table class="room-planning"><thead>';
            html += '<tr><th class="room-lbl-h">Salle</th>';
            jours.forEach(function (d) {
                var iso = isoLocal(d);
                var isToday = iso === todayStr;
                html += '<th colspan="2" class="day-h' + (isToday ? ' today' : '') + '">' +
                    (isToday ? '<span class="today-dot">\u25cf</span> ' : '') +
                    d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric' }) + '</th>';
            });
            html += '</tr><tr><th></th>';
            jours.forEach(function (d) {
                html += '<th class="slot-h slot-am">\u2600\ufe0f Matin</th><th class="slot-h slot-pm">\ud83d\udd50 A-midi</th>';
            });
            html += '</tr></thead><tbody>';

            rooms.forEach(function (r, ri) {
                html += '<tr class="room-row room-' + ri + '"><td class="room-lbl">\ud83c\udfeb ' + esc(r.name) + '</td>';
                jours.forEach(function (d) {
                    var dateStr = isoLocal(d);
                    var isToday = dateStr === todayStr;
                    var isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    ['AM', 'PM'].forEach(function (slot) {
                        var cell = byCell[dateStr + '|' + r.id + '|' + slot];
                        var colClass = ' room-' + ri + (isToday && currentSlot === slot ? ' now' : '');
                        if (cell) {
                            occupied++;
                            var tone = cell.cat ? toneFor(cell.cat) : -1;
                            var bg = tone >= 0 ? TONE_SOLID[tone] : 'var(--primary)';
                            var estLoc = cell.type === 'location';
                            html += '<td class="slot-cell busy' + colClass + '"><a href="' + (estLoc ? 'location.html?id=' : 'formation.html?id=') + encodeURIComponent(cell.event_id) + '" class="slot-busy' + (estLoc ? ' slot-location' : '') + '"' + (estLoc ? '' : ' style="background:' + bg + ';"') + ' title="' + esc(cell.title) + '">' + (estLoc ? '\ud83d\udd11 ' : '') + esc(shortTitle(cell.title)) + '</a></td>';
                        } else {
                            html += '<td class="slot-cell' + colClass + (isWeekend ? ' muted' : '') + '"></td>';
                        }
                    });
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            planningWrap.innerHTML = html;
            monthCount.textContent = occupied + ' créneau' + (occupied > 1 ? 'x' : '') + ' occupé' + (occupied > 1 ? 's' : '') + ' cette semaine';

            // ---- M3 (sous la grille) : agenda chronologique des 30 prochains jours —
            //      uniquement les journées qui ont quelque chose ----
            var agHtml = '';
            var nbItems = 0;
            for (var j = 0; j < 30; j++) {
                var ad = new Date(weekStart); ad.setDate(ad.getDate() + j);
                var aIso = isoLocal(ad);
                var cells = byDay[aIso];
                if (!cells || !cells.length) continue;
                cells.sort(function (a, b) { return a.slot === b.slot ? String(a.title).localeCompare(String(b.title)) : (a.slot === 'AM' ? -1 : 1); });
                agHtml += '<div class="ag-jour' + (aIso === todayStr ? ' ag-today' : '') + '">';
                agHtml += '<div class="ag-head"><strong>' + ad.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) + '</strong>' +
                    '<span>' + (aIso === todayStr ? 'aujourd\u2019hui \u00b7 ' : '') + cells.length + ' créneau' + (cells.length > 1 ? 'x' : '') + '</span></div>';
                cells.forEach(function (c) {
                    var tone = c.cat ? toneFor(c.cat) : -1;
                    var bg = tone >= 0 ? TONE_SOLID[tone] : 'var(--primary)';
                    var estLoc = c.type === 'location';
                    nbItems++;
                    agHtml += '<a class="ag-item" href="' + (estLoc ? 'location.html?id=' : 'formation.html?id=') + encodeURIComponent(c.event_id) + '">' +
                        '<span class="ag-slot' + (c.slot === 'PM' ? ' pm' : '') + '">' + (c.slot === 'AM' ? 'Matin' : 'A-midi') + '</span>' +
                        '<span class="ag-evt' + (estLoc ? ' ag-loc' : '') + '"' + (estLoc ? '' : ' style="background:' + bg + ';"') + '>' + (estLoc ? '\ud83d\udd11 ' : '') + esc(c.title) + '</span>' +
                        '<span class="ag-room">' + esc(roomNameById[c.room_id] || 'Sans salle') + '</span>' +
                        '</a>';
                });
                agHtml += '</div>';
            }
            agendaWrap.innerHTML = nbItems ?
                '<h2 class="ag-title">\ud83d\udddd\ufe0f \u00c0 venir \u2014 30 prochains jours</h2><div class="ag-list">' + agHtml + '</div>' :
                '<div class="empty-state" style="margin:1.5rem 0;"><p>Aucun créneau occupé dans les 30 prochains jours.</p></div>';

            // Badge sans salle
            unassignedBadge.textContent = withoutData.length;
            unassignedBadge.style.display = withoutData.length ? '' : 'none';
            }).catch(function () {
                planningWrap.innerHTML = '<div class="empty-state"><p>Erreur de chargement (serveur injoignable).</p></div>';
            });
        }

        function renderUnassigned() {
            Promise.all([
                window.ADWDatabase.listRooms().catch(function () { return []; }),
                window.ADWDatabase.formationsWithoutRoom().catch(function () { return []; })
            ]).then(function (sources) {
            var rooms = sources[0] || [];
            var without = sources[1] || [];
            unassignedList.innerHTML = without.length ? '' : '<p class="form-hint" style="padding:1rem;">Toutes les formations ont une salle. \ud83c\udf89</p>';
            var promises = without.map(function (f) {
                return window.ADWDatabase.getFormationDates(f.id).catch(function () { return []; }).then(function (dates) {
                dates = dates || [];
                var li = document.createElement('div');
                li.className = 'checkin-item';
                li.style.flexWrap = 'wrap';
                li.innerHTML =
                    '<div style="flex:1;min-width:200px;"><strong>' + esc(f.title) + '</strong>' +
                    '<div class="form-hint">' + esc(f.date_text || f.start_date || 'dates \u00e0 confirmer') + ' \u00b7 ' + dates.length + ' s\u00e9ance' + (dates.length > 1 ? 's' : '') + (dates.length ? ' (' + dates[0].slot + ')' : '') + '</div></div>' +
                    '<select class="unassigned-select" data-fid="' + esc(f.id) + '">' +
                    '<option value="">\u2014 Choisir une salle \u2014</option>' +
                    rooms.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('') +
                    '</select>';
                unassignedList.appendChild(li);
                });
            });
            return Promise.all(promises).then(function () {
            unassignedList.querySelectorAll('.unassigned-select').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    if (!sel.value) return;
                    var fid = sel.getAttribute('data-fid');
                    var roomName = sel.options[sel.selectedIndex].textContent;
                    window.ADWDatabase.getRoomConflicts(fid, sel.value).then(function (conflicts) {
                        conflicts = conflicts || [];
                        return window.ADWDatabase.setFormationRoom(fid, sel.value).then(function () { return conflicts; });
                    }).then(function (conflicts) {
                        if (window.ADWNotifications) {
                            window.ADWNotifications.push('info', '\ud83d\udcdd Formation attribu\u00e9e \u00e0 ' + roomName +
                                (conflicts.length ? ' \u2014 \u26a0\ufe0f ' + conflicts.length + ' conflit(s) de cr\u00e9neau' : ''),
                                conflicts.length ? 'warning' : 'success');
                        }
                        renderUnassigned();
                        render();
                    }).catch(function (err) { alert('Erreur : ' + err.message); });
                });
            });
            });
            }).catch(function () { unassignedList.innerHTML = '<p class="form-hint">Erreur de chargement.</p>'; });
        }

        document.getElementById('prevMonthBtn').addEventListener('click', function () {
            view.setDate(view.getDate() - 7); render();
        });
        document.getElementById('nextMonthBtn').addEventListener('click', function () {
            view.setDate(view.getDate() + 7); render();
        });
        document.getElementById('todayBtn').addEventListener('click', function () {
            view = lundiDe(new Date()); render();
        });
        document.getElementById('unassignedBtn').addEventListener('click', function () {
            renderUnassigned();
            unassignedModal.hidden = false;
        });
        document.getElementById('unassignedCloseBtn').addEventListener('click', function () { unassignedModal.hidden = true; });
        unassignedModal.addEventListener('click', function (e) { if (e.target === unassignedModal) unassignedModal.hidden = true; });

        window.ADWDatabase.init().then(function () {
            if (window.ADWNotifications) window.ADWNotifications.refresh();
            render();
            // Le créneau actuel change en cours de journée : re-render chaque minute
            setInterval(render, 60000);
        }).catch(function () {
            planningWrap.innerHTML = '<div class="empty-state"><p>Erreur de chargement de la base.</p></div>';
        });
    })();
