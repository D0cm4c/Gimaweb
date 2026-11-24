// Gimaweb — Import XML de l'ancienne base Access (membres), portage serveur de import.js (maquette).
// Aucune dépendance : petit parseur XML dédié à la structure plate Access (records > champs texte).
const STATUS_MAP = {
    'actiris': 'actiris',
    'orbem': 'cpas',
    'etudiant': 'etudiant',
    'etudiant(e)': 'etudiant',
    'etudiante': 'etudiant',
    'cpas': 'cpas',
    'employe': 'travailleur',
    'employe autre': 'travailleur',
    'employe saint gilles': 'travailleur',
    'travailleur/employe': 'travailleur',
    'seniors': 'pensionne',
    'senior': 'pensionne',
    'mutuelle': 'mutuelle',
    'pensionne': 'pensionne',
    'pensionnee': 'pensionne',
    'seniors/pensionnes': 'pensionne',
    'enfant': 'enfant',
    'interim': 'interim'
};
const FIELD = {
    numId: 'Num_id',
    nom: 'Nom',
    prenom: 'Prénom',
    adresse: 'Adresse',
    cp: 'Code Postal',
    naissance: 'Année de naissance',
    sexe: 'Sexe',
    tel: 'N° Tél\u00e9phone (GSM)',
    statut: 'Statut Social',
    debut: 'Date début Abonnement',
    fin: 'Date fin Abonnement',
    email: 'Adresse E Mail',
    aboMensuel: 'ABO mensuel',
    aboAnnuel: 'ABO annuel',
    aboAnnuelCPAS: 'ABO annuel CPAS'
};
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// ---- Mini-parseur XML (structure plate : <racine><record><Champ>valeur</Champ>...</record></racine>) ----
const decoderTag = (tag) => tag.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const decodeEntites = (s) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const parserXml = (text) => {
    if (typeof text !== 'string' || !text.trim()) throw new Error('XML vide.');
    if (!/<[a-zA-Z_]/.test(text)) throw new Error('XML invalide.');
    const racine = { tag: '#racine', enfants: [], texte: '' };
    const pile = [racine];
    const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([^\s>]+)\s*>|<([^\s>\/]+)((?:\s[^>]*)?)\/>|<([^\s>\/]+)((?:\s[^>]*)?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m[1] !== undefined) { // fermeture
            const noeud = pile.pop();
            if (!noeud || noeud.tag !== m[1]) throw new Error('XML invalide (balises déséquilibrées).');
            continue;
        }
        if (m[2] !== undefined || m[4] !== undefined) { // ouverture (auto-fermée ou non)
            const tag = m[2] !== undefined ? m[2] : m[4];
            const noeud = { tag, enfants: [], texte: '' };
            pile[pile.length - 1].enfants.push(noeud);
            if (m[2] === undefined) pile.push(noeud);
            continue;
        }
        if (m[6] !== undefined && pile.length) {
            pile[pile.length - 1].texte += m[6];
        }
    }
    if (pile.length !== 1) throw new Error('XML invalide (balises non fermées).');
    return racine;
};

