-- ============================================================================
-- Supporting tables missing from the "willsfarms-test" project
-- ============================================================================
-- These aren't part of Task Manager — they're tables the REST OF the app
-- (Policies & Ops, SOP library) already expects, but this particular test
-- project never had them created. Run this once so those areas of the app
-- work too, e.g. so Task Manager's "choose existing document" picker has
-- something to find.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Policies & Ops: manuals + versions ─────────────────────────────────────
-- category is plain text on purpose — not a fixed list, so you can type any
-- category when uploading, not just HR/Biosecurity/Finance/Breeding.
create table if not exists manuals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists manual_versions (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references manuals(id) on delete cascade,
  version_label text not null,
  cloudinary_public_id text,
  cloudinary_url text not null,
  file_name text not null,
  file_size_bytes bigint,
  version_notes text,
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists manual_versions_manual_id_idx on manual_versions(manual_id);

-- ── SOP / content library ────────────────────────────────────────────────
create table if not exists content (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  sub_category text,
  description text,
  cover_image_url text,
  video_url text,
  video_duration_minutes int,
  document_url text,
  document_read_minutes int,
  created_by uuid,
  created_at timestamptz not null default now()
);
