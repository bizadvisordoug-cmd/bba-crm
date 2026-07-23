import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    )

    // Find all email logs with replied_at timestamps
    const { data: repliedEmails, error: repliedError } = await supabase
      .from('email_logs')
      .select('id, campaign_enrollment_id')
      .not('replied_at', 'is', null)

    if (repliedError) {
      console.error('[Campaign Reply Auto-Complete] Email logs query error:', repliedError)
      return NextResponse.json({ error: 'Failed to query email logs' }, { status: 500 })
    }

    if (!repliedEmails || repliedEmails.length === 0) {
      return NextResponse.json({ message: 'No replied emails to process', processed: 0 })
    }

    // Get all enrollment IDs from replied emails
    const enrollmentIds = repliedEmails
      .filter((e: any) => e.campaign_enrollment_id)
      .map((e: any) => e.campaign_enrollment_id)

    if (enrollmentIds.length === 0) {
      return NextResponse.json({ message: 'No enrollments to complete', processed: 0 })
    }

    // Update enrollments to "completed" status
    const { error: updateError, data: updatedEnrollments } = await supabase
      .from('campaign_enrollments')
      .update({ status: 'completed' })
      .in('id', enrollmentIds)
      .select('id, lead_id, campaign_id')

    if (updateError) {
      console.error('[Campaign Reply Auto-Complete] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update enrollments' }, { status: 500 })
    }

    console.log(`[Campaign Reply Auto-Complete] Completed ${enrollmentIds.length} enrollments due to prospect replies`)

    return NextResponse.json({
      success: true,
      message: `Auto-completed ${enrollmentIds.length} campaign enrollment(s) due to prospect replies`,
      processed: enrollmentIds.length,
    })
  } catch (err) {
    console.error('[Campaign Reply Auto-Complete] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
