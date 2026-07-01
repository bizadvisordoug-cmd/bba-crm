-- Migration 012: Close anonymous read access to public.users
-- ============================================================
-- The "Public: read rep info for booking" policy (migration 006) was written
-- as `FOR SELECT TO anon USING (true)`. Postgres RLS policies filter ROWS,
-- not columns — despite the migration's comment ("only expose the columns
-- needed — not passwords or tokens"), USING (true) grants read on every
-- column of every row to any unauthenticated request, including smtp_pass,
-- imap_pass, pop_pass, and google_calendar_token.
--
-- Nothing in the app actually needs anon to read this table directly:
-- the public booking page derives the rep name from the URL slug client-side,
-- and /api/book (the only other consumer) now resolves rep info + the GCal
-- token via the service-role client (see lib/supabase-admin.ts), which
-- bypasses RLS entirely and never touches this policy.

DROP POLICY IF EXISTS "Public: read rep info for booking" ON public.users;