const normaliserEspaces = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const nettoyerTexte = (v) => {
    const s = normaliserEspaces(v);
    return (!s || /^vide$/i.test(s)) ? '' : s;
};
const champsRecord = (record) => {
    const map = {};
    for (const enfant of record.enfants) map[decoderTag(enfant.tag)] = enfant.texte;
    return map;
};
const mapperGenre = (v) => {
    const s = normaliserEspaces(v).toLowerCase();
    if (s === 'femme' || s === 'f') return 'F';
    if (s === 'homme' || s === 'm' || s === 'masculin' || s === 'h') return 'M';
    return 'X';
};
const mapperStatut = (v) => {
    let s = normaliserEspaces(v).toLowerCase()
        .replace(/[éèê]/g, 'e').replace(/ç/g, 'c');
    return STATUS_MAP[s] || '';
};
const parserDate = (v) => {
    if (!v) return null;
    const s = normaliserEspaces(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (m) {
        const j = m[1].padStart(2, '0');
        const mois = m[2].padStart(2, '0');
        const a = m[3].length === 2 ? (Number(m[3]) > 70 ? '19' + m[3] : '20' + m[3]) : m[3];
        return `${a}-${mois}-${j}`;
    }
    return null;
};
const nettoyerEmail = (v) => {
    let s = normaliserEspaces(v).split('#')[0].trim();
    const m = s.match(EMAIL_RE);
    return m ? m[0] : '';
};
const calculerAge = (anneeNaissance) => {
    const y = parseInt(anneeNaissance, 10);
    if (!y || y < 1900 || y > 2100) return null;
    const age = new Date().getFullYear() - y;
    return (age > 0 && age < 120) ? age : null;
};
const estVrai = (v) => {
    const s = normaliserEspaces(v);
    return s === '-1' || s === '1' || /^(true|vrai)$/i.test(s);
};

// ---- Parsing métier : texte XML -> fiches membres (mêmes règles que la maquette) ----
export const parserXmlMembres = (texte) => {
    const documentRacine = parserXml(texte);
    // L'élément racine du document (ex. <dataroot>) porte les fiches : documentElement.children, comme la maquette
    const records = documentRacine.enfants.length === 1 && documentRacine.enfants[0].tag.toLowerCase() !== 'tbl_membres'
        ? (documentRacine.enfants[0].enfants || [])
        : documentRacine.enfants;
    const membres = [];
    const avertissements = { non_mappe_statut: 0, email_illisible: 0, date_fin_invalide: 0 };
    for (const record of records) {
        const f = champsRecord(record);
        const numId = parseInt(f[FIELD.numId], 10);
        const lastName = nettoyerTexte(f[FIELD.nom]);
        const firstName = nettoyerTexte(f[FIELD.prenom]);
        if (!numId || (!lastName && !firstName)) continue;

        const mensuel = estVrai(f[FIELD.aboMensuel]);
        const annuel = estVrai(f[FIELD.aboAnnuel]) || estVrai(f[FIELD.aboAnnuelCPAS]);
        const subscription = mensuel ? 'monthly' : (annuel ? 'yearly' : 'none');

        const statutBrut = f[FIELD.statut];
        const status = mapperStatut(statutBrut);
        if (!status && statutBrut) avertissements.non_mappe_statut++;

        const emailBrut = nettoyerTexte(f[FIELD.email]);
        const email = nettoyerEmail(emailBrut);
        if (emailBrut && !email) avertissements.email_illisible++;

        const finBrut = f[FIELD.fin];
        const endDate = parserDate(finBrut);
        if (finBrut && !endDate) avertissements.date_fin_invalide++;

        membres.push({
            member_no: numId,
            first_name: firstName,
            last_name: lastName,
            address: nettoyerTexte(f[FIELD.adresse]) || null,
            postal_code: nettoyerTexte(f[FIELD.cp]) || null,
            age: calculerAge(f[FIELD.naissance]),
            gender: mapperGenre(f[FIELD.sexe]),
            phone: nettoyerTexte(f[FIELD.tel]) || null,
            email: email || null,
            social_status: status || null,
            start_date: parserDate(f[FIELD.debut]),
            end_date: endDate,
            subscription
        });
    }
    return { membres, avertissements };
};

// ---- Import en masse : transaction, doublons member_no ignorés, notification ----
export const importerXmlMembres = (db, texte, notifier) => {
    const { membres, avertissements } = parserXmlMembres(texte);
    if (!membres.length) return { analyses: membres.length, importes: 0, doublons: 0, avertissements };

    const existe = db.prepare('SELECT 1 AS v FROM members WHERE member_no = ?');
    const insertion = db.prepare(
        'INSERT INTO members (id, member_no, first_name, last_name, age, phone, email, address, postal_code, gender, social_status, start_date, end_date, subscription) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    let importes = 0;
    let doublons = 0;
    db.transaction(() => {
        for (const m of membres) {
            if (existe.get(m.member_no)) { doublons++; continue; }
            insertion.run('imp' + m.member_no, m.member_no, m.first_name, m.last_name, m.age,
                m.phone, m.email, m.address, m.postal_code, m.gender, m.social_status,
                m.start_date, m.end_date, m.subscription);
            importes++;
        }
    })();
    if (importes > 0) notifier('import_membres',
        `\uD83D\uDCE5 ${importes} membres importés depuis l'ancienne base Access` +
        (doublons ? ` (${doublons} doublons ignorés)` : ''), 'info');
    return { analyses: membres.length, importes, doublons, avertissements };
};
