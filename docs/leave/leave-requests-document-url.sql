-- Supporting document URL on leave requests (Cloudinary secure_url).
-- The apply form uploads the file first, then POSTs /api/leave/apply with
-- document_url. Without this column, PostgREST returns:
--   Could not find the 'document_url' column of 'leave_requests' in the schema cache
--
-- Run once in the Supabase SQL editor, then retry the leave application.

alter table public.leave_requests
  add column if not exists document_url text;

notify pgrst, 'reload schema';
