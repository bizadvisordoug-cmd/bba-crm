import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendCampaignStep } from '@/lib/campaign-sender'

// User-initiated send of an enrollment's current step. The delivery logic
// lives in lib/campaign-sender so this and the scheduler cron
// (/api/cron/campaign-steps) stay in lockstep.

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { enrollmentId } = await req.json()
    if (!enrollmentId) {
      return NextResponse.json({ error: 'Missing enrollmentId' }, { status: 400 })
    }

    const result = await sendCampaignStep(supabase, enrollmentId, user.id)

    if (!result.sent) {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }

    return NextResponse.json({ success: true, step: result.step, type: result.type })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send' },
      { status: 500 }
    )
  }
}
