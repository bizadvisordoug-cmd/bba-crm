'use client'

import { motion } from 'framer-motion'
import {
  Users, TrendingUp, Mail, Calendar, Plus, Phone, Send,
  CheckCircle, Clock, AlertTriangle, Activity, RefreshCw, DollarSign,
} from 'lucide-react'
import Link from 'next/link'
import { GlassCard, StatCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { StageBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatDate, formatDateTime, isOverdue, PIPELINE_STAGES } from '@/lib/utils'
import { CommissionAlertsCard } from './CommissionAlertsCard'

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
  commissionAlerts?: {
    isPaymentEntryTime: boolean
    overdueRecords: any[]
    dismissedNotifs: any[]
    currentUserId: string
    currentYear: number
    currentMonth: number
  }
  repRecentCommissions?: Array<{
    id: string
    year: number
    month: number
    status: string
    total_owed: number
    total_paid: number
    paid_date?: string | null
  }>
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
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const fmt$ = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">
          {greeting()}, {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Here&apos;s what&apos;s happening with your pipeline today.
        </p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex flex-wrap gap-3 mb-8"
      >
        <Link href="/crm?action=new">
          <Button variant="primary" icon={<Plus size={15} />}>Add Lead</Button>
        </Link>
        <Link href="/crm?action=log-call">
          <Button variant="secondary" icon={<Phone size={15} />}>Log Call</Button>
        </Link>
        <Link href="/campaigns">
          <Button variant="secondary" icon={<Send size={15} />}>Send Campaign</Button>
        </Link>
      </motion.div>

      {/* Commission alerts (admin only) - TEMPORARILY DISABLED due to React ref error */}
      {/* {commissionAlerts && <CommissionAlertsCard {...commissionAlerts} />} */}

      {/* Rep commission card */}
      {repRecentCommissions && repRecentCommissions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mb-8">
          <GlassCard animate={false}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/20">
                  <DollarSign size={14} className="text-purple-400" />
                </div>
                <h2 className="font-semibold text-white">My Commissions</h2>
              </div>
              <Link href="/my-commissions" className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors cursor-pointer">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {repRecentCommissions.map(record => (
                <Link key={record.id} href="/my-commissions">
                  <div className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    record.status === 'paid'
                      ? 'bg-green-500/[0.05] border-green-500/15 hover:bg-green-500/[0.08]'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${record.status === 'paid' ? 'bg-green-500/15' : 'bg-white/[0.05]'}`}>
                        {record.status === 'paid'
                          ? <CheckCircle size={14} className="text-green-400" />
                          : <Clock size={14} className="text-purple-400" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {MONTH_NAMES[record.month - 1]} {record.year}
                        </p>
                        {record.status === 'paid' && record.paid_date && (
                          <p className="text-xs text-green-400">
                            Paid {new Date(record.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                        {record.status !== 'paid' && (
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pending</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white text-sm">{fmt$(record.total_owed)}</p>
                      {record.status === 'paid' && (
                        <p className="text-xs text-green-400">{fmt$(record.total_paid)} received</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Leads" value={totalLeads} icon={<Users size={16} />} color="blue" delay={0.1} />
        <StatCard label="Active Clients" value={activeClients} icon={<TrendingUp size={16} />} color="green" delay={0.15} />
        <StatCard
          label="Emails Sent"
          value={campaignStats.emailsSent.toLocaleString()}
          sub={`${campaignStats.openRate}% open rate`}
          icon={<Mail size={16} />}
          color="purple"
          delay={0.2}
        />
        <StatCard
          label="Reply Rate"
          value={`${campaignStats.replyRate}%`}
          sub="Campaign replies"
          icon={<Activity size={16} />}
          color="amber"
          delay={0.25}
        />
      </div>

      {/* Pipeline overview */}
      <GlassCard delay={0.3} className="mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-white">Pipeline Overview</h2>
          <Link href="/kanban">
            <Button variant="ghost" size="sm">View Board →</Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = pipelineByStage[stage] || 0
            const max = Math.max(...Object.values(pipelineByStage), 1)
            const pct = Math.round((count / max) * 100)
            return (
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.04 }}
                className="text-center"
              >
                <div className="text-xl font-bold text-white mb-1">{count}</div>
                <div
                  className="h-1 rounded-full mb-2 mx-auto"
                  style={{
                    width: `${Math.max(pct, 8)}%`,
                    maxWidth: '100%',
                    background: 'linear-gradient(90deg, #7c3aed, #4f46e5)',
                  }}
                />
                <div className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                  {stage}
                </div>
              </motion.div>
            )
          })}
        </div>
      </GlassCard>

      {/* Two column: Tasks + Renewals */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Tasks */}
        <GlassCard delay={0.35}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white">Tasks</h2>
              {tasksDueToday.length > 0 && (
                <span className="badge-red text-xs px-2 py-0.5 rounded-full font-medium">
                  {tasksDueToday.length} due today
                </span>
              )}
            </div>
            <Link href="/crm">
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          </div>
          <div className="space-y-2">
            {tasksDueToday.length === 0 && tasksDueThisWeek.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                <CheckCircle size={32} className="mx-auto mb-2 opacity-30" />
                All caught up!
              </div>
            ) : (
              <>
                {tasksDueToday.map(task => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/10">
                    <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{task.title}</div>
                      <div className="text-xs text-red-400">{task.lead?.business_name} · Due today</div>
                    </div>
                  </div>
                ))}
                {tasksDueThisWeek.slice(0, 5).map(task => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <Clock size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{task.title}</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {task.lead?.business_name} · {formatDate(task.due_date)}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </GlassCard>

        {/* Upcoming renewals */}
        <GlassCard delay={0.4}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white">Upcoming Renewals</h2>
              <span className="badge-amber text-xs px-2 py-0.5 rounded-full">Next 90 days</span>
            </div>
            <Link href="/renewals">
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          </div>
          <div className="space-y-2">
            {renewals.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                No upcoming renewals
              </div>
            ) : (
              renewals.map(r => {
                const overdue = isOverdue(r.contract_expiration)
                return (
                  <Link key={r.id} href={`/crm/${r.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all cursor-pointer">
                      <RefreshCw size={14} className={overdue ? 'text-red-400' : 'text-amber-400'} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{r.business_name}</div>
                        <div className={`text-xs ${overdue ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                          {r.owner_name} · Expires {formatDate(r.contract_expiration)}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </GlassCard>
      </div>

      {/* Activity feed */}
      <GlassCard delay={0.45}>
        <h2 className="font-semibold text-white mb-5">Recent Activity</h2>
        <div className="space-y-3">
          {activity.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">No recent activity</div>
          ) : (
            activity.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.04 }}
                className="flex items-start gap-3"
              >
                <Avatar name={item.user?.name || 'System'} size="xs" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{item.user?.name}</span>
                  <span className="text-sm text-[var(--text-secondary)]"> {item.action}</span>
                  {item.lead?.business_name && (
                    <span className="text-sm text-purple-400"> · {item.lead.business_name}</span>
                  )}
                  {item.details && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.details}</p>
                  )}
                </div>
                <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {formatDateTime(item.created_at).split(',')[1]?.trim() || formatDate(item.created_at)}
                </span>
              </motion.div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  )
}
