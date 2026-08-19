-- ============================================================================
-- System Definitions — Recruitment module, APPLICATION FIELDS ONLY.
--
-- Split out from recruitment.sql: that file's second block (job postings —
-- Junior Swine Technician, etc.) already exists in this database under
-- different row ids, so its "on conflict (id) do nothing" doesn't catch the
-- duplicate and Postgres blocks on the underlying
-- system_options_module_id_option_list_legacy_value_key constraint instead.
-- This file is just the application-fields insert, safe to run on its own.
--
-- Run after docs/system-definitions/schema.sql.
-- ============================================================================

insert into system_modules (module_id, source, enabled, business_logic)
values ('mod:recruitment', 'override', true, '{}'::jsonb)
on conflict (module_id) do nothing;

-- Job application form fields (legacy_value = stable field key)
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:recruitment:field:first_name', 'mod:recruitment', 'careers.applicationFields', 'First name', 'first_name', 1,
   '{"step":"personal","fieldKey":"first_name","fieldType":"text","required":true}'::jsonb),
  ('opt:recruitment:field:last_name', 'mod:recruitment', 'careers.applicationFields', 'Last name', 'last_name', 2,
   '{"step":"personal","fieldKey":"last_name","fieldType":"text","required":true}'::jsonb),
  ('opt:recruitment:field:email', 'mod:recruitment', 'careers.applicationFields', 'Email address', 'email', 3,
   '{"step":"personal","fieldKey":"email","fieldType":"email","required":true}'::jsonb),
  ('opt:recruitment:field:phone', 'mod:recruitment', 'careers.applicationFields', 'Mobile phone', 'phone', 4,
   '{"step":"personal","fieldKey":"phone","fieldType":"phone","required":true}'::jsonb),
  ('opt:recruitment:field:dob', 'mod:recruitment', 'careers.applicationFields', 'Date of birth', 'date_of_birth', 5,
   '{"step":"personal","fieldKey":"date_of_birth","fieldType":"date","required":true}'::jsonb),
  ('opt:recruitment:field:gender', 'mod:recruitment', 'careers.applicationFields', 'Gender', 'gender', 6,
   '{"step":"personal","fieldKey":"gender","fieldType":"select","required":true,"options":["Male","Female"]}'::jsonb),
  ('opt:recruitment:field:nationality', 'mod:recruitment', 'careers.applicationFields', 'Nationality', 'nationality', 7,
   '{"step":"personal","fieldKey":"nationality","fieldType":"text","required":true}'::jsonb),
  ('opt:recruitment:field:citizen', 'mod:recruitment', 'careers.applicationFields', 'Ghana citizen?', 'is_citizen', 8,
   '{"step":"personal","fieldKey":"is_citizen","fieldType":"select","required":true,"options":["Yes","No"]}'::jsonb),
  ('opt:recruitment:field:ghana_card', 'mod:recruitment', 'careers.applicationFields', 'Ghana Card number', 'ghana_card_no', 9,
   '{"step":"personal","fieldKey":"ghana_card_no","fieldType":"text","required":true,"showWhen":{"field":"is_citizen","equals":"Yes"}}'::jsonb),
  ('opt:recruitment:field:passport_no', 'mod:recruitment', 'careers.applicationFields', 'Passport number', 'passport_number', 10,
   '{"step":"personal","fieldKey":"passport_number","fieldType":"text","required":true,"showWhen":{"field":"is_citizen","equals":"No"}}'::jsonb),
  ('opt:recruitment:field:passport_bio', 'mod:recruitment', 'careers.applicationFields', 'Passport bio page (photo)', 'passport_bio_page', 11,
   '{"step":"personal","fieldKey":"passport_bio_page","fieldType":"file","required":true,"accept":"image/*,.pdf","showWhen":{"field":"is_citizen","equals":"No"}}'::jsonb),
  ('opt:recruitment:field:experience', 'mod:recruitment', 'careers.applicationFields', 'Work experience', 'work_experience', 20,
   '{"step":"experience","fieldKey":"work_experience","fieldType":"textarea","required":true}'::jsonb),
  ('opt:recruitment:field:education', 'mod:recruitment', 'careers.applicationFields', 'Educational qualifications', 'education', 21,
   '{"step":"experience","fieldKey":"education","fieldType":"textarea","required":true}'::jsonb),
  ('opt:recruitment:field:cert', 'mod:recruitment', 'careers.applicationFields', 'Certificates / qualifications (upload)', 'certificates', 22,
   '{"step":"experience","fieldKey":"certificates","fieldType":"file","required":true,"accept":".pdf,image/*"}'::jsonb),
  ('opt:recruitment:field:cv', 'mod:recruitment', 'careers.applicationFields', 'Curriculum vitae (CV)', 'cv', 30,
   '{"step":"documents","fieldKey":"cv","fieldType":"file","required":true,"accept":".pdf,.doc,.docx,image/*"}'::jsonb),
  ('opt:recruitment:field:cover', 'mod:recruitment', 'careers.applicationFields', 'Cover letter', 'cover_letter', 31,
   '{"step":"documents","fieldKey":"cover_letter","fieldType":"textarea","required":true}'::jsonb),
  ('opt:recruitment:field:ref1_name', 'mod:recruitment', 'careers.applicationFields', 'Reference 1 — full name', 'reference_1_name', 32,
   '{"step":"documents","fieldKey":"reference_1_name","fieldType":"text","required":true}'::jsonb),
  ('opt:recruitment:field:ref1_phone', 'mod:recruitment', 'careers.applicationFields', 'Reference 1 — phone', 'reference_1_phone', 33,
   '{"step":"documents","fieldKey":"reference_1_phone","fieldType":"phone","required":true}'::jsonb),
  ('opt:recruitment:field:ref1_email', 'mod:recruitment', 'careers.applicationFields', 'Reference 1 — email', 'reference_1_email', 34,
   '{"step":"documents","fieldKey":"reference_1_email","fieldType":"email","required":false}'::jsonb),
  ('opt:recruitment:field:ref1_rel', 'mod:recruitment', 'careers.applicationFields', 'Reference 1 — relationship', 'reference_1_relationship', 35,
   '{"step":"documents","fieldKey":"reference_1_relationship","fieldType":"text","required":true}'::jsonb),
  ('opt:recruitment:field:ref2_name', 'mod:recruitment', 'careers.applicationFields', 'Reference 2 — full name', 'reference_2_name', 36,
   '{"step":"documents","fieldKey":"reference_2_name","fieldType":"text","required":true}'::jsonb),
  ('opt:recruitment:field:ref2_phone', 'mod:recruitment', 'careers.applicationFields', 'Reference 2 — phone', 'reference_2_phone', 37,
   '{"step":"documents","fieldKey":"reference_2_phone","fieldType":"phone","required":true}'::jsonb),
  ('opt:recruitment:field:ref2_email', 'mod:recruitment', 'careers.applicationFields', 'Reference 2 — email', 'reference_2_email', 38,
   '{"step":"documents","fieldKey":"reference_2_email","fieldType":"email","required":false}'::jsonb),
  ('opt:recruitment:field:ref2_rel', 'mod:recruitment', 'careers.applicationFields', 'Reference 2 — relationship', 'reference_2_relationship', 39,
   '{"step":"documents","fieldKey":"reference_2_relationship","fieldType":"text","required":true}'::jsonb)
on conflict (id) do nothing;

NOTIFY pgrst, 'reload schema';
