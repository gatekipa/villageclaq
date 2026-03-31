-- Migration 00036: Seed FAQs, fix contact_enquiries, seed changelogs & help articles
-- Part of Help Center gap fixes

-- ============================================================
-- FIX 1: Seed 12 additional FAQs with bilingual content
-- ============================================================
INSERT INTO faqs (question, question_fr, answer, answer_fr, category, sort_order, is_published) VALUES

-- Getting Started (3)
('How do I create a new group?',
 'Comment créer un nouveau groupe ?',
 'After signing in, click "Create Group" from the dashboard sidebar. Fill in the group name, description, currency, and upload a logo. You will automatically become the group owner with full admin privileges.',
 'Après vous être connecté, cliquez sur « Créer un groupe » dans la barre latérale du tableau de bord. Renseignez le nom du groupe, la description, la devise et téléchargez un logo. Vous deviendrez automatiquement le propriétaire du groupe avec tous les privilèges d''administrateur.',
 'getting-started', 10, true),

('How do I invite members to my group?',
 'Comment inviter des membres dans mon groupe ?',
 'Go to Members → Invite Member. You can invite by email or phone number. The invitee will receive a notification and can accept from their dashboard. Admins can also create proxy members for people without smartphones.',
 'Allez dans Membres → Inviter un membre. Vous pouvez inviter par e-mail ou numéro de téléphone. L''invité recevra une notification et pourra accepter depuis son tableau de bord. Les administrateurs peuvent aussi créer des membres mandataires pour les personnes sans smartphone.',
 'getting-started', 11, true),

('What is a proxy member?',
 'Qu''est-ce qu''un membre mandataire ?',
 'A proxy member represents someone who does not have a smartphone or VillageClaq account (e.g., elderly relatives). An admin creates the proxy, manages their contributions and attendance, and can convert them to a full account later if they sign up.',
 'Un membre mandataire représente une personne qui n''a pas de smartphone ou de compte VillageClaq (par exemple, un parent âgé). Un administrateur crée le mandataire, gère ses cotisations et sa présence, et peut le convertir en compte complet plus tard.',
 'getting-started', 12, true),

-- Payments (3)
('How do I record a payment?',
 'Comment enregistrer un paiement ?',
 'Navigate to Finances → Record Payment. Select the member, the contribution type, enter the amount, and optionally upload a receipt photo. The system automatically updates the member''s obligation status (pending → partial → paid).',
 'Accédez à Finances → Enregistrer un paiement. Sélectionnez le membre, le type de cotisation, entrez le montant et téléchargez éventuellement une photo du reçu. Le système met automatiquement à jour le statut de l''obligation du membre (en attente → partiel → payé).',
 'payments', 20, true),

('What happens when a contribution is overdue?',
 'Que se passe-t-il quand une cotisation est en retard ?',
 'When a contribution passes its due date without full payment, it is marked "overdue." This affects the member''s standing — overdue dues automatically move standing to "suspended." The member and group admins receive notifications.',
 'Lorsqu''une cotisation dépasse sa date d''échéance sans paiement intégral, elle est marquée « en retard ». Cela affecte la réputation du membre — les cotisations en retard placent automatiquement le statut à « suspendu ». Le membre et les administrateurs reçoivent des notifications.',
 'payments', 21, true),

('Can I set up different contribution types?',
 'Puis-je configurer différents types de cotisations ?',
 'Yes! Go to Finances → Contribution Types. You can create monthly dues, one-time levies, event-specific contributions, and more. Each type has its own amount, frequency, and due dates. Members are automatically enrolled when a new type is created.',
 'Oui ! Allez dans Finances → Types de cotisations. Vous pouvez créer des cotisations mensuelles, des prélèvements ponctuels, des contributions spécifiques à un événement, et plus. Chaque type a son propre montant, fréquence et dates d''échéance.',
 'payments', 22, true),

-- Membership (2)
('How does member standing work?',
 'Comment fonctionne le statut des membres ?',
 'Standing is automatically calculated based on four factors: (1) dues payment — any overdue contribution fails, (2) attendance — below 60% in 12 months fails, (3) relief plan contributions — behind on enrolled plans fails, (4) open disputes — soft warning. Good standing requires passing all checks.',
 'Le statut est calculé automatiquement selon quatre facteurs : (1) paiement des cotisations — toute cotisation en retard échoue, (2) présence — en dessous de 60 % sur 12 mois échoue, (3) contributions aux plans d''entraide — retard sur les plans inscrits échoue, (4) litiges ouverts — avertissement. Le bon statut exige de passer tous les contrôles.',
 'membership', 30, true),

