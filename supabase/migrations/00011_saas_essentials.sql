-- ============================================================
-- SaaS Essentials: help articles, feedback, changelogs, audit
-- ============================================================

-- ==================== HELP ARTICLES ====================

CREATE TABLE help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  title_fr TEXT NOT NULL,
  content TEXT NOT NULL,
  content_fr TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  helpful_yes INTEGER NOT NULL DEFAULT 0,
  helpful_no INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_articles_category ON help_articles(category);
CREATE INDEX idx_help_articles_slug ON help_articles(slug);

-- ==================== FEEDBACK ====================

CREATE TYPE feedback_type AS ENUM ('bug', 'feature', 'general');
CREATE TYPE feedback_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE feedback_status AS ENUM ('submitted', 'under_review', 'planned', 'in_progress', 'shipped', 'closed');

CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  type feedback_type NOT NULL DEFAULT 'general',
  severity feedback_severity,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  status feedback_status NOT NULL DEFAULT 'submitted',
  upvotes INTEGER NOT NULL DEFAULT 0,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_status ON feedback(status);

CREATE TABLE feedback_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(feedback_id, user_id)
);

-- ==================== CHANGELOGS ====================

CREATE TABLE changelogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_fr TEXT NOT NULL,
  description TEXT NOT NULL,
  description_fr TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'feature', -- feature, improvement, bugfix
  version TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_changelogs_published ON changelogs(published_at DESC);

-- ==================== GROUP AUDIT LOG ====================

CREATE TABLE group_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_audit_group ON group_audit_logs(group_id, created_at DESC);
CREATE INDEX idx_group_audit_actor ON group_audit_logs(actor_id);

-- ==================== TRIGGERS ====================

CREATE TRIGGER set_help_articles_updated_at BEFORE UPDATE ON help_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_feedback_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_audit_logs ENABLE ROW LEVEL SECURITY;

-- Help articles: public read
CREATE POLICY "Anyone can read help articles" ON help_articles FOR SELECT USING (is_published = true);
CREATE POLICY "Staff manage help articles" ON help_articles FOR ALL USING (is_platform_staff());

-- Feedback: users CRUD own, staff see all
CREATE POLICY "Users view own feedback" ON feedback FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Staff view all feedback" ON feedback FOR SELECT USING (is_platform_staff());
CREATE POLICY "Users create feedback" ON feedback FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own feedback" ON feedback FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Staff manage feedback" ON feedback FOR ALL USING (is_platform_staff());

-- Feedback votes
CREATE POLICY "Users vote on feedback" ON feedback_votes FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Anyone see votes" ON feedback_votes FOR SELECT USING (true);

-- Changelogs: public read
CREATE POLICY "Anyone read changelogs" ON changelogs FOR SELECT USING (is_published = true);
CREATE POLICY "Staff manage changelogs" ON changelogs FOR ALL USING (is_platform_staff());

-- Group audit logs: group members read, system writes
CREATE POLICY "Members view group audit" ON group_audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships WHERE memberships.group_id = group_audit_logs.group_id AND memberships.user_id = auth.uid())
);
CREATE POLICY "System insert audit" ON group_audit_logs FOR INSERT WITH CHECK (true);

-- ==================== SEED HELP ARTICLES ====================

