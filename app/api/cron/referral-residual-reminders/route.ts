import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createServerSupabaseClient()

    // Get today's date in Central Time
    const ctFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const ctDate = ctFormatter.format(new Date())
    const [month, day, year] = ctDate.split('/')
    const today = `${year}-${month}-${day}`
    const dayOfMonth = parseInt(day)

    console.log(`[Referral Residuals] Checking for payment reminders on day ${dayOfMonth} of the month`)

    // Get all POS systems with their payment days
    const { data: posSystems, error: posError } = await supabase
      .from('pos_systems')
      .select('name, payment_day')
      .eq('active', true)
      .order('display_order')

    if (posError) {
      console.error('[Referral Residuals] POS systems query error:', posError)
      return NextResponse.json({ error: 'Failed to query POS systems' }, { status: 500 })
    }

    if (!posSystems || posSystems.length === 0) {
      return NextResponse.json({ message: 'No POS systems configured', emailsSent: 0 })
    }

    // Find which POS systems have a payment today (send reminder day after payment_day)
    const posSystemsPayingToday = posSystems.filter(pos => {
      if (!pos.payment_day) return false
      const reminderDay = pos.payment_day === 31 ? 1 : pos.payment_day + 1
      return dayOfMonth === reminderDay
    })

    if (posSystemsPayingToday.length === 0) {
      return NextResponse.json({ message: 'No POS systems paying today', emailsSent: 0 })
    }

    console.log(`[Referral Residuals] Reminders due for: ${posSystemsPayingToday.map(p => p.name).join(', ')}`)

    // Find all leads with active residual referrals for POS systems paying today
    const posNamesPayingToday = posSystemsPayingToday.map(p => p.name)
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, business_name, referred_by, referral_percentage, referral_type, monthly_processing_volume, suggested_pos_system, status')
      .eq('referral_type', 'residual')
      .eq('status', 'Active Client')
      .in('suggested_pos_system', posNamesPayingToday)
      .not('referred_by', 'is', null)
      .not('referral_percentage', 'is', null)

    if (leadsError) {
      console.error('[Referral Residuals] Leads query error:', leadsError)
      return NextResponse.json({ error: 'Failed to query leads' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'No residual referrals due today', emailsSent: 0 })
    }

    // Group by referred_by person
    const leadsByReferrer: Record<string, any[]> = {}
    for (const lead of leads) {
      if (!lead.referred_by) continue
      if (!leadsByReferrer[lead.referred_by]) {
        leadsByReferrer[lead.referred_by] = []
      }
      leadsByReferrer[lead.referred_by].push(lead)
    }

    // Get SMTP config
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, smtp_host, smtp_port, smtp_user, smtp_pass, name, role')
      .in('role', ['owner', 'vp_operations'])

    if (adminError) {
      console.error('[Referral Residuals] Admin query error:', adminError)
      return NextResponse.json({ error: 'Failed to get admin config' }, { status: 500 })
    }

    const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)
    if (!smtpConfig) {
      console.warn('[Referral Residuals] No SMTP configured')
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

    // Send reminder for each referrer
    for (const [referrerName, referredLeads] of Object.entries(leadsByReferrer)) {
      // Calculate total owed
      let totalOwed = 0
      const leadDetails: Array<{ name: string; percentage: number; volume: number; estimated: number }> = []

      for (const lead of referredLeads) {
        const volume = lead.monthly_processing_volume || 0
        const percentage = lead.referral_percentage || 0
        const estimated = (volume * percentage) / 100

        totalOwed += estimated
        leadDetails.push({
          name: lead.business_name || 'Untitled',
          percentage,
          volume,
          estimated,
        })
      }

      // Build email
      let emailBody = `<h2 style="color: #10b981;">💰 Residual Referral Payment Reminder</h2>`
      emailBody += `<p>Hi ${smtpConfig.name},</p>`
      emailBody += `<p>Monthly residual payments to <strong>${referrerName}</strong> are due today. Here's the breakdown:</p>`
      emailBody += `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">`
      emailBody += `<tr style="background: #f3f4f6; border-bottom: 1px solid #e5e7eb;">`
      emailBody += `<th style="padding: 10px; text-align: left;">Lead</th>`
      emailBody += `<th style="padding: 10px; text-align: right;">Monthly Volume</th>`
      emailBody += `<th style="padding: 10px; text-align: center;">%</th>`
      emailBody += `<th style="padding: 10px; text-align: right;">Estimated</th>`
      emailBody += `</tr>`

      for (const lead of leadDetails) {
        emailBody += `<tr style="border-bottom: 1px solid #e5e7eb;">`
        emailBody += `<td style="padding: 10px;">${lead.name}</td>`
        emailBody += `<td style="padding: 10px; text-align: right;">$${lead.volume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`
        emailBody += `<td style="padding: 10px; text-align: center;">${lead.percentage}%</td>`
        emailBody += `<td style="padding: 10px; text-align: right; font-weight: bold;">$${lead.estimated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`
        emailBody += `</tr>`
      }

      emailBody += `</table>`
      emailBody += `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-weight: bold;">Total Owed: $${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>`
      emailBody += `<p style="font-size: 12px; color: #666; margin-top: 20px;">Log payment in Settings → Referral Program when complete.</p>`

      try {
        console.log(`[Referral Residuals] Sending reminder for ${referrerName}: $${totalOwed.toFixed(2)}`)
        await transporter.sendMail({
          from: smtpConfig.smtp_user,
          to: smtpConfig.smtp_user,
          subject: `💰 Referral Payment Due to ${referrerName} — $${totalOwed.toFixed(2)}`,
          html: emailBody,
        })
        emailsSent++
      } catch (err) {
        console.error(`[Referral Residuals] Failed to send email:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${emailsSent} referral payment reminder${emailsSent === 1 ? '' : 's'}`,
      emailsSent,
      leadersProcessed: Object.keys(leadsByReferrer).length,
    })
  } catch (err) {
    console.error('[Referral Residuals] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
