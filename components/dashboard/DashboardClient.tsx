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
          <p className="text-sm text-slate-600">Emails Sent</p>
          <p className="text-2xl font-bold">{campaignStats.emailsSent}</p>
        </div>
      </div>
    </div>
  )
}
