interface DashboardClientProps {
  profile: { name: string; role: string } | null
  pipelineByStage: Record<string, number>
  tasksDueToday: any[]
  tasksDueThisWeek: any[]
  renewals: any[]
  activity: any[]
  totalLeads: number
  activeClients: number
  campaignStats: { emailsSent: number; openRate: number; replyRate: number }
  commissionAlerts?: any
  repRecentCommissions?: any
}

export function DashboardClient({
  profile,
  pipelineByStage,
  tasksDueToday,
  tasksDueThisWeek,
  renewals,
  activity,
  totalLeads,
  activeClients,
  campaignStats,
  commissionAlerts,
  repRecentCommissions,
}: DashboardClientProps) {
  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.name?.split(' ')[0] || 'User'
  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-slate-600 mt-2">
          Here&apos;s what&apos;s happening with your pipeline today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-slate-600">Total Leads</p>
          <p className="text-2xl font-bold">{totalLeads}</p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-slate-600">Active Clients</p>
          <p className="text-2xl font-bold">{activeClients}</p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-slate-600">Tasks Due Today</p>
          <p className="text-2xl font-bold">{tasksDueToday.length}</p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-slate-600">Email Open Rate</p>
          <p className="text-2xl font-bold">{campaignStats.openRate}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-lg border p-4">
          <h2 className="font-bold text-lg mb-4">Tasks Due Today</h2>
          <div className="space-y-2">
            {tasksDueToday.length === 0 ? (
              <p className="text-slate-500 text-sm">No tasks due today</p>
            ) : (
              tasksDueToday.slice(0, 5).map((task) => (
                <div key={task.id} className="border-b pb-2 last:border-b-0">
                  <p className="font-medium text-sm">{task.lead?.business_name || 'Task'}</p>
                  <p className="text-xs text-slate-600">{task.title}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-bold text-lg mb-4">Upcoming Renewals</h2>
          <div className="space-y-2">
            {renewals.length === 0 ? (
              <p className="text-slate-500 text-sm">No upcoming renewals</p>
            ) : (
              renewals.slice(0, 5).map((renewal) => (
                <div key={renewal.id} className="border-b pb-2 last:border-b-0">
                  <p className="font-medium text-sm">{renewal.business_name}</p>
                  <p className="text-xs text-slate-600">{renewal.contract_expiration}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-bold text-lg mb-4">Pipeline</h2>
          <div className="space-y-2">
            {Object.entries(pipelineByStage).length === 0 ? (
              <p className="text-slate-500 text-sm">No pipeline data</p>
            ) : (
              Object.entries(pipelineByStage).map(([stage, count]) => (
                <div key={stage} className="flex justify-between items-center text-sm">
                  <span className="capitalize">{stage}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {tasksDueThisWeek.length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="font-bold text-lg mb-4">Tasks Due This Week</h2>
          <div className="space-y-2">
            {tasksDueThisWeek.slice(0, 10).map((task) => (
              <div key={task.id} className="flex justify-between items-start border-b pb-2 last:border-b-0">
                <div>
                  <p className="font-medium text-sm">{task.lead?.business_name || 'Task'}</p>
                  <p className="text-xs text-slate-600">{task.title}</p>
                </div>
                <p className="text-xs text-slate-500">{task.due_date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activity.length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="font-bold text-lg mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {activity.slice(0, 10).map((entry) => (
              <div key={entry.id} className="text-sm border-b pb-2 last:border-b-0">
                <p className="font-medium">{entry.user?.name} - {entry.action}</p>
                <p className="text-xs text-slate-600">{entry.lead?.business_name}</p>
                <p className="text-xs text-slate-500">{entry.created_at}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && commissionAlerts && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <h2 className="font-bold text-lg mb-4">Commission Alerts</h2>
          {commissionAlerts.overdueRecords.length === 0 ? (
            <p className="text-slate-600 text-sm">No overdue commission records</p>
          ) : (
            <div className="space-y-2">
              {commissionAlerts.overdueRecords.slice(0, 5).map((record) => (
                <div key={record.id} className="text-sm border-b pb-2 last:border-b-0">
                  <p className="font-medium">{record.rep?.name}</p>
                  <p className="text-slate-600">
                    {record.month}/{record.year} - Owed: ${record.total_owed}, Paid: ${record.total_paid}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isAdmin && repRecentCommissions && repRecentCommissions.length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="font-bold text-lg mb-4">Recent Commissions</h2>
          <div className="space-y-2">
            {repRecentCommissions.map((record) => (
              <div key={record.id} className="text-sm border-b pb-2 last:border-b-0">
                <p className="font-medium">
                  {record.month}/{record.year}
                </p>
                <p className="text-slate-600">
                  Owed: ${record.total_owed}, Paid: ${record.total_paid}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
