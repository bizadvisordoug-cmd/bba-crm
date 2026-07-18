import { GlassCard, Button, Badge, Avatar, PageHeader } from '@/components/ui'
import { CommissionAlertsCard } from '@/components/dashboard/CommissionAlertsCard'
import { TrendingUp, Users, Mail, CheckCircle } from 'lucide-react'

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
    <div className="space-y-6">
      <PageHeader>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Here&apos;s what&apos;s happening with your pipeline today.
          </p>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Leads</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalLeads}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Active Clients</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeClients}</p>
            </div>
            <Users className="w-8 h-8 text-green-500" />
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Tasks Due Today</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{tasksDueToday.length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-purple-500" />
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Emails Sent</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{campaignStats.emailsSent}</p>
            </div>
            <Mail className="w-8 h-8 text-orange-500" />
          </div>
        </GlassCard>
      </div>

      {commissionAlerts && <CommissionAlertsCard alerts={commissionAlerts} />}
    </div>
  )
}
