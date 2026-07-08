'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase'

interface ReferralPartner {
  id: string
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  payment_day: number
  notes: string
  active: boolean
}

interface ReferralAgreement {
  id: string
  partner_id: string
  lead_id: string
  payment_type: 'one_time' | 'residual'
  amount: number
  who_pays: 'us' | 'pos_company'
  status: 'active' | 'completed' | 'cancelled'
  partner?: { name: string }
  lead?: { business_name: string }
}

export function ReferralProgramPanel() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'partners' | 'agreements'>('partners')
  const [partners, setPartners] = useState<ReferralPartner[]>([])
  const [agreements, setAgreements] = useState<ReferralAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New partner form
  const [showNewPartner, setShowNewPartner] = useState(false)
  const [newPartner, setNewPartner] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    payment_day: 1,
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [partnersRes, agreementsRes] = await Promise.all([
        supabase.from('referral_partners').select('*').order('name'),
        supabase.from('referral_agreements').select('*, partner:partner_id(name), lead:lead_id(business_name)').order('created_at', { ascending: false }),
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

  const addPartner = async () => {
    if (!newPartner.name.trim()) {
      setError('Partner name is required')
      return
    }

    setError('')
    setSuccess('')

    try {
      const { error: err } = await supabase
        .from('referral_partners')
        .insert([newPartner])

      if (err) throw err

      setNewPartner({
        name: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        payment_day: 1,
        notes: '',
      })
      setShowNewPartner(false)
      setSuccess('Referral partner added')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add partner')
    }
  }

  const deletePartner = async (id: string) => {
    if (!confirm('Delete this referral partner? Associated agreements will also be deleted.')) return

    try {
      const { error: err } = await supabase
        .from('referral_partners')
        .delete()
        .eq('id', id)

      if (err) throw err
      setSuccess('Partner deleted')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete partner')
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('partners')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'partners'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          Referral Partners
        </button>
        <button
          onClick={() => setActiveTab('agreements')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'agreements'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          Payment Agreements
        </button>
      </div>

      {/* Messages */}
      {error && <div className="p-3 bg-red-900/20 border border-red-500/50 rounded text-red-300 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-900/20 border border-green-500/50 rounded text-green-300 text-sm">{success}</div>}

      {/* Partners Tab */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Referral Partners</h3>
            <Button onClick={() => setShowNewPartner(!showNewPartner)} size="sm" icon={<Plus size={16} />}>
              Add Partner
            </Button>
          </div>

          {/* New Partner Form */}
          {showNewPartner && (
            <div className="p-4 bg-gray-800/50 rounded border border-gray-700 space-y-3">
              <Input
                label="Partner Name"
                placeholder="e.g., ABC Payment Processing"
                value={newPartner.name}
                onChange={e => setNewPartner({ ...newPartner, name: e.target.value })}
              />
              <Input
                label="Contact Name"
                placeholder="John Doe"
                value={newPartner.contact_name}
                onChange={e => setNewPartner({ ...newPartner, contact_name: e.target.value })}
              />
              <Input
                label="Contact Email"
                type="email"
                placeholder="john@example.com"
                value={newPartner.contact_email}
                onChange={e => setNewPartner({ ...newPartner, contact_email: e.target.value })}
              />
              <Input
                label="Contact Phone"
                placeholder="+1 (555) 000-0000"
                value={newPartner.contact_phone}
                onChange={e => setNewPartner({ ...newPartner, contact_phone: e.target.value })}
              />
              <Select
                label="Payment Day of Month"
                value={newPartner.payment_day.toString()}
                onChange={e => setNewPartner({ ...newPartner, payment_day: parseInt(e.target.value) })}
                options={Array.from({ length: 31 }, (_, i) => ({
                  value: (i + 1).toString(),
                  label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
                }))}
              />
              <Input
                label="Notes"
                placeholder="Internal notes..."
                value={newPartner.notes}
                onChange={e => setNewPartner({ ...newPartner, notes: e.target.value })}
              />
              <div className="flex gap-2 justify-end">
                <Button onClick={() => setShowNewPartner(false)} variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button onClick={addPartner} size="sm">
                  Add Partner
                </Button>
              </div>
            </div>
          )}

          {/* Partners List */}
          {loading ? (
            <div className="text-gray-400 text-sm">Loading...</div>
          ) : partners.length === 0 ? (
            <div className="text-gray-400 text-sm">No referral partners yet</div>
          ) : (
            <div className="space-y-2">
              {partners.map(partner => (
                <div key={partner.id} className="p-4 bg-gray-800/50 rounded border border-gray-700">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{partner.name}</h4>
                      <p className="text-xs text-gray-400">Payment day: <strong>{partner.payment_day}</strong> (reminder on day {partner.payment_day === 1 ? 2 : partner.payment_day + 1})</p>
                    </div>
                    <Button
                      onClick={() => deletePartner(partner.id)}
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  {partner.contact_name && <p className="text-sm text-gray-300">{partner.contact_name}</p>}
                  {partner.contact_email && <p className="text-sm text-gray-400">{partner.contact_email}</p>}
                  {partner.contact_phone && <p className="text-sm text-gray-400">{partner.contact_phone}</p>}
                  {partner.notes && <p className="text-sm text-gray-500 mt-2">📝 {partner.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agreements Tab */}
      {activeTab === 'agreements' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Payment Agreements</h3>
          <p className="text-sm text-gray-400">Link referral partners to leads and set payment terms</p>

          {loading ? (
            <div className="text-gray-400 text-sm">Loading...</div>
          ) : agreements.length === 0 ? (
            <div className="text-gray-400 text-sm">No agreements yet. Create agreements in lead forms.</div>
          ) : (
            <div className="space-y-2">
              {agreements.map(agreement => (
                <div key={agreement.id} className="p-3 bg-gray-800/50 rounded border border-gray-700 text-sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold text-white">
                        {agreement.partner?.name} → {agreement.lead?.business_name || 'Unknown Lead'}
                      </p>
                      <p className="text-gray-400">
                        {agreement.payment_type === 'residual' ? '📅 Monthly: ' : '💰 One-time: '}
                        <strong>${parseFloat(agreement.amount.toString()).toFixed(2)}</strong>
                        {' '}({agreement.who_pays === 'us' ? 'We Pay' : 'Partner Pays'})
                      </p>
                      <p className={`text-xs mt-1 ${
                        agreement.status === 'active' ? 'text-green-400' :
                        agreement.status === 'completed' ? 'text-gray-500' :
                        'text-red-400'
                      }`}>
                        Status: {agreement.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
