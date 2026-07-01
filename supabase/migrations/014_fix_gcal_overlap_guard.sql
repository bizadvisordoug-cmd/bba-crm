-- Migration 014: Scope the overlap guard to CRM-native bookings only
-- ============================================================
-- Migration 013 added appointments_no_overlap to stop double-booked public
-- slots — correct for that flow, but the constraint is table-wide, so it
-- also fires during Google Calendar sync. Real calendars routinely have
-- legitimately overlapping events (an all-day event alongside a timed
-- meeting, back-to-back calls), and syncGCalEvents inserts a rep's whole
-- fetched batch in one statement — the first overlapping pair makes Postgres
-- reject the entire insert atomically, silently emptying out sync results.
--
-- Fix: only guard rows we actually create through the public booking flow
-- (gcal_synced = false). Rows mirrored from Google are a read-only copy of
-- someone else's calendar — we don't get to say two of their real events
-- "conflict."

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_no_overlap;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    rep_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status <> 'cancelled' AND gcal_synced = false);
