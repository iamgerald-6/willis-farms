-- ============================================================================
-- Organizational structure — Site ↔ Business unit mapping
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- schema.sql (this references sites and business_units).
--
-- Records which business units belong to which site. A site can have
-- several business units, and a business unit could in principle be reused
-- across more than one site — this junction table is what makes that
-- many-to-many relationship possible, without sites or business_units
-- themselves needing to know about each other.
--
-- No Postgres RLS — same pattern as the rest of Organizational Structure;
-- Next.js API routes use the service-role key and enforce access in code.
-- ============================================================================

create table if not exists site_business_units (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, business_unit_id)
);

create index if not exists site_business_units_site_id_idx
  on site_business_units (site_id);
create index if not exists site_business_units_business_unit_id_idx
  on site_business_units (business_unit_id);

notify pgrst, 'reload schema';
