-- Add file_url column to meeting_minutes for uploaded file attachments
ALTER TABLE meeting_minutes ADD COLUMN IF NOT EXISTS file_url TEXT;

COMMENT ON COLUMN meeting_minutes.file_url IS 'Public URL of an uploaded file attachment (PDF, DOCX, image) stored in group-documents bucket';
