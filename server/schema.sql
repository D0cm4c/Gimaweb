-- Gimaweb — schéma SQLite consolidé (base de départ du serveur)
-- Source : db.js (ensureSchema) de la maquette D0cm4c/Gestion-Membres-Inscriptions-de-l-Atelier-du-web,
-- issue #150 §3. Les migrations historiques de la maquette (ALTER TABLE) sont ici
-- consolidées dans les CREATE TABLE définitifs — une base vierge n'a pas à les rejouer.

CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    age INTEGER,
    phone TEXT,
    email TEXT,
    address TEXT,
    start_date TEXT,
    end_date TEXT,
    subscription TEXT DEFAULT 'none',      -- none | monthly | yearly
    member_no INTEGER UNIQUE,              -- n° auto 4 chiffres (#1000…)
    postal_code TEXT,
    gender TEXT,
    social_status TEXT,                    -- cpas | actiris | travailleur… (couleurs consacrées dans l'UI)
    first_start_date TEXT,                 -- 1re inscription historique (préservée aux renouvellements)
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_no ON members(member_no);
CREATE INDEX IF NOT EXISTS idx_members_enddate ON members(end_date);        -- alertes d'expiration (audit oct. 2026)

CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    amount REAL DEFAULT 1.0,
    reason TEXT,                            -- motif de visite, vocabulaire baromètre FRB 2026 (nov. 2026)
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_visits_member_date ON visits(member_id, visit_date);  -- dashboard + fiche membre

CREATE TABLE IF NOT EXISTS prints (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    print_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bw', 'color')),
    amount REAL NOT NULL,
    paid INTEGER DEFAULT 0,
    paid_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS formations (
    id TEXT PRIMARY KEY,
    event_id TEXT UNIQUE,                   -- event_id M.E. Calendar = clé naturelle
    title TEXT NOT NULL,
    start_date TEXT,
    date_text TEXT,
    time_label TEXT,
    duration TEXT,
    excerpt TEXT,
    url TEXT,
    categories TEXT,
    price REAL,
    organizer TEXT,
    location TEXT,
    labels TEXT,
    room_id TEXT,
    synced_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS formations_members (
    id TEXT PRIMARY KEY,
    formation_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    registered_at TEXT DEFAULT (datetime('now')),
    payment TEXT,                           -- bancontact | cash | NULL (oct. 2026)
    attendance TEXT,                        -- present | canceled | NULL
    payment_at TEXT,
    UNIQUE(formation_id, member_id),
    FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS formation_dates (
    id TEXT PRIMARY KEY,
    formation_id TEXT NOT NULL,
    date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('AM', 'PM')),   -- Matin 9h30-12h30 / Après-midi 13h30-16h30
    UNIQUE(formation_id, date, slot),
    FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fdates ON formation_dates(date, slot);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capacity INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                     -- sync_formations | auto_link | auto_unlink | awaiting_validation | member_created | info | error
    severity TEXT NOT NULL DEFAULT 'info',  -- info | success | warning | danger
    message TEXT NOT NULL,
    details TEXT,                           -- JSON optionnel
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(is_read, created_at);

CREATE TABLE IF NOT EXISTS bookings_remote (
    id TEXT PRIMARY KEY,                    -- id de réservation MEC (clé naturelle)
    event_id TEXT,
    member_no INTEGER,                      -- champ optionnel saisi par l'usager (maillon fort du matching)
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    booked_at TEXT,
    status TEXT,                            -- confirmed | pending | canceled…
    synced_at TEXT,
    processed INTEGER DEFAULT 0,
    processed_action TEXT,                  -- linked | created | ignored | auto_linked
    processed_at TEXT,
    local_member_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_booking_unprocessed ON bookings_remote(processed, booked_at);

CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    page TEXT,
    author TEXT,
    status TEXT DEFAULT 'open',             -- open | done | discarded
    created_at TEXT DEFAULT (datetime('now')),
    handled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sugg_status ON suggestions(status, created_at);

CREATE TABLE IF NOT EXISTS fm_payment_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formation_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    action TEXT NOT NULL,                   -- paid | cleared
    method TEXT,                            -- bancontact | cash (NULL si cleared)
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fmpaylog ON fm_payment_log(formation_id, member_id, created_at);

CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    formation_event_id TEXT,               -- si la formation existe (fiche)
    formation_title TEXT NOT NULL,          -- intitulé (ou texte libre pour une future session)
    status TEXT DEFAULT 'waiting',          -- waiting | contacted | enrolled
    contacted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_waitlist ON waitlist(member_id, formation_event_id);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'other',           -- computer | printer | network | software | furniture | other
    equipment TEXT,
    priority TEXT DEFAULT 'normal',         -- low | normal | high | urgent
    status TEXT DEFAULT 'open',             -- open | in_progress | resolved | closed
    assignee TEXT,                          -- texte libre (pas de comptes)
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, priority, created_at);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    author TEXT,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tcomments ON ticket_comments(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Salles par défaut (seed, premier démarrage seulement — à faire côté code applicatif)
-- Grande salle (15), Petite salle (8), Cyber-espace (25)
