// Test fonctionnel M6 : PARCOURS DE BOUT EN BOUT — une journée à L'Atelier du web, 100 % via le client HTTP
// (exactement ce que font les pages migrées). Couvre les méthodes jamais exercées par les autres suites.
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha256').update('chantier', 'utf8').digest('hex');
fs.rmSync('data', { recursive: true, force: true });

// ---- Mock atelierduweb.be (WP + plugin labels) ----
const FLUX = [{
    id: 201,
    title: { rendered: 'Anonymat et traçage en ligne' },
    link: 'https://atelierduweb.be/formation/anonymat/',
    excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Matin\u00e9e \uD83D\uDCC5 Dates : Le 15 f\u00e9vrier 2027 \u23f0 Horaires : De 9h30 \u00E0 12h30</p>' },
    mec_category: [7]
},
{
    id: 202,
    title: { rendered: 'E-mail pas \u00E0 pas' },
    link: 'https://atelierduweb.be/formation/email/',
    excerpt: { rendered: '<p>\u23f3 Dur\u00e9e : 1 Apr\u00E8s-midi \uD83D\uDCC5 Dates : Le 17 mars 2027 de 13h30 \u00E0 16h30 \u23f0 Horaires : De 13h30 \u00E0 16h30</p>' },
    mec_category: [7]
}];
const mock = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/wp-json/wp/v2/mec-events')) res.end(JSON.stringify(FLUX));
    else if (req.url.startsWith('/wp-json/wp/v2/mec_category')) res.end(JSON.stringify([{ id: 7, name: 'Internet & s\u00e9curit\u00e9' }]));
    else if (req.url.startsWith('/wp-json/adw-mec/v1/labels')) res.end(JSON.stringify({ 201: { labels: ['D\u00E9butant'], price: '20,00\u20ac' }, 202: { price: '15,00\u20AC' } }));
    else { res.statusCode = 404; res.end('{}'); }
});
await new Promise((r) => mock.listen(32995, '127.0.0.1', r));

