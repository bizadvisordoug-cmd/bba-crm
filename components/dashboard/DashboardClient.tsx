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
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          {greeting()}, {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Here&apos;s what&apos;s happening with your pipeline today.
        </p>
      </div>
    </div>
  )
}
