-- TEST/DEV SEED — not part of the normal migration set.
--
-- Purpose: skip real panel-invite emails (Resend is restricted to your own
-- address right now) and drop in a fully-graded Stage 1 straight into the
-- application, so you can open the Kwabena Osei test application in the
-- Recruitment dashboard and see exactly what the "Stage 1 — Panel grading
-- review" screen looks like once 3 panel members + HR have all submitted
-- and the candidate is passing.
--
-- What this does to the ONE matching application row:
--   1. Sets status = 'shortlisted' (unlocks the Interview tab in the UI —
--      harmless if AI screening already set this).
--   2. Writes interview_form_data with:
--        - 3 Stage 1 panel members (already "invited")
--        - a submitted Stage 1 grading form from each of them
--        - a submitted Stage 1 grading form from HR
--        - ratings weighted mostly 4s and 5s → averages to ~3.8/5, solidly
--          in the "Hire" band (3.3+), so the review screen shows him
--          passing
--   3. Leaves stage1_review UNSET, so when you open the application the
--      workflow lands exactly on the "Stage 1 — Panel grading review"
--      screen with live "Pass to Stage 2 setup" / "Reject candidate"
--      buttons — nothing is auto-decided for you.
--
-- Matches the application by name only (full_name contains "Kwabena" and
-- "Osei"), most recent submission — so it doesn't matter which email
-- address you actually used when you submitted the test application.
-- Safe to re-run — it just overwrites the same test row's interview data.