INSERT INTO help_articles (slug, category, title, title_fr, content, content_fr, sort_order) VALUES
('create-group', 'getting_started', 'How do I create a group?', 'Comment créer un groupe ?', 'After signing up, click "Create Group" from your dashboard. Choose your group type (savings circle, alumni union, church group, etc.), enter your group name, select your currency, and set your meeting schedule. The setup takes less than 30 seconds. You''ll be automatically assigned as the group owner with full admin permissions.', 'Après votre inscription, cliquez sur "Créer un groupe" depuis votre tableau de bord. Choisissez le type de groupe (cercle d''épargne, union d''anciens, groupe d''église, etc.), entrez le nom du groupe, sélectionnez votre devise et définissez votre calendrier de réunions. La configuration prend moins de 30 secondes. Vous serez automatiquement désigné comme propriétaire du groupe avec toutes les permissions d''administration.', 1),
('invite-members', 'getting_started', 'How do I invite members?', 'Comment inviter des membres ?', 'Go to Invitations in the sidebar. You can invite by email, share a join link, or display a QR code. Members receive an invitation and can join with one tap. You can also share the join code directly — members enter it in the app to join your group.', 'Allez dans Invitations dans la barre latérale. Vous pouvez inviter par e-mail, partager un lien d''adhésion ou afficher un code QR. Les membres reçoivent une invitation et peuvent rejoindre en un clic. Vous pouvez aussi partager le code d''adhésion directement — les membres le saisissent dans l''app pour rejoindre votre groupe.', 2),
('record-payment', 'payments', 'How do I record a payment?', 'Comment enregistrer un paiement ?', 'Navigate to Contributions → Record Payment. Select the member, choose the contribution type, enter the amount, select the payment method (cash, mobile money, bank transfer), and optionally add a reference number. The payment is instantly recorded and the member''s balance updates automatically.', 'Naviguez vers Cotisations → Enregistrer un paiement. Sélectionnez le membre, choisissez le type de cotisation, entrez le montant, sélectionnez le mode de paiement (espèces, mobile money, virement bancaire), et ajoutez éventuellement un numéro de référence. Le paiement est enregistré instantanément et le solde du membre se met à jour automatiquement.', 3),
('take-attendance', 'events', 'How do I take attendance?', 'Comment prendre les présences ?', 'Go to Attendance, select the event from the dropdown, then click "Mark All Present" — this marks everyone as present. Then tap individual members to change their status to absent, excused, or late. For a 50-member group, this takes about 10 taps instead of 50.', 'Allez dans Présences, sélectionnez l''événement dans le menu déroulant, puis cliquez sur "Marquer tous présents" — cela marque tout le monde comme présent. Ensuite, tapez sur les membres individuels pour changer leur statut en absent, excusé ou en retard. Pour un groupe de 50 membres, cela prend environ 10 clics au lieu de 50.', 4),
('generate-report', 'reports', 'How do I generate a report?', 'Comment générer un rapport ?', 'Go to Reports in the sidebar. Choose from 20+ one-click reports including Who Hasn''t Paid, Annual Financial Summary, Attendance Summary, and more. Each report can be exported as CSV, Excel, or PDF. The PDF includes your group''s branding and is optimized for sharing via WhatsApp.', 'Allez dans Rapports dans la barre latérale. Choisissez parmi plus de 20 rapports en un clic, notamment Qui n''a pas payé, Résumé financier annuel, Résumé des présences, et plus. Chaque rapport peut être exporté en CSV, Excel ou PDF. Le PDF inclut l''identité visuelle de votre groupe et est optimisé pour le partage via WhatsApp.', 5),
('change-language', 'account', 'How do I change my language?', 'Comment changer ma langue ?', 'Click the language icon (globe) in the top navigation bar and select English or Français. Your preference is saved and all pages will display in your chosen language. You can also change this in Profile → Settings.', 'Cliquez sur l''icône de langue (globe) dans la barre de navigation en haut et sélectionnez English ou Français. Votre préférence est enregistrée et toutes les pages s''afficheront dans la langue choisie. Vous pouvez aussi changer cela dans Profil → Paramètres.', 6),
('switch-groups', 'account', 'How do I switch between groups?', 'Comment basculer entre les groupes ?', 'Use the Group Switcher dropdown in the top-left corner of the dashboard. Click it to see all your groups, then click the one you want to view. All dashboard data updates instantly to show that group''s information.', 'Utilisez le sélecteur de groupe dans le coin supérieur gauche du tableau de bord. Cliquez dessus pour voir tous vos groupes, puis cliquez sur celui que vous souhaitez voir. Toutes les données du tableau de bord se mettent à jour instantanément pour afficher les informations de ce groupe.', 7),
('standing-status', 'members', 'What does my standing status mean?', 'Que signifie mon statut ?', 'Your standing reflects your membership health. Good (green): all payments up to date, active participation. Warning (yellow): you have overdue payments or missed events. Suspended (red): extended overdue payments — some features may be restricted. Contact your group treasurer to resolve any issues.', 'Votre statut reflète la santé de votre adhésion. Bon (vert) : tous les paiements à jour, participation active. Avertissement (jaune) : vous avez des paiements en retard ou des événements manqués. Suspendu (rouge) : paiements en retard prolongés — certaines fonctionnalités peuvent être restreintes. Contactez le trésorier de votre groupe pour résoudre tout problème.', 8),
('relief-claim', 'members', 'How do I submit a relief claim?', 'Comment soumettre une demande de secours ?', 'Go to My Relief, find the plan you''re enrolled in, and click "Submit Claim". Select what happened (bereavement, illness, wedding, etc.), add a brief description, and optionally attach a supporting document. Your claim will be reviewed by the group admin. You''ll receive a notification when it''s approved or denied.', 'Allez dans Mon Secours, trouvez le plan auquel vous êtes inscrit et cliquez sur "Soumettre une demande". Sélectionnez ce qui s''est passé (décès, maladie, mariage, etc.), ajoutez une brève description et joignez éventuellement un document justificatif. Votre demande sera examinée par l''administrateur du groupe. Vous recevrez une notification lorsqu''elle sera approuvée ou refusée.', 9),
('savings-circle', 'payments', 'How do I start a savings circle?', 'Comment démarrer un cercle d''épargne ?', 'Go to Savings Circle and click "Create Cycle". Enter the cycle name, contribution amount, frequency (weekly/biweekly/monthly), number of members, and start date. Choose rotation type: sequential (fixed order), random, or auction-based. The system auto-generates the rotation schedule and tracks contributions per round.', 'Allez dans Cercle d''Épargne et cliquez sur "Créer un cycle". Entrez le nom du cycle, le montant de la cotisation, la fréquence (hebdomadaire/bimensuel/mensuel), le nombre de membres et la date de début. Choisissez le type de rotation : séquentiel (ordre fixe), aléatoire ou par enchère. Le système génère automatiquement le calendrier de rotation et suit les cotisations par tour.', 10),
('create-election', 'events', 'How do I create an election?', 'Comment créer une élection ?', 'Go to Elections and click "Create Election". Choose the type: Officer Election (with candidates), Motion (yes/no/abstain), or Poll (multiple choice). Set the voting period start and end dates. For officer elections, add candidates with their statements. Votes are anonymous and results are shown after voting closes.', 'Allez dans Élections et cliquez sur "Créer une élection". Choisissez le type : Élection d''officiers (avec candidats), Motion (oui/non/abstention) ou Sondage (choix multiple). Définissez les dates de début et de fin de vote. Pour les élections d''officiers, ajoutez des candidats avec leurs déclarations. Les votes sont anonymes et les résultats sont affichés après la clôture du vote.', 11),
('upload-documents', 'getting_started', 'How do I upload documents?', 'Comment télécharger des documents ?', 'Go to Documents and click "Upload Document". Add a title, select a category (Constitution, Financial Statements, Certificates, etc.), add a description, and upload the file. Supported formats include PDF, DOCX, and images up to 10MB. You can mark documents as restricted (executives only) or visible to all members.', 'Allez dans Documents et cliquez sur "Télécharger un document". Ajoutez un titre, sélectionnez une catégorie (Constitution, États financiers, Certificats, etc.), ajoutez une description et téléchargez le fichier. Les formats pris en charge incluent PDF, DOCX et images jusqu''à 10 Mo. Vous pouvez marquer les documents comme restreints (dirigeants uniquement) ou visibles par tous les membres.', 12),
('export-data', 'account', 'How do I export data?', 'Comment exporter des données ?', 'Every report in VillageClaq can be exported as CSV, Excel (.xlsx), or PDF. Go to Reports, generate the report you need, then click the export button. For a complete data export, go to Group Settings → Data & Privacy → Export All Group Data.', 'Chaque rapport dans VillageClaq peut être exporté en CSV, Excel (.xlsx) ou PDF. Allez dans Rapports, générez le rapport dont vous avez besoin, puis cliquez sur le bouton d''exportation. Pour une exportation complète des données, allez dans Paramètres du groupe → Données et confidentialité → Exporter toutes les données du groupe.', 13),
('data-security', 'account', 'How secure is my data?', 'Mes données sont-elles sécurisées ?', 'VillageClaq uses Supabase with enterprise-grade security: row-level security ensures users only see data they''re authorized to access, all connections are encrypted with TLS, and your data is stored in secure cloud infrastructure. We never share your data with third parties. See our Privacy Policy for full details.', 'VillageClaq utilise Supabase avec une sécurité de niveau entreprise : la sécurité au niveau des lignes garantit que les utilisateurs ne voient que les données auxquelles ils sont autorisés à accéder, toutes les connexions sont chiffrées avec TLS, et vos données sont stockées dans une infrastructure cloud sécurisée. Nous ne partageons jamais vos données avec des tiers. Consultez notre Politique de Confidentialité pour tous les détails.', 14),
('subscription', 'account', 'How do I change my subscription?', 'Comment changer mon abonnement ?', 'Go to Group Settings → Billing to see your current plan and usage. Click "Upgrade" to compare plans and switch to a higher tier. To downgrade, select a lower plan — you''ll keep access to premium features until the end of your billing period. New groups get a 14-day free trial of the Pro plan.', 'Allez dans Paramètres du groupe → Facturation pour voir votre plan actuel et votre utilisation. Cliquez sur "Mettre à niveau" pour comparer les plans et passer à un niveau supérieur. Pour rétrograder, sélectionnez un plan inférieur — vous garderez l''accès aux fonctionnalités premium jusqu''à la fin de votre période de facturation. Les nouveaux groupes bénéficient d''un essai gratuit de 14 jours du plan Pro.', 15);
