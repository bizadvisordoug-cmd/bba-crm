'use client'

import { useState } from 'react'
import { DollarSign, AlertTriangle, ChevronRight, X, Bell } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { createClient } from '@/lib/supabase'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

type OverdueRecord = {
  id: string
  year: number
  month: number
  total_owed: number
  total_paid: number
  status: 'pending' | 'partial' | 'paid'
  rep?: { name: string } | null
}

type DismissedNotif = { type: string; year: number; month: number }

interface CommissionAlertsCardProps {
  isPaymentEntryTime: boolean
  overdueRecords: OverdueRecord[]
  dismissedNotifs: DismissedNotif[]
  currentUserId: string
  currentYear: number
  currentMonth: number
}

function daysOverdue(year: number, month: number): number {
  // Days since 1st of the month AFTER the record's period (when it should have been settled)
  const dueDate = new Date(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)
  return Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86_400_000))
}

export function CommissionAlertsCard({
  isPaymentEntryTime,
  overdueRecords,
  dismissedNotifs,
  currentUserId,
  currentYear,
  currentMonth,
}: CommissionAlertsCardProps) {
  const supabase = createClient()

  const [dismissed, setDismissed] = useState<Set<string>>(
    new Set(dismissedNotifs.map(d => `${d.type}:${d.year}:${d.month}`))
  )

  const isDismissed = (type: string, year: number, month: number) =>
    dismissed.has(`${type}:${year}:${month}`)

  const dismiss = async (type: string, year: number, month: number) => {
    setDismissed(prev => new Set([...prev, `${type}:${year}:${month}`]))
    await supabase.from('commission_notifications').upsert(
      { user_id: currentUserId, type, year, month, dismissed: true, dismissed_at: new Date().toISOString() },
      { onConflict: 'user_id,type,year,month' }
    )
  }

  const showEntry = isPaymentEntryTime && !isDismissed('commission_entry', currentYear, currentMonth)
  const visibleOverdue = overdueRecords.filter(r => !isDismissed('commission_unpaid', r.year, r.month))

  if (!showEntry && visibleOverdue.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mb-8">
      <GlassCard animate={false} className="border-amber-500/20 bg-amber-500/[0.03]">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-500/20">
            <Bell size={14} className="text-amber-400" />
          </div>
          <h2 className="font-semibold text-white">Commission Reminders</h2>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
            {showEntry ? visibleOverdue.length + 1 : visibleOverdue.length}
          </span>
        </div>

        <div className="space-y-2">
          {/* Payment entry reminder */}
          {showEntry && (
            <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
              <div className="flex items-start gap-3 min-w-0">
                <DollarSign size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    📌 Time to enter {MONTH_NAMES[currentMonth - 1]}'s processor payments
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    It's the {new Date().getDate()}th — processor deposits should be in.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <Link href="/crm/commissions" className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors cursor-pointer whitespace-nowrap">
                  Enter now →
                </Link>
                <button
                  onClick={() => dismiss('commission_entry', currentYear, currentMonth)}
                  className="p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Dismiss for this month"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Overdue commission records */}
          {visibleOverdue.map(record => {
            const days = daysOverdue(record.year, record.month)
            const outstanding = record.total_owed - record.total_paid
            return (
              <div
                key={record.id}
                className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/15"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white">
                        {record.rep?.name ?? 'Unknown'} — {MONTH_NAMES[record.month - 1]} {record.year}
                      </p>
                      {days > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 flex-shrink-0">
                          {days}d overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      ${outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })} outstanding
                      {' · '}{record.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <Link href="/crm/commissions">
                    <ChevronRight size={14} className="text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer" />
                  </Link>
                  <button
                    onClick={() => dismiss('commission_unpaid', record.year, record.month)}
                    className="p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Dismiss this reminder"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-end">
          <Link href="/crm/commissions">
            <span className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors cursor-pointer">
              View all commissions →
            </span>
          </Link>
        </div>
      </GlassCard>
    </motion.div>
  )
}
