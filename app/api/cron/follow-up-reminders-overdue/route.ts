import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Use service role (admin) for cron jobs to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    )

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

    // Find all leads with next_follow_up < today (overdue), grouped by assigned rep
    const { data: overdueLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, business_name, owner_name, assigned_rep_id, next_follow_up')
      .lt('next_follow_up', today)
      .not('assigned_rep_id', 'is', null)
      .not('next_follow_up', 'is', null)

    if (leadsError) {
      console.error('[Follow-up Overdue Reminders] Leads query error:', leadsError)
      return NextResponse.json({ error: 'Failed to query leads' }, { status: 500 })
    }

    if (!overdueLeads || overdueLeads.length === 0) {
      return NextResponse.json({
        message: 'No overdue follow-ups',
        emailsSent: 0,
        debug: { today, query: 'lt(next_follow_up, today)', leadsError }
      })
    }

    // Group leads by assigned_rep_id
    const leadsByRep: Record<string, any[]> = {}
    for (const lead of overdueLeads) {
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
      console.error('[Follow-up Overdue Reminders] Admin query error:', adminError)
      return NextResponse.json({ error: 'Failed to get admin config' }, { status: 500 })
    }

    const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)
    if (!smtpConfig) {
      console.warn('[Follow-up Overdue Reminders] No SMTP configured')
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 500 })
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
        console.error(`[Follow-up Overdue Reminders] Failed to get rep ${repId}:`, repError)
        continue
      }

      // Check if we already sent a reminder for this person today (to avoid spam)
      // but allow new leads to be added to the overdue list
      const { data: sentToday } = await supabase
        .from('follow_up_reminders_sent')
        .select('lead_id')
        .eq('user_id', rep.id)
        .eq('reminder_type', 'overdue')
        .gte('sent_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())

      const sentLeadIds = new Set((sentToday || []).map(s => s.lead_id))
      const unseenLeads = leads.filter(l => !sentLeadIds.has(l.id))

      if (unseenLeads.length === 0) continue

      // Sort by how overdue (oldest first)
      unseenLeads.sort((a, b) => {
        const dateA = new Date(a.next_follow_up).getTime()
        const dateB = new Date(b.next_follow_up).getTime()
        return dateA - dateB
      })

      // Calculate days overdue for each lead
      const leadsWithDaysOverdue = unseenLeads.map(lead => {
        const dueDate = new Date(lead.next_follow_up)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        return { ...lead, daysOverdue }
      })

      // Build email
      let emailBody = `<h2 style="color: #ef4444;">⚠️ Overdue Follow-Ups — Action Required</h2>`
      emailBody += `<p>Hi ${rep.name},</p>`
      emailBody += `<p>You have <strong>${unseenLeads.length}</strong> overdue follow-up${unseenLeads.length === 1 ? '' : 's'} that need immediate attention:</p>`
      emailBody += `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">`
      emailBody += `<tr style="background: #f3f4f6; border-bottom: 1px solid #e5e7eb;">`
      emailBody += `<th style="padding: 10px; text-align: left;">Lead</th>`
      emailBody += `<th style="padding: 10px; text-align: left;">Due Date</th>`
      emailBody += `<th style="padding: 10px; text-align: center;">Days Overdue</th>`
      emailBody += `</tr>`

      for (const lead of leadsWithDaysOverdue) {
        const leadName = lead.business_name || lead.owner_name || 'Untitled'
        const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/crm?lead=${lead.id}`
        const dueDate = new Date(lead.next_follow_up).toLocaleDateString()
        const overdueStyle = lead.daysOverdue > 7 ? 'color: #ef4444; font-weight: bold;' : ''
        emailBody += `<tr style="border-bottom: 1px solid #e5e7eb;">`
        emailBody += `<td style="padding: 10px;"><a href="${leadUrl}" style="color: #7c3aed; text-decoration: none;">${leadName}</a></td>`
        emailBody += `<td style="padding: 10px;">${dueDate}</td>`
        emailBody += `<td style="padding: 10px; text-align: center; ${overdueStyle}">${lead.daysOverdue}</td>`
        emailBody += `</tr>`
      }

      emailBody += `</table>`
      emailBody += `<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/crm" style="display: inline-block; padding: 10px 20px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Update Follow-Ups Now</a></p>`
      emailBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">Please update the follow-up dates in your CRM. Once you complete a follow-up, update the lead and set a new follow-up date to remove it from this list.</p>`

      try {
        await transporter.sendMail({
          from: smtpConfig.smtp_user,
          to: rep.email,
          subject: `⚠️ OVERDUE: ${unseenLeads.length} follow-up${unseenLeads.length === 1 ? '' : 's'} require action`,
          html: emailBody,
        })

        // Mark reminders as sent
        const remindersToInsert = unseenLeads.map(lead => ({
          lead_id: lead.id,
          user_id: rep.id,
          reminder_type: 'overdue',
          next_follow_up_date: lead.next_follow_up,
        }))

        await supabase
          .from('follow_up_reminders_sent')
          .insert(remindersToInsert)

        emailsSent++
        console.log(`[Follow-up Overdue Reminders] Sent overdue reminder to ${rep.email} for ${unseenLeads.length} leads`)
      } catch (err) {
        console.error(`[Follow-up Overdue Reminders] Failed to send email to ${rep.email}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${emailsSent} overdue reminder email${emailsSent === 1 ? '' : 's'}`,
      emailsSent,
      leadsProcessed: overdueLeads.length,
    })
  } catch (err) {
    console.error('[Follow-up Overdue Reminders] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
