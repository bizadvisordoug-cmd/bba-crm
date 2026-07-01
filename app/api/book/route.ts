import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createGCalEvent } from '@/lib/gcal'

// Public endpoint — no auth required (booking pages are public).
// The anon INSERT policy on appointments (migration 006) permits this.

function parseSlotTime(date: string, slot: string): Date {
  // slot format: "9:00 AM", "2:30 PM"
  const [time, ampm] = slot.split(' ')
  const [h, m] = time.split(':').map(Number)
  let hour = h
  if (ampm === 'PM' && hour !== 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
}

export async function POST(req: NextRequest) {
  const { repSlug, date, time, name, email, phone, businessName } = await req.json()

  if (!repSlug || !date || !time || !name || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // Find the rep by matching the name slug (same transform as the booking page URL).
  // Also select google_calendar_token so we can push the booking to their GCal.
  // Uses the admin client (service role) — this route is hit by unauthenticated
  // visitors, and public.users has no anon-readable policy (it holds SMTP/IMAP
  // credentials and calendar tokens), so a normal anon-scoped client can't read it.
  const { data: users } = await createAdminClient().from('users').select('id, name, google_calendar_token')
  const rep = (users ?? []).find(
    u => u.name.toLowerCase().replace(/\s+/g, '-') === repSlug
  )
  if (!rep) {
    return NextResponse.json({ error: 'Rep not found' }, { status: 404 })
  }

  const startTime  = parseSlotTime(date, time)
  const endTime    = new Date(startTime.getTime() + 30 * 60 * 1000) // 30-minute slot
  const title      = `${businessName} — ${name}`
  const notes      = `Booked via web\nName: ${name}\nEmail: ${email}\nPhone: ${phone ?? ''}\nBusiness: ${businessName}`

  // 1. Insert into Supabase
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      rep_id:     rep.id,
      title,
      start_time: startTime.toISOString(),
      end_time:   endTime.toISOString(),
      notes,
      status:     'scheduled',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 2. Push to the rep's Google Calendar (best-effort)
  if (rep.google_calendar_token) {
    const googleEventId = await createGCalEvent(rep.google_calendar_token, {
      title,
      startTime:   startTime.toISOString(),
      endTime:     endTime.toISOString(),
      description: notes,
    })

    if (googleEventId) {
      // Back-fill the Google event ID so the next page-load sync can match it
      await supabase
        .from('appointments')
        .update({ google_event_id: googleEventId })
        .eq('id', data.id)
    } else {
      console.warn('[book] GCal push failed for appointment', data.id)
    }
  }

  return NextResponse.json({ success: true, appointmentId: data.id })
}
