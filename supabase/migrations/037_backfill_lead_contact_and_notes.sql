-- ============================================================
-- Migration 037: repair leads created through the two-step lead form
--
-- Two details entered on step 1 of that form never reached where the UI reads
-- them back, so leads created before the fix look like the data was lost:
--
--   1. A new person's phone and email were written to public.people, but the
--      lead's own owner_phone / email columns — what the CRM list, the map and
--      the drawer display — were left empty.
--   2. The Notes box wrote leads.notes, which nothing in the UI displays. The
--      drawer's Notes tab reads public.lead_notes.
--
-- This copies both into place. It only fills blanks: a lead that already has a
-- phone, an email, or a note keeps what it has.
--
-- NOTE: this rewrites existing rows. Review the two SELECTs at the bottom
-- before applying if you want to see what it will touch.
-- ============================================================

-- ── 1. Contact details from the person record ─────────────────────────────

UPDATE public.leads l
SET    owner_phone = p.phone
FROM   public.people p
WHERE  l.owner_id = p.id
  AND  p.phone IS NOT NULL
  AND  btrim(p.phone) <> ''
  AND  (l.owner_phone IS NULL OR btrim(l.owner_phone) = '');

UPDATE public.leads l
SET    email = p.email
FROM   public.people p
WHERE  l.owner_id = p.id
  AND  p.email IS NOT NULL
  AND  btrim(p.email) <> ''
  AND  (l.email IS NULL OR btrim(l.email) = '');

-- ── 2. Notes into the table the drawer reads ──────────────────────────────
-- Attributed to the assigned rep, since lead_notes.user_id is NOT NULL and the
-- form did not record who typed it. Leads with no rep are left alone.

INSERT INTO public.lead_notes (lead_id, user_id, note_type, content, created_at)
SELECT l.id, l.assigned_rep_id, 'other', btrim(l.notes), COALESCE(l.created_at, now())
FROM   public.leads l
WHERE  l.notes IS NOT NULL
  AND  btrim(l.notes) <> ''
  AND  l.assigned_rep_id IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM public.lead_notes n
         WHERE  n.lead_id = l.id
           AND  btrim(n.content) = btrim(l.notes)
       );

-- ── Checks ────────────────────────────────────────────────────────────────
-- Leads whose notes could not be moved because no rep is assigned:
--   SELECT id, business_name, notes FROM public.leads
--   WHERE notes IS NOT NULL AND btrim(notes) <> '' AND assigned_rep_id IS NULL;
--
-- Leads still missing contact details because the person record has none:
--   SELECT l.id, l.business_name, l.owner_name
--   FROM public.leads l LEFT JOIN public.people p ON p.id = l.owner_id
--   WHERE (l.owner_phone IS NULL OR btrim(l.owner_phone) = '')
--     AND (l.email IS NULL OR btrim(l.email) = '');

NOTIFY pgrst, 'reload schema';
