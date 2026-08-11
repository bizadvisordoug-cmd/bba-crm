'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { DollarSign, Users, History, Plus, Check, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
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
  /** What the company received for this deal in the period (residuals only). */
  received: number | null
  processor: string | null
  repName: string | null
}

interface AwaitingItem {
  leadId: string
  businessName: string
  partnerName: string
  partnerId: string | null
  percentage: number | null
  repName: string | null
}

interface ReferralsClientProps {
  leads: any[]
  partners: any[]
  payments: any[]
  receivedByLead: Record<string, { amount: number; processor: string | null }>
  isAdmin: boolean
  year: number
  month: number
}

export function ReferralsClient({
  leads,
  partners,
  payments,
  receivedByLead,
  isAdmin,
  year,
  month,
}: ReferralsClientProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'owed' | 'history' | 'partners'>('owed')
  const [payingItem, setPayingItem] = useState<OwedItem | null>(null)
  const [addingPartner, setAddingPartner] = useState(false)

  const goToPeriod = (y: number, m: number) => {
    router.push(`/crm/referrals?year=${y}&month=${m}`)
  }

  const prevPeriod = () => (month === 1 ? goToPeriod(year - 1, 12) : goToPeriod(year, month - 1))
  const nextPeriod = () => (month === 12 ? goToPeriod(year + 1, 1) : goToPeriod(year, month + 1))

  // A residual is settled for a period once a payment record exists for that
  // lead and period. One-time bonuses use the lead's referral_paid flag.
  const paidResidualLeadIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of payments) {
      if (p.period_year === year && p.period_month === month && p.lead_id) {
        set.add(p.lead_id)
      }
    }
    return set
  }, [payments, year, month])

  const { owed, awaiting } = useMemo(() => {
    const owedItems: OwedItem[] = []
    const awaitingItems: AwaitingItem[] = []

    for (const lead of leads) {
      const partnerName = (lead.referred_by || '').trim()
      if (!partnerName) continue

      const base = {
        leadId:       lead.id,
        businessName: lead.business_name || 'Untitled',
        partnerName,
        partnerId:    lead.referral_partner_id ?? null,
        repName:      lead.assigned_rep?.name ?? null,
      }

      if (lead.referral_type === 'one_time') {
        if (lead.referral_paid) continue
        const amount = Number(lead.referral_amount) || 0
        if (amount <= 0) continue
        owedItems.push({
          ...base,
          type: 'one_time',
          amount,
          percentage: null,
          received: null,
          processor: null,
        })
        continue
      }

      if (lead.referral_type === 'residual') {
        const pct = Number(lead.referral_percentage) || 0
        if (pct <= 0) continue
        if (paidResidualLeadIds.has(lead.id)) continue

        const received = receivedByLead[lead.id]

        // Payouts come out of money actually received, so nothing is owed until
        // this deal's residual has been recorded for the period.
        if (!received || received.amount <= 0) {
          if (lead.status === 'Active Client') {
            awaitingItems.push({
              leadId:       lead.id,
              businessName: base.businessName,
              partnerName,
              partnerId:    base.partnerId,
              percentage:   pct,
              repName:      base.repName,
            })
          }
          continue
        }

        owedItems.push({
          ...base,
          type: 'residual',
          amount: (received.amount * pct) / 100,
          percentage: pct,
          received: received.amount,
          processor: received.processor,
        })
      }
    }

    return { owed: owedItems, awaiting: awaitingItems }
  }, [leads, paidResidualLeadIds, receivedByLead])

  // One partner commonly refers several businesses and is paid a single cheque.
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
  const totalReceived = owed
    .filter(i => i.type === 'residual')
    .reduce((s, i) => s + (i.received || 0), 0)

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Delete this record? A one-time bonus will go back to unpaid.')) return
    const res = await fetch(`/api/referrals/payments?id=${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else alert('Failed to delete record')
  }

  // Closes a period out with nothing owed — the merchant stopped processing,
  // the residual fell below a threshold, the account closed. Recorded rather
  // than hidden, so "nothing was due" stays distinguishable from "we forgot".
  const [markingLeadId, setMarkingLeadId] = useState<string | null>(null)

  const handleNoPaymentDue = async (item: AwaitingItem) => {
    if (!confirm(`Mark ${item.businessName} as having no payout due for ${MONTHS[month - 1]} ${year}?`)) return
    setMarkingLeadId(item.leadId)
    try {
      const res = await fetch('/api/referrals/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id:        item.leadId,
          partner_id:     item.partnerId,
          referred_by:    item.partnerName,
          amount:         0,
          percentage:     item.percentage,
          date_paid:      new Date().toISOString().slice(0, 10),
          payment_type:   'residual',
          period_year:    year,
          period_month:   month,
          no_payment_due: true,
          notes:          'No payout due for this period',
        }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to mark as no payment due')
      }
    } finally {
      setMarkingLeadId(null)
    }
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

        {/* Period selector — payouts are normally reconciled a month behind */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={prevPeriod}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.05] transition-all"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-white min-w-[140px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={nextPeriod}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.05] transition-all"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Owed',           value: money(totalOwed),     accent: '#f59e0b' },
            { label: 'One-Time Bonuses',     value: money(oneTimeOwed),   accent: '#3b82f6' },
            { label: 'Residual Payouts',     value: money(residualOwed),  accent: '#10b981' },
            { label: 'Received This Period', value: money(totalReceived), accent: '#8b5cf6' },
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
          <>
            {byPartner.length === 0 ? (
              <GlassCard className="text-center py-16">
                <Check size={40} className="mx-auto mb-3 text-green-400 opacity-50" />
                <p className="text-white font-semibold mb-1">Nothing outstanding</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No referral payouts are due for {MONTHS[month - 1]} {year}.
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
                                {item.type === 'residual' && item.received !== null
                                  ? `${money(item.received)} received × ${item.percentage}%`
                                  : 'Bonus'}
                                {item.processor && ` · ${item.processor}`}
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
            )}

            {/* Residuals that cannot be calculated until the processor payment
                for this period is entered — surfaced so they do not look lost */}
            {awaiting.length > 0 && (
              <GlassCard animate={false} className="p-4 mt-3">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={15} className="text-amber-400" />
                  <h3 className="text-white font-semibold text-sm">
                    Awaiting processor payment ({awaiting.length})
                  </h3>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                  These have an active residual agreement, but no commission has been recorded
                  for {MONTHS[month - 1]} {year} yet. Enter the processor payment on the
                  Commissions tab and the payout will calculate here.
                </p>
                <div className="space-y-1.5">
                  {awaiting.map(item => (
                    <div
                      key={item.leadId}
                      className="flex flex-wrap items-center gap-3 justify-between py-2 px-3 rounded-lg bg-white/[0.02] text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-white truncate">{item.businessName}</span>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {item.partnerName} · {item.percentage}%
                          {item.repName && ` · ${item.repName}`}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPayingItem({
                              leadId:       item.leadId,
                              businessName: item.businessName,
                              partnerName:  item.partnerName,
                              partnerId:    item.partnerId,
                              type:         'residual',
                              amount:       0,
                              percentage:   item.percentage,
                              received:     null,
                              processor:    null,
                              repName:      item.repName,
                            })}
                          >
                            Add Payment
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={markingLeadId === item.leadId}
                            onClick={() => handleNoPaymentDue(item)}
                          >
                            {markingLeadId === item.leadId ? 'Saving...' : 'None Due'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </>
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
                              p.no_payment_due
                                ? 'bg-gray-500/15 text-gray-400'
                                : p.payment_type === 'one_time'
                                  ? 'bg-blue-500/15 text-blue-300'
                                  : 'bg-green-500/15 text-green-300'
                            }`}
                          >
                            {p.no_payment_due
                              ? 'None Due'
                              : p.payment_type === 'one_time' ? 'One-Time' : 'Residual'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">
                          {p.no_payment_due ? (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          ) : (
                            <span className="text-white">{money(Number(p.amount) || 0)}</span>
                          )}
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
