import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { lead_id, assigned_to, title, type, due_date } = body

    if (!lead_id || !assigned_to || !title || !type || !due_date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        lead_id,
        assigned_to,
        title,
        type,
        due_date,
        completed: false,
      })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send email notification to assigned person
    try {
      const serviceSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        { auth: { persistSession: false } }
      )

      // Get assigned person details
      const { data: assignedUser } = await serviceSupabase
        .from('users')
        .select('id, name, email, smtp_host, smtp_port, smtp_user, smtp_pass')
        .eq('id', assigned_to)
        .single()

      // Get creator details
      const { data: creatorUser } = await serviceSupabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single()

      // Get lead details
      const { data: lead } = await serviceSupabase
        .from('leads')
        .select('business_name')
        .eq('id', lead_id)
        .single()

      if (assignedUser?.email) {
        // Get SMTP config from any admin
        const { data: adminUsers } = await serviceSupabase
          .from('users')
          .select('smtp_host, smtp_port, smtp_user, smtp_pass, role')
          .in('role', ['owner', 'vp_operations'])

        const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)

        if (smtpConfig) {
          const transporter = nodemailer.createTransport({
            host: smtpConfig.smtp_host,
            port: smtpConfig.smtp_port || 587,
            secure: false,
            auth: {
              user: smtpConfig.smtp_user,
              pass: smtpConfig.smtp_pass,
            },
          })

          const dueDate = new Date(due_date).toLocaleDateString()
          const emailBody = `
            <h2>New Task Assigned to You</h2>
            <p>Hi ${assignedUser.name},</p>
            <p><strong>${creatorUser?.name || 'Someone'}</strong> has assigned you a new task:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p><strong>${title}</strong></p>
              <p><strong>Type:</strong> ${type}</p>
              <p><strong>Lead:</strong> ${lead?.business_name || 'N/A'}</p>
              <p><strong>Due Date:</strong> ${dueDate}</p>
            </div>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/tasks" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px;">View Task</a></p>
            <p style="font-size: 12px; color: #999; margin-top: 20px;">This is an automated notification from the CRM system.</p>
          `

          await transporter.sendMail({
            from: smtpConfig.smtp_user,
            to: assignedUser.email,
            subject: `New Task: ${title}`,
            html: emailBody,
          })

          console.log(`[Task Assignment] Email sent to ${assignedUser.email}`)
        }
      }
    } catch (err) {
      console.error('[Task Assignment] Failed to send notification email:', err)
      // Don't fail the task creation if email fails
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
