'use client'

import { useState, useEffect } from 'react'
import { Plus, X, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase'

interface ReferralPartner {
  id: string
  name: string
}

interface ReferralAgreement {
  id: string
  partner_id: string
  payment_type: 'one_time' | 'residual'
  amount: number
  who_pays: 'us' | 'pos_company'
  status: 'active' | 'completed' | 'cancelled'
  partner?: { name: string }
}

interface ReferralAgreementsSectionProps {
  leadId: string
  canEdit: boolean
}

export function ReferralAgreementsSection({ leadId, canEdit }: ReferralAgreementsSectionProps) {
  const supabase = createClient()
  const [partners, setPartners] = useState<ReferralPartner[]>([])
  const [agreements, setAgreements] = useState<ReferralAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewAgreement, setShowNewAgreement] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newAgreement, setNewAgreement] = useState({
    partner_id: '',
    payment_type: 'residual' as const,
    amount: '',
    who_pays: 'us' as const,
  })

  useEffect(() => {
    loadData()
  }, [leadId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [partnersRes, agreementsRes] = await Promise.all([
        supabase.from('referral_partners').select('id, name').eq('active', true).order('name'),
        supabase.from('referral_agreements').select('*, partner:partner_id(name)').eq('lead_id', leadId).order('created_at', { ascending: false }),
      ])

      if (partnersRes.error) throw partnersRes.error
      if (agreementsRes.error) throw agreementsRes.error

      setPartners(partnersRes.data || [])
      setAgreements(agreementsRes.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const addAgreement = async () => {
    if (!newAgreement.partner_id || !newAgreement.amount) {
      setError('Partner and amount are required')
      return
    }

    setError('')
    setSuccess('')

    try {
      const { error: err } = await supabase.from('referral_agreements').insert([
        {
          lead_id: leadId,
          partner_id: newAgreement.partner_id,
          payment_type: newAgreement.payment_type,
          amount: parseFloat(newAgreement.amount),
          who_pays: newAgreement.who_pays,
          status: 'active',
        },
      ])

      if (err) throw err

      setNewAgreement({ partner_id: '', payment_type: 'residual', amount: '', who_pays: 'us' })
      setShowNewAgreement(false)
      setSuccess('Agreement added')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add agreement')
    }
  }

  const deleteAgreement = async (id: string) => {
    if (!confirm('Delete this agreement?')) return

    try {
      const { error: err } = await supabase.from('referral_agreements').delete().eq('id', id)

      if (err) throw err
      setSuccess('Agreement deleted')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agreement')
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading referral info...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Referral Agreements</h3>
        {canEdit && (
          <Button onClick={() => setShowNewAgreement(!showNewAgreement)} size="sm" icon={<Plus size={14} />}>
            Add
          </Button>
        )}
      </div>

      {/* Messages */}
      {error && <div className="p-2 bg-red-900/30 border border-red-500/30 rounded text-red-300 text-xs">{error}</div>}
      {success && <div className="p-2 bg-green-900/30 border border-green-500/30 rounded text-green-300 text-xs">{success}</div>}

      {/* New Agreement Form */}
      {showNewAgreement && canEdit && (
        <div className="p-3 bg-gray-900/50 rounded border border-gray-700 space-y-2">
          <Select
            label="Referral Partner"
            value={newAgreement.partner_id}
            onChange={e => setNewAgreement({ ...newAgreement, partner_id: e.target.value })}
            options={partners.map(p => ({ value: p.id, label: p.name }))}
            placeholder="Select partner..."
          />
          <Select
            label="Payment Type"
            value={newAgreement.payment_type}
            onChange={e => setNewAgreement({ ...newAgreement, payment_type: e.target.value as any })}
            options={[
              { value: 'one_time', label: 'One-Time Fee' },
              { value: 'residual', label: 'Monthly Residual' },
            ]}
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={newAgreement.amount}
            onChange={e => setNewAgreement({ ...newAgreement, amount: e.target.value })}
          />
          <Select
            label="Who Pays"
            value={newAgreement.who_pays}
            onChange={e => setNewAgreement({ ...newAgreement, who_pays: e.target.value as any })}
            options={[
              { value: 'us', label: 'We Pay' },
              { value: 'pos_company', label: 'POS Company Pays' },
            ]}
          />
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setShowNewAgreement(false)} variant="ghost" size="sm">
              Cancel
            </Button>
            <Button onClick={addAgreement} size="sm">
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Agreements List */}
      {agreements.length === 0 ? (
        <p className="text-xs text-gray-500">No referral agreements for this lead</p>
      ) : (
        <div className="space-y-2">
          {agreements.map(agreement => (
            <div key={agreement.id} className="p-3 bg-gray-900/50 rounded border border-gray-700 flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{agreement.partner?.name}</p>
                <p className="text-xs text-gray-400">
                  {agreement.payment_type === 'residual' ? '📅 ' : '💰 '}
                  {agreement.payment_type === 'residual' ? 'Monthly: ' : 'One-time: '}
                  <strong>${parseFloat(agreement.amount.toString()).toFixed(2)}</strong>
                </p>
                <p className="text-xs text-gray-500">
                  {agreement.who_pays === 'us' ? '👤 We pay' : '🏢 Partner pays'} • {agreement.status}
                </p>
              </div>
              {canEdit && (
                <Button
                  onClick={() => deleteAgreement(agreement.id)}
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 flex-shrink-0"
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