('Can members belong to multiple groups?',
 'Les membres peuvent-ils appartenir à plusieurs groupes ?',
 'Yes! VillageClaq uses a "one account, many groups" model. Each user can join unlimited groups, with a separate role and standing in each. Use the Group Switcher in the header to switch between your groups.',
 'Oui ! VillageClaq utilise un modèle « un compte, plusieurs groupes ». Chaque utilisateur peut rejoindre un nombre illimité de groupes, avec un rôle et un statut distincts dans chacun. Utilisez le sélecteur de groupe dans l''en-tête pour basculer entre vos groupes.',
 'membership', 31, true),

-- Events (2)
('How do I schedule a meeting?',
 'Comment planifier une réunion ?',
 'Go to Events → Create Event. Choose "Meeting" as the type, set the date, time, location (or virtual link), and agenda. Members receive a notification. After the meeting, you can record attendance and publish minutes.',
 'Allez dans Événements → Créer un événement. Choisissez « Réunion » comme type, définissez la date, l''heure, le lieu (ou lien virtuel) et l''ordre du jour. Les membres reçoivent une notification. Après la réunion, vous pouvez enregistrer la présence et publier le procès-verbal.',
 'events', 40, true),

('How does attendance tracking work?',
 'Comment fonctionne le suivi de la présence ?',
 'After each event, admins can mark members as present, absent, or excused from the event detail page. Attendance rates are automatically calculated and factor into member standing — below 60% attendance in the last 12 months triggers a warning.',
 'Après chaque événement, les administrateurs peuvent marquer les membres comme présents, absents ou excusés depuis la page de détail de l''événement. Les taux de présence sont calculés automatiquement et affectent le statut du membre — en dessous de 60 % de présence sur les 12 derniers mois, un avertissement est déclenché.',
 'events', 41, true),

-- Relief (2)
('What are relief plans?',
 'Que sont les plans d''entraide ?',
 'Relief plans are mutual aid funds where members contribute regularly and can file claims when in need (e.g., bereavement, medical emergency, wedding). Each plan defines its contribution amount, claim eligibility rules, and payout amounts.',
 'Les plans d''entraide sont des fonds d''aide mutuelle où les membres contribuent régulièrement et peuvent déposer des demandes en cas de besoin (par exemple, deuil, urgence médicale, mariage). Chaque plan définit son montant de contribution, ses règles d''éligibilité et ses montants de versement.',
 'relief', 50, true),

('How do I file a relief claim?',
 'Comment déposer une demande d''entraide ?',
 'Navigate to Relief → File Claim. Select the relief plan, describe your situation, and upload any supporting documents. The claim is reviewed by group admins who can approve or deny it. Approved claims are paid out according to the plan rules.',
 'Accédez à Entraide → Déposer une demande. Sélectionnez le plan d''entraide, décrivez votre situation et téléchargez tout document justificatif. La demande est examinée par les administrateurs du groupe qui peuvent l''approuver ou la refuser. Les demandes approuvées sont versées selon les règles du plan.',
 'relief', 51, true);


-- ============================================================
-- FIX 2: Add user_id column to contact_enquiries
-- ============================================================
ALTER TABLE contact_enquiries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN contact_enquiries.user_id IS 'The authenticated user who submitted the enquiry, if any';


-- ============================================================
-- FIX 3: Seed changelogs table with v1.0.0 entry
-- ============================================================
INSERT INTO changelogs (title, title_fr, description, description_fr, category, version, is_published, published_at) VALUES
('VillageClaq Launch',
 'Lancement de VillageClaq',
 'The first official release of VillageClaq — a complete platform for managing African community groups. Includes group management, financial tracking, event scheduling, member management, relief plans, elections, and more.',
 'La première version officielle de VillageClaq — une plateforme complète pour gérer les groupes communautaires africains. Inclut la gestion de groupe, le suivi financier, la planification d''événements, la gestion des membres, les plans d''entraide, les élections, et plus encore.',
 'feature', 'v1.0.0', true, '2026-03-30'),

('Help Center & Activity Feed',
 'Centre d''aide et flux d''activité',
 'Added a comprehensive Help Center with articles, FAQs, feature guides, and contact support. Also wired full activity feed logging across all modules for complete audit trails.',
 'Ajout d''un centre d''aide complet avec articles, FAQ, guides de fonctionnalités et support de contact. Également ajout de la journalisation complète du flux d''activité dans tous les modules pour des pistes d''audit complètes.',
 'feature', 'v1.1.0', true, '2026-03-30');


