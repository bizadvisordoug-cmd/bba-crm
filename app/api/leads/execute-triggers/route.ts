import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { leadId, newStageName } = await req.json()

    if (!leadId || !newStageName) {
      return NextResponse.json({ error: 'leadId and newStageName are required' }, { status: 400 })
    }

    // Fetch lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_name, owner_name, assigned_rep_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Fetch all enabled triggers for this stage
    const { data: triggers, error: triggersError } = await supabase
      .from('pipeline_stage_triggers')
      .select('*')
      .eq('stage_name', newStageName)
      .eq('enabled', true)

    if (triggersError || !triggers || triggers.length === 0) {
      return NextResponse.json({ success: true, message: 'No triggers to execute' })
    }

    // Get user's SMTP config (owner/VP)
    const { data: ownerUser, error: ownerError } = await supabase
      .from('users')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, name')
      .eq('role', 'owner')
      .single()

    if (ownerError || !ownerUser?.smtp_host) {
      return NextResponse.json(
        { error: 'SMTP not configured for owner account' },
        { status: 500 }
      )
    }

    const transporter = nodemailer.createTransport({
      host: ownerUser.smtp_host,
      port: ownerUser.smtp_port || 587,
      secure: false,
      auth: {
        user: ownerUser.smtp_user,
        pass: ownerUser.smtp_pass,
      },
    })

    let emailsSent = 0

    for (const trigger of triggers) {
      let recipientEmail: string | null = null
      let recipientName: string | null = null

      if (trigger.recipient_type === 'assigned_rep' && lead.assigned_rep_id) {
        const { data: rep } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', lead.assigned_rep_id)
          .single()
        if (rep) {
          recipientEmail = rep.email
          recipientName = rep.name
        }
      } else if (trigger.recipient_type === 'lead_owner') {
        // Get the person (owner) associated with the lead
        const { data: leadWithOwner } = await supabase
          .from('leads')
          .select('owner_id, people(email, name)')
          .eq('id', leadId)
          .single()

        if (leadWithOwner?.people && Array.isArray(leadWithOwner.people) && leadWithOwner.people[0]) {
          recipientEmail = leadWithOwner.people[0].email
          recipientName = leadWithOwner.people[0].name
        }
      }

      if (!recipientEmail) continue

      // Get assigned rep name for variable substitution
      let repName = 'Team'
      if (lead.assigned_rep_id) {
        const { data: rep } = await supabase
          .from('users')
          .select('name')
          .eq('id', lead.assigned_rep_id)
          .single()
        if (rep) repName = rep.name
      }

      // Replace variables in email body
      const emailBody = trigger.email_body
        .replace(/{LEAD_NAME}/g, lead.business_name || lead.owner_name || 'Lead')
        .replace(/{OWNER_NAME}/g, lead.owner_name || 'Contact')
        .replace(/{REP_NAME}/g, repName)

      try {
        await transporter.sendMail({
          from: ownerUser.smtp_user,
          to: recipientEmail,
          subject: trigger.email_subject,
          text: emailBody,
        })
        emailsSent++
      } catch (emailError) {
        console.error(`Failed to send trigger email: ${emailError}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Executed ${emailsSent} trigger emails`,
      emailsSent,
    })
  } catch (err) {
    console.error('Trigger execution error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
