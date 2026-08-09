'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { DollarSign, Users, History, Plus, Check } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { LogPaymentModal } from '@/components/referrals/LogPaymentModal'
import { AddPartnerModal } from '@/components/referrals/AddPartnerModal'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function money(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface OwedItem {
  leadId: string
  businessName: string
  partnerName: string
  partnerId: string | null
  type: 'one_time' | 'residual'
  amount: number
  percentage: number | null
  volume: number | null
  posSystem: string | null
  repName: string | null
}

interface ReferralsClientProps {
  leads: any[]
  partners: any[]
  payments: any[]
  posSystems: { name: string; payment_day: number | null }[]
  isAdmin: boolean
  year: number
  month: number
}

export function ReferralsClient({
  leads,
  partners,
  payments,
  posSystems,
  isAdmin,
  year,
  month,
}: ReferralsClientProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'owed' | 'history' | 'partners'>('owed')
  const [payingItem, setPayingItem] = useState<OwedItem | null>(null)
  const [addingPartner, setAddingPartner] = useState(false)

  // A residual is settled for a given month once a payment record exists for
  // that lead and period. One-time bonuses use the lead's referral_paid flag.
  const paidResidualLeadIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) {
      if (p.period_year === year && p.period_month === month && p.lead_id) {
        set.add(p.lead_id)
      }
    }
    return set
  }, [payments, year, month])

  const owed = useMemo<OwedItem[]>(() => {
    const items: OwedItem[] = []

    for (const lead of leads) {
      const partnerName = (lead.referred_by || '').trim()
      if (!partnerName) continue

      const base = {
        leadId:       lead.id,
        businessName: lead.business_name || 'Untitled',
        partnerName,
        partnerId:    lead.referral_partner_id ?? null,
        posSystem:    lead.pos_system ?? null,
        repName:      lead.assigned_rep?.name ?? null,
      }

      if (lead.referral_type === 'one_time') {
        if (lead.referral_paid) continue
        const amount = Number(lead.referral_amount) || 0
        if (amount <= 0) continue
        items.push({ ...base, type: 'one_time', amount, percentage: null, volume: null })
      }

      if (lead.referral_type === 'residual') {
        // Residuals only accrue while the client is active and processing.
        if (lead.status !== 'Active Client') continue
        if (paidResidualLeadIds.has(lead.id)) continue
        const pct    = Number(lead.referral_percentage) || 0
        const volume = Number(lead.monthly_processing_volume) || 0
        const amount = (volume * pct) / 100
        if (pct <= 0 || amount <= 0) continue
        items.push({ ...base, type: 'residual', amount, percentage: pct, volume })
      }
    }

    return items
  }, [leads, paidResidualLeadIds])

  // Group by partner — one partner commonly refers several businesses, and the
  // payout is written as a single cheque per partner.
  const byPartner = useMemo(() => {
    const groups: Record<string, OwedItem[]> = {}
    for (const item of owed) {
      if (!groups[item.partnerName]) groups[item.partnerName] = []
      groups[item.partnerName].push(item)
    }
    return Object.entries(groups)
      .map(([name, items]) => ({
        name,
        items,
        total: items.reduce((sum, i) => sum + i.amount, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [owed])

  const totalOwed    = owed.reduce((s, i) => s + i.amount, 0)
  const oneTimeOwed  = owed.filter(i => i.type === 'one_time').reduce((s, i) => s + i.amount, 0)
  const residualOwed = owed.filter(i => i.type === 'residual').reduce((s, i) => s + i.amount, 0)
  const totalPaid    = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const posPaymentDay = (name: string | null) =>
    posSystems.find(p => p.name === name)?.payment_day ?? null

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Delete this payment record? A one-time bonus will go back to unpaid.')) return
    const res = await fetch(`/api/referrals/payments?id=${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else alert('Failed to delete payment')
  }

  return (
    <>
      <div>
        <PageHeader
          title="Referrals"
          subtitle={
            isAdmin
              ? `${money(totalOwed)} owed across ${byPartner.length} partner${byPartner.length === 1 ? '' : 's'}`
              : `${money(totalOwed)} owed on your leads`
          }
          actions={
            isAdmin && tab === 'partners' ? (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddingPartner(true)}>
                Add Partner
              </Button>
            ) : undefined
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Owed',            value: money(totalOwed),    accent: '#f59e0b' },
            { label: 'One-Time Bonuses',      value: money(oneTimeOwed),  accent: '#3b82f6' },
            { label: `Residuals — ${MONTHS[month - 1]}`, value: money(residualOwed), accent: '#10b981' },
            { label: 'Paid To Date',          value: money(totalPaid),    accent: '#8b5cf6' },
          ].map(stat => (
            <GlassCard key={stat.label} animate={false} className="p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              <p className="text-xl font-bold" style={{ color: stat.accent }}>{stat.value}</p>
            </GlassCard>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {([
            { key: 'owed',     label: 'Owed Now', icon: DollarSign },
            { key: 'history',  label: 'History',  icon: History },
            { key: 'partners', label: 'Partners', icon: Users },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-purple-600/20 border border-purple-500/30 text-white'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.05] border border-transparent'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Owed Now ─────────────────────────────────────────────────── */}
        {tab === 'owed' && (
          byPartner.length === 0 ? (
            <GlassCard className="text-center py-16">
              <Check size={40} className="mx-auto mb-3 text-green-400 opacity-50" />
              <p className="text-white font-semibold mb-1">Nothing outstanding</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Every referral payout is settled for {MONTHS[month - 1]} {year}.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {byPartner.map(group => (
                <motion.div
                  key={group.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <GlassCard animate={false} className="p-4">
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[0.06]">
                      <div>
                        <h3 className="text-white font-semibold">{group.name}</h3>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {group.items.length} business{group.items.length === 1 ? '' : 'es'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-400">{money(group.total)}</p>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Owed
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {group.items.map(item => (
                        <div
                          key={`${item.leadId}-${item.type}`}
                          className="flex flex-wrap items-center gap-3 justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-white truncate">{item.businessName}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  item.type === 'one_time'
                                    ? 'bg-blue-500/15 text-blue-300'
                                    : 'bg-green-500/15 text-green-300'
                                }`}
                              >
                                {item.type === 'one_time' ? 'One-Time' : 'Residual'}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {item.type === 'residual' && item.volume !== null
                                ? `${money(item.volume)} × ${item.percentage}%`
                                : 'Bonus'}
                              {item.posSystem && ` · ${item.posSystem}`}
                              {item.posSystem && posPaymentDay(item.posSystem) &&
                                ` (pays day ${posPaymentDay(item.posSystem)})`}
                              {item.repName && ` · ${item.repName}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-white">{money(item.amount)}</span>
                            {isAdmin && (
                              <Button size="sm" variant="secondary" onClick={() => setPayingItem(item)}>
                                Log Payment
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          )
        )}

        {/* ── History ──────────────────────────────────────────────────── */}
        {tab === 'history' && (
          payments.length === 0 ? (
            <GlassCard className="text-center py-16">
              <History size={40} className="mx-auto mb-3 opacity-30 text-purple-400" />
              <p className="text-white font-semibold mb-1">No payments logged yet</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Payouts you record will appear here.
              </p>
            </GlassCard>
          ) : (
            <GlassCard animate={false} className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Date Paid', 'Partner', 'Business', 'Period', 'Type', 'Amount', ''].map(h => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(p.date_paid).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-white whitespace-nowrap">{p.referred_by}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {p.lead?.business_name || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {p.period_year && p.period_month
                            ? `${MONTHS[p.period_month - 1]} ${p.period_year}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              p.payment_type === 'one_time'
                                ? 'bg-blue-500/15 text-blue-300'
                                : 'bg-green-500/15 text-green-300'
                            }`}
                          >
                            {p.payment_type === 'one_time' ? 'One-Time' : 'Residual'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                          {money(Number(p.amount) || 0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isAdmin && (
                            <button
                              onClick={() => handleDeletePayment(p.id)}
                              className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )
        )}

        {/* ── Partners ─────────────────────────────────────────────────── */}
        {tab === 'partners' && (
          partners.length === 0 ? (
            <GlassCard className="text-center py-16">
              <Users size={40} className="mx-auto mb-3 opacity-30 text-purple-400" />
              <p className="text-white font-semibold mb-1">No partners yet</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {isAdmin
                  ? 'Add a partner to start tracking referrals against them.'
                  : 'No referral partners have been set up.'}
              </p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {partners.map(partner => {
                const partnerLeads = leads.filter(
                  l => (l.referred_by || '').trim().toLowerCase() === partner.name.toLowerCase()
                )
                const paidToPartner = payments
                  .filter(p => (p.referred_by || '').trim().toLowerCase() === partner.name.toLowerCase())
                  .reduce((s, p) => s + (Number(p.amount) || 0), 0)

                return (
                  <GlassCard key={partner.id} animate={false} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-semibold">{partner.name}</h3>
                      {!partner.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/15 text-gray-400">
                          Inactive
                        </span>
                      )}
                    </div>
                    {partner.contact_name && (
                      <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {partner.contact_name}
                      </p>
                    )}
                    {partner.contact_email && (
                      <a
                        href={`mailto:${partner.contact_email}`}
                        className="text-xs block hover:text-purple-400 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {partner.contact_email}
                      </a>
                    )}
                    {partner.contact_phone && (
                      <a
                        href={`tel:${partner.contact_phone}`}
                        className="text-xs block hover:text-purple-400 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {partner.contact_phone}
                      </a>
                    )}
                    <div className="flex gap-4 mt-3 pt-3 border-t border-white/[0.06]">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Referred
                        </p>
                        <p className="text-sm font-semibold text-white">{partnerLeads.length}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Paid To Date
                        </p>
                        <p className="text-sm font-semibold text-purple-300">{money(paidToPartner)}</p>
                      </div>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          )
        )}
      </div>

      {payingItem && (
        <LogPaymentModal
          item={payingItem}
          year={year}
          month={month}
          onClose={() => setPayingItem(null)}
          onLogged={() => {
            setPayingItem(null)
            router.refresh()
          }}
        />
      )}

      {addingPartner && (
        <AddPartnerModal
          onClose={() => setAddingPartner(false)}
          onCreated={() => {
            setAddingPartner(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
