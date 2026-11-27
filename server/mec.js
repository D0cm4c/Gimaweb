// Gimaweb — client M.E. Calendar (atelierduweb.be), portage serveur du module mec.js de la maquette.
// Source : wp-json/wp/v2/mec-events (public, sans clé), fallback RSS, enrichissement labels
// via l'endpoint public du plugin ADW MEC API (/wp-json/adw-mec/v1/labels).
// WP_BASE surchargeable par .env (les tests fonctionnels y injectent un serveur mock).
const WP_BASE_DEFAUT = 'https://atelierduweb.be/wp-json/wp/v2';
const WP_BASE = process.env.WP_BASE || WP_BASE_DEFAUT;
const LABELS_URL = (process.env.ADW_LABELS_URL || WP_BASE.replace(/\/wp\/v2\/?$/, '/adw-mec/v1/labels'));
const RSS_URL = process.env.ADW_RSS_URL || 'https://atelierduweb.be/feed/';
// v1.5.12 : API RESTful OFFICIELLE de M.E. Calendar (issue #52) — auth par header « mec-token »
// (rien d'autre ne marche : ni ?key=, ni Bearer, ni X-API-KEY). La clé vient de la
// table settings (posée via la page Paramètres) ou de MEC_API_KEY dans .env.
const MEC_API_BASE = process.env.MEC_API_BASE || 'https://atelierduweb.be/wp-json/mec/v1.0';

