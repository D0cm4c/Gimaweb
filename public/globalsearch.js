(function () {
    'use strict';

    // Recherche globale — recherche dans l'app (membres, formations, suggestions)
    // Prend le relais sur les champs de recherche de topbar (id="siteSearch").
    // Dropdown avec navigation clavier (haut/bas/Entrée/Échap), résultats cliquables.

    function ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    ready(function () {
        var input = document.getElementById('siteSearch');
        if (!input || !window.ADWDatabase) return;

        input.placeholder = 'Rechercher : membre, formation…';
        input.setAttribute('autocomplete', 'off');

        var drop = document.createElement('div');
        drop.className = 'gs-dropdown';
        drop.hidden = true;
        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(drop);

        var results = [];
        var activeIndex = -1;

        function esc(s) { return window.ADWEscape.html(s); }

        function setActive(idx) {
            activeIndex = idx;
            var items = drop.querySelectorAll('.gs-item');
            items.forEach(function (el, i) { el.classList.toggle('gs-active', i === activeIndex); });
            if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].scrollIntoView({ block: 'nearest' });
        }

        function close() { drop.hidden = true; activeIndex = -1; results = []; }

        function go(item) {
            if (!item) return;
            location.href = item.url;
        }

        function search(q) {
            q = (q || '').trim();
            if (!q || q.length < 2) { close(); return; }
            results = [];
            // Gimawec : la recherche vit côté serveur (GET /api/recherche)
            window.ADWDatabase.rechercheGlobale(q).then(function (r) {
                (r.membres || []).forEach(function (m) {
                    results.push({
                        icon: '👥', label: m.first_name + ' ' + m.last_name + (m.member_no ? ' (#' + m.member_no + ')' : ''),
                        hint: 'membre', url: 'membre.html?id=' + encodeURIComponent(m.id)
                    });
                });
                (r.formations || []).forEach(function (f) {
                    results.push({
                        icon: '🎓', label: f.title, hint: 'formation',
                        url: 'formation.html?id=' + encodeURIComponent(f.event_id)
                    });
                });
                (r.suggestions || []).forEach(function (sg) {
                    results.push({
                        icon: '💡', label: (sg.message || '').slice(0, 60),
                        hint: 'à faire', url: 'suggestions.html'
                    });
                });
                (r.tickets || []).forEach(function (t) {
                    results.push({
                        icon: '🛠', label: t.title, hint: 'incident',
                        url: 'ticket.html?id=' + encodeURIComponent(t.id)
                    });
                });
                _afficher();
            }).catch(function () {
                drop.innerHTML = '<div class="gs-empty">Recherche indisponible (serveur injoignable).</div>';
                drop.hidden = false;
            });
        }

        function _afficher() {
            if (!results.length) {
                drop.innerHTML = '<div class="gs-empty">Aucun résultat dans l\u2019app.</div>';
                drop.hidden = false;
                return;
            }
            var html = '';
            results.forEach(function (r, i) {
                html += '<div class="gs-item" data-idx="' + i + '">' +
                    '<span class="gs-ico">' + r.icon + '</span>' +
                    '<span class="gs-label">' + esc(r.label) + '</span>' +
                    '<span class="gs-hint">' + esc(r.hint) + '</span>' +
                    '</div>';
            });
            drop.innerHTML = html;
            drop.hidden = false;
            setActive(0);
        }

        input.addEventListener('input', function () { search(input.value); });
        input.addEventListener('focus', function () { if (input.value.trim().length >= 2) search(input.value); });
        input.addEventListener('keydown', function (e) {
            if (drop.hidden || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(results[activeIndex >= 0 ? activeIndex : 0]); }
            else if (e.key === 'Escape') { close(); }
        });
        drop.addEventListener('click', function (e) {
            var item = e.target.closest('.gs-item');
            if (item) go(results[parseInt(item.getAttribute('data-idx'), 10)]);
        });
        document.addEventListener('click', function (e) {
            if (!input.parentNode.contains(e.target)) close();
        });
    });
})();