-- ============================================================
-- FIX 4: Seed additional help articles (8 new articles)
-- ============================================================
INSERT INTO help_articles (slug, category, title, title_fr, content, content_fr, sort_order, is_published) VALUES

('setting-up-contribution-types',
 'payments',
 'Setting Up Contribution Types',
 'Configuration des types de cotisations',
 'Contribution types define what members owe and when. Go to Finances → Contribution Types to create monthly dues, one-time levies, or event-based contributions.\n\n**Creating a contribution type:**\n1. Click "Add Contribution Type"\n2. Enter name, amount, and currency\n3. Set the frequency (monthly, quarterly, yearly, one-time)\n4. Set the due date or recurrence pattern\n5. Save — all current members are automatically enrolled\n\n**Managing obligations:**\nEach member gets an obligation record per period. Track partial payments, mark waivers for hardship cases, and export reports for your records.',
 'Les types de cotisations définissent ce que les membres doivent et quand. Allez dans Finances → Types de cotisations pour créer des cotisations mensuelles, prélèvements ponctuels ou contributions basées sur des événements.\n\n**Créer un type de cotisation :**\n1. Cliquez sur « Ajouter un type de cotisation »\n2. Entrez le nom, le montant et la devise\n3. Définissez la fréquence (mensuelle, trimestrielle, annuelle, ponctuelle)\n4. Définissez la date d''échéance ou le schéma de récurrence\n5. Enregistrez — tous les membres actuels sont automatiquement inscrits\n\n**Gestion des obligations :**\nChaque membre reçoit un enregistrement d''obligation par période. Suivez les paiements partiels, marquez les dérogations pour les cas difficiles et exportez les rapports.',
 25, true),

('running-elections',
 'members',
 'Running Group Elections',
 'Organisation des élections de groupe',
 'VillageClaq supports democratic officer elections with anonymous balloting.\n\n**Setting up an election:**\n1. Go to Elections → Create Election\n2. Define the positions being elected\n3. Set nomination and voting periods\n4. Members can nominate themselves or be nominated\n\n**Voting process:**\n- Each eligible member gets one anonymous vote per position\n- Results are tallied automatically when voting closes\n- Winners are announced and can be assigned to positions\n\n**Tips:**\n- Set clear eligibility rules (e.g., good standing required)\n- Use the announcement feature to remind members to vote\n- Published results include vote counts for transparency',
 'VillageClaq prend en charge les élections démocratiques avec vote anonyme.\n\n**Organiser une élection :**\n1. Allez dans Élections → Créer une élection\n2. Définissez les postes à pourvoir\n3. Fixez les périodes de nomination et de vote\n4. Les membres peuvent se porter candidats ou être nominés\n\n**Processus de vote :**\n- Chaque membre éligible a un vote anonyme par poste\n- Les résultats sont comptabilisés automatiquement à la clôture\n- Les gagnants sont annoncés et peuvent être assignés aux postes\n\n**Conseils :**\n- Établissez des règles d''éligibilité claires (ex : bon statut requis)\n- Utilisez la fonction d''annonce pour rappeler aux membres de voter\n- Les résultats publiés incluent le décompte des votes pour la transparence',
 35, true),

('understanding-savings-circles',
 'payments',
 'Understanding Savings Circles (Njangi)',
 'Comprendre les tontines (Njangi)',
 'Savings circles (njangi, tontine, ajo, susu) are rotating savings groups where members contribute a fixed amount each period and one member receives the full pot.\n\n**Creating a savings cycle:**\n1. Go to Savings → Create Cycle\n2. Set the contribution amount and frequency\n3. Define the rotation order or use random assignment\n4. Track who has received and who is next\n\n**Key features:**\n- Automatic contribution tracking per member per round\n- Visual rotation calendar showing upcoming payouts\n- Support for multiple concurrent cycles\n- History and reporting for completed cycles',
 'Les tontines (njangi, ajo, susu) sont des groupes d''épargne rotative où les membres contribuent un montant fixe chaque période et un membre reçoit la totalité du pot.\n\n**Créer un cycle d''épargne :**\n1. Allez dans Épargne → Créer un cycle\n2. Définissez le montant de la contribution et la fréquence\n3. Définissez l''ordre de rotation ou utilisez l''attribution aléatoire\n4. Suivez qui a reçu et qui est le prochain\n\n**Fonctionnalités clés :**\n- Suivi automatique des contributions par membre et par tour\n- Calendrier visuel de rotation montrant les prochains versements\n- Support pour plusieurs cycles simultanés\n- Historique et rapports pour les cycles terminés',
 26, true),

