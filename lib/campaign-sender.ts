import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { interpolateTemplate } from '@/lib/utils'

// Shared campaign step delivery.
//
// Used by both /api/campaigns/send (user-initiated, user-scoped client) and
// /api/cron/campaign-steps (scheduled, service-role client) so a step sent by
// the scheduler is byte-for-byte identical to one sent from the UI.

// ── HTML email builder ─────────────────────────────────────────────────────
// The body stored in campaign_steps is plain text with optional <img> tags.
// This function converts it into a fully-formed HTML email.

export function buildHtmlEmail({
  headerImageUrl,
  headerImageWidth,
  body,
  unsubLink,
  footerText,
}: {
  headerImageUrl?: string | null
  headerImageWidth?: number | null
  body: string          // interpolated body (may contain <img> tags)
  unsubLink: string
  footerText?: string | null
}): string {
  // Convert plain-text newlines to <br> while leaving existing HTML tags intact.
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
export function buildPlainText(body: string, unsubLink: string): string {
  const stripped = body
    .replace(/<img[^>]*>/gi, '[Image]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return `${stripped}\n\n---\nTo unsubscribe: ${unsubLink}`
}

export interface SendStepResult {
  sent: boolean
  step?: number
  type?: string
  /** Set when the step was not sent; explains why. */
  reason?: string
}

/**
 * Send the enrollment's current step, then advance the enrollment.
 *
 * `delay_days` on campaign_steps is CUMULATIVE days from enrollment, so the
 * next step is scheduled for enrolled_at + nextStep.delay_days.
 *
 * @param actorUserId user credited in activity_log. The cron has no session,
 *                    so it passes the lead's assigned rep (or null).
 */
export async function sendCampaignStep(
  supabase: SupabaseClient,
  enrollmentId: string,
  actorUserId: string | null,
): Promise<SendStepResult> {
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
    return { sent: false, reason: 'Enrollment not found' }
  }

  if (enrollment.status !== 'active') {
    return { sent: false, reason: `Enrollment is ${enrollment.status}` }
  }

  const steps = enrollment.campaign?.steps
    ?.slice()
    .sort((a: any, b: any) => a.step_number - b.step_number) || []
  const currentStep = steps.find((s: any) => s.step_number === enrollment.current_step)

  if (!currentStep) {
    // The campaign was edited out from under this enrollment — nothing left to
    // send, so close it out rather than leaving it stuck and re-scanned daily.
    await supabase
      .from('campaign_enrollments')
      .update({ status: 'completed', next_send_at: null })
      .eq('id', enrollmentId)
    return { sent: false, reason: 'No matching step; enrollment completed' }
  }

  const lead = enrollment.lead
  const rep  = lead?.assigned_rep

  if (!lead) {
    return { sent: false, reason: 'Lead not found' }
  }

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
      return { sent: false, reason: 'Rep SMTP not configured' }
    }
    if (!lead.email) {
      return { sent: false, reason: 'Lead has no email address' }
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
      footerText: currentStep.footer_text ?? null,
    })

    await transporter.sendMail({
      from:    `${rep.name} <${rep.smtp_user}>`,
      to:      lead.email,
      subject,
      html:    htmlEmail,
      text:    buildPlainText(body, unsubLink),
    })

    await supabase.from('email_logs').insert({
      lead_id:                lead.id,
      campaign_enrollment_id: enrollmentId,
      subject:                subject || '',
      sent_at:                new Date().toISOString(),
    })

  } else if (currentStep.type === 'sms') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = rep?.twilio_number || process.env.TWILIO_DEFAULT_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      return { sent: false, reason: 'Twilio not configured' }
    }
    if (!lead.owner_phone) {
      return { sent: false, reason: 'Lead has no phone number' }
    }

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

  // Advance to the next step and schedule it. delay_days is cumulative from
  // enrollment, so the due date is anchored to enrolled_at — not to now —
  // which keeps the campaign on its intended calendar even if a run is late.
  const nextStep = steps.find((s: any) => s.step_number > enrollment.current_step)
  const sentAt   = new Date().toISOString()

  if (nextStep) {
    const enrolledAt = new Date(enrollment.enrolled_at)
    const nextSendAt = new Date(enrolledAt)
    nextSendAt.setDate(nextSendAt.getDate() + (nextStep.delay_days || 0))

    await supabase
      .from('campaign_enrollments')
      .update({
        current_step: nextStep.step_number,
        status:       'active',
        next_send_at: nextSendAt.toISOString(),
        last_sent_at: sentAt,
      })
      .eq('id', enrollmentId)
  } else {
    await supabase
      .from('campaign_enrollments')
      .update({
        status:       'completed',
        next_send_at: null,
        last_sent_at: sentAt,
      })
      .eq('id', enrollmentId)
  }

  await supabase.from('activity_log').insert({
    lead_id: lead.id,
    user_id: actorUserId,
    action:  `sent campaign ${currentStep.type}`,
    details: `${enrollment.campaign?.name || 'Campaign'} — Step ${currentStep.step_number}: ${subject || body.slice(0, 60)}`,
  })

  return { sent: true, step: currentStep.step_number, type: currentStep.type }
}
