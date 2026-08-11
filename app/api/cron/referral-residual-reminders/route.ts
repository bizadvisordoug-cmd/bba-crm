import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Reminds you to pay referral partners their share of residuals.
 *
 * Payouts are a cut of what the processor actually paid the company for a
 * deal — commission_line_items.amount_from_processor — not a cut of the
 * merchant's processing volume. Nothing is owed until that month's commission
 * has been entered, so this reports leads still missing one separately.
 *
 * Fires the day after a POS system's payment_day, which is when the money has
 * landed and the commission would have been recorded.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    )

    // Today in Central Time
    const ctFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const [month, day, year] = ctFormatter.format(new Date()).split('/')
    const dayOfMonth  = parseInt(day)
    const thisYear    = parseInt(year)
    const thisMonth   = parseInt(month)

    // The processor pays in arrears, so the commission just recorded may be
    // filed under either the current or the previous month.
    const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1
    const prevYear  = thisMonth === 1 ? thisYear - 1 : thisYear
    const periods = [
      { year: thisYear, month: thisMonth },
      { year: prevYear, month: prevMonth },
    ]

    // ?force=true skips the day-of-month gate so the reminder can be checked on
    // demand. Mail goes to your own inbox, never to partners.
    const force = req.nextUrl.searchParams.get('force') === 'true'

    const { data: posSystems, error: posError } = await supabase
      .from('pos_systems')
      .select('name, payment_day')
      .eq('active', true)
      .order('display_order')

    if (posError) {
      console.error('[Referral Residuals] POS systems query error:', posError)
      return NextResponse.json({ error: 'Failed to query POS systems' }, { status: 500 })
    }

    const posPayingToday = (posSystems ?? []).filter(pos => {
      if (!pos.payment_day) return false
      if (force) return true
      const reminderDay = pos.payment_day === 31 ? 1 : pos.payment_day + 1
      return dayOfMonth === reminderDay
    })

    if (posPayingToday.length === 0) {
      return NextResponse.json({ message: 'No POS systems paying today', emailsSent: 0 })
    }

    const posNames = posPayingToday.map(p => p.name)

    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, business_id, business_name, referred_by, referral_percentage, pos_system')
      .eq('referral_type', 'residual')
      .in('pos_system', posNames)
      .not('referred_by', 'is', null)
      .not('referral_percentage', 'is', null)

    if (leadsError) {
      console.error('[Referral Residuals] Leads query error:', leadsError)
      return NextResponse.json({ error: 'Failed to query leads' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'No residual referrals for these systems', emailsSent: 0 })
    }

    const leadIds = leads.map(l => l.id)
    // Commission line items are attached to a business by the Commissions UI,
    // which never sets lead_id — match on either.
    const businessIds = leads.map(l => l.business_id).filter(Boolean)
    const leadIdByBusinessId = new Map(
      leads.filter(l => l.business_id).map(l => [l.business_id as string, l.id])
    )

    // Commission periods → what was actually received per deal
    const { data: records } = await supabase
      .from('commission_records')
      .select('id, year, month')
      .or(periods.map(p => `and(year.eq.${p.year},month.eq.${p.month})`).join(','))

    const periodByRecordId = new Map((records ?? []).map(r => [r.id, { year: r.year, month: r.month }]))
    const recordIds = [...periodByRecordId.keys()]

    let lineItems: any[] = []
    if (recordIds.length > 0) {
      const orFilters = [
        leadIds.length     > 0 ? `lead_id.in.(${leadIds.join(',')})`         : null,
        businessIds.length > 0 ? `business_id.in.(${businessIds.join(',')})` : null,
      ].filter(Boolean).join(',')

      const { data } = await supabase
        .from('commission_line_items')
        .select('lead_id, business_id, processor, amount_from_processor, commission_record_id')
        .in('commission_record_id', recordIds)
        .or(orFilters)
      lineItems = data ?? []
    }

    // A split deal repeats amount_from_processor per rep — take the max, not
    // the sum, or the received figure doubles. Keyed by lead + period.
    const received = new Map<string, { leadId: string; year: number; month: number; amount: number; processor: string | null }>()
    for (const item of lineItems) {
      const period = periodByRecordId.get(item.commission_record_id)
      const leadId = item.lead_id
        ?? (item.business_id ? leadIdByBusinessId.get(item.business_id) : undefined)
      if (!period || !leadId) continue
      const key = `${leadId}:${period.year}:${period.month}`
      const amount = Number(item.amount_from_processor) || 0
      const existing = received.get(key)
      if (!existing || amount > existing.amount) {
        received.set(key, {
          leadId, year: period.year, month: period.month,
          amount, processor: item.processor ?? null,
        })
      }
    }

    // Exclude anything already paid out
    const { data: alreadyPaid } = await supabase
      .from('referral_payment_records')
      .select('lead_id, period_year, period_month')
      .in('lead_id', leadIds)
      .not('period_year', 'is', null)

    const paidKeys = new Set(
      (alreadyPaid ?? []).map(p => `${p.lead_id}:${p.period_year}:${p.period_month}`)
    )

    const leadById = new Map(leads.map(l => [l.id, l]))

    interface Owed {
      business: string; partner: string; period: string
      receivedAmount: number; percentage: number; owedAmount: number; processor: string | null
    }
    const owedByPartner: Record<string, Owed[]> = {}
    const awaitingByPartner: Record<string, string[]> = {}

    for (const [key, entry] of received) {
      if (paidKeys.has(key)) continue
      if (entry.amount <= 0) continue
      const lead = leadById.get(entry.leadId)
      if (!lead) continue

      const partner = (lead.referred_by || '').trim()
      const pct = Number(lead.referral_percentage) || 0
      if (!partner || pct <= 0) continue

      if (!owedByPartner[partner]) owedByPartner[partner] = []
      owedByPartner[partner].push({
        business:       lead.business_name || 'Untitled',
        partner,
        period:         `${MONTHS[entry.month - 1]} ${entry.year}`,
        receivedAmount: entry.amount,
        percentage:     pct,
        owedAmount:     (entry.amount * pct) / 100,
        processor:      entry.processor,
      })
    }

    // Leads with a residual agreement but no commission recorded for either
    // period — flagged so a missing entry does not silently skip a payout.
    for (const lead of leads) {
      const hasAny = periods.some(p => received.has(`${lead.id}:${p.year}:${p.month}`))
      if (hasAny) continue
      const partner = (lead.referred_by || '').trim()
      if (!partner) continue
      if (!awaitingByPartner[partner]) awaitingByPartner[partner] = []
      awaitingByPartner[partner].push(lead.business_name || 'Untitled')
    }

    if (Object.keys(owedByPartner).length === 0 && Object.keys(awaitingByPartner).length === 0) {
      return NextResponse.json({ message: 'Nothing to report', emailsSent: 0 })
    }

    // SMTP from any admin
    const { data: adminUsers } = await supabase
      .from('users')
      .select('id, smtp_host, smtp_port, smtp_user, smtp_pass, name, role')
      .in('role', ['owner', 'vp_operations'])

    const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)
    if (!smtpConfig) {
      console.warn('[Referral Residuals] No SMTP configured')
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 500 })
    }

    const transporter = nodemailer.createTransport({
      host: smtpConfig.smtp_host,
      port: smtpConfig.smtp_port || 587,
      secure: false,
      auth: { user: smtpConfig.smtp_user, pass: smtpConfig.smtp_pass },
    })

    const fmt = (n: number) =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    let emailsSent = 0
    const partnersToEmail = new Set([
      ...Object.keys(owedByPartner),
      ...Object.keys(awaitingByPartner),
    ])

    for (const partner of partnersToEmail) {
      const rows     = owedByPartner[partner] ?? []
      const awaiting = awaitingByPartner[partner] ?? []
      const total    = rows.reduce((s, r) => s + r.owedAmount, 0)

      let html = `<h2 style="color:#10b981;">Referral Payment Reminder</h2>`
      html += `<p>Hi ${smtpConfig.name},</p>`

      if (rows.length > 0) {
        html += `<p>You owe <strong>${partner}</strong> their share of residuals received:</p>`
        html += `<table style="width:100%;border-collapse:collapse;margin:20px 0;">`
        html += `<tr style="background:#f3f4f6;border-bottom:1px solid #e5e7eb;">
                   <th style="padding:10px;text-align:left;">Business</th>
                   <th style="padding:10px;text-align:left;">Period</th>
                   <th style="padding:10px;text-align:right;">You Received</th>
                   <th style="padding:10px;text-align:center;">Share</th>
                   <th style="padding:10px;text-align:right;">Owed</th>
                 </tr>`
        for (const r of rows) {
          html += `<tr style="border-bottom:1px solid #e5e7eb;">
                     <td style="padding:10px;">${r.business}${r.processor ? ` <span style="color:#9ca3af;">(${r.processor})</span>` : ''}</td>
                     <td style="padding:10px;">${r.period}</td>
                     <td style="padding:10px;text-align:right;">${fmt(r.receivedAmount)}</td>
                     <td style="padding:10px;text-align:center;">${r.percentage}%</td>
                     <td style="padding:10px;text-align:right;font-weight:bold;">${fmt(r.owedAmount)}</td>
                   </tr>`
        }
        html += `</table>`
        html += `<p style="background:#f3f4f6;padding:12px;border-radius:6px;font-weight:bold;">Total Owed: ${fmt(total)}</p>`
      }

      if (awaiting.length > 0) {
        html += `<div style="background:#fffbeb;border:1px solid #fcd34d;padding:12px;border-radius:6px;margin:16px 0;">
                   <p style="margin:0 0 6px 0;font-weight:bold;color:#92400e;">Awaiting commission entry</p>
                   <p style="margin:0 0 6px 0;font-size:13px;color:#92400e;">
                     ${partner} has a residual agreement on these, but no commission has been
                     recorded yet, so the payout cannot be calculated:
                   </p>
                   <ul style="margin:0;padding-left:18px;font-size:13px;color:#92400e;">
                     ${awaiting.map(b => `<li>${b}</li>`).join('')}
                   </ul>
                 </div>`
      }

      html += `<p style="font-size:12px;color:#666;margin-top:20px;">Log payments under CRM → Referrals.</p>`

      try {
        await transporter.sendMail({
          from: smtpConfig.smtp_user,
          to:   smtpConfig.smtp_user,
          subject: rows.length > 0
            ? `Referral Payment Due to ${partner} — ${fmt(total)}`
            : `Referral: commission entry needed for ${partner}`,
          html,
        })
        emailsSent++
      } catch (err) {
        console.error(`[Referral Residuals] Failed to send email for ${partner}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${emailsSent} referral reminder${emailsSent === 1 ? '' : 's'}`,
      emailsSent,
      partnersOwed: Object.keys(owedByPartner).length,
      partnersAwaitingEntry: Object.keys(awaitingByPartner).length,
    })
  } catch (err) {
    console.error('[Referral Residuals] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
