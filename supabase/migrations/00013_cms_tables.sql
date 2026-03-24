-- ============================================================
-- CMS Tables: Testimonials & FAQs for landing page
-- ============================================================

CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  group_name TEXT,
  quote TEXT NOT NULL,
  quote_fr TEXT,
  country TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  question_fr TEXT,
  answer TEXT NOT NULL,
  answer_fr TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Public read for landing page
CREATE POLICY "Anyone can view testimonials" ON testimonials FOR SELECT USING (true);
CREATE POLICY "Staff can manage testimonials" ON testimonials FOR ALL USING (is_platform_staff());

CREATE POLICY "Anyone can view published faqs" ON faqs FOR SELECT USING (is_published = true);
CREATE POLICY "Staff can manage faqs" ON faqs FOR ALL USING (is_platform_staff());

CREATE TRIGGER set_testimonials_updated_at BEFORE UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_faqs_updated_at BEFORE UPDATE ON faqs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed testimonials
INSERT INTO testimonials (name, role, group_name, quote, quote_fr, country, featured, sort_order) VALUES
  ('Cyril N.', 'President', 'Bamenda Alumni Union', 'VillageClaq transformed how our group manages finances and meetings. Everything is transparent now.', 'VillageClaq a transformé la façon dont notre groupe gère les finances et les réunions. Tout est transparent maintenant.', 'Cameroon', true, 1),
  ('Adebayo O.', 'Treasurer', 'Lagos Ajo Cooperative', 'Finally a platform that understands how our rotating savings actually work. The tracker is perfect.', 'Enfin une plateforme qui comprend comment fonctionne réellement notre épargne rotative. Le suivi est parfait.', 'Nigeria', true, 2),
  ('Kwame A.', 'Secretary', 'Accra Susu Collective', 'Meeting minutes and attendance tracking saved us hours of manual work every month.', 'Les procès-verbaux et le suivi des présences nous font gagner des heures de travail manuel chaque mois.', 'Ghana', true, 3),
  ('Wanjiku M.', 'Chair', 'Nairobi Chama Network', 'Our Chama grew from 20 to 80 members and VillageClaq scaled with us perfectly.', 'Notre Chama est passé de 20 à 80 membres et VillageClaq a parfaitement suivi notre croissance.', 'Kenya', false, 4),
  ('Thabo D.', 'Admin', 'Soweto Stokvel', 'The reports feature is what sold us. One tap and the treasurer has everything for the AGM.', 'La fonctionnalité de rapports nous a convaincus. Un clic et le trésorier a tout pour l''AGM.', 'South Africa', false, 5);

-- Seed FAQs
INSERT INTO faqs (question, question_fr, answer, answer_fr, category, sort_order) VALUES
  ('How do I create a group?', 'Comment créer un groupe ?', 'Sign up for free, then follow the group creation wizard. It takes less than 2 minutes to set up your group with positions, currency, and meeting schedule.', 'Inscrivez-vous gratuitement, puis suivez l''assistant de création de groupe. Il faut moins de 2 minutes pour configurer votre groupe.', 'getting-started', 1),
  ('How do I invite members?', 'Comment inviter des membres ?', 'Go to Invitations in your dashboard. Share the join link, QR code, or send email invitations directly. Members can join with one tap.', 'Allez dans Invitations sur votre tableau de bord. Partagez le lien, le code QR ou envoyez des invitations par e-mail.', 'getting-started', 2),
  ('Is my data secure?', 'Mes données sont-elles sécurisées ?', 'Yes. VillageClaq uses bank-level encryption, row-level security policies, and is hosted on enterprise infrastructure. Your financial data is never shared.', 'Oui. VillageClaq utilise un chiffrement de niveau bancaire et des politiques de sécurité au niveau des lignes.', 'security', 3),
  ('How much does it cost?', 'Combien ça coûte ?', 'VillageClaq is free for groups up to 25 members. Larger groups can upgrade to Community ($9/mo) or Federation ($29/mo) plans.', 'VillageClaq est gratuit pour les groupes jusqu''à 25 membres. Les grands groupes peuvent passer au plan Communauté (9$/mois).', 'pricing', 4),
  ('Can I use it in French?', 'Puis-je l''utiliser en français ?', 'Absolutely! VillageClaq is fully bilingual (English/French). Each member can choose their preferred language independently.', 'Absolument ! VillageClaq est entièrement bilingue (anglais/français). Chaque membre peut choisir sa langue préférée.', 'features', 5),
  ('How do savings circles work?', 'Comment fonctionnent les cercles d''épargne ?', 'Create a savings circle, set the contribution amount and frequency, add participants, and the system tracks who contributes and who collects each round.', 'Créez un cercle d''épargne, définissez le montant et la fréquence des cotisations, ajoutez des participants.', 'features', 6);
