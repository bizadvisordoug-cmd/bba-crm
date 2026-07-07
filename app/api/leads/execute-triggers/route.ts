import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.log('[Triggers] Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { leadId, newStageName } = await req.json()
    console.log(`[Triggers] Executing for lead ${leadId}, stage ${newStageName}`)

    if (!leadId || !newStageName) {
      return NextResponse.json({ error: 'leadId and newStageName are required' }, { status: 400 })
    }

    // Fetch lead details with related people and businesses
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_name, owner_name, owner_id, business_id, assigned_rep_id, owner:people(name, email), business:businesses(business_name)')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.log(`[Triggers] Lead not found: ${leadError?.message}`)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Get actual business/owner names from related tables if not in lead directly
    const leadName = lead.business_name || (lead.business && typeof lead.business === 'object' && (lead.business as any).business_name) || 'Lead'
    const ownerName = lead.owner_name || (lead.owner && typeof lead.owner === 'object' && (lead.owner as any).name) || 'Contact'

    console.log(`[Triggers] Found lead: ${leadName} (owner: ${ownerName})`)

    // Fetch all enabled triggers for this stage
    const { data: triggers, error: triggersError } = await supabase
      .from('pipeline_stage_triggers')
      .select('*')
      .eq('stage_name', newStageName)
      .eq('enabled', true)

    if (triggersError) {
      console.error(`[Triggers] Failed to fetch triggers: ${triggersError.message}`)
      return NextResponse.json({ error: `Trigger fetch error: ${triggersError.message}` }, { status: 500 })
    }

    if (!triggers || triggers.length === 0) {
      console.log(`[Triggers] No triggers for stage: ${newStageName}`)
      return NextResponse.json({ success: true, message: 'No triggers to execute', triggersFound: 0 })
    }

    console.log(`[Triggers] Found ${triggers.length} triggers`)

    // Get SMTP config from any admin account (owner or vp_operations)
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, smtp_host, smtp_port, smtp_user, smtp_pass, name, role')
      .in('role', ['owner', 'vp_operations'])

    if (adminError) {
      console.error(`[Triggers] Failed to fetch admins: ${adminError.message}`)
      return NextResponse.json(
        { error: `Admin fetch error: ${adminError.message}` },
        { status: 500 }
      )
    }

    // Find first admin with SMTP configured
    const ownerUser = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)

    if (!ownerUser) {
      console.error(`[Triggers] No admin account with SMTP configured`)
      return NextResponse.json(
        { error: 'SMTP not configured for any admin account' },
        { status: 500 }
      )
    }

    console.log(`[Triggers] SMTP configured for: ${ownerUser.smtp_user}`)

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
    const executionLog: any[] = []

    for (const trigger of triggers) {
      console.log(`[Triggers] Processing trigger ${trigger.id}, type: ${trigger.recipient_type}`)

      let recipientEmail: string | null = null
      let recipientName: string | null = null

      if (trigger.recipient_type === 'assigned_rep' && lead.assigned_rep_id) {
        const { data: rep, error: repError } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', lead.assigned_rep_id)
          .single()

        if (repError) {
          console.error(`[Triggers] Failed to fetch rep: ${repError.message}`)
          executionLog.push({ trigger: trigger.id, error: `Rep fetch failed: ${repError.message}` })
          continue
        }

        if (rep) {
          recipientEmail = rep.email
          recipientName = rep.name
          console.log(`[Triggers] Rep recipient: ${recipientEmail}`)
        }
      } else if (trigger.recipient_type === 'lead_owner') {
        // Get the person (owner) associated with the lead
        const { data: leadWithOwner, error: ownerFetchError } = await supabase
          .from('leads')
          .select('owner_id')
          .eq('id', leadId)
          .single()

        if (ownerFetchError) {
          console.error(`[Triggers] Failed to fetch lead owner_id: ${ownerFetchError.message}`)
          executionLog.push({ trigger: trigger.id, error: `Lead owner fetch failed` })
          continue
        }

        if (leadWithOwner?.owner_id) {
          const { data: person, error: personError } = await supabase
            .from('people')
            .select('email, name')
            .eq('id', leadWithOwner.owner_id)
            .single()

          if (personError) {
            console.error(`[Triggers] Failed to fetch person: ${personError.message}`)
            executionLog.push({ trigger: trigger.id, error: `Person fetch failed` })
            continue
          }

          if (person?.email) {
            recipientEmail = person.email
            recipientName = person.name
            console.log(`[Triggers] Person recipient: ${recipientEmail}`)
          } else {
            console.warn(`[Triggers] Person found but no email: ${person?.name}`)
            executionLog.push({ trigger: trigger.id, error: `Person has no email` })
          }
        } else {
          console.warn(`[Triggers] Lead has no owner_id`)
          executionLog.push({ trigger: trigger.id, error: `Lead has no owner` })
        }
      }

      if (!recipientEmail) {
        console.warn(`[Triggers] No recipient email found for trigger ${trigger.id}`)
        continue
      }

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
        .replace(/{LEAD_NAME}/g, leadName)
        .replace(/{OWNER_NAME}/g, ownerName)
        .replace(/{REP_NAME}/g, repName)

      try {
        console.log(`[Triggers] Sending email to ${recipientEmail} with subject: ${trigger.email_subject}`)
        const info = await transporter.sendMail({
          from: ownerUser.smtp_user,
          to: recipientEmail,
          subject: trigger.email_subject,
          text: emailBody,
        })
        console.log(`[Triggers] Email sent successfully. Message ID: ${info.messageId}`)
        emailsSent++
        executionLog.push({ trigger: trigger.id, status: 'sent', messageId: info.messageId, to: recipientEmail })
      } catch (emailError) {
        console.error(`[Triggers] Failed to send trigger email: ${emailError}`)
        executionLog.push({ trigger: trigger.id, status: 'failed', error: String(emailError) })
      }
    }

    console.log(`[Triggers] Completed. Emails sent: ${emailsSent}`)
    return NextResponse.json({
      success: true,
      message: `Executed ${emailsSent} trigger emails`,
      emailsSent,
      triggersProcessed: triggers.length,
      executionLog,
    })
  } catch (err) {
    console.error('Trigger execution error:', err)
    return NextResponse.json({ error: String(err), stack: err instanceof Error ? err.stack : '' }, { status: 500 })
  }
}
