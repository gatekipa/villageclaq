-- Storage buckets and RLS policies for file uploads
-- Buckets are created via Supabase dashboard; these policies control access.

-- ─── Receipts bucket ──────────────────────────────────────────────────────────
-- Used for payment receipt photo uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can view receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can delete own receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Avatars bucket ───────────────────────────────────────────────────────────
-- Used for user profile avatar uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Group Documents bucket ──────────────────────────────────────────────────
-- Used for group document uploads and group logo uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('group-documents', 'group-documents', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload group documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'group-documents');

CREATE POLICY "Authenticated users can view group documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'group-documents');

CREATE POLICY "Authenticated users can delete group documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'group-documents');