('managing-relief-plans',
 'members',
 'Managing Relief & Mutual Aid Plans',
 'Gestion des plans d''entraide',
 'Relief plans provide a safety net for group members during difficult times like bereavement, illness, or celebrations.\n\n**Setting up a relief plan:**\n1. Go to Relief → Create Plan\n2. Name the plan and define eligible events (death, illness, wedding, etc.)\n3. Set member contribution amounts and claim payout amounts\n4. Enroll members — they can opt in or be auto-enrolled\n\n**Processing claims:**\n1. A member files a claim with description and documents\n2. Admins review and approve or deny\n3. Approved claims trigger payout tracking\n4. All claim activity is logged in the audit trail\n\n**Best practices:**\n- Define clear eligibility criteria upfront\n- Require documentation for claims\n- Keep the fund balance visible to build trust',
 'Les plans d''entraide fournissent un filet de sécurité pour les membres pendant les moments difficiles comme le deuil, la maladie ou les célébrations.\n\n**Configurer un plan d''entraide :**\n1. Allez dans Entraide → Créer un plan\n2. Nommez le plan et définissez les événements éligibles\n3. Fixez les montants de contribution et les montants de versement\n4. Inscrivez les membres — ils peuvent s''inscrire ou être auto-inscrits\n\n**Traitement des demandes :**\n1. Un membre dépose une demande avec description et documents\n2. Les administrateurs examinent et approuvent ou refusent\n3. Les demandes approuvées déclenchent le suivi des versements\n4. Toute l''activité est journalisée dans la piste d''audit\n\n**Bonnes pratiques :**\n- Définissez des critères d''éligibilité clairs dès le départ\n- Exigez des justificatifs pour les demandes\n- Gardez le solde du fonds visible pour instaurer la confiance',
 36, true),

('admin-setup-guide',
 'getting_started',
 'Admin Setup Guide',
 'Guide de configuration administrateur',
 'After creating your group, follow these steps to set it up for your members.\n\n**Step 1: Configure positions**\nGo to Settings → Positions to create officer roles (President, Treasurer, Secretary, etc.) and assign permissions to each.\n\n**Step 2: Set up contribution types**\nCreate your monthly dues, levies, and other financial obligations under Finances → Contribution Types.\n\n**Step 3: Invite members**\nUse Members → Invite to add members by email or phone. Create proxy members for those without smartphones.\n\n**Step 4: Create events**\nSchedule your first meeting under Events → Create Event.\n\n**Step 5: Enable relief plans**\nIf your group has mutual aid, set up relief plans under Relief → Create Plan.\n\n**Step 6: Customize settings**\nUpload your group logo, set the group description, and configure notification preferences.',
 'Après avoir créé votre groupe, suivez ces étapes pour le configurer pour vos membres.\n\n**Étape 1 : Configurer les postes**\nAllez dans Paramètres → Postes pour créer des rôles (Président, Trésorier, Secrétaire, etc.) et assigner des permissions.\n\n**Étape 2 : Configurer les types de cotisations**\nCréez vos cotisations mensuelles et autres obligations financières sous Finances → Types de cotisations.\n\n**Étape 3 : Inviter des membres**\nUtilisez Membres → Inviter pour ajouter des membres par e-mail ou téléphone. Créez des membres mandataires pour ceux sans smartphone.\n\n**Étape 4 : Créer des événements**\nPlanifiez votre première réunion sous Événements → Créer un événement.\n\n**Étape 5 : Activer les plans d''entraide**\nSi votre groupe a de l''aide mutuelle, configurez les plans sous Entraide → Créer un plan.\n\n**Étape 6 : Personnaliser les paramètres**\nTéléchargez le logo du groupe, définissez la description et configurez les préférences de notification.',
 5, true),

