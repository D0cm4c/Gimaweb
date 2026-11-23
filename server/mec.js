// Gimaweb — client M.E. Calendar (atelierduweb.be), portage serveur du module mec.js de la maquette.
// Source : wp-json/wp/v2/mec-events (public, sans clé), fallback RSS, enrichissement labels
// via l'endpoint public du plugin ADW MEC API (/wp-json/adw-mec/v1/labels).
// WP_BASE surchargeable par .env (les tests fonctionnels y injectent un serveur mock).
const WP_BASE_DEFAUT = 'https://atelierduweb.be/wp-json/wp/v2';
const WP_BASE = process.env.WP_BASE || WP_BASE_DEFAUT;
const LABELS_URL = (process.env.ADW_LABELS_URL || WP_BASE.replace(/\/wp\/v2\/?$/, '/adw-mec/v1/labels'));
const RSS_URL = process.env.ADW_RSS_URL || 'https://atelierduweb.be/feed/';

export const stripHtml = (html) => String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Parse une date française : « le lundi 23 novembre », « Les 08 et 10 décembre 2026 »,
// « Les 15, 16, 22, 23 juin de 13h30 à 16h30 » (on coupe avant « de 13h »)
export function parseFrDates(texte) {
    if (!texte) return [];
    const clean = texte.replace(/\s+de\s+\d{1,2}\s?h.*$/i, '').trim();
    const months = { janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, 'décembre': 12, decembre: 12 };
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
    return resolveCategories(aVenir);
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
            if (!info) return;
            if (info.labels?.length) ev.labels = info.labels;
            if (info.price) ev.price = String(info.price);
            if (info.location) ev.location = info.location;
            if (info.organizer) ev.organizer = info.organizer;
        });
    } catch { /* plugin injoignable : silencieux, comme la maquette */ }
    return events;
}

// Chargement complet : WP REST → fallback RSS → enrichissement plugin
export async function chargerFormations() {
    let events;
    try {
        events = await fetchViaWpRest();
    } catch {
        events = await fetchViaRss();
    }
    return enrichFromPlugin(events);
}
