import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { campaignId, isShared } = body

    if (!campaignId || isShared === undefined) {
      return NextResponse.json(
        { error: 'Missing campaignId or isShared' },
        { status: 400 }
      )
    }

    // Get the original campaign
    const { data: originalCampaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('name, type, description')
      .eq('id', campaignId)
      .single()

    if (campaignError || !originalCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get the original campaign steps
    const { data: originalSteps, error: stepsError } = await supabase
      .from('campaign_steps')
      .select('step_number, type, delay_days, subject, body')
      .eq('campaign_id', campaignId)
      .order('step_number')

    if (stepsError) {
      return NextResponse.json(
        { error: 'Failed to fetch campaign steps' },
        { status: 500 }
      )
    }

    // Create new campaign with "(Copy)" suffix
    const newCampaignName = `${originalCampaign.name} (Copy)`

    const { data: newCampaign, error: createError } = await supabase
      .from('campaigns')
      .insert({
        name: newCampaignName,
        type: originalCampaign.type,
        description: originalCampaign.description,
        is_shared: isShared,
      })
      .select()
      .single()

    if (createError || !newCampaign) {
      return NextResponse.json(
        { error: 'Failed to create campaign' },
        { status: 500 }
      )
    }

    // Copy all steps to the new campaign
    if (originalSteps && originalSteps.length > 0) {
      const stepsToInsert = originalSteps.map((step: any) => ({
        campaign_id: newCampaign.id,
        step_number: step.step_number,
        type: step.type,
        delay_days: step.delay_days,
        subject: step.subject,
        body: step.body,
      }))

      const { error: insertStepsError } = await supabase
        .from('campaign_steps')
        .insert(stepsToInsert)

      if (insertStepsError) {
        // Delete the campaign if steps insertion fails
        await supabase.from('campaigns').delete().eq('id', newCampaign.id)
        return NextResponse.json(
          { error: 'Failed to copy campaign steps' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      campaign: newCampaign,
      message: `Campaign copied as "${newCampaignName}"`
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