with target as (
  select id
  from public.job_applications
  where full_name ilike '%kwabena%'
    and full_name ilike '%osei%'
  order by created_at desc
  limit 1
),
tokens as (
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
  status = 'shortlisted',
  interview_form_data = jsonb_build_object(
    'current_stage', 1,

    'setup', jsonb_build_object(
      'stage1_members', jsonb_build_array(
        jsonb_build_object('id', t.m1_id, 'name', 'Kofi Boateng', 'email', 'kofi.boateng@willsfarms.com', 'stage', 1, 'access_token', t.m1_token),
        jsonb_build_object('id', t.m2_id, 'name', 'Ama Serwaa',  'email', 'ama.serwaa@willsfarms.com',  'stage', 1, 'access_token', t.m2_token),
        jsonb_build_object('id', t.m3_id, 'name', 'Dr. Yaw Owusu', 'email', 'yaw.owusu@willsfarms.com', 'stage', 1, 'access_token', t.m3_token)
      ),
      'interview_start_at', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'location', 'Wills Farms — Eastern Region Breeding Farm, Panel Room',
      'stage1_invites_sent_at', (now() - interval '2 days')::text,
      'invites_sent_at', (now() - interval '2 days')::text,
      'candidate_invite_sent_at', (now() - interval '2 days')::text
    ),

    'panel_submissions', jsonb_build_array(
      jsonb_build_object(
        'member_id', t.m1_id,
        'member_name', 'Kofi Boateng',
        'stage', 1,
        'submitted_at', (now() - interval '1 day')::text,
        'screening', jsonb_build_object(
          'A1', jsonb_build_object('pass','yes','notes','Certificate in Animal Health sighted, CTVET-accredited college.'),
          'A2', jsonb_build_object('pass','yes','notes','Confirmed comfortable lifting 50kg sacks.'),
          'A3', jsonb_build_object('pass','yes','notes','Clear on biosecurity/PPE expectations.'),
          'A4', jsonb_build_object('pass','yes','notes','Available for early starts and weekend rotation.')
        ),
        'question_ratings', jsonb_build_object(
          'Q1', jsonb_build_object('rating', 5, 'notes', 'Realistic, grounded picture of daily work.'),
          'Q2', jsonb_build_object('rating', 4, 'notes', 'Specific detail on field-attachment routines.'),
          'Q3', jsonb_build_object('rating', 5, 'notes', 'Comfortable with supervised progression.'),
          'Q4', jsonb_build_object('rating', 4, 'notes', 'Systematic pen-check approach.'),
          'Q5', jsonb_build_object('rating', 5, 'notes', 'Correct escalation instinct on a weak piglet.'),
          'Q6', jsonb_build_object('rating', 5, 'notes', 'Strong grasp of biosecurity rationale.'),
          'Q7', jsonb_build_object('rating', 4, 'notes', 'Would correct or report a colleague.'),
          'Q8', jsonb_build_object('rating', 5, 'notes', 'Links records to KPIs and customer trust.'),
          'Q9', jsonb_build_object('rating', 4, 'notes', 'Honest about backdating risk.'),
          'Q10', jsonb_build_object('rating', 5, 'notes', 'Volunteers mistakes unprompted.')
        )
      ),
      jsonb_build_object(
        'member_id', t.m2_id,
        'member_name', 'Ama Serwaa',
        'stage', 1,
        'submitted_at', (now() - interval '1 day')::text,
        'screening', jsonb_build_object(
          'A1', jsonb_build_object('pass','yes','notes','Original certificate sighted.'),
          'A2', jsonb_build_object('pass','yes','notes','No concerns on physical capacity.'),
          'A3', jsonb_build_object('pass','yes','notes','Willing and clear on rules.'),
          'A4', jsonb_build_object('pass','yes','notes','Flexible on schedule.')
        ),
        'question_ratings', jsonb_build_object(
          'Q1', jsonb_build_object('rating', 4, 'notes', 'Good understanding of the work.'),
          'Q2', jsonb_build_object('rating', 4, 'notes', 'Attachment experience checks out.'),
          'Q3', jsonb_build_object('rating', 4, 'notes', 'Comfortable with structured progression.'),
          'Q4', jsonb_build_object('rating', 4, 'notes', 'Reasonable pen-check method.'),
          'Q5', jsonb_build_object('rating', 5, 'notes', 'Good welfare instinct.'),
          'Q6', jsonb_build_object('rating', 4, 'notes', 'Solid biosecurity understanding.'),
          'Q7', jsonb_build_object('rating', 5, 'notes', 'Would report the breach.'),
          'Q8', jsonb_build_object('rating', 4, 'notes', 'Understands record importance.'),
          'Q9', jsonb_build_object('rating', 4, 'notes', 'Honest response.'),
          'Q10', jsonb_build_object('rating', 4, 'notes', 'Would self-report.')
        )
      ),
      jsonb_build_object(
        'member_id', t.m3_id,
        'member_name', 'Dr. Yaw Owusu',
        'stage', 1,
        'submitted_at', (now() - interval '1 day')::text,
        'screening', jsonb_build_object(
          'A1', jsonb_build_object('pass','yes','notes','Qualification verified.'),
          'A2', jsonb_build_object('pass','yes','notes','Physically capable.'),
          'A3', jsonb_build_object('pass','yes','notes','Compliant attitude.'),
          'A4', jsonb_build_object('pass','yes','notes','Available as required.')
        ),
        'question_ratings', jsonb_build_object(
          'Q1', jsonb_build_object('rating', 4, 'notes', 'Sensible expectations.'),
          'Q2', jsonb_build_object('rating', 5, 'notes', 'Detailed, credible attachment account.'),
          'Q3', jsonb_build_object('rating', 4, 'notes', 'Accepts supervised authorisation path.'),
          'Q4', jsonb_build_object('rating', 5, 'notes', 'Clinically sound observation checklist.'),
          'Q5', jsonb_build_object('rating', 4, 'notes', 'Reports rather than intervening.'),
          'Q6', jsonb_build_object('rating', 5, 'notes', 'Understands genetic-tier protection.'),
          'Q7', jsonb_build_object('rating', 4, 'notes', 'Would correct a colleague.'),
          'Q8', jsonb_build_object('rating', 4, 'notes', 'Good grasp of record accuracy.'),
          'Q9', jsonb_build_object('rating', 5, 'notes', 'No hesitation on immediate reporting.'),
          'Q10', jsonb_build_object('rating', 4, 'notes', 'Consistent honesty theme.')
        )
      )
    ),

    'hr_submission', jsonb_build_object(
      'stage1', jsonb_build_object(
        'submitted_at', (now() - interval '1 day')::text,
        'screening', jsonb_build_object(
          'A1', jsonb_build_object('pass','yes','notes','Confirmed with college.'),
          'A2', jsonb_build_object('pass','yes','notes','Confirmed.'),
          'A3', jsonb_build_object('pass','yes','notes','Confirmed.'),
          'A4', jsonb_build_object('pass','yes','notes','Confirmed.')
        ),
        'question_ratings', jsonb_build_object(
          'Q1', jsonb_build_object('rating', 5, 'notes', 'Strong, grounded motivation.'),
          'Q2', jsonb_build_object('rating', 5, 'notes', 'Very specific attachment detail.'),
          'Q3', jsonb_build_object('rating', 4, 'notes', 'Comfortable with structured progression.'),
          'Q4', jsonb_build_object('rating', 4, 'notes', 'Good observation approach.'),
          'Q5', jsonb_build_object('rating', 5, 'notes', 'Correct escalation instinct.'),
          'Q6', jsonb_build_object('rating', 5, 'notes', 'Clear on biosecurity rationale.'),
          'Q7', jsonb_build_object('rating', 5, 'notes', 'Would report a breach.'),
          'Q8', jsonb_build_object('rating', 4, 'notes', 'Understands records link to KPIs.'),
          'Q9', jsonb_build_object('rating', 4, 'notes', 'Honest under pressure.'),
          'Q10', jsonb_build_object('rating', 5, 'notes', 'Self-reports without prompting.')
        )
      )
    )
  ),
  updated_at = now()
from target, tokens t
where ja.id = target.id
returning ja.id, ja.full_name, ja.status, ja.reference_number;

NOTIFY pgrst, 'reload schema';
