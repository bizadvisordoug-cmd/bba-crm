'use client'

import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { OwedItem } from '@/components/referrals/ReferralsClient'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface LogPaymentModalProps {
  item: OwedItem
  year: number
  month: number
  onClose: () => void
  onLogged: () => void
}

export function LogPaymentModal({ item, year, month, onClose, onLogged }: LogPaymentModalProps) {
  // Prefilled from the calculated cut but editable, for rounding or an agreed
  // adjustment on a particular month.
  const [amount, setAmount]     = useState(item.amount.toFixed(2))
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/referrals/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id:      item.leadId,
          partner_id:   item.partnerId,
          referred_by:  item.partnerName,
          amount:       parseFloat(amount),
          percentage:   item.percentage,
          date_paid:    datePaid,
          payment_type: item.type,
          period_year:  item.type === 'residual' ? year  : null,
          period_month: item.type === 'residual' ? month : null,
          notes:        notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to log payment')
        return
      }

      onLogged()
    } catch {
      setError('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'rgba(16,20,32,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-1">Log Referral Payment</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {item.partnerName} · {item.businessName}
        </p>

        <div className="rounded-xl p-3 mb-4 bg-white/[0.03] border border-white/[0.06] space-y-1">
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Type</span>
            <span className="text-white">
              {item.type === 'one_time' ? 'One-Time Bonus' : 'Monthly Residual'}
            </span>
          </div>
          {item.type === 'residual' && (
            <>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Period</span>
                <span className="text-white">{MONTHS[month - 1]} {year}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Received</span>
                <span className="text-white">
                  ${item.received?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  {item.processor && ` from ${item.processor}`}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Partner share</span>
                <span className="text-white">{item.percentage}%</span>
              </div>
            </>
          )}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Input
            label="Amount Paid ($)"
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={e => setAmount(e.target.value)}
            hint={
              item.type === 'residual'
                ? "Your partner's cut of what the processor paid you for this deal."
                : undefined
            }
          />

          <Input
            label="Date Paid"
            type="date"
            required
            value={datePaid}
            onChange={e => setDatePaid(e.target.value)}
          />

          <Textarea
            label="Notes (optional)"
            placeholder="Check number, transfer reference..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="min-h-[70px]"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? 'Saving...' : 'Log Payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