('exporting-reports',
 'reports',
 'Exporting Reports & Data',
 'Exportation des rapports et données',
 'VillageClaq supports exporting your group data in multiple formats for record-keeping and transparency.\n\n**CSV Exports:**\nMost data tables (members, contributions, payments, attendance, activity log) have an "Export CSV" button that downloads the current filtered view.\n\n**PDF Reports:**\nFinancial summaries, member lists, and attendance reports can be exported as formatted PDF documents suitable for printing or sharing.\n\n**AI Insights:**\nThe Reports section includes AI-powered analysis that summarizes trends, highlights at-risk members, and suggests actionable improvements.\n\n**Tips:**\n- Use date filters before exporting to get specific periods\n- PDF exports include your group logo and header\n- Activity log exports include the full audit trail',
 'VillageClaq prend en charge l''exportation de vos données de groupe dans plusieurs formats pour la tenue des registres et la transparence.\n\n**Exports CSV :**\nLa plupart des tableaux (membres, cotisations, paiements, présence, journal d''activité) ont un bouton « Exporter CSV » qui télécharge la vue filtrée actuelle.\n\n**Rapports PDF :**\nLes résumés financiers, listes de membres et rapports de présence peuvent être exportés en documents PDF formatés pour impression ou partage.\n\n**Analyses IA :**\nLa section Rapports inclut une analyse alimentée par l''IA qui résume les tendances, signale les membres à risque et suggère des améliorations.\n\n**Conseils :**\n- Utilisez les filtres de date avant d''exporter pour des périodes spécifiques\n- Les exports PDF incluent le logo et l''en-tête de votre groupe\n- Les exports du journal d''activité incluent la piste d''audit complète',
 15, true),

('notification-preferences',
 'account',
 'Managing Notifications',
 'Gestion des notifications',
 'VillageClaq sends notifications to keep you informed about group activity.\n\n**Notification types:**\n- Contribution due reminders\n- Payment confirmations\n- Meeting and event reminders\n- Relief claim updates\n- New member announcements\n- Published meeting minutes\n\n**In-app notifications:**\nClick the bell icon in the header to see your latest notifications. Unread notifications show a red badge. Click "Mark all as read" to clear them, or visit the full notifications page.\n\n**Email notifications:**\nImportant notifications are also sent by email. You can manage your email preferences from your account settings.\n\n**Tips:**\n- Check notifications regularly to stay current\n- Use the "What''s New" sparkle icon to see platform updates',
 'VillageClaq envoie des notifications pour vous tenir informé de l''activité du groupe.\n\n**Types de notifications :**\n- Rappels de cotisation due\n- Confirmations de paiement\n- Rappels de réunions et événements\n- Mises à jour des demandes d''entraide\n- Annonces de nouveaux membres\n- Procès-verbaux publiés\n\n**Notifications dans l''application :**\nCliquez sur l''icône de cloche dans l''en-tête pour voir vos dernières notifications. Les non lues affichent un badge rouge. Cliquez sur « Tout marquer comme lu » ou visitez la page complète.\n\n**Notifications par e-mail :**\nLes notifications importantes sont aussi envoyées par e-mail. Gérez vos préférences depuis les paramètres du compte.\n\n**Conseils :**\n- Consultez régulièrement les notifications\n- Utilisez l''icône « Nouveautés » pour voir les mises à jour de la plateforme',
 55, true),

('mobile-usage-tips',
 'getting_started',
 'Mobile Usage Tips',
 'Conseils d''utilisation mobile',
 'VillageClaq is designed mobile-first, so it works great on smartphones and tablets.\n\n**Navigation:**\nTap the hamburger menu (☰) in the top-left to access the sidebar navigation. Use the Group Switcher to change between groups.\n\n**Quick actions:**\n- Record payments directly from the member detail page\n- Mark attendance from the event detail page\n- File relief claims from the Relief section\n\n**Offline considerations:**\nVillageClaq requires an internet connection. If you lose connectivity, your unsaved changes may be lost. An offline indicator appears when disconnected.\n\n**Tips:**\n- Add VillageClaq to your home screen for quick access\n- Use landscape mode for data-heavy tables\n- The app supports both English and French — switch in the header',
 'VillageClaq est conçu pour le mobile d''abord, il fonctionne donc parfaitement sur smartphones et tablettes.\n\n**Navigation :**\nAppuyez sur le menu hamburger (☰) en haut à gauche pour accéder à la barre latérale. Utilisez le sélecteur de groupe pour changer de groupe.\n\n**Actions rapides :**\n- Enregistrez les paiements depuis la page de détail du membre\n- Marquez la présence depuis la page de détail de l''événement\n- Déposez des demandes d''entraide depuis la section Entraide\n\n**Considérations hors ligne :**\nVillageClaq nécessite une connexion Internet. Si vous perdez la connectivité, vos modifications non sauvegardées peuvent être perdues. Un indicateur hors ligne apparaît.\n\n**Conseils :**\n- Ajoutez VillageClaq à votre écran d''accueil pour un accès rapide\n- Utilisez le mode paysage pour les tableaux de données\n- L''application prend en charge l''anglais et le français — changez dans l''en-tête',
 6, true);
