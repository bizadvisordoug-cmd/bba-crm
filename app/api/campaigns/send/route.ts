import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { interpolateTemplate } from '@/lib/utils'

// ── HTML email builder ─────────────────────────────────────────────────────
// The body stored in campaign_steps is plain text with optional <img> tags.
// This function converts it into a fully-formed HTML email.

function buildHtmlEmail({
  headerImageUrl,
  headerImageWidth,
  body,
  unsubLink,
  repName,
  footerText,
}: {
  headerImageUrl?: string | null
  headerImageWidth?: number | null
  body: string          // interpolated body (may contain <img> tags)
  unsubLink: string
  repName: string
  footerText?: string | null
}): string {
  // Convert plain-text newlines to <br> while leaving existing HTML tags intact.
  // Split on newline, skip empty-ish lines that are just <img> tags (they already block-display).
  const htmlBody = body
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      // Lines that are pure HTML tags (img, etc.) pass through unchanged
      if (/^<[a-z]/i.test(trimmed)) return trimmed
      // Blank lines become a spacer
      if (trimmed === '') return '<br>'
      return `${escapeForHtml(trimmed)}<br>`
    })
    .join('\n')

  const hdrW = headerImageWidth ?? 600
  const headerRow = headerImageUrl
    ? `<tr>
        <td style="padding:0;line-height:0;">
          <img src="${headerImageUrl}" width="${hdrW}" alt=""
               style="display:block;width:${hdrW}px;max-width:100%;height:auto;border:0;">
        </td>
       </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          ${headerRow}
          <tr>
            <td style="padding:36px 40px 28px 40px;color:#374151;font-size:15px;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
              ${htmlBody}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;font-family:Arial,sans-serif;">
                ${escapeForHtml(footerText || 'You\'re receiving this email from Breakthrough Business Advisors')}.<br>
                <a href="${unsubLink}" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Minimal HTML-escaping for text content (not for already-trusted URLs from our own storage)
function escapeForHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Plain-text fallback — strip <img> tags and other HTML
function buildPlainText(body: string, unsubLink: string): string {
  const stripped = body
    .replace(/<img[^>]*>/gi, '[Image]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return `${stripped}\n\n---\nTo unsubscribe: ${unsubLink}`
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { enrollmentId } = await req.json()

    const { data: enrollment, error } = await supabase
      .from('campaign_enrollments')
      .select(`
        *,
        lead:leads(*, assigned_rep:users(*)),
        campaign:campaigns(*, steps:campaign_steps(*))
      `)
      .eq('id', enrollmentId)
      .single()

    if (error || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    }

    if (enrollment.status !== 'active') {
      return NextResponse.json({ message: 'Enrollment not active' })
    }

    const steps = enrollment.campaign.steps?.sort((a: any, b: any) => a.step_number - b.step_number) || []
    const currentStep = steps.find((s: any) => s.step_number === enrollment.current_step)

    if (!currentStep || steps.length === 0) {
      console.warn(`No step found for enrollment ${enrollmentId}, current_step: ${enrollment.current_step}, available steps:`, steps.map((s: any) => s.step_number))
      return NextResponse.json({ message: 'No steps available' }, { status: 400 })
    }

    const rep = enrollment.lead.assigned_rep
    const lead = enrollment.lead

    const vars = {
      FirstName:    lead.owner_name?.split(' ')[0] || lead.owner_name || 'there',
      BusinessName: lead.business_name || 'your business',
      RepName:      rep?.name || 'Your Advisor',
      SystemName:   lead.pos_system || 'your POS system',
      Volume:       lead.monthly_processing_volume
                      ? `$${lead.monthly_processing_volume.toLocaleString()}`
                      : 'your volume',
    }

    const body    = interpolateTemplate(currentStep.body, vars)
    const subject = currentStep.subject ? interpolateTemplate(currentStep.subject, vars) : undefined

    if (currentStep.type === 'email') {
      if (!rep?.smtp_host || !rep?.smtp_user || !rep?.smtp_pass) {
        return NextResponse.json({ error: 'Rep SMTP not configured' }, { status: 400 })
      }

      const transporter = nodemailer.createTransport({
        host: rep.smtp_host,
        port: rep.smtp_port || 587,
        secure: rep.smtp_ssl === true || rep.smtp_port === 465,
        auth: { user: rep.smtp_user, pass: rep.smtp_pass },
      })

      const unsubLink = `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?enrollment=${enrollmentId}`

      const htmlEmail = buildHtmlEmail({
        headerImageUrl:   currentStep.header_image_url   ?? null,
        headerImageWidth: currentStep.header_image_width ?? null,
        body,
        unsubLink,
        repName: rep.name || 'Your Advisor',
        footerText: currentStep.footer_text ?? null,
      })

      const textEmail = buildPlainText(body, unsubLink)

      await transporter.sendMail({
        from:    `${rep.name} <${rep.smtp_user}>`,
        to:      lead.email,
        subject,
        html:    htmlEmail,
        text:    textEmail,
      })

      await supabase.from('email_logs').insert({
        lead_id:                 lead.id,
        campaign_enrollment_id:  enrollmentId,
        subject:                 subject || '',
        sent_at:                 new Date().toISOString(),
      })

    } else if (currentStep.type === 'sms') {
      const accountSid  = process.env.TWILIO_ACCOUNT_SID
      const authToken   = process.env.TWILIO_AUTH_TOKEN
      const fromNumber  = rep?.twilio_number || process.env.TWILIO_DEFAULT_NUMBER

      if (accountSid && authToken && fromNumber && lead.owner_phone) {
        const twilio = (await import('twilio')).default
        const client = twilio(accountSid, authToken)
        await client.messages.create({ body, from: fromNumber, to: lead.owner_phone })
        await supabase.from('sms_logs').insert({
          lead_id:   lead.id,
          message:   body,
          sent_at:   new Date().toISOString(),
          direction: 'outbound',
        })
      }
    }

    // Advance enrollment
    const nextStepNumber = enrollment.current_step + 1
    const hasNextStep = steps.some((s: any) => s.step_number === nextStepNumber)

    await supabase
      .from('campaign_enrollments')
      .update({ current_step: nextStepNumber, status: hasNextStep ? 'active' : 'completed' })
      .eq('id', enrollmentId)

    await supabase.from('activity_log').insert({
      lead_id:  lead.id,
      user_id:  user.id,
      action:   `sent campaign ${currentStep.type}`,
      details:  `${enrollment.campaign.name} — Step ${currentStep.step_number}: ${subject || body.slice(0, 60)}`,
    })

    return NextResponse.json({ success: true, step: currentStep.step_number, type: currentStep.type })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send' },
      { status: 500 }
    )
  }
}
