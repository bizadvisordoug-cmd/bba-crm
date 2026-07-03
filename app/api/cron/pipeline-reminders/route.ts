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

    // Get all users with enabled reminders
    const { data: reminders } = await supabase
      .from('pipeline_reminder_settings')
      .select('user_id, pipeline_stage, reminder_days, enabled')
      .eq('enabled', true)

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ message: 'No reminders enabled' })
    }

    // Group by user
    const remindersByUser: Record<string, any[]> = {}
    for (const reminder of reminders) {
      if (!reminder.reminder_days || !reminder.user_id) continue
      if (!remindersByUser[reminder.user_id]) {
        remindersByUser[reminder.user_id] = []
      }
      remindersByUser[reminder.user_id].push(reminder)
    }

    // For each user, find their stale leads
    const emailsByUser: Record<string, { email: string; stageMap: Record<string, any[]> }> = {}

    for (const [userId, userReminders] of Object.entries(remindersByUser)) {
      // Get user email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', userId)
        .single()
      if (userError || !user?.email) continue

      const stageMap: Record<string, any[]> = {}

      for (const reminder of userReminders) {
        const thresholdDate = new Date()
        thresholdDate.setDate(thresholdDate.getDate() - reminder.reminder_days)

        // Find stale leads in this stage assigned to this user
        const { data: staleLeads } = await supabase
          .from('leads')
          .select('id, business_name, owner_name')
          .eq('pipeline_stage', reminder.pipeline_stage)
          .eq('assigned_rep_id', userId)
          .lt('updated_at', thresholdDate.toISOString())
          .neq('pipeline_stage', 'Active Client')

        if (staleLeads && staleLeads.length > 0) {
          stageMap[reminder.pipeline_stage] = staleLeads
        }
      }

      // Only add user if they have stale leads
      if (Object.keys(stageMap).length > 0) {
        emailsByUser[userId] = {
          email: user.email,
          stageMap,
        }
      }
    }

    // Send emails to each user
    let emailsSent = 0

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SSL === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    for (const [userId, { email, stageMap }] of Object.entries(emailsByUser)) {
      // Build email body
      let emailBody = `<h2>Pipeline Reminders — ${new Date().toLocaleDateString()}</h2><p>The following leads have been in their current stage for longer than your configured reminder threshold:</p>`

      for (const [stage, leads] of Object.entries(stageMap)) {
        emailBody += `<h3>${stage} (${leads.length} leads)</h3><ul>`
        for (const lead of leads) {
          const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/crm?lead=${lead.id}`
          emailBody += `<li><a href="${leadUrl}">${lead.business_name} — ${lead.owner_name}</a></li>`
        }
        emailBody += `</ul>`
      }

      emailBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">This is an automated reminder. Update your reminder thresholds in <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=pipeline-reminders">Settings</a>.</p>`

      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: `Pipeline Reminders — ${new Date().toLocaleDateString()}`,
          html: emailBody,
        })
        emailsSent++
      } catch (err) {
        console.error(`Failed to send reminder email to ${email}:`, err)
      }
    }

    return NextResponse.json({ success: true, emailsSent })
  } catch (err) {
    console.error('Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
