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

    // Get today's date
    const today = new Date()
    const dayOfMonth = today.getDate()

    // Find partners where payment_day was yesterday (accounting for month boundaries)
    let yesterdayPaymentDay = dayOfMonth - 1
    if (dayOfMonth === 1) {
      // Today is the 1st, so yesterday was the last day of previous month
      const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      yesterdayPaymentDay = lastMonth.getDate()
    }

    console.log(`[Referral Reminders] Today: ${dayOfMonth}, Checking for payment_day: ${yesterdayPaymentDay}`)

    // Get all active referral partners with payment_day = yesterday
    const { data: partners, error: partnersError } = await supabase
      .from('referral_partners')
      .select('id, name, contact_email, payment_day')
      .eq('active', true)
      .eq('payment_day', yesterdayPaymentDay)

    if (partnersError) {
      console.error('[Referral Reminders] Partners query error:', partnersError)
      return NextResponse.json({ error: 'Failed to query partners' }, { status: 500 })
    }

    if (!partners || partners.length === 0) {
      return NextResponse.json({ message: 'No payment reminders due today', emailsSent: 0 })
    }

    // Get SMTP config
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, smtp_host, smtp_port, smtp_user, smtp_pass, name, role')
      .in('role', ['owner', 'vp_operations'])

    if (adminError) {
      console.error('[Referral Reminders] Admin query error:', adminError)
      return NextResponse.json({ error: 'Failed to get admin config' }, { status: 500 })
    }

    const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)
    if (!smtpConfig) {
      console.warn('[Referral Reminders] No SMTP configured')
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

    // For each partner, get active residual agreements with active leads
    for (const partner of partners) {
      const { data: agreements, error: agreementsError } = await supabase
        .from('referral_agreements')
        .select(`
          id,
          amount,
          who_pays,
          lead:lead_id(id, business_name, status),
          start_date
        `)
        .eq('partner_id', partner.id)
        .eq('payment_type', 'residual')
        .eq('status', 'active')

      if (agreementsError) {
        console.error(`[Referral Reminders] Failed to get agreements for ${partner.name}:`, agreementsError)
        continue
      }

      if (!agreements || agreements.length === 0) {
        continue
      }

      // Filter to only leads that are active clients
      const activeAgreements = (agreements || []).filter((a: any) => {
        const lead = a.lead
        return lead && lead.status === 'Active Client'
      })

      if (activeAgreements.length === 0) {
        continue
      }

      // Build email
      const totalAmount = activeAgreements.reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0)
      let emailBody = `<h2 style="color: #7c3aed;">💰 Referral Payment Reminder</h2>`
      emailBody += `<p>Hi ${smtpConfig.name},</p>`
      emailBody += `<p>Payment from <strong>${partner.name}</strong> typically arrives today. You have <strong>${activeAgreements.length}</strong> active residual agreement${activeAgreements.length === 1 ? '' : 's'} to track:</p>`
      emailBody += `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">`
      emailBody += `<tr style="background: #f3f4f6; border-bottom: 1px solid #e5e7eb;">`
      emailBody += `<th style="padding: 10px; text-align: left;">Lead</th>`
      emailBody += `<th style="padding: 10px; text-align: right;">Monthly Amount</th>`
      emailBody += `<th style="padding: 10px; text-align: center;">Who Pays</th>`
      emailBody += `</tr>`

      for (const agreement of activeAgreements) {
        const lead = (agreement as any).lead as { id: string; business_name: string; status: string }
        if (!lead) continue
        const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/crm?lead=${lead.id}`
        const whoPays = agreement.who_pays === 'us' ? 'We Pay' : 'Partner Pays'
        const whoPaysBg = agreement.who_pays === 'us' ? '#fee2e2' : '#dbeafe'
        const whoPaysFg = agreement.who_pays === 'us' ? '#dc2626' : '#0284c7'

        emailBody += `<tr style="border-bottom: 1px solid #e5e7eb;">`
        emailBody += `<td style="padding: 10px;"><a href="${leadUrl}" style="color: #7c3aed; text-decoration: none;">${lead.business_name || 'Untitled'}</a></td>`
        emailBody += `<td style="padding: 10px; text-align: right; font-weight: bold;">$${parseFloat(agreement.amount).toFixed(2)}</td>`
        emailBody += `<td style="padding: 10px; text-align: center; background: ${whoPaysBg}; color: ${whoPaysFg}; font-size: 12px; font-weight: bold;">${whoPays}</td>`
        emailBody += `</tr>`
      }

      emailBody += `</table>`
      emailBody += `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-weight: bold;">Total Monthly: $${totalAmount.toFixed(2)}</p>`
      emailBody += `<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=referrals" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View in Settings</a></p>`
      emailBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">Track payment receipt in the Referrals section.</p>`

      try {
        console.log(`[Referral Reminders] Sending reminder to admin for ${partner.name} (${activeAgreements.length} agreements, $${totalAmount.toFixed(2)})`)
        await transporter.sendMail({
          from: smtpConfig.smtp_user,
          to: smtpConfig.smtp_user,
          subject: `💰 Referral Payment from ${partner.name} — $${totalAmount.toFixed(2)}`,
          html: emailBody,
        })
        emailsSent++
      } catch (err) {
        console.error(`[Referral Reminders] Failed to send email:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${emailsSent} referral payment reminder${emailsSent === 1 ? '' : 's'}`,
      emailsSent,
      partnersProcessed: partners.length,
    })
  } catch (err) {
    console.error('[Referral Reminders] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
