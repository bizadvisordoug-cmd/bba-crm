import nodemailer from 'nodemailer'

/** The SMTP columns on public.users, as every sender reads them. */
export interface SmtpConfig {
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_user?: string | null
  smtp_pass?: string | null
  smtp_ssl?: boolean | null
}

/**
 * Builds a transport for one account's SMTP settings.
 *
 * `secure` has to follow the port. Port 465 speaks TLS from the first byte, so
 * connecting to it in plaintext leaves both ends waiting — nodemailer reports
 * "Greeting never received" and the request hangs until it times out. Ports 587
 * and 25 start in plaintext and upgrade via STARTTLS, which is `secure: false`.
 *
 * The timeouts matter on a serverless function: without them a blocked or
 * misconfigured port stalls the whole invocation rather than failing fast.
 */
export function createSmtpTransport(c: SmtpConfig) {
  const port = c.smtp_port || 587
  return nodemailer.createTransport({
    host: c.smtp_host!,
    port,
    secure: c.smtp_ssl === true || port === 465,
    auth: { user: c.smtp_user!, pass: c.smtp_pass! },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}
