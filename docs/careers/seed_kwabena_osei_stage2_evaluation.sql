-- TEST/DEV SEED — not part of the normal migration set.
--
-- Run this AFTER seed_kwabena_osei_stage1_panel_review.sql. It builds on
-- top of whatever interview_form_data already exists for that row (it
-- merges, it does not overwrite Stage 1) and takes the candidate the rest
-- of the way to the Evaluation screen:
--
--   1. Marks Stage 1 as reviewed & passed (skips the manual Pass click —
--      if you already clicked "Pass to Stage 2 setup" in the UI this is
--      a harmless no-op there).
--   2. Adds a Stage 2 panel — same 3 people (Kofi, Ama, Dr. Yaw Owusu) —
--      with "invites sent" and a scheduled practical.
--   3. Adds a fully submitted Stage 2 practical grading form from each of
--      them, plus one from HR, ratings mostly 4s and 5s.
--   4. Sets status = 'interview'.
--
-- interview_submitted_at is deliberately left NULL, so opening the
-- application lands you on the live "Final evaluation — all panel
-- scores" screen (Stage 1 + Stage 2 grader matrices, combined weighted
-- score, disqualifiers checklist) with Save draft / Submit evaluation
-- still available — nothing is finalized for you.
--
-- Note on the numbers you'll see: Stage 2's weighted score column only
-- reflects the "Practical assessment" line (15% of the guide's total
-- weight), so Stage 2 grader totals show as a small number like ~0.6–0.7
-- out of 5 — that's the guide's own weighting model (practical is only
-- one slice of the full combined score), not a mistake in this seed.
--
-- Matches the application by name only, most recent submission. Safe to
-- re-run.

with target as (
  select id, interview_form_data
  from public.job_applications
  where full_name ilike '%kwabena%'
    and full_name ilike '%osei%'
  order by created_at desc
  limit 1
),
ids as (
  select
    encode(gen_random_bytes(8), 'hex')  as m1_id,
    encode(gen_random_bytes(8), 'hex')  as m2_id,
    encode(gen_random_bytes(8), 'hex')  as m3_id,
    encode(gen_random_bytes(24), 'hex') as m1_token,
    encode(gen_random_bytes(24), 'hex') as m2_token,
    encode(gen_random_bytes(24), 'hex') as m3_token
)
update public.job_applications ja
set
  status = 'interview',
  interview_form_data = coalesce(target.interview_form_data, '{}'::jsonb) || jsonb_build_object(
    'current_stage', 3,

    'stage1_review', coalesce(target.interview_form_data->'stage1_review', '{}'::jsonb) || jsonb_build_object(
      'passed', true,
      'reviewed_at', coalesce(target.interview_form_data #>> '{stage1_review,reviewed_at}', (now() - interval '20 hours')::text),
      'reviewed_by', coalesce(target.interview_form_data #>> '{stage1_review,reviewed_by}', 'Sheila Amoafo (HR)')
    ),

    'stage1_completed_at', coalesce(target.interview_form_data->>'stage1_completed_at', (now() - interval '20 hours')::text),
    'stage2_scheduled_at', (now() - interval '3 hours')::text,
    'stage2_schedule_sent_at', (now() - interval '6 hours')::text,
    'stage2_completed_at', (now() - interval '1 hour')::text,

    'setup', coalesce(target.interview_form_data->'setup', '{}'::jsonb) || jsonb_build_object(
      'stage2_members', jsonb_build_array(
        jsonb_build_object('id', i.m1_id, 'name', 'Kofi Boateng', 'email', 'kofi.boateng@willsfarms.com', 'stage', 2, 'access_token', i.m1_token),
        jsonb_build_object('id', i.m2_id, 'name', 'Ama Serwaa',  'email', 'ama.serwaa@willsfarms.com',  'stage', 2, 'access_token', i.m2_token),
        jsonb_build_object('id', i.m3_id, 'name', 'Dr. Yaw Owusu', 'email', 'yaw.owusu@willsfarms.com', 'stage', 2, 'access_token', i.m3_token)
      ),
      'stage2_scheduled_at', (now() - interval '3 hours')::text,
      'stage2_location', 'Wills Farms — Eastern Region Breeding Farm, Practical Yard',
      'stage2_invites_sent_at', (now() - interval '6 hours')::text
    ),

    'panel_submissions', coalesce(target.interview_form_data->'panel_submissions', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'member_id', i.m1_id,
        'member_name', 'Kofi Boateng',
        'stage', 2,
        'submitted_at', (now() - interval '1 hour')::text,
        'scenario_ratings', jsonb_build_object(
          'P1', jsonb_build_object('rating', 5, 'notes', 'Methodical, hygienic, welfare-aware pen routine.'),
          'P2', jsonb_build_object('rating', 4, 'notes', 'Spotted abnormal behaviour quickly, escalated correctly.'),
          'P3', jsonb_build_object('rating', 5, 'notes', 'Strong PPE and tool discipline throughout.')
        )
      ),
      jsonb_build_object(
        'member_id', i.m2_id,
        'member_name', 'Ama Serwaa',
        'stage', 2,
        'submitted_at', (now() - interval '1 hour')::text,
        'scenario_ratings', jsonb_build_object(
          'P1', jsonb_build_object('rating', 4, 'notes', 'Good method, slightly slow pace.'),
          'P2', jsonb_build_object('rating', 4, 'notes', 'Systematic observation approach.'),
          'P3', jsonb_build_object('rating', 4, 'notes', 'Compliant; minor tool-storage lapse, corrected on prompt.')
        )
      ),
      jsonb_build_object(
        'member_id', i.m3_id,
        'member_name', 'Dr. Yaw Owusu',
        'stage', 2,
        'submitted_at', (now() - interval '1 hour')::text,
        'scenario_ratings', jsonb_build_object(
          'P1', jsonb_build_object('rating', 5, 'notes', 'Confident, welfare-first handling.'),
          'P2', jsonb_build_object('rating', 5, 'notes', 'Excellent clinical eye for early signs.'),
          'P3', jsonb_build_object('rating', 4, 'notes', 'Solid biosecurity awareness.')
        )
      )
    ),

    'hr_submission', coalesce(target.interview_form_data->'hr_submission', '{}'::jsonb) || jsonb_build_object(
      'stage2', jsonb_build_object(
        'submitted_at', (now() - interval '1 hour')::text,
        'scenario_ratings', jsonb_build_object(
          'P1', jsonb_build_object('rating', 5, 'notes', 'Confident and methodical.'),
          'P2', jsonb_build_object('rating', 4, 'notes', 'Good observation discipline.'),
          'P3', jsonb_build_object('rating', 5, 'notes', 'Excellent biosecurity compliance.')
        )
      )
    )
  ),
  updated_at = now()
from target, ids i
where ja.id = target.id
returning ja.id, ja.full_name, ja.status, ja.reference_number;

NOTIFY pgrst, 'reload schema';
