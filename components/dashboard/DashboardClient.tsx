'use client'

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

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
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
  return (
    <div>
      <h1>{getGreeting()}, Test 👋</h1>
    </div>
  )
}
