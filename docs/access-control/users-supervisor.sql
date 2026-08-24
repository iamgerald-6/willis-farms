-- Assigned reporting supervisor for each user (used by appraisals, etc.)
-- Run in Supabase SQL editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS supervisor_id uuid;

-- Self-reference not allowed; optional FK when supervisor is another user row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_supervisor_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_supervisor_id_fkey
      FOREIGN KEY (supervisor_id) REFERENCES public.users (user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_supervisor_id_idx ON public.users (supervisor_id);

NOTIFY pgrst, 'reload schema';
