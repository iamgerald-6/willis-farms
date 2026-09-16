-- ============================================================================
-- Site tagging for Policies (manuals) and SOPs (content)
-- Phase 3 of the multi-site access architecture — see
-- docs/SITE_ACCESS_ARCHITECTURE.md. Run ONCE in the Supabase SQL editor.
--
-- WHY: Policies and SOPs were originally classified as pure company-wide
-- documents with no site concept (Phase 2 decision, confirmed at the time).
-- That decision has since been revised — a policy or SOP can now belong to
-- one or more specific sites, defaulting to "all sites" if the uploader
-- doesn't pick any. This migration is the data-layer step only: it adds the
-- tagging tables and wires the upload/edit flows to populate them. It does
-- NOT add any read-side filtering yet — nothing restricts who currently
-- sees a site-tagged document. That's a separate, later step.
--
-- MODEL: a join table per module, not a single site_id column, because a
-- document can be tagged to several specific sites at once, not just one.
-- A manual/content row with ZERO rows in its join table means "applies to
-- all sites" (the default) — this is a deliberate convention, not an
-- oversight: most documents will stay untagged (company-wide), so "no rows"
-- being the common case avoids needing a placeholder "all sites" sentinel
-- row for every single site.
-- ============================================================================

create table if not exists manual_sites (
  manual_id uuid not null references manuals(id) on delete cascade,
  site_id integer not null references sites(id) on delete cascade,
  primary key (manual_id, site_id)
);
create index if not exists manual_sites_site_id_idx on manual_sites(site_id);

create table if not exists content_sites (
  content_id bigint not null references content(id) on delete cascade,
  site_id integer not null references sites(id) on delete cascade,
  primary key (content_id, site_id)
);
create index if not exists content_sites_site_id_idx on content_sites(site_id);

notify pgrst, 'reload schema';
