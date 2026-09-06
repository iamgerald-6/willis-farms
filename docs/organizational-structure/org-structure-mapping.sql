-- ============================================================================
-- Org structure mapping set up
-- Run once in the Supabase SQL editor.
--
-- Four levels, each one a real table, each one FK-constrained to require a
-- matching row already exists in the level above it — so it's impossible to
-- e.g. map a department under a site+business-unit combination that was
-- never itself mapped in "Site set up". This is what makes the whole chain
-- (Site -> Business unit -> Department -> Section -> Position) enforceable
-- at the database level, not just in the UI.
--
-- Create job posting reads these to cascade its dropdowns: pick a Site,
-- only its mapped Business units show; pick one of those, only its mapped
-- Departments show; and so on down to Position. A level with NO rows at
-- all in its mapping table yet (nothing has been set up for it) falls back
-- to showing every item unrestricted, so existing installs keep working
-- until someone actually starts mapping that level.
-- ============================================================================

-- 1. Site set up — which business units are available under each site.
create table if not exists org_site_business_units (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, business_unit_id)
);

-- 2. Business unit set up — which departments are available under each
-- already-mapped site+business-unit pair.
create table if not exists org_business_unit_departments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  business_unit_id uuid not null,
  department_id uuid not null references departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, business_unit_id, department_id),
  foreign key (site_id, business_unit_id)
    references org_site_business_units (site_id, business_unit_id)
    on delete cascade
);

-- 3. Department set up — which sections are available under each
-- already-mapped site+business-unit+department chain.
create table if not exists org_department_sections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  business_unit_id uuid not null,
  department_id uuid not null,
  section_id uuid not null references sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, business_unit_id, department_id, section_id),
  foreign key (site_id, business_unit_id, department_id)
    references org_business_unit_departments (site_id, business_unit_id, department_id)
    on delete cascade
);

-- 4. Section set up — which job positions are available under each
-- already-mapped site+business-unit+department+section chain.
create table if not exists org_section_positions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  business_unit_id uuid not null,
  department_id uuid not null,
  section_id uuid not null,
  position_id uuid not null references custom_position(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, business_unit_id, department_id, section_id, position_id),
  foreign key (site_id, business_unit_id, department_id, section_id)
    references org_department_sections (site_id, business_unit_id, department_id, section_id)
    on delete cascade
);

notify pgrst, 'reload schema';
