#!/usr/bin/env node
// Audit de l'API M.E. Calendar — dump le plus complet possible.
// Usage : node tools/audit-mec-api.js <cle> [base]
// Écrit le dump complet dans .vibe/mec-audit/ (JSON par endpoint + résumé lisible).

const fs = require('fs');
const path = require('path');

const cle = process.argv[2];
if (!cle) {
  console.error('Usage : node tools/audit-mec-api.js <cle> [base]');
  process.exit(1);
}
const BASE = process.argv[3] || 'https://atelierduweb.be/wp-json/mec/v1.0';
const OUT = path.join(process.cwd(), '.vibe', 'mec-audit');
fs.mkdirSync(OUT, { recursive: true });

const HEADERS = { 'mec-token': cle, Accept: 'application/json' };

async function req(nom, url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: HEADERS });
    const ms = Date.now() - t0;
    const texte = await r.text();
    let json = null;
    try { json = JSON.parse(texte); } catch (_) {}
    console.log(`${nom} -> HTTP ${r.status} (${ms} ms, ${texte.length} octets)`);
    fs.writeFileSync(path.join(OUT, nom.replace(/[^a-z0-9._-]/gi, '_') + '.json'), texte);
    return { status: r.status, ms, json, texte };
  } catch (e) {
    console.log(`${nom} -> ERREUR RESEAU : ${e.message}`);
    return { status: 0, erreur: e.message };
  }
}

function apercu(v, n = 220) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

(async () => {
  console.log(`Audit API MEC — base : ${BASE}`);

  // 1) /events — la racine (PAGINATION suivie)
  const tous = {};
  let page = await req('events', `${BASE}/events`);
  let gardes = 0;
  while (page.json && page.json.events && gardes < 20) {
    Object.assign(tous, page.json.events);
    const pg = page.json.pagination || {};
    if (!pg.has_more_events) { console.log(`[pagination] fin (${pg.found || '?'} evenements trouves)`); break; }
    gardes++;
    const url = `${BASE}/events?start=${encodeURIComponent(pg.next_date)}&offset=${pg.next_offset}`;
    console.log(`[pagination] page suivante : ${url}`);
    page = await req(`events-p${gardes}`, url);
  }
  const resume = {};
  for (const [dt, arr] of Object.entries(tous)) {
    for (const ev of (Array.isArray(arr) ? arr : [arr])) {
      resume[ev.ID] = ev;
    }
  }
  const ids = Object.keys(resume).map(Number);
  console.log(`\n[events total] ${ids.length} IDs uniques`);
  const eventsJson = { resume };
  if (true) {
    const d = { events: tous };
    const events = { json: { ...page.json, events: tous } };

    if (true) {
      const dates = Object.keys(tous);
      console.log(`\n[events] ${dates.length} cles de date : ${apercu(dates.join(', '))}`);
      const premier = tous[dates[0]] && (Array.isArray(tous[dates[0]]) ? tous[dates[0]][0] : tous[dates[0]]);
      if (premier) {
        console.log('\n[structure item event]');
        console.log(JSON.stringify(premier, null, 2).slice(0, 4000));
      }
      console.log('[resume par ID] :', ids.sort((a,b)=>a-b).join(', '));
      // DUMP: pour CHAQUE evenement, extraire les champs utiles a la sync
      console.log('\n[champs utiles par evenement]');
      for (const id of ids.sort((a,b)=>a-b)) {
        const ev = resume[id];
        const d1 = ev.data || {};
        const meta = d1.meta || {};
        console.log(JSON.stringify({
          ID: id, title: d1.title,
          date_occurrence: ev.date && ev.date.start && ev.date.start.date,
          ampm: ev.date && ev.date.start && ev.date.start.ampm,
          allday: meta.mec_allday,
          location_id: meta.mec_location_id, organizer_id: meta.mec_organizer_id,
          cost: meta.mec_cost,
          mec_days: d1.mec && d1.mec.days ? d1.mec.days.slice(0,200) : null,
          labels: Object.values(d1.labels||{}).map(l=>l.name),
          categories: Object.values(d1.categories||{}).map(c=>c.name),
          time: d1.time && d1.time.start, permalink: d1.permalink,
          tickets: Object.values(d1.tickets||{}).map(t=>({name:t.name,price:t.price}))
        }));
      }

      // 2) next-occurrences pour chaque ID (40 max)
      const liste = ids.sort((a,b)=>a-b).slice(0, 40);
      console.log(`\n[next-occurrences] pour ${liste.length} evenements…`);
      for (const id of liste) {
        const occ = await req(`occ-${id}`, `${BASE}/events/${id}/next-occurrences`);
        if (occ.json) console.log(`  ${id} : ${apercu(occ.json)}`);
      }

      // 3) Endpoints de config annexes
      for (const ep of ['config/custom-fields', 'config/locations', 'config/organizers', 'config/categories', 'config/labels', 'config/payment-gateways']) {
        const r = await req(ep, `${BASE}/${ep}`);
        if (r.json) console.log(`  ${ep} : ${apercu(r.json)}`);
      }

      // 4) Un event seul en direct
      if (liste.length) {
        await req(`event-${liste[0]}`, `${BASE}/events/${liste[0]}`);
      }
    } else {
      console.log('[events] structure inattendue :', apercu(events.json, 1500));
    }
  } else {
    console.log('[events] pas de JSON exploitable :', apercu(events.texte, 600));
  }

  // 5) Canal public wp-json (comparaison fusion)
  console.log('\n--- Canal public wp-json (sans cle) ---');
  const wp = await fetch(`${process.env.WP_BASE || 'https://atelierduweb.be'}/wp-json/wp/v2/mec-events?per_page=5`, { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(e => ({ erreur: e.message }));
  if (Array.isArray(wp)) {
    console.log(`wp-json : ${wp.length} evenements publics`);
    if (wp[0]) {
      console.log('[structure event public]');
      console.log(JSON.stringify(wp[0], null, 2).slice(0, 3000));
    }
  } else {
    console.log('wp-json :', apercu(wp));
  }

  console.log(`\nDump complet ecrit dans ${OUT}`);
})();
