import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCampaignStep } from '@/lib/campaign-sender'

export const runtime = 'nodejs'
// SMTP round-trips are slow; give the batch room to finish.
export const maxDuration = 60

// How many enrollments to process per run. Keeps the function inside its
// time budget; anything left over is picked up on the next run.
const BATCH_LIMIT = 50

/**
 * Sends campaign steps that have come due.
 *
 * Each enrollment advances at most one step per run, so a lead who is several
 * steps overdue (e.g. enrolled before scheduling existed) catches up gradually
 * instead of receiving a burst of back-dated messages.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Service role: the cron has no user session, and RLS would otherwise hide
    // enrollments belonging to other reps.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    )

    const { data: due, error } = await supabase
      .from('campaign_enrollments')
      .select('id, lead:leads(assigned_rep_id)')
      .eq('status', 'active')
      .not('next_send_at', 'is', null)
      .lte('next_send_at', new Date().toISOString())
      .order('next_send_at', { ascending: true })
      .limit(BATCH_LIMIT)

    if (error) {
      console.error('[Campaign Steps] Query error:', error)
      return NextResponse.json({ error: 'Failed to query enrollments' }, { status: 500 })
    }

    if (!due || due.length === 0) {
      return NextResponse.json({ message: 'No campaign steps due', sent: 0 })
    }

    let sent = 0
    const skipped: { enrollmentId: string; reason: string }[] = []

    for (const enrollment of due) {
      // No session here, so credit the lead's assigned rep in the activity log.
      const repId = (enrollment.lead as any)?.assigned_rep_id ?? null

      try {
        const result = await sendCampaignStep(supabase, enrollment.id, repId)
        if (result.sent) {
          sent++
        } else {
          // Scheduling is left untouched on a soft failure (missing SMTP,
          // missing email) so the enrollment resumes once the gap is fixed.
          skipped.push({ enrollmentId: enrollment.id, reason: result.reason || 'unknown' })
        }
      } catch (err) {
        // One bad enrollment must not abort the rest of the batch.
        console.error(`[Campaign Steps] Failed on enrollment ${enrollment.id}:`, err)
        skipped.push({ enrollmentId: enrollment.id, reason: String(err) })
      }
    }

    console.log(`[Campaign Steps] Sent ${sent} of ${due.length} due; ${skipped.length} skipped`)
    if (skipped.length > 0) {
      console.log('[Campaign Steps] Skipped:', JSON.stringify(skipped))
    }

    return NextResponse.json({
      success: true,
      due: due.length,
      sent,
      skipped,
    })
  } catch (err) {
    console.error('[Campaign Steps] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
