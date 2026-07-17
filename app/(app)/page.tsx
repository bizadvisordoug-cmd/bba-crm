export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { DashboardClient } from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  // Pipeline counts
  const leadQuery = supabase.from('leads').select('pipeline_stage, status, contract_expiration, assigned_rep_id')
  if (!isAdmin) leadQuery.eq('assigned_rep_id', user!.id)
  const { data: leads } = await leadQuery

  // Tasks due today/this week
  const today = new Date()
  const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59)
  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + 7)

  const taskQuery = supabase
    .from('tasks')
    .select('*, lead:leads(business_name)')
    .eq('completed', false)
    .lte('due_date', endOfWeek.toISOString())
    .order('due_date', { ascending: true })
    .limit(20)
  if (!isAdmin) taskQuery.eq('assigned_to', user!.id)
  const { data: tasks } = await taskQuery

  // Recent activity
  const activityQuery = supabase
    .from('activity_log')
    .select('*, lead:leads(business_name), user:users(name)')
    .order('created_at', { ascending: false })
    .limit(10)
  if (!isAdmin) activityQuery.eq('user_id', user!.id)
  const { data: activity } = await activityQuery

  // Upcoming renewals (next 90 days)
  const in90 = new Date(); in90.setDate(today.getDate() + 90)
  const renewalQuery = supabase
    .from('leads')
    .select('id, business_name, owner_name, contract_expiration, assigned_rep_id')
    .not('contract_expiration', 'is', null)
    .gte('contract_expiration', today.toISOString().split('T')[0])
    .lte('contract_expiration', in90.toISOString().split('T')[0])
    .order('contract_expiration', { ascending: true })
    .limit(10)
  if (!isAdmin) renewalQuery.eq('assigned_rep_id', user!.id)
  const { data: renewals } = await renewalQuery

  // Commission alerts (admin only)
  const now2 = new Date()
  const alertYear = now2.getFullYear()
  const alertMonth = now2.getMonth() + 1
  const alertDay = now2.getDate()

  let overdueCommissions: any[] = []
  let dismissedNotifs: any[] = []
  let repRecentCommissions: any[] = []
  if (isAdmin) {
    const [{ data: ov }, { data: dn }] = await Promise.all([
      supabase
        .from('commission_records')
        .select('id, year, month, total_owed, total_paid, status, rep:users(name)')
        .neq('status', 'paid')
        .or(`year.lt.${alertYear},and(year.eq.${alertYear},month.lt.${alertMonth})`)
        .order('year', { ascending: true })
        .order('month', { ascending: true }),
      supabase
        .from('commission_notifications')
        .select('type, year, month')
        .eq('user_id', user!.id)
        .eq('dismissed', true),
    ])
    overdueCommissions = ov ?? []
    dismissedNotifs = dn ?? []
  } else {
    const { data: rc } = await supabase
      .from('commission_records')
      .select('id, year, month, total_owed, total_paid, status, paid_date')
      .eq('rep_id', user!.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(3)
    repRecentCommissions = rc ?? []
  }

  // Campaign stats
  const { count: emailsSent } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
  const { count: emailsOpened } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .not('opened_at', 'is', null)
  const { count: emailsReplied } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .not('replied_at', 'is', null)

  const pipelineByStage: Record<string, number> = {}
  for (const lead of leads || []) {
    pipelineByStage[lead.pipeline_stage] = (pipelineByStage[lead.pipeline_stage] || 0) + 1
  }

  const todayStr = today.toISOString()
  const tasksDueToday = (tasks || []).filter(t => new Date(t.due_date) <= endOfDay)
  const tasksDueThisWeek = (tasks || []).filter(t => new Date(t.due_date) > endOfDay)

  return (
    <DashboardClient
        profile={profile}
        pipelineByStage={pipelineByStage}
        tasksDueToday={tasksDueToday}
        tasksDueThisWeek={tasksDueThisWeek}
        renewals={renewals || []}
        activity={activity || []}
        totalLeads={leads?.length || 0}
        activeClients={leads?.filter(l => l.status === 'Active Client').length || 0}
        campaignStats={{
          emailsSent: emailsSent || 0,
          openRate: emailsSent ? Math.round(((emailsOpened || 0) / emailsSent) * 100) : 0,
          replyRate: emailsSent ? Math.round(((emailsReplied || 0) / emailsSent) * 100) : 0,
        }}
        commissionAlerts={isAdmin ? {
          isPaymentEntryTime: alertDay >= 26,
          overdueRecords: overdueCommissions,
          dismissedNotifs,
          currentUserId: user!.id,
          currentYear: alertYear,
          currentMonth: alertMonth,
        } : undefined}
        repRecentCommissions={!isAdmin ? repRecentCommissions : undefined}
      />
  )
}
