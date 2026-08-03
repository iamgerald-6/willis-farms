-- Multi-document extraction: "Add Tasks From a Document" now accepts
-- several files at once (e.g. a policy document plus a separate document
-- describing it) and reads them together as one set, so Claude can
-- cross-reference across files instead of only ever seeing one at a time.
--
-- tm_extraction_jobs was built around a single file (file_name/file_url,
-- both NOT NULL) — this adds a `files` column holding every file in the
-- job, and makes the original two columns nullable. They're kept (and
-- still populated with the first file) only so any code that hasn't been
-- updated to read `files` doesn't break; new code should read `files`.
--
-- Run this once in the Supabase SQL editor, same as the earlier files.

alter table tm_extraction_jobs add column if not exists files jsonb not null default '[]';
alter table tm_extraction_jobs alter column file_name drop not null;
alter table tm_extraction_jobs alter column file_url drop not null;

-- Backfill existing single-file jobs into the new column so old job rows
-- still display correctly anywhere `files` is read instead of the legacy
-- columns.
update tm_extraction_jobs
set files = jsonb_build_array(jsonb_build_object('file_name', file_name, 'file_url', file_url))
where files = '[]'::jsonb and file_name is not null and file_url is not null;
