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
  return (
    <div style={{ padding: '2rem', color: 'white' }}>
      <h1>Dashboard (Debugging)</h1>
      <p>Testing DashboardClient imports...</p>
    </div>
  )
}
