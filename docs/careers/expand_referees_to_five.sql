-- Referees 1 and 2 are now always required (no "add second referee" toggle
-- any more). Referees 3-5 are optional, added one at a time via "Add
-- another referee" on the application form. Run this whole file once.

-- 1) Referee 2 fields: drop the old conditional showWhen, relabel to match
--    the new "Referee 2" naming (was "Second referee"), keep required: true.
update system_options
set label = replace(label, 'Second referee', 'Referee 2'),
    rules = (rules - 'showWhen') || jsonb_build_object('required', true)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value in (
    'reference_2_name', 'reference_2_phone', 'reference_2_email', 'reference_2_relationship'
  );

-- 2) Relabel referee 1 fields for consistency (was plain "Referee — X").
update system_options
set label = replace(label, 'Referee —', 'Referee 1 —')
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value in (
    'reference_1_name', 'reference_1_phone', 'reference_1_email', 'reference_1_relationship'
  );

-- 3) Insert referee slots 3, 4, 5 — optional, gated behind add_referee_{n}.
insert into system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
values
  ('opt:recruitment:field:ref3_name', 'mod:recruitment', 'careers.applicationFields', 'Referee 3 — full name', 'reference_3_name', 40, true,
    jsonb_build_object('step','documents','fieldKey','reference_3_name','fieldType','text','required',true,'showWhen',jsonb_build_object('field','add_referee_3','equals','Yes'))),
  ('opt:recruitment:field:ref3_phone', 'mod:recruitment', 'careers.applicationFields', 'Referee 3 — phone', 'reference_3_phone', 41, true,
    jsonb_build_object('step','documents','fieldKey','reference_3_phone','fieldType','phone','required',true,'showWhen',jsonb_build_object('field','add_referee_3','equals','Yes'))),
  ('opt:recruitment:field:ref3_email', 'mod:recruitment', 'careers.applicationFields', 'Referee 3 — email', 'reference_3_email', 42, true,
    jsonb_build_object('step','documents','fieldKey','reference_3_email','fieldType','email','required',true,'showWhen',jsonb_build_object('field','add_referee_3','equals','Yes'))),
  ('opt:recruitment:field:ref3_rel', 'mod:recruitment', 'careers.applicationFields', 'Referee 3 — relationship', 'reference_3_relationship', 43, true,
    jsonb_build_object('step','documents','fieldKey','reference_3_relationship','fieldType','text','required',true,'showWhen',jsonb_build_object('field','add_referee_3','equals','Yes'))),

  ('opt:recruitment:field:ref4_name', 'mod:recruitment', 'careers.applicationFields', 'Referee 4 — full name', 'reference_4_name', 44, true,
    jsonb_build_object('step','documents','fieldKey','reference_4_name','fieldType','text','required',true,'showWhen',jsonb_build_object('field','add_referee_4','equals','Yes'))),
  ('opt:recruitment:field:ref4_phone', 'mod:recruitment', 'careers.applicationFields', 'Referee 4 — phone', 'reference_4_phone', 45, true,
    jsonb_build_object('step','documents','fieldKey','reference_4_phone','fieldType','phone','required',true,'showWhen',jsonb_build_object('field','add_referee_4','equals','Yes'))),
  ('opt:recruitment:field:ref4_email', 'mod:recruitment', 'careers.applicationFields', 'Referee 4 — email', 'reference_4_email', 46, true,
    jsonb_build_object('step','documents','fieldKey','reference_4_email','fieldType','email','required',true,'showWhen',jsonb_build_object('field','add_referee_4','equals','Yes'))),
  ('opt:recruitment:field:ref4_rel', 'mod:recruitment', 'careers.applicationFields', 'Referee 4 — relationship', 'reference_4_relationship', 47, true,
    jsonb_build_object('step','documents','fieldKey','reference_4_relationship','fieldType','text','required',true,'showWhen',jsonb_build_object('field','add_referee_4','equals','Yes'))),

  ('opt:recruitment:field:ref5_name', 'mod:recruitment', 'careers.applicationFields', 'Referee 5 — full name', 'reference_5_name', 48, true,
    jsonb_build_object('step','documents','fieldKey','reference_5_name','fieldType','text','required',true,'showWhen',jsonb_build_object('field','add_referee_5','equals','Yes'))),
  ('opt:recruitment:field:ref5_phone', 'mod:recruitment', 'careers.applicationFields', 'Referee 5 — phone', 'reference_5_phone', 49, true,
    jsonb_build_object('step','documents','fieldKey','reference_5_phone','fieldType','phone','required',true,'showWhen',jsonb_build_object('field','add_referee_5','equals','Yes'))),
  ('opt:recruitment:field:ref5_email', 'mod:recruitment', 'careers.applicationFields', 'Referee 5 — email', 'reference_5_email', 50, true,
    jsonb_build_object('step','documents','fieldKey','reference_5_email','fieldType','email','required',true,'showWhen',jsonb_build_object('field','add_referee_5','equals','Yes'))),
  ('opt:recruitment:field:ref5_rel', 'mod:recruitment', 'careers.applicationFields', 'Referee 5 — relationship', 'reference_5_relationship', 51, true,
    jsonb_build_object('step','documents','fieldKey','reference_5_relationship','fieldType','text','required',true,'showWhen',jsonb_build_object('field','add_referee_5','equals','Yes')))
on conflict (id) do update set
  label = excluded.label,
  legacy_value = excluded.legacy_value,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  rules = excluded.rules;

-- 4) Widen the referee-reference-check tables from a hard "1 or 2 only"
--    limit to 1-5, so slots 3-5 can also get invite emails / submissions.
alter table public.referee_reference_tokens
  drop constraint if exists referee_reference_tokens_referee_index_check;
alter table public.referee_reference_tokens
  add constraint referee_reference_tokens_referee_index_check check (referee_index between 1 and 5);

alter table public.referee_reference_submissions
  drop constraint if exists referee_reference_submissions_referee_index_check;
alter table public.referee_reference_submissions
  add constraint referee_reference_submissions_referee_index_check check (referee_index between 1 and 5);

-- Verify:
-- select legacy_value, label, rules from system_options
-- where module_id = 'mod:recruitment' and option_list = 'careers.applicationFields'
-- and legacy_value like 'reference_%' order by sort_order;
