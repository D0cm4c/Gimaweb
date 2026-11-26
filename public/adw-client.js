(function () {
    'use strict';

    // Gimaweb — client HTTP de l'objet ADWDatabase (contrat issue app #150 §2).
    // REMPLACE le db.js de la maquette (SQLite/sql.js local) : chaque méthode métier
    // devient un appel à l'API REST du serveur Gimaweb (base SQLite unique en LAN).
    //
    // ⚠ Physique différente de la maquette : HTTP est asynchrone — TOUTES les
    // méthodes retournent une Promise. Les pages migrées (M5) utilisent .then/await.
    // persist()/flush() sont des no-ops (la persistance est le fichier SQLite du serveur).
    // queryAll()/run() disparaissent : aucun SQL ne traverse plus le réseau —
    // les pages encore non migrées (M5b) doivent passer par les méthodes métier.

    function requete(chemin, options) {
        var opts = options || {};
        opts.credentials = 'same-origin';
        opts.headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
        if (opts.body && typeof opts.body !== 'string') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(chemin, opts).then(function (res) {
            return res.text().then(function (texte) {
                var corps = null;
                try { corps = texte ? JSON.parse(texte) : null; } catch (e) { corps = null; }
                if (!res.ok) {
                    var erreur = new Error((corps && corps.erreur) || ('HTTP ' + res.status));
                    erreur.status = res.status;
                    throw erreur;
                }
                return corps;
            });
        });
    }
    var GET = function (u) { return requete(u); };
    var POST = function (u, b) { return requete(u, { method: 'POST', body: b === undefined ? {} : b }); };
    var PUT = function (u, b) { return requete(u, { method: 'PUT', body: b }); };
    var DEL = function (u) { return requete(u, { method: 'DELETE' }); };

    var nonMigre = function (nom) {
        return function () {
            return Promise.reject(new Error(
                'ADWDatabase.' + nom + ' : SQL brut interdit côté client Gimaweb — ' +
                'cette page doit être migrée vers les méthodes métier (M5b).'));
        };
    };

    window.ADWDatabase = {
        // ---- Primitives ----
        init: function () {
            return GET('/api/sante').then(function () { return window.ADWDatabase; });
        },
        persist: function () { return Promise.resolve(); },
        flush: function () { return Promise.resolve(); },
        // Interdits en serveur : aucun SQL par le réseau
        queryAll: nonMigre('queryAll'),
        run: nonMigre('run'),

        // ---- Membres ----
        listerMembres: function () { return GET('/api/membres'); },
        importerXml: function (xml, essai) { return POST('/api/membres/import', { xml: xml, essai: Boolean(essai) }); },
        getMembre: function (id) { return GET('/api/membres/' + encodeURIComponent(id)); },
        creerMembre: function (m) {
            var corps = {
                first_name: m.firstName || m.first_name,
                last_name: m.lastName || m.last_name,
                age: m.age != null ? Number(m.age) : null,
                phone: m.phone, email: m.email, address: m.address,
                start_date: m.startDate || m.start_date,
                end_date: m.endDate || m.end_date,
                subscription: m.subscription || 'none',
                postal_code: m.postalCode || m.postal_code,
                gender: m.gender, social_status: m.socialStatus || m.social_status
            };
            return POST('/api/membres', corps);
        },
        modifierMembre: function (id, champs) {
            var corps = {};
            if (champs.firstName != null || champs.first_name != null) corps.first_name = champs.firstName || champs.first_name;
            if (champs.lastName != null || champs.last_name != null) corps.last_name = champs.lastName || champs.last_name;
            ['age', 'phone', 'email', 'address', 'postal_code', 'gender', 'social_status'].forEach(function (c) {
                if (champs[c] !== undefined) corps[c] = champs[c];
            });
            ['start_date', 'end_date', 'subscription'].forEach(function (c) {
                if (champs[c] !== undefined) corps[c] = champs[c];
            });
            return PUT('/api/membres/' + encodeURIComponent(id), corps);
        },
        deleteMemberCompletely: function (id) { return DEL('/api/membres/' + encodeURIComponent(id)).then(function () { return true; }); },
        previewRenewal: function (id) { return GET('/api/membres/' + encodeURIComponent(id) + '/renouvellement')
            .then(function (r) { return r && { newStart: r.nouveau_debut, newEnd: r.nouvelle_fin, nouveau_debut: r.nouveau_debut, nouvelle_fin: r.nouvelle_fin }; }); },
        renewSubscription: function (id, debut, fin) {
            return POST('/api/membres/' + encodeURIComponent(id) + '/renouvellement', { nouveau_debut: debut, nouvelle_fin: fin })
                .then(function (r) { return r && { newStart: r.nouveau_debut, newEnd: r.nouvelle_fin, nouveau_debut: r.nouveau_debut, nouvelle_fin: r.nouvelle_fin }; });
        },
        // ---- Visites & impressions ----
        pointerVisite: function (memberId, raison) {
            if (memberId === 'anon' || memberId === null) {
                return POST('/api/visites', { anonyme: true, reason: raison || null });
            }
            return POST('/api/visites', { member_id: memberId, reason: raison || null });
        },
        agregatsFlot: function () { return GET('/api/agregats/flot'); },
        rechercheGlobale: function (q) { return GET('/api/recherche?q=' + encodeURIComponent(q || '')); },
        agregatsStats: function () { return GET('/api/agregats/stats'); },
        listerVisitesMembre: function (memberId) { return GET('/api/membres/' + encodeURIComponent(memberId) + '/visites'); },
        ajouterImpression: function (memberId, type, montant) {
            return POST('/api/impressions', { member_id: memberId, type: type, amount: montant === undefined ? undefined : montant });
        },
        etatImpressions: function (memberId) { return GET('/api/membres/' + encodeURIComponent(memberId) + '/impressions'); },
        solderImpressions: function (memberId) { return POST('/api/membres/' + encodeURIComponent(memberId) + '/impressions/solder'); },
        effacerSoldeImpressions: function (memberId) { return DEL('/api/membres/' + encodeURIComponent(memberId) + '/impressions'); },

        // ---- Formations ----
        syncFormations: function () { return POST('/api/formations/sync'); },   // le serveur fetch le site lui-même
        listFormations: function () { return GET('/api/formations'); },
        getFormation: function (id) { return GET('/api/formations/' + encodeURIComponent(id)); },
        getFormationByEventId: function (eventId) { return GET('/api/formations/' + encodeURIComponent(String(eventId))); },
        registerMemberToFormation: function (formationId, memberId) {
            return POST('/api/formations/' + encodeURIComponent(formationId) + '/inscrits', { member_id: memberId });
        },
        unregisterMemberFromFormation: function (formationId, memberId) {
            return DEL('/api/formations/' + encodeURIComponent(formationId) + '/inscrits/' + encodeURIComponent(memberId));
        },
        getFormationAttendees: function (formationId) { return GET('/api/formations/' + encodeURIComponent(formationId) + '/inscrits'); },
        getMemberFormations: function (memberId) { return GET('/api/membres/' + encodeURIComponent(memberId) + '/formations'); },
        setFmPayment: function (formationId, memberId, payment) {
            var corps = { payment: payment === undefined ? null : payment };
            return PUT('/api/formations/' + encodeURIComponent(formationId) + '/inscrits/' + encodeURIComponent(memberId), corps);
        },
        setFmAttendance: function (formationId, memberId, attendance) {
            var corps = { attendance: attendance === undefined ? null : attendance };
            return PUT('/api/formations/' + encodeURIComponent(formationId) + '/inscrits/' + encodeURIComponent(memberId), corps);
        },
        getPaymentLog: function (formationId, memberId) {
            return GET('/api/formations/' + encodeURIComponent(formationId) + '/inscrits/' + encodeURIComponent(memberId) + '/paiements');
        },
        listFormationTitlesDistinct: function () { return GET('/api/formations/titres/distincts'); },

        // ---- Salles ----
        listRooms: function () { return GET('/api/salles'); },
        addRoom: function (name, capacity) { return POST('/api/salles', { name: name, capacity: capacity }); },
        renameRoom: function (id, name) { return PUT('/api/salles/' + encodeURIComponent(id), { name: name }); },
        deleteRoom: function (id) { return DEL('/api/salles/' + encodeURIComponent(id)); },
        setFormationRoom: function (formationId, roomId) {
            return PUT('/api/formations/' + encodeURIComponent(formationId) + '/salle', { room_id: roomId || null });
        },
        setFormationDates: function (formationId, dates) {
            return PUT('/api/formations/' + encodeURIComponent(formationId) + '/dates', { dates: dates });
        },
        getFormationDates: function (formationId) { return GET('/api/formations/' + encodeURIComponent(formationId) + '/dates'); },
        getRoomPlanning: function (mois) { return GET('/api/salles/planning?mois=' + encodeURIComponent(mois)); },
        getRoomConflicts: function (formationId, roomId) {
            return GET('/api/formations/' + encodeURIComponent(formationId) + '/conflits' + (roomId ? '?salle=' + encodeURIComponent(roomId) : ''));
        },
        formationsWithoutRoom: function () { return GET('/api/formations/sans-salle'); },
        listLocations: function () { return GET('/api/locations'); },
        getLocation: function (id) { return GET('/api/locations/' + encodeURIComponent(id)); },
        createLocation: function (l) { return POST('/api/locations', l); },
        updateLocation: function (id, l) { return PUT('/api/locations/' + encodeURIComponent(id), l); },
        deleteLocation: function (id) { return DEL('/api/locations/' + encodeURIComponent(id)); },
        conflitsLocation: function (id) { return GET('/api/locations/' + encodeURIComponent(id) + '/conflits'); },
        listOrganisateurs: function () { return GET('/api/formations/organisateurs'); },

        // ---- Listes d'attente ----
        addToWaitlist: function (memberId, formationEventId, formationTitle) {
            return POST('/api/listes-attente', { member_id: memberId, formation_event_id: formationEventId || null, formation_title: formationTitle || '' });
        },
        removeFromWaitlist: function (entryId) { return DEL('/api/listes-attente/' + encodeURIComponent(entryId)); },
        getWaitlist: function (formationEventId, formationTitle) {
            return GET('/api/listes-attente?event_id=' + encodeURIComponent(formationEventId || '') + '&titre=' + encodeURIComponent(formationTitle || ''));
        },
        getMostWaitedFormations: function (limit) { return GET('/api/listes-attente/top?limite=' + (limit || 5)); },
        getMemberWaitlist: function (memberId) { return GET('/api/membres/' + encodeURIComponent(memberId) + '/listes-attente'); },
        matchWaitlistForFormation: function (formationId) {
            return GET('/api/formations/' + encodeURIComponent(formationId) + '/liste-attente/match');
        },
        markWaitlistContacted: function (entryIds) {
            var ids = Array.isArray(entryIds) ? entryIds : [entryIds];
            return Promise.all(ids.map(function (id) { return PUT('/api/listes-attente/' + encodeURIComponent(id) + '/contacte'); }));
        },

        // ---- Notifications ----
        notify: function (type, message, severity, details) {
            return POST('/api/notifications', { type: type, message: message, severity: severity || 'info', details: details || null });
        },
        listNotifications: function (limit) { return GET('/api/notifications?limite=' + (limit || 50)); },
        listNotificationsPreview: function (limit) { return GET('/api/notifications/avant-premiere?limite=' + (limit || 8)); },
        unreadNotificationsCount: function () { return GET('/api/notifications/non-lues').then(function (r) { return r.non_lues; }); },
        markNotificationRead: function (id) { return PUT('/api/notifications/' + encodeURIComponent(id) + '/lu'); },
        markAllNotificationsRead: function () { return PUT('/api/notifications/lues'); },
        clearReadNotifications: function () { return DEL('/api/notifications/lues'); },
        clearNotifications: function () { return DEL('/api/notifications'); },

        // ---- Réservations du site (bookings) + matching ----
        upsertBookings: function (bookings) {
            if (window.ADWMIRROR_DEMO) { return Promise.reject(new Error('Démo interdite : sync bookings = server-to-server.')); }
            return Promise.reject(new Error('La synchro bookings est server-to-server (plugin WP → POST /api/bookings/upsert).'));
        },
        listUnprocessedBookings: function () { return GET('/api/bookings/non-traites'); },
        markBookingProcessed: function (bookingId, action, localMemberId) {
            var corps = { action: action };
            if (localMemberId) corps.member_id = localMemberId;
            return PUT('/api/bookings/' + encodeURIComponent(bookingId) + '/traitement', corps);
        },
        traitementAutomatiqueBookings: function () { return POST('/api/bookings/traitement-automatique'); },
        applyMirror: function () { return GET('/api/sante').then(function () { return []; }); },

        // ---- Suggestions ----
        addSuggestion: function (message, page, author) {
            return POST('/api/suggestions', { message: message, page: page || null, author: author || null });
        },
        listSuggestions: function () { return GET('/api/suggestions'); },
        openSuggestionsCount: function () { return GET('/api/suggestions/ouvertes').then(function (r) { return r.ouvertes; }); },
        setSuggestionStatus: function (id, status) { return PUT('/api/suggestions/' + encodeURIComponent(id) + '/statut', { status: status }); },

        // ---- Tickets ----
        addTicket: function (t) {
            return POST('/api/tickets', {
                title: t.title, description: t.description || null, category: t.category,
                equipment: t.equipment || null, priority: t.priority,
                assignee: t.assignee || null, created_by: t.created_by || null
            });
        },
        getTicket: function (id) { return GET('/api/tickets/' + encodeURIComponent(id)); },
        listTickets: function () { return GET('/api/tickets'); },
        updateTicket: function (id, champs) {
            return PUT('/api/tickets/' + encodeURIComponent(id), {
                title: champs.title, description: champs.description, category: champs.category,
                equipment: champs.equipment, priority: champs.priority,
                status: champs.status, assignee: champs.assignee
            });
        },
        deleteTicket: function (id) { return DEL('/api/tickets/' + encodeURIComponent(id)); },
        addTicketComment: function (ticketId, author, message) {
            return POST('/api/tickets/' + encodeURIComponent(ticketId) + '/commentaires', { author: author, message: message });
        },
        listTicketComments: function (ticketId) { return GET('/api/tickets/' + encodeURIComponent(ticketId) + '/commentaires'); },

        // ---- Équipe ----
        listTeamMembers: function () { return GET('/api/equipe'); },
        addTeamMember: function (name) { return POST('/api/equipe', { name: name }); },
        deleteTeamMember: function (id) { return DEL('/api/equipe/' + encodeURIComponent(id)); },

        // ---- Base : sauvegarde & remplacement (session admin) ----
        sauvegardeChiffree: function () { return POST('/api/base/sauvegarde'); },
        remplacerBase: function (fichierBase64) { return POST('/api/base/remplacement', { fichier_base64: fichierBase64 }); }
    };
})();
