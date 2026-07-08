'use client'

import { useState, useEffect } from 'react'
import { Input, Select } from '@/components/ui/Input'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { createClient } from '@/lib/supabase'

interface ReferralSectionProps {
  referredBy: string | null
  referralType: string | null
  referralAmount: number | null
  referralPercentage: number | null
  referralPaid: boolean | null
  monthlyProcessingVolume: number | null
  onReferredByChange: (value: string) => void
  onReferralTypeChange: (value: string) => void
  onReferralAmountChange: (value: number | null) => void
  onReferralPercentageChange: (value: number | null) => void
  onReferralPaidChange: (value: boolean) => void
  canEdit: boolean
}

export function ReferralSection({
  referredBy,
  referralType,
  referralAmount,
  referralPercentage,
  referralPaid,
  monthlyProcessingVolume,
  onReferredByChange,
  onReferralTypeChange,
  onReferralAmountChange,
  onReferralPercentageChange,
  onReferralPaidChange,
  canEdit,
}: ReferralSectionProps) {
  const supabase = createClient()
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    loadPartners()
  }, [])

  const loadPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('referral_partners')
        .select('id, name')
        .eq('active', true)
        .order('name')

      if (!error && data) {
        setPartners(data)
      }
    } catch (err) {
      console.error('Failed to load referral partners:', err)
    }
  }

  const handleAddPartner = async (newName: string) => {
    try {
      const { data, error } = await supabase
        .from('referral_partners')
        .insert([{ name: newName, active: true }])
        .select('id, name')
        .single()

      if (error) throw error
      if (data) {
        setPartners([...partners, data])
        onReferredByChange(data.name)
      }
    } catch (err) {
      console.error('Failed to create referral partner:', err)
    }
  }

  const estimatedMonthly = referralPercentage && monthlyProcessingVolume
    ? (monthlyProcessingVolume * referralPercentage) / 100
    : 0

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
        Source & Referral
      </h3>

      {canEdit ? (
        <div className="space-y-3">
          {/* Referred By - with create option */}
          <SearchableSelect
            label="Referred By"
            value={referredBy || ''}
            onChange={onReferredByChange}
            options={partners.map(p => ({ value: p.name, label: p.name }))}
            placeholder="Select or create referral partner..."
            onCreateNew={handleAddPartner}
          />

          {/* Referral Type */}
          {referredBy && (
            <>
              <Select
                label="Referral Type"
                value={referralType || ''}
                onChange={onReferralTypeChange}
                options={[
                  { value: 'one_time', label: 'One-Time Bonus' },
                  { value: 'residual', label: 'Monthly Residual' },
                ]}
                placeholder="Select type..."
              />

              {/* One-Time Bonus */}
              {referralType === 'one_time' && (
                <>
                  <Input
                    label="Referral Bonus ($)"
                    type="number"
                    step="0.01"
                    value={referralAmount?.toString() || ''}
                    onChange={e => onReferralAmountChange(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="0.00"
                  />
                  <div className="flex items-center gap-3 p-3 bg-gray-800/30 rounded border border-gray-700">
                    <input
                      type="checkbox"
                      checked={referralPaid || false}
                      onChange={e => onReferralPaidChange(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <label className="text-sm text-gray-300">Bonus paid</label>
                  </div>
                </>
              )}

              {/* Monthly Residual */}
              {referralType === 'residual' && (
                <>
                  <Input
                    label="Referral Percentage (%)"
                    type="number"
                    step="0.01"
                    value={referralPercentage?.toString() || ''}
                    onChange={e => onReferralPercentageChange(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="0.00"
                  />
                  {monthlyProcessingVolume && referralPercentage ? (
                    <div className="p-3 bg-green-900/20 border border-green-500/30 rounded">
                      <p className="text-xs text-green-300">
                        Estimated Monthly: <strong>${estimatedMonthly.toFixed(2)}</strong>
                      </p>
                      <p className="text-xs text-green-400 mt-1">
                        {monthlyProcessingVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })} × {referralPercentage}%
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Add monthly processing volume to calculate estimated payment</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        // View mode
        <div className="space-y-2 text-sm">
          {referredBy && (
            <>
              <div>
                <p style={{ color: 'var(--text-muted)' }}>Referred By</p>
                <p className="text-white">{referredBy}</p>
              </div>
              {referralType === 'one_time' && referralAmount !== null && (
                <>
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>One-Time Bonus</p>
                    <p className="text-white">${referralAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Status</p>
                    <p className="text-white">{referralPaid ? '✓ Paid' : 'Pending'}</p>
                  </div>
                </>
              )}
              {referralType === 'residual' && referralPercentage !== null && (
                <>
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Monthly Residual</p>
                    <p className="text-white">{referralPercentage}%</p>
                  </div>
                  {estimatedMonthly > 0 && (
                    <div>
                      <p style={{ color: 'var(--text-muted)' }}>Estimated Monthly</p>
                      <p className="text-green-400">${estimatedMonthly.toFixed(2)}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