// Décodeur d'entités HTML (WP renvoie titres et extraits encodés : &amp; &rsquo; &#8211; «…).
// Correctif v1.4.7 : l'ancien stripHtml écrasait les entités numériques par une ESPACE
// et ignorait la plupart des entités nommées — guillemets, apostrophes, tirets cassés.
const ENTITES_NOMMEES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
    laquo: '«', raquo: '»', ndash: '–', mdash: '—',
    eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ccedil: 'ç',
    ugrave: 'ù', ocirc: 'ô', icirc: 'î', acirc: 'â', uuml: 'ü', ouml: 'ö', auml: 'ä'
};
export function decodeEntites(txt) {
    return String(txt || '')
        .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
        .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ' '; } })
        .replace(/&([a-zA-Z]+);/g, (m, n) => (Object.prototype.hasOwnProperty.call(ENTITES_NOMMEES, n.toLowerCase()) ? ENTITES_NOMMEES[n.toLowerCase()] : m));
}
export const stripHtml = (html) => decodeEntites(String(html || '')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

// Parse une date française : « le lundi 23 novembre », « Les 08 et 10 décembre 2026 »,
// « Les 15, 16, 22, 23 juin de 13h30 à 16h30 » (on coupe avant « de 13h »)
export function parseFrDates(texte) {
    if (!texte) return [];
    let clean = texte.replace(/\s+de\s+\d{1,2}\s?h.*$/i, '').trim();
    const months = { janvier: 1, 'f\u00e9vrier': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, 'ao\u00fbt': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'd\u00e9cembre': 12, decembre: 12 };
    // Plage « du 27 juillet au 08 ao\u00fbt inclus » (v1.4.8) : on \u00e9num\u00e8re chaque jour ferm\u00e9
    // Formes admises : « du 27 juillet au 08 ao\u00fbt » ET « du 14 au 17 ao\u00fbt 2027 » (mois apr\u00e8s la 2e date)
    // (v1.4.9) la plage peut vivre APRES le bloc horaires « De 9h à … » que le clean
    // tronque — on la cherche donc aussi sur le texte brut.
    let pl = clean.toLowerCase().match(/du\s+(\d{1,2})(?:\s+([a-z\u00e9\u00fb]+))?(?:\s+(\d{4}))?\s+(?:au|jusqu(?:'|\u2019)?au)\s+(\d{1,2})(?:\s+([a-z\u00e9\u00fb]+))?(?:\s+(\d{4}))?/);
    if (!pl) pl = texte.toLowerCase().match(/du\s+(\d{1,2})(?:\s+([a-z\u00e9\u00fb]+))?(?:\s+(\d{4}))?\s+(?:au|jusqu(?:'|\u2019)?au)\s+(\d{1,2})(?:\s+([a-z\u00e9\u00fb]+))?(?:\s+(\d{4}))?/);
    if (pl) {
        const moisDep = months[pl[2]] || months[pl[5]] || 0;
        const moisFin = months[pl[5]] || moisDep;
        if (moisDep && moisFin) {
            // une seule anne\u00e9e mentionn\u00e9e ? elle vaut pour les deux bornes
            let anneeDep = pl[3] ? parseInt(pl[3], 10) : (pl[6] ? parseInt(pl[6], 10) : new Date().getFullYear());
            let anneeFin = pl[6] ? parseInt(pl[6], 10) : anneeDep;
            if (moisFin < moisDep && anneeFin === anneeDep) anneeFin += 1;
            const dep = new Date(Date.UTC(anneeDep, moisDep - 1, parseInt(pl[1], 10)));
            const fin = new Date(Date.UTC(anneeFin, moisFin - 1, parseInt(pl[4], 10)));
            const jours = [];
            for (let d = new Date(dep); d <= fin && jours.length < 60; d.setUTCDate(d.getUTCDate() + 1)) {
                jours.push(d.toISOString().slice(0, 10));
            }
            if (jours.length) return jours;
        }
    }
    const m = clean.toLowerCase().match(/(\d{1,2}(?:\s*(?:,|et|&)\s*\d{1,2})*)\s+([a-zéû]+)\s*(\d{4})?/);
    if (!m) return [];
    const mois = months[m[2]];
    if (!mois) return [];
    const annee = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    const jours = m[1].match(/\d{1,2}/g) || [];
    return jours.map((j) => `${annee}-${String(mois).padStart(2, '0')}-${String(parseInt(j, 10)).padStart(2, '0')}`);
}

// Créneau : Matin (AM) si heure de début < 12h, sinon Après-midi (PM)
export function parseSlot(texteHeure) {
    const m = (texteHeure || '').match(/(\d{1,2})\s?h/i);
    if (!m) return 'AM';
    return parseInt(m[1], 10) < 12 ? 'AM' : 'PM';
}

// Extrait durée / dates / horaires depuis l'extrait structuré du site
// Format : « ⏳ Durée : 1 Matinée 📅 Dates : le lundi 23 novembre ⏰ Horaires : De 13h30 à 16h30 … »
export function parseExcerptFields(texte) {
    const out = { duration: '', dateText: '', timeText: '', startDate: '', description: '' };
    if (!texte) return out;
    const clean = texte.replace(/Lire la suite.*$/, '').trim();
    const mDur = clean.match(/Dur[ée]e\s*:\s*([^📅⏰]+)/);
    if (mDur) out.duration = mDur[1].trim();
    const mDate = clean.match(/Dates?\s*:\s*([^⏰]+)/);
    if (mDate) out.dateText = mDate[1].trim();
    const mTime = clean.match(/(?:[Dd]e\s*)?(\d{1,2}\s?h\s?\d{0,2})\s*[àa\-–]\s*(\d{1,2}\s?h\s?\d{0,2})/);
    if (mTime) out.timeText = `De ${mTime[1].replace(/\s/g, '')} à ${mTime[2].replace(/\s/g, '')}`;
    if (!out.duration) {
        const mDurAlt = clean.match(/(?:^|\s)(\d\s*(?:demie|matin[ée]e|apr[èe]s-midi|journ[ée]e|soir[ée]e|heure[s]?)[^📅⏰\n]{0,20})/i);
        if (mDurAlt) out.duration = mDurAlt[1].trim().replace(/\s+/g, ' ');
    }
    if (!out.dateText) {
        const mDateAlt = clean.match(/(?:le |les )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}(?:\s*(?:et|,|-)\s*\d{1,2})*\s+[a-zéû\d]+\s*(?:\d{4})?/i);
        if (mDateAlt) out.dateText = mDateAlt[0].trim();
    }
    out.startDate = parseFrDates(out.dateText)[0] || '';
    let desc = clean;
    if (mDur) desc = desc.replace(mDur[0], '');
    if (mDate) desc = desc.replace(mDate[0], '');
    if (out.timeText) desc = desc.replace(`Horaires : ${out.timeText}`, '').replace(/Horaires?\s*:\s*/, '');
    desc = desc.replace(/[⏳📅⏰☀]/g, ' ').replace(/\s+/g, ' ').trim();
    out.description = desc;
    return out;
}

// Source 1 : API REST publique WordPress (fetch paginé côté serveur)
async function fetchViaWpRest() {
    const events = [];
    const page = async (no) => {
        const url = `${WP_BASE}/mec-events?per_page=100&page=${no}&_fields=id,date,modified,title,link,excerpt,mec_category`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`wp_http_${res.status}`);
        const items = await res.json();
        if (!Array.isArray(items) || !items.length) return events;
        for (const item of items) {
            if (!item.link || item.link.includes('__trashed')) continue;
            const excerptText = stripHtml(item.excerpt?.rendered);
            const fields = parseExcerptFields(excerptText);
            let evDates = parseFrDates(fields.dateText);
            if (!evDates.length && fields.startDate) evDates = [fields.startDate];
            // v1.4.9 : si le champ « Dates » n'a qu'une seule date mais que la description
            // donne la période complète (« ferme ses portes du 27 juillet au 08 août inclus »),
            // on prend la plage de la description.
            if (evDates.length <= 1) {
                const plage = parseFrDates(excerptText);
                if (plage.length > 1) evDates = plage;
            }
            events.push({
                id: item.id,
                title: stripHtml(item.title?.rendered),
                url: item.link,
                excerpt: fields.description,
                duration: fields.duration,
                startDate: evDates[0] || '',
                dates: evDates,
                slot: parseSlot(fields.timeText),
                dateText: fields.dateText,
                timeLabel: fields.timeText,
                categories: item.mec_category || []
            });
        }
        if (items.length === 100) return page(no + 1);
        return events;
    };
    const evs = await page(1);
    const todayStr = new Date().toISOString().slice(0, 10);
    const aVenir = evs.filter((ev) => ev.startDate && ev.startDate >= todayStr);
    // v1.4.8 : garder aussi les 20 dernières formations PASSÉES (le filtre
    // « Toutes » de formations.html peut enfin montrer l'historique récent)
    const passees = evs.filter((ev) => ev.startDate && ev.startDate < todayStr)
        .sort((x, y) => (y.startDate < x.startDate ? -1 : y.startDate > x.startDate ? 1 : 0))
        .slice(0, 20);
    return resolveCategories(aVenir.concat(passees));
}

// Résout les IDs de catégories en noms (jamais d'ID numérique en base — le leurre historique de la maquette)
async function resolveCategories(events) {
    const needed = new Set();
    events.forEach((ev) => (ev.categories || []).forEach((id) => needed.add(id)));
    if (!needed.size) return events;
    try {
        const res = await fetch(`${WP_BASE}/mec_category?per_page=100&_fields=id,name`, { headers: { Accept: 'application/json' } });
        const terms = res.ok ? await res.json() : [];
        const map = {};
        terms.forEach((t) => { map[t.id] = t.name; });
        events.forEach((ev) => {
            ev.categories = (ev.categories || []).map((id) => map[id] || null).filter(Boolean);
        });
    } catch {
        events.forEach((ev) => {
            ev.categories = (ev.categories || []).filter((c) => !/^\d+$/.test(String(c)));
        });
    }
    return events;
}

// Source 2 (fallback) : flux RSS du site — parsing regex (pas de DOMParser côté serveur)
async function fetchViaRss() {
    const res = await fetch(RSS_URL, { headers: { Accept: 'application/rss+xml' } });
    if (!res.ok) throw new Error(`rss_http_${res.status}`);
    const xml = await res.text();
    const events = [];
    for (const bloc of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
        const get = (tag) => {
            const m = bloc.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
            return m ? stripHtml(m[1]) : '';
        };
        const link = get('link');
        if (!link.includes('/formation/')) continue;
        const excerptComplet = get('description');
        const apres = (mot, stops) => {
            const m = excerptComplet.match(new RegExp(`${mot}[\\s:]*(.*?)(?=${stops}|$)`, 'i'));
            return m ? m[1].replace(/\s+/g, ' ').trim() : '';
        };
        const labels = apres('Labels', 'Lieu|Catégorie|Organisateur');
        events.push({
            id: get('guid') || link,
            title: get('title'),
            url: link,
            excerpt: excerptComplet.split('Lire la suite')[0].trim(),
            startDate: '',
            timeLabel: '',
            categories: [],
            labels: labels ? labels.split(',').map((s) => s.trim()).filter(Boolean) : [],
            price: apres('Tarif', 'Labels|Lieu').replace(/[^0-9,.]/g, '').replace(',', '.'),
            location: apres('Lieu', 'Catégorie|Organisateur'),
            organizer: apres('Organisateur', 'Email|Site|Catégorie')
        });
    }
    return events;
}

// Enrichissement labels/tarif/lieu/organisateur via le plugin ADW MEC API (endpoint public)
async function enrichFromPlugin(events) {
    try {
        const res = await fetch(LABELS_URL, { headers: { Accept: 'application/json' } });
        if (!res.ok) return events;
        const data = await res.json();
        if (!data || typeof data !== 'object') return events;
        (events || []).forEach((ev) => {
            const info = data[String(ev.id)];
            if (!info || ev._mec) return; // v1.5.13 : l'API MEC est prioritaire, le plugin ne comble que le vide
            if (info.labels?.length) ev.labels = info.labels;
            if (info.price) ev.price = String(info.price);
            if (info.location) ev.location = info.location;
            if (info.organizer) ev.organizer = info.organizer;
        });
    } catch { /* plugin injoignable : silencieux, comme la maquette */ }
    return events;
}

// ---- v1.5.12/1.5.13 : source M.E. Calendar (API officielle, si clé présente) ----
// GET /events → racine « events » indexée par date de début, items {ID, date, data:{…}}
//   (audit 27 nov. 2026 : docs/AUDIT-API-MEC.md — la pagination du plugin est ignorée,
//    UN SEUL GET suffit ; has_more_events boucle à l'infini sur le même payload)
// data contient : title, content, permalink, meta:{mec_cost, mec_location_id, mec_organizer_id,
//   mec_allday…}, mec:{days}, time, tickets, categories, labels, locations, organizers, color.
// GET /events/:id/next-occurrences → occurrences FUTURES {start:{date, ampm}, allday, past}
//   les dates PASSÉES vivent dans data.mec.days (liste complète) : on fusionne les deux.
async function fetchViaApiMec(cle) {
    if (!cle) return null;
    const entetes = { 'mec-token': cle, Accept: 'application/json' };
    const res = await fetch(`${MEC_API_BASE}/events`, { headers: entetes });
    if (!res.ok) throw new Error(`mec_api_http_${res.status}`);
    const data = await res.json();
    const parId = {};
    const premierDe = (obj) => {
        const v = Object.values(obj || {});
        return v.length ? v[0] : null;
    };
    for (const [dateCle, items] of Object.entries(data.events || {})) {
        for (const it of (items || [])) {
            const id = String(it.ID ?? it.data?.ID ?? '');
            if (!id) continue;
            const d = it.data || {};
            const loc = premierDe(d.locations);
            const org = premierDe(d.organizers);
            const cats = Object.values(d.categories || {}).map((c) => c.name).filter(Boolean);
            // v1.5.13 (décision porteur) : les fermetures se détectent par CATÉGORIE
            // uniquement — les labels MEC ne servent qu'à la déco du site web.
            const ev = parId[id] = parId[id] || {
                id,
                title: stripHtml(d.title || ''),
                excerpt: stripHtml(d.content || '').slice(0, 400),
                dates: new Set(),
                slot: '',
                startDate: dateCle,
                url: d.permalink || '',
                categories: cats,
                labels: Object.values(d.labels || {}).map((l) => l.name).filter(Boolean),
                price: (d.meta && d.meta.mec_cost !== undefined && String(d.meta.mec_cost).trim() !== '') ? String(d.meta.mec_cost).trim() : '',
                location: loc ? loc.name : '',
                organizer: org ? org.name : '',
                timeLabel: (d.time && d.time.start ? String(d.time.start) : '') + (d.time && d.time.end ? ' – ' + d.time.end : ''),
                allday: String((d.meta && d.meta.mec_allday) || '0') === '1',
                mecDays: (d.mec && d.mec.days) || ''
            };
            if (!ev.mecDays && d.mec && d.mec.days) ev.mecDays = d.mec.days;
            if (!/\d{4}-\d{2}-\d{2}/.test(ev.startDate) || dateCle < ev.startDate) ev.startDate = dateCle;
            if (dateCle) ev.dates.add(dateCle);
            // créneau depuis l'occurrence de l'index (ampm local, zéro piège de fuseau)
            const ampm = it.date && it.date.start && String(it.date.start.ampm).toUpperCase();
            if (ampm === 'PM') ev.creneauPM = true; else ev.creneauAM = true;
        }
    }
    // Séances COMPLÈTES : next-occurrences (futures, exactes) ∪ mec.days (y compris passées)
    // Format mec.days : « 2026-11-10:2026-11-10:09-30-AM:12-30-PM,2026-11-17:… »
    for (const ev of Object.values(parId)) {
        const dates = new Set(ev.dates);
        const creneaux = new Set();
        if (ev.creneauAM) creneaux.add('AM');
        if (ev.creneauPM) creneaux.add('PM');
        const parseJoursMec = (days) => {
            for (const bloc of String(days || '').split(',')) {
                const m = bloc.trim().match(/^(\d{4}-\d{2}-\d{2}):\d{4}-\d{2}-\d{2}:(\d{2})-(\d{2})-(AM|PM):(\d{2})-(\d{2})-(AM|PM)$/);
                if (!m) continue;
                dates.add(m[1]);
                creneaux.add(m[4] === 'PM' ? 'PM' : 'AM');
                creneaux.add(m[7] === 'PM' ? 'PM' : 'AM');
            }
        };
        try {
            const r = await fetch(`${MEC_API_BASE}/events/${ev.id}/next-occurrences`, { headers: entetes });
            if (r.ok) {
                const occs = (await r.json()).occurrences || [];
                for (const o of occs) {
                    if (o && Number(o.past) === 1) continue;
                    const d = o?.start?.date;
                    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
                    dates.add(d);
                    if (String(o.allday) === '1') { creneaux.add('AM'); creneaux.add('PM'); }
                    else creneaux.add(String(o.start?.ampm).toUpperCase() === 'PM' ? 'PM' : 'AM');
                }
            }
        } catch { /* occurrences inaccessibles : on garde l'index + mec.days */ }
        // mec.days : injecté depuis l'index initial (stocké sur le 1er item vu)
        if (ev.mecDays) parseJoursMec(ev.mecDays);
        if (dates.size) {
            ev.dates = dates;
            // convention existante : un créneau par formation ; allday → AM
            ev.slot = ev.allday || creneaux.has('AM') ? 'AM' : 'PM';
        }
    }
    return Object.values(parId).map((ev) => {
        const { creneauAM, creneauPM, mecDays, allday, ...propre } = ev;
        return { ...propre, dates: [...ev.dates].sort() };
    });
}

// Chargement complet : WP REST → fallback RSS → enrichissement plugin
// v1.5.13 (audit docs/AUDIT-API-MEC.md) : si une clé MEC est fournie, l'API officielle
// est PRIORITAIRE sur TOUTES les infos — dates (occurrences ∪ mec.days, y compris passées),
// tarif (meta.mec_cost), lieu (locations[id].name), organisateur (organizers[id].name),
// catégories, labels, permalien. Le wp-json public ne sert plus que de secours pour les
// champs que l'API MEC ne fournit pas (durée, date_text) et pour les événements absents
// de l'index MEC (fenêtre future uniquement). Les entités HTML sont décodées (stripHtml).
export async function chargerFormations({ cleMec = '' } = {}) {
    let sourceMec = false;
    let apiEvents = null;
    if (cleMec) {
        try { apiEvents = await fetchViaApiMec(cleMec); sourceMec = apiEvents !== null; }
        catch { /* clé refusée / site injoignable : repli silencieux sur le canal public */ }
    }
    let events;
    try {
        events = await fetchViaWpRest();
    } catch {
        events = await fetchViaRss();
    }
    if (apiEvents && apiEvents.length) {
        const parId = new Map(apiEvents.map((e) => [String(e.id), e]));
        const vus = new Set();
        events = events.map((ev) => {
            const api = parId.get(String(ev.id));
            if (!api) return ev;
            vus.add(String(ev.id));
            vus.add(String(ev.id));
            return {
                ...ev,
                _mec: true,
                title: api.title || ev.title,
                url: api.url || ev.url,
                excerpt: api.excerpt || ev.excerpt,
                dates: api.dates.length ? api.dates : ev.dates,
                startDate: api.dates.length ? api.dates[0] : ev.startDate,
                slot: api.slot || ev.slot,
                timeLabel: api.timeLabel || ev.timeLabel,
                price: api.price !== '' && api.price !== undefined ? api.price : ev.price,
                location: api.location || ev.location,
                organizer: api.organizer || ev.organizer,
                categories: (api.categories && api.categories.length) ? api.categories : ev.categories,
                labels: (api.labels && api.labels.length) ? api.labels : ev.labels
            };
        });
        // Événements présents dans l'API MEC mais absents du flux wp-json : ajoutés tels quels
        for (const api of apiEvents) {
            if (vus.has(String(api.id))) continue;
            events.push({
                _mec: true,
                id: api.id, title: api.title, url: api.url, excerpt: api.excerpt,
                duration: '', startDate: api.dates[0] || '', dates: api.dates, slot: api.slot || 'AM',
                dateText: '', timeLabel: api.timeLabel || '',
                categories: api.categories || [], labels: api.labels || [],
                price: api.price || '', location: api.location || '', organizer: api.organizer || ''
            });
        }
    }
    const resultat = await enrichFromPlugin(events);
    resultat.sourceMec = sourceMec;
    return resultat;
}
