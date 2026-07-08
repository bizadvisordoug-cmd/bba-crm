import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get today's date in Central Time (CT/CDT)
    const ctFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const ctDate = ctFormatter.format(new Date())
    const [month, day, year] = ctDate.split('/')
    const today = `${year}-${month}-${day}`

    // Find all leads with next_follow_up = today, grouped by assigned rep
    const { data: dueTodayLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, business_name, owner_name, assigned_rep_id, owner:people(name), business:businesses(business_name)')
      .eq('next_follow_up', today)
      .not('assigned_rep_id', 'is', null)

    if (leadsError) {
      console.error('[Follow-up Reminders] Leads query error:', leadsError)
      return NextResponse.json({ error: 'Failed to query leads' }, { status: 500 })
    }

    if (!dueTodayLeads || dueTodayLeads.length === 0) {
      return NextResponse.json({ message: 'No follow-ups due today', emailsSent: 0 })
    }

    // Group leads by assigned_rep_id
    const leadsByRep: Record<string, any[]> = {}
    for (const lead of dueTodayLeads) {
      if (!lead.assigned_rep_id) continue
      if (!leadsByRep[lead.assigned_rep_id]) {
        leadsByRep[lead.assigned_rep_id] = []
      }
      leadsByRep[lead.assigned_rep_id].push(lead)
    }

    // Get SMTP config from any admin account
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, smtp_host, smtp_port, smtp_user, smtp_pass, name, role')
      .in('role', ['owner', 'vp_operations'])

    if (adminError) {
      console.error('[Follow-up Reminders] Admin query error:', adminError)
      return NextResponse.json({ error: 'Failed to get admin config' }, { status: 500 })
    }

    const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)
    console.log('[Follow-up Reminders] Admin users found:', adminUsers?.length || 0)
    console.log('[Follow-up Reminders] SMTP config:', smtpConfig ? { host: smtpConfig.smtp_host, port: smtpConfig.smtp_port, user: smtpConfig.smtp_user } : 'NONE FOUND')
    if (!smtpConfig) {
      console.warn('[Follow-up Reminders] No SMTP configured')
      return NextResponse.json({ error: 'SMTP not configured', adminCount: adminUsers?.length || 0 }, { status: 500 })
    }

    const transporter = nodemailer.createTransport({
      host: smtpConfig.smtp_host,
      port: smtpConfig.smtp_port || 587,
      secure: false,
      auth: {
        user: smtpConfig.smtp_user,
        pass: smtpConfig.smtp_pass,
      },
    })

    let emailsSent = 0

    // Send emails to each rep
    for (const [repId, leads] of Object.entries(leadsByRep)) {
      // Get rep's email
      const { data: rep, error: repError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', repId)
        .single()

      if (repError || !rep?.email) {
        console.error(`[Follow-up Reminders] Failed to get rep ${repId}:`, repError)
        continue
      }

      // Check which reminders have already been sent today
      const { data: sentToday } = await supabase
        .from('follow_up_reminders_sent')
        .select('lead_id')
        .eq('user_id', rep.id)
        .eq('reminder_type', 'due_today')
        .eq('next_follow_up_date', today)

      const sentLeadIds = new Set((sentToday || []).map(s => s.lead_id))
      const unseenLeads = leads.filter(l => !sentLeadIds.has(l.id))

      if (unseenLeads.length === 0) continue

      // Build email
      let emailBody = `<h2>Follow-Up Reminders Due Today — ${new Date().toLocaleDateString()}</h2>`
      emailBody += `<p>Hi ${rep.name},</p>`
      emailBody += `<p>You have <strong>${unseenLeads.length}</strong> lead${unseenLeads.length === 1 ? '' : 's'} due for follow-up today:</p>`
      emailBody += `<ul>`

      for (const lead of unseenLeads) {
        const leadName = lead.business_name || (lead.business && typeof lead.business === 'object' && (lead.business as any).business_name) || 'Untitled'
        const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/crm?lead=${lead.id}`
        emailBody += `<li><a href="${leadUrl}">${leadName}</a> (Owner: ${lead.owner_name || (lead.owner && typeof lead.owner === 'object' && (lead.owner as any).name) || 'Unknown'})</li>`
      }

      emailBody += `</ul>`
      emailBody += `<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/crm" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px;">View in CRM</a></p>`
      emailBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">This is an automated reminder for follow-ups scheduled for today.</p>`

      try {
        console.log(`[Follow-up Reminders] Sending email to ${rep.email} for ${unseenLeads.length} leads`)
        await transporter.sendMail({
          from: smtpConfig.smtp_user,
          to: rep.email,
          subject: `Follow-Up Reminder — ${unseenLeads.length} lead${unseenLeads.length === 1 ? '' : 's'} due today`,
          html: emailBody,
        })
        console.log(`[Follow-up Reminders] Email sent successfully to ${rep.email}`)

        // Mark reminders as sent
        const remindersToInsert = unseenLeads.map(lead => ({
          lead_id: lead.id,
          user_id: rep.id,
          reminder_type: 'due_today',
          next_follow_up_date: today,
        }))

        await supabase
          .from('follow_up_reminders_sent')
          .insert(remindersToInsert)

        emailsSent++
        console.log(`[Follow-up Reminders] Sent due-today reminder to ${rep.email} for ${unseenLeads.length} leads`)
      } catch (err) {
        console.error(`[Follow-up Reminders] Failed to send email to ${rep.email}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${emailsSent} follow-up reminder email${emailsSent === 1 ? '' : 's'}`,
      emailsSent,
      leadsProcessed: dueTodayLeads.length,
    })
  } catch (err) {
    console.error('[Follow-up Reminders] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
