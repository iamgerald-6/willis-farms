-- ============================================================================
-- Careers — Educational Certificates ended up on the wrong step (personal
-- instead of experience), likely from the same admin edit that cleared its
-- field key. Move it back.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{step}', '"experience"'::jsonb)
where id = 'opt:recruitment:field:cert';

NOTIFY pgrst, 'reload schema';

select id, legacy_value, label, rules->>'step' as step
from system_options
where id = 'opt:recruitment:field:cert';