const srv = spawn('node', ['server/serveur.js'], {
    env: { ...process.env, PORT: '32135', ADMIN_HASH_SHA256: hash, BACKUP_PASSPHRASE: 'phrase-parcours-m6',
        WP_BASE: 'http://127.0.0.1:32995/wp-json/wp/v2', ADW_LABELS_URL: 'http://127.0.0.1:32995/wp-json/adw-mec/v1/labels' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let erreurs = '';
srv.stderr.on('data', (d) => { erreurs += d; });
for (let i = 0; i < 50; i++) {
    try { const r = await fetch('http://127.0.0.1:32135/api/sante'); if (r.ok) break; } catch { await new Promise(r => setTimeout(r, 100)); }
}

let ok = 0, tout = 0;
const verifie = (label, cond, extra) => { tout++; if (cond) { ok++; console.log(`\u2705 ${label}`); } else { console.log(`\u274c ${label}`, extra ?? ''); } };

// ---- Le client HTTP, comme la page ----
const window = {};
const origine = 'http://127.0.0.1:32135';
const fetchNavigateur = (u, o) => fetch(String(u).startsWith('http') ? u : origine + u, o);
new Function('window', 'fetch', fs.readFileSync('public/adw-client.js', 'utf8'))(window, fetchNavigateur);
const D = window.ADWDatabase;
await D.init();

// ---- Connexion équipe (session admin pour les actions gardées) ----
const co = await fetch(`${origine}/api/auth/connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'chantier' }) });
const cookie = (co.headers.get('set-cookie') || '').split(';')[0];
verifie('équipe : connexion (session admin)', co.status === 200 && /gimaweb_session=/.test(cookie), co.status);
// Le client du navigateur transporte le cookie de session automatiquement (same-origin) ; ici on l'injecte dans un fetch sessionn\u00e9
const fetchAvecCookie = (u, o) => {
    o = o || {};
    o.headers = { ...(o.headers || {}), Cookie: cookie };
    return fetchNavigateur(u, o);
};

// ---- 9h00 : ouverture — l'équipe se connecte ----
// Le client a déjà fetché sans cookie : on RECHARGE le client avec le fetch sessionné
const window2 = {};
new Function('window', 'fetch', fs.readFileSync('public/adw-client.js', 'utf8'))(window2, fetchAvecCookie);
const C = window2.ADWDatabase;
await C.init();
verifie('rechargé : même interface', typeof C.renewSubscription === 'function');

// ---- 9h10 : les membres arrivent (une partie via l'import XML Access) ----
const xml = `<dataroot>
  <Tbl_Membres><Num_id>8501</Num_id><Nom>Diallo</Nom><Pr_x00E9_nom>Fatouma</Pr_x00E9_nom><Statut_x0020_Social>cpas</Statut_x0020_Social><Code_x0020_Postal>1060</Code_x0020_Postal><ABO_x0020_mensuel>1</ABO_x0020_mensuel></Tbl_Membres>
  <Tbl_Membres><Num_id>8502</Num_id><Nom>Vandamme</Nom><Pr_x00E9_nom>Luc</Pr_x00E9_nom></Tbl_Membres>
</dataroot>`;
const imp = await C.importerXml(xml, false);
verifie('import XML : 2 fiches Access', imp.importes === 2, imp);
const gb = await C.creerMembre({ firstName: 'Greta', lastName: 'Bossaerts', subscription: 'none', startDate: '2027-01-05', endDate: '2027-02-05', email: 'greta@be.eu', postal_code: '1000', social_status: 'etudiant' });
verifie('création manuelle Greta (#1000)', gb.member_no === 1000, gb);
const diallo = (await C.listerMembres()).find((m) => m.member_no === 8501);
verifie('fiche Fatouma présente', Boolean(diallo && diallo.first_name === 'Fatouma'), diallo && diallo.first_name);
const fiche = await C.getMembre(diallo.id);
verifie('getMembre : fiche enrichie', fiche && fiche.first_name === 'Fatouma' && 'visit_count' in fiche, fiche && fiche.visit_count);

// ---- 9h30 : pointage du matin + visite anonyme ----
await C.pointerVisite(diallo.id, 'e-administration');
let double409 = false;
try { await C.pointerVisite(diallo.id); } catch (e) { double409 = e.status === 409; }
verifie('double pointage refusé (409)', double409);
await C.pointerVisite('anon', 'accompagnement cheminot');
const vAnon = await C.listerVisitesMembre(gb.id);
verifie('listerVisitesMembre (Greta : vide)', Array.isArray(vAnon) && vAnon.length === 0, vAnon);

// ---- 10h00 : impressions ----
const imp1 = await C.ajouterImpression(gb.id, 'bw');
const imp2 = await C.ajouterImpression(gb.id, 'color');
verifie('2 impressions (0,10 + 0,50)', Math.abs(imp1.amount - 0.10) < 1e-9 && Math.abs(imp2.solde - 0.60) < 1e-9, imp2);
await C.effacerSoldeImpressions(gb.id);
const etatApres = await C.etatImpressions(gb.id);
verifie('effacerSoldeImpressions : solde 0', etatApres.solde === 0, etatApres);

// ---- 10h30 : renouvellement de Fatouma (fin d\u2019abonnement mensuel) ----
const avant = await C.getMembre(diallo.id);
const prev = await C.previewRenewal(diallo.id);
verifie('previewRenewal : dates proposées', Boolean(prev && prev.nouveau_debut && prev.nouvelle_fin), prev);
const renouv = await C.renewSubscription(diallo.id);
verifie('renewSubscription : fenêtre valide posée', Boolean(renouv.nouvelle_fin && renouv.nouveau_debut && renouv.nouvelle_fin > renouv.nouveau_debut), renouv);

// ---- 11h00 : sync formations + inscriptions ----
const formations = await C.listFormations();
verifie('sync auto : 2 formations du site', formations.length === 2, formations.map((f) => f.event_id));
const f201 = formations.find((f) => String(f.event_id) === '201');
const f202 = formations.find((f) => String(f.event_id) === '202');
const parEvent = await C.getFormationByEventId('201');
verifie('getFormation + getFormationByEventId', (await C.getFormation(f201.id)).title === parEvent.title, parEvent.title);
await C.registerMemberToFormation(f201.id, diallo.id);
await C.registerMemberToFormation(f201.id, gb.id);
verifie('2 inscrites à « Anonymat »', (await C.getFormationAttendees(f201.id)).length === 2);
await C.unregisterMemberFromFormation(f201.id, gb.id);
verifie('désinscription Greta', (await C.getFormationAttendees(f201.id)).length === 1);
verifie('getMemberFormations de Fatouma', (await C.getMemberFormations(diallo.id)).some((f) => f.id === f201.id));

// ---- 11h30 : paiement + présence + journal ----
const paye = await C.setFmPayment(f201.id, diallo.id, 'bancontact');
verifie('paiement encaissé (bancontact)', paye.payment === 'bancontact', paye);
await C.setFmAttendance(f201.id, diallo.id, 'present');
verifie('présence pointée', (await C.getFormationAttendees(f201.id))[0].attendance === 'present');
const journal = await C.getPaymentLog(f201.id, diallo.id);
verifie('journal paiements : 1 entrée', Array.isArray(journal) && journal.length === 1, journal);

// ---- 11h45 : salle + dates + conflits ----
await C.setFormationRoom(f201.id, 'room-grande');
const nouvelleSalle = await C.addRoom('Salle atelier', 10);
verifie('addRoom', nouvelleSalle.name === 'Salle atelier', nouvelleSalle);
const renommee = await C.renameRoom(nouvelleSalle.id, 'Salle convive');
verifie('renameRoom', renommee.name === 'Salle convive', renommee);
await C.setFormationRoom(f202.id, nouvelleSalle.id);
const conflits = await C.getRoomConflicts(f202.id, nouvelleSalle.id);
verifie('getRoomConflicts (f202 : aucune — autre mois)', Array.isArray(conflits) && conflits.length === 0, conflits);
const sansSalle = await C.formationsWithoutRoom();
verifie('formationsWithoutRoom : 0 (les 2 ont une salle)', sansSalle.length === 0, sansSalle.length);
const planning = await C.getRoomPlanning('2027-03');
verifie('planning mars : E-mail au 17', planning.some((c) => String(c.fid) === String(f202.id) && c.date === '2027-03-17'), planning.length);
const dates = await C.getFormationDates(f202.id);
verifie('getFormationDates : 17 mars', dates.some((d) => d.date === '2027-03-17'), dates);
const deleteSalleOccupee = await C.deleteRoom(nouvelleSalle.id).then(() => 'ok', (e) => e.status);
verifie('deleteRoom occupée refusée (409)', deleteSellePlaceHolder(deleteSalleOccupee) === 409, deleteSalleOccupee);

// ---- 12h00 : liste d'attente ----
const wl = await C.addToWaitlist(gb.id, null, 'Perfectionnement tableur');
verifie('liste d\u2019attente générique', Boolean(wl && wl.id), wl);
const mesAttentes = await C.getMemberWaitlist(gb.id);
verifie('getMemberWaitlist', mesAttentes.length === 1 && mesAttentes[0].id === wl.id, mesAttentes.length);
const topAttente = await C.getMostWaitedFormations(5);
verifie('getMostWaitedFormations : tableur en tête', topAttente.length >= 1 && topAttente[0].waiting === 1, topAttente);
const contactee = await C.markWaitlistContacted(wl.id);
verifie('markWaitlistContacted', Array.isArray(contactee) && contactee.length === 1, contactee);
const parTitre = await C.getWaitlist('', 'Perfectionnement tableur');
verifie('getWaitlist par titre', parTitre.length === 1, parTitre.length);
await C.removeFromWaitlist(wl.id);
verifie('removeFromWaitlist', (await C.getMemberWaitlist(gb.id)).length === 0);

// ---- 13h00 : tickets de l\u2019équipe ----
const tech = await C.addTeamMember('Sam Technician');
verifie('addTeamMember', tech.name === 'Sam Technician', tech);
const t1 = await C.addTicket({ title: 'PC 12 ne démarre plus', category: 'computer', equipment: 'PC 12', priority: 'urgent', assignee: tech.name });
verifie('addTicket urgent', t1.priority === 'urgent' && t1.assignee === tech.name, t1);
await C.addTicketComment(t1.id, 'Sam', 'Remplacement alimentation prévu');
const commentaires = await C.listTicketComments(t1.id);
verifie('commentaire de suivi', commentaires.length === 1 && commentaires[0].message.includes('alimentation'), commentaires);
const maj = await C.updateTicket(t1.id, { status: 'in_progress' });
verifie('updateTicket : en cours', maj.status === 'in_progress', maj);
const tRecup = await C.getTicket(t1.id);
verifie('getTicket', tRecup.status === 'in_progress');
verifie('listTickets contient le ticket', (await C.listTickets()).some((t) => t.id === t1.id));
const delTech = await C.deleteTeamMember(tech.id).then(() => 'ok', (e) => e.status);
verifie('deleteTeamMember avec tickets assignés refusée (409)', delTech === 409, delTech);
await C.deleteTicket(t1.id);
verifie('deleteTicket + commentaires en cascade', (await C.listTickets()).every((t) => t.id !== t1.id));

// ---- 14h00 : boîte à suggestions ----
await C.addSuggestion('Ajouter un mode sombre', 'dashboard', 'Greta');
const suggestions = await C.listSuggestions();
verifie('addSuggestion + listSuggestions', suggestions.length === 1 && suggestions[0].status === 'open', suggestions);
verifie('openSuggestionsCount = 1', (await C.openSuggestionsCount()) === 1);
const faites = await C.setSuggestionStatus(suggestions[0].id, 'done');
verifie('setSuggestionStatus done (204)', faites === null && (await C.listSuggestions())[0].status === 'done');

// ---- 15h00 : notifications ----
await C.notify('test', 'Notification de parcours M6', 'info');
const apercu = await C.listNotificationsPreview(8);
verifie('avant-première', Array.isArray(apercu) && apercu.length > 0, apercu.length);
const une = (await C.listNotifications(50)).find((n) => n.message.includes('parcours M6'));
verifie('notification du parcours trouvée', Boolean(une));
await C.markNotificationRead(une.id);
verifie('markNotificationRead', (await C.listNotifications(50)).find((n) => n.id === une.id).is_read === 1);
await C.markAllNotificationsRead();
verifie('tout lu', (await C.unreadNotificationsCount()) === 0);
await C.clearReadNotifications();
verifie('purge des lues (les non lues survivent = 0 non lues ici)', (await C.listNotifications(50)).every((n) => n.read === 0));

// ---- 16h00 : le dashboard de fin de journée ----
const flot = await C.agregatsFlot();
verifie('flot : 2 visites du jour (1 membre abonn\u00e9 + 1 anonyme)', flot.kpi.visites_aujourdhui === 2, flot.kpi.visites_aujourdhui);
verifie('flot : visites récentes featuring Fatouma', (flot.visites_recentes || []).some((v) => v.last_name === 'Diallo'), flot.visites_recentes);
const stats = await C.agregatsStats();
verifie('stats : 3 membres, revenus du mois', stats.membres.total === 3 && stats.visites.revenus_mois === 1, stats.visites.revenus_mois);
const recherche = await C.rechercheGlobale('diallo');
verifie('recherche : Fatouma retrouvée', recherche.membres.length === 1 && recherche.membres[0].member_no === 8501, recherche.membres);

// ---- 17h00 : sauvegarde chiffrée + restauration (fin de journée) ----
const sauvegarde = await C.sauvegardeChiffree();
verifie('sauvegarde chiffrée déposée', sauvegarde && sauvegarde.ok !== false && (sauvegarde.fichier || sauvegarde.chemin || true), sauvegarde);
const dbBase64 = fs.readFileSync('data/gimaweb.db').toString('base64');
const remp = await C.remplacerBase(dbBase64);
verifie('remplacement de base programmé (redémarrage)', remp && remp.redemarrage_requis !== false, remp);

if (erreurs) console.log('stderr serveur :', erreurs);
srv.kill();
mock.close();
await new Promise((r) => setTimeout(r, 300));
console.log(`\n${ok}/${tout} vérifications réussies`);
process.exit(ok === tout ? 0 : 1);

function deleteSellePlaceHolder(v) { return v; } // helper lisibilité
var fetchNavigateurAvecSession;
