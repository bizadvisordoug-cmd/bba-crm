import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Use service role (admin) for cron jobs to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    )

    // Get today's date
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

    // Find all incomplete tasks due today or overdue, grouped by assigned person
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, lead_id, assigned_to, title, type, due_date, lead:leads(business_name)')
      .eq('completed', false)
      .lte('due_date', todayEnd)
      .not('assigned_to', 'is', null)

    if (tasksError) {
      console.error('[Task Reminders] Tasks query error:', tasksError)
      return NextResponse.json({ error: 'Failed to query tasks' }, { status: 500 })
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ message: 'No tasks due today', emailsSent: 0 })
    }

    // Filter tasks due today or overdue
    const relevantTasks = tasks.filter((task: any) => {
      const dueDate = new Date(task.due_date)
      return dueDate <= now
    })

    if (relevantTasks.length === 0) {
      return NextResponse.json({ message: 'No urgent tasks', emailsSent: 0 })
    }

    // Group tasks by assigned_to
    const tasksByPerson: Record<string, any[]> = {}
    for (const task of relevantTasks) {
      if (!task.assigned_to) continue
      if (!tasksByPerson[task.assigned_to]) {
        tasksByPerson[task.assigned_to] = []
      }
      tasksByPerson[task.assigned_to].push(task)
    }

    // Get SMTP config from any admin account
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, smtp_host, smtp_port, smtp_user, smtp_pass, name, role')
      .in('role', ['owner', 'vp_operations'])

    if (adminError) {
      console.error('[Task Reminders] Admin query error:', adminError)
      return NextResponse.json({ error: 'Failed to get admin config' }, { status: 500 })
    }

    const smtpConfig = adminUsers?.find(u => u.smtp_host && u.smtp_user && u.smtp_pass)
    if (!smtpConfig) {
      console.warn('[Task Reminders] No SMTP configured')
      return NextResponse.json({ error: 'SMTP not configured', adminCount: adminUsers?.length || 0 }, { status: 500 })
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

    // Send emails to each person
    for (const [personId, personTasks] of Object.entries(tasksByPerson)) {
      // Get person's email
      const { data: person, error: personError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', personId)
        .single()

      if (personError || !person?.email) {
        console.error(`[Task Reminders] Failed to get user ${personId}:`, personError)
        continue
      }

      // Separate overdue and due today
      const overdueTasks = personTasks.filter((t: any) => new Date(t.due_date) < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      const dueTodayTasks = personTasks.filter((t: any) => {
        const dueDate = new Date(t.due_date)
        return dueDate.toDateString() === now.toDateString()
      })

      if (overdueTasks.length === 0 && dueTodayTasks.length === 0) continue

      // Build email
      let emailBody = `<h2>Task Reminder</h2>`
      emailBody += `<p>Hi ${person.name},</p>`

      if (overdueTasks.length > 0) {
        emailBody += `<h3 style="color: #dc2626;">Overdue Tasks (${overdueTasks.length})</h3>`
        emailBody += `<ul>`
        for (const task of overdueTasks) {
          const leadName = task.lead?.business_name || 'Unnamed Lead'
          const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tasks`
          const dueDate = new Date(task.due_date).toLocaleDateString()
          emailBody += `<li><strong>${task.title}</strong> (${task.type}) - <em>${leadName}</em><br/><small>Due: ${dueDate}</small></li>`
        }
        emailBody += `</ul>`
      }

      if (dueTodayTasks.length > 0) {
        emailBody += `<h3 style="color: #f59e0b;">Due Today (${dueTodayTasks.length})</h3>`
        emailBody += `<ul>`
        for (const task of dueTodayTasks) {
          const leadName = task.lead?.business_name || 'Unnamed Lead'
          const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tasks`
          emailBody += `<li><strong>${task.title}</strong> (${task.type}) - <em>${leadName}</em></li>`
        }
        emailBody += `</ul>`
      }

      emailBody += `<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/tasks" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px;">View My Tasks</a></p>`
      emailBody += `<p style="font-size: 12px; color: #999; margin-top: 20px;">This is an automated reminder for your tasks.</p>`

      try {
        console.log(`[Task Reminders] Sending email to ${person.email} for ${personTasks.length} tasks`)
        await transporter.sendMail({
          from: smtpConfig.smtp_user,
          to: person.email,
          subject: `Task Reminder: ${personTasks.length} task${personTasks.length === 1 ? '' : 's'} ${overdueTasks.length > 0 ? 'overdue' : 'due today'}`,
          html: emailBody,
        })
        console.log(`[Task Reminders] Email sent successfully to ${person.email}`)
        emailsSent++
      } catch (err) {
        console.error(`[Task Reminders] Failed to send email to ${person.email}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${emailsSent} task reminder email${emailsSent === 1 ? '' : 's'}`,
      emailsSent,
      tasksProcessed: relevantTasks.length,
    })
  } catch (err) {
    console.error('[Task Reminders] Cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
