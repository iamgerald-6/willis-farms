-- User Manual feature — a single, admin-editable staff guide (not a
-- browsable library like Policies/SOP). Every logged-in user can view/
-- download the current version; only System Administrator or Super Admin
-- can upload a new one. The most recently uploaded row is "current"; older
-- rows stay queryable as history, same idea as manual_versions but for one
-- document instead of a library.
--
-- Run this against Supabase, then: notify pgrst, 'reload schema';

create table if not exists user_manual_versions (
  id uuid primary key default gen_random_uuid(),
  cloudinary_url text not null,
  cloudinary_public_id text,
  file_name text not null,
  file_size_bytes bigint,
  version_label text not null,
  version_notes text,
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists user_manual_versions_uploaded_at_idx
  on user_manual_versions (uploaded_at desc);

notify pgrst, 'reload schema';
