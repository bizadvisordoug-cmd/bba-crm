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

    // Get all reminder settings
    const { data: reminders } = await supabase
      .from('pipeline_reminder_settings')
      .select('*')
      .eq('enabled', true)

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ message: 'No reminders enabled' })
    }

    // For each reminder setting, find stale leads
    const emailsByRep: Record<string, { stage: string; leads: any[] }[]> = {}

    for (const reminder of reminders) {
      if (!reminder.reminder_days) continue

      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() - reminder.reminder_days)

      // Find leads in this stage that haven't been updated in X days
      const { data: staleLeads } = await supabase
        .from('leads')
        .select('id, business_name, owner_name, assigned_rep_id, assigned_rep:users(id, name, email)')
        .eq('pipeline_stage', reminder.pipeline_stage)
        .lt('updated_at', thresholdDate.toISOString())
        .neq('pipeline_stage', 'Active Client')

      if (staleLeads && staleLeads.length > 0) {
        for (const lead of staleLeads) {
          const repId = lead.assigned_rep_id
          if (!repId) continue

          if (!emailsByRep[repId]) {
            emailsByRep[repId] = []
          }

          emailsByRep[repId].push({
            stage: reminder.pipeline_stage,
            lead,
          })
        }
      }
    }

    // Send emails to each rep
    let emailsSent = 0
    for (const [repId, stageGroups] of Object.entries(emailsByRep)) {
      const repEmail = stageGroups[0]?.lead?.assigned_rep?.email
      if (!repEmail) continue

      // Group by stage
      const byStage: Record<string, any[]> = {}
      for (const item of stageGroups) {
        if (!byStage[item.stage]) byStage[item.stage] = []
        byStage[item.stage].push(item.lead)
      }

      // Build email body
      let emailBody = `<h2>Pipeline Reminders — ${new Date().toLocaleDateString()}</h2><p>The following leads have been in their current stage for longer than your configured reminder threshold:</p>`

      for (const [stage, leads] of Object.entries(byStage)) {
        emailBody += `<h3>${stage} (${leads.length} leads)</h3><ul>`
        for (const lead of leads) {
          const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/crm?lead=${lead.id}`
          emailBody += `<li><a href="${leadUrl}">${lead.business_name} — ${lead.owner_name}</a></li>`
        }
        emailBody += `</ul>`
      }

      emailBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">This is an automated reminder. Update your reminder thresholds in Settings.</p>`

      // Send email
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SSL === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })

      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: repEmail,
          subject: `Pipeline Reminders — ${new Date().toLocaleDateString()}`,
          html: emailBody,
        })
        emailsSent++
      } catch (err) {
        console.error(`Failed to send reminder email to ${repEmail}:`, err)
      }
    }

    return NextResponse.json({ success: true, emailsSent })
  } catch (err) {
    console.error('Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
