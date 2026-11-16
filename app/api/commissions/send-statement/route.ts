import { NextRequest, NextResponse } from 'next/server'
import { createSmtpTransport } from '@/lib/mailer'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const fmt$ = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function buildStatementHtml({
  repName, monthName, year, lineItems, totalOwed, totalPaid, paidDate,
}: {
  repName: string
  monthName: string
  year: number
  lineItems: { business: string; processor: string; amount: number; rate: number; commission: number }[]
  totalOwed: number
  totalPaid: number
  paidDate: string
}) {
  const rows = lineItems.map(item => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1e2535;color:#e2e8f8;">${item.business}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e2535;color:#94a3b8;">${item.processor}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e2535;text-align:right;color:#e2e8f8;">${fmt$(item.amount)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e2535;text-align:center;color:#94a3b8;">${item.rate}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e2535;text-align:right;font-weight:600;color:#a78bfa;">${fmt$(item.commission)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080b12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:40px auto;padding:0 20px;">
    <div style="background:#0f1420;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">

      <div style="padding:32px 32px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:10px;text-align:center;line-height:40px;font-size:20px;">⚡</div>
          <div>
            <div style="font-weight:700;font-size:14px;color:white;">Breakthrough Business Advisors</div>
            <div style="font-size:11px;color:#6b7280;">Commission Statement</div>
          </div>
        </div>
        <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:white;">${monthName} ${year} Commission</h1>
        <p style="margin:0;font-size:14px;color:#94a3b8;">Hi ${repName}, your commission for ${monthName} ${year} has been processed.</p>
      </div>

      <div style="padding:24px 32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Total Earned</div>
          <div style="font-size:20px;font-weight:700;color:white;">${fmt$(totalOwed)}</div>
        </div>
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Amount Paid</div>
          <div style="font-size:20px;font-weight:700;color:#4ade80;">${fmt$(totalPaid)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Payment Date</div>
          <div style="font-size:13px;font-weight:600;color:white;margin-top:2px;">${paidDate}</div>
        </div>
      </div>

      <div style="padding:24px 32px;">
        <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px;">Deal Breakdown</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:rgba(255,255,255,0.04);">
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;border-bottom:1px solid #1e2535;">Business</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;border-bottom:1px solid #1e2535;">Processor</th>
              <th style="padding:10px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;border-bottom:1px solid #1e2535;">Received</th>
              <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;border-bottom:1px solid #1e2535;">Rate</th>
              <th style="padding:10px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;border-bottom:1px solid #1e2535;">Commission</th>
            </tr>
          </thead>
          <tbody>${lineItems.length > 0 ? rows : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#6b7280;">No line items recorded</td></tr>'}</tbody>
          <tfoot>
            <tr style="background:rgba(124,58,237,0.08);">
              <td colspan="4" style="padding:14px;font-weight:700;color:white;font-size:14px;">Total Commission</td>
              <td style="padding:14px;text-align:right;font-weight:700;font-size:16px;color:#a78bfa;">${fmt$(totalOwed)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
        <p style="margin:0;font-size:12px;color:#4b5563;">Questions? Reply to this email or contact your manager.</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { commission_record_id } = await req.json()
    if (!commission_record_id) {
      return NextResponse.json({ error: 'Missing commission_record_id' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const [{ data: record, error: recErr }, { data: lineItems }, { data: owner }] = await Promise.all([
      supabase
        .from('commission_records')
        .select('*, rep:users(id, name, email)')
        .eq('id', commission_record_id)
        .single(),
      supabase
        .from('commission_line_items')
        .select('*, business:businesses(business_name), lead:leads(business_name)')
        .eq('commission_record_id', commission_record_id)
        .order('created_at'),
      supabase
        .from('users')
        .select('name, email, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_ssl')
        .eq('role', 'owner')
        .maybeSingle(),
    ])

    if (recErr || !record) {
      return NextResponse.json({ error: 'Commission record not found' }, { status: 404 })
    }

    const rep = record.rep as { id: string; name: string; email: string } | null
    if (!rep?.email) {
      return NextResponse.json({ error: 'Rep has no email address configured' }, { status: 422 })
    }

    if (!owner?.smtp_host || !owner?.smtp_user || !owner?.smtp_pass) {
      return NextResponse.json(
        { error: 'Owner SMTP credentials not configured. Add them in Settings → Email.' },
        { status: 422 }
      )
    }

    const monthName = MONTH_NAMES[record.month - 1]
    const paidDate = record.paid_date
      ? new Date(record.paid_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const items = (lineItems ?? []).map((item: any) => ({
      business: item.business?.business_name || item.lead?.business_name || '—',
      processor: item.processor,
      amount: Number(item.amount_from_processor),
      rate: Number(item.commission_rate),
      commission: Number(item.commission_amount),
    }))

    const html = buildStatementHtml({
      repName: rep.name,
      monthName,
      year: record.year,
      lineItems: items,
      totalOwed: Number(record.total_owed),
      totalPaid: Number(record.total_paid),
      paidDate,
    })

    const transporter = createSmtpTransport(owner)

    await transporter.sendMail({
      from: `"${owner.name}" <${owner.smtp_user}>`,
      to: rep.email,
      subject: `Your ${monthName} ${record.year} Commission Statement — ${fmt$(record.total_paid)} Paid`,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[send-statement]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
  }
}
