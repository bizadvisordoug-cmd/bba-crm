'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { createClient } from '@/lib/supabase'
import { PIPELINE_STAGES, POS_SYSTEMS, LEAD_SOURCES } from '@/lib/utils'
import { geocodeAddress } from '@/lib/geocode'
import type { Lead, Person, Business } from '@/types'
import { ChevronRight, ChevronLeft } from 'lucide-react'

interface LeadFormModalProps {
  open: boolean
  onClose: () => void
  onCreate: (lead: Lead) => void
  reps: { id: string; name: string }[]
  currentUserId: string
  initialData?: Partial<Lead>
}

export function LeadFormModal({ open, onClose, onCreate, reps, currentUserId, initialData }: LeadFormModalProps) {
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [businessesLoading, setBusinessesLoading] = useState(false)

  const [form, setForm] = useState({
    owner_id: initialData?.owner_id || '',
    business_id: initialData?.business_id || '',
    new_owner_name: '',
    new_owner_phone: '',
    new_owner_email: '',
    new_business_name: '',
    new_business_address: '',
    new_business_city: '',
    new_business_state: '',
    new_business_zip: '',
    new_business_industry: '',
    address: initialData?.address || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    zip: initialData?.zip || '',
    owner_phone: initialData?.owner_phone || '',
    business_phone: initialData?.business_phone || '',
    email: initialData?.email || '',
    industry: initialData?.industry || '',
    monthly_processing_volume: initialData?.monthly_processing_volume?.toString() || '',
    current_processor: initialData?.current_processor || '',
    current_rate: initialData?.current_rate?.toString() || '',
    pos_system: initialData?.pos_system || '',
    lead_source: initialData?.lead_source || '',
    referred_by: initialData?.referred_by || '',
    referral_bonus_amount: initialData?.referral_bonus_amount?.toString() || '',
    referral_bonus_paid: initialData?.referral_bonus_paid ?? false,
    assigned_rep_id: initialData?.assigned_rep_id || currentUserId,
    pipeline_stage: initialData?.pipeline_stage || 'New Lead',
    status: initialData?.status || 'Prospect',
    notes: initialData?.notes || '',
  })

  useEffect(() => {
    if (!open) {
      setStep(1)
      return
    }
    // Load people and businesses when modal opens
    const loadData = async () => {
      setPeopleLoading(true)
      const { data: peopleData } = await supabase
        .from('people')
        .select('*')
        .order('name')
      setPeople(peopleData || [])
      setPeopleLoading(false)
    }
    loadData()
  }, [open])

  useEffect(() => {
    // Load businesses when owner changes
    if (!form.owner_id) {
      setBusinesses([])
      return
    }
    const loadBusinesses = async () => {
      setBusinessesLoading(true)
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', form.owner_id)
        .order('business_name')
      setBusinesses(data || [])
      setBusinessesLoading(false)
    }
    loadBusinesses()
  }, [form.owner_id])

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Require owner: either select existing or fill in name for new one
    if (!form.owner_id && !form.new_owner_name.trim()) {
      setError('Provide an owner name or select an existing owner')
      return
    }
    // Business is only required when an existing owner is selected
    // (business section is hidden when creating a new owner)
    if (form.owner_id && !form.business_id && !form.new_business_name.trim()) {
      setError('Select an existing business or provide a name for a new one')
      return
    }

    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let ownerId = form.owner_id
      let businessId = form.business_id

      // Create new owner if needed
      if (!ownerId && form.new_owner_name) {
        const { data: newOwner, error: ownerErr } = await supabase
          .from('people')
          .insert({
            name: form.new_owner_name,
            phone: form.new_owner_phone || null,
            email: form.new_owner_email || null,
          })
          .select()
          .single()
        if (ownerErr) throw ownerErr
        ownerId = newOwner.id
      }

      // Create new business if needed
      if (!businessId && form.new_business_name && ownerId) {
        const { data: newBusiness, error: businessErr } = await supabase
          .from('businesses')
          .insert({
            owner_id: ownerId,
            business_name: form.new_business_name,
            address: form.new_business_address || null,
            city: form.new_business_city || null,
            state: form.new_business_state || null,
            zip: form.new_business_zip || null,
            industry: form.new_business_industry || null,
          })
          .select()
          .single()
        if (businessErr) throw businessErr
        businessId = newBusiness.id
      }

      // Populate legacy scalar columns so map / CRM list work without join
      const ownerName = form.new_owner_name.trim() || people.find(p => p.id === ownerId)?.name || ''
      const bizName   = form.new_business_name.trim() || businesses.find(b => b.id === businessId)?.business_name || ''

      const payload = {
        owner_id: ownerId || null,
        business_id: businessId || null,
        owner_name: ownerName || null,
        business_name: bizName || null,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        owner_phone: form.owner_phone,
        business_phone: form.business_phone,
        email: form.email,
        industry: form.industry,
        monthly_processing_volume: form.monthly_processing_volume ? parseFloat(form.monthly_processing_volume) : null,
        current_processor: form.current_processor,
        current_rate: form.current_rate ? parseFloat(form.current_rate) : null,
        pos_system: form.pos_system || null,
        lead_source: form.lead_source || null,
        referred_by: form.referred_by,
        referral_bonus_amount: form.referral_bonus_amount ? parseFloat(form.referral_bonus_amount) : null,
        referral_bonus_paid: form.referral_bonus_paid,
        assigned_rep_id: form.assigned_rep_id,
        pipeline_stage: form.pipeline_stage,
        status: form.status,
        notes: form.notes,
      }

      const LEAD_SELECT = '*, assigned_rep:users(id, name, email), owner:people(id, name, phone, email), business:businesses(id, owner_id, business_name, address, city, state, zip, industry)'

      const { data, error: dbErr } = await supabase
        .from('leads')
        .insert(payload)
        .select(LEAD_SELECT)
        .single()
      if (dbErr) throw dbErr

      // Geocode address if provided and write lat/lng back to the row
      let finalData = data
      const hasAddress = [form.address, form.city, form.state, form.zip].some(Boolean)
      if (hasAddress) {
        const coords = await geocodeAddress({
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
        })
        if (coords) {
          const { data: geocoded } = await supabase
            .from('leads')
            .update({ lat: coords.lat, lng: coords.lng })
            .eq('id', data.id)
            .select(LEAD_SELECT)
            .single()
          if (geocoded) finalData = geocoded
        }
      }

      // Log activity
      await supabase.from('activity_log').insert({
        lead_id: finalData.id,
        user_id: currentUserId,
        action: 'created lead',
        details: `Added lead to the pipeline`,
      })

      onCreate(finalData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create lead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={step === 1 ? 'Add New Lead — Step 1: Owner & Business' : 'Add New Lead — Step 2: Lead Details'} size="xl">
      {step === 1 ? (
        <form onSubmit={handleStep1Submit} className="space-y-5">
          {/* Select Owner */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Owner
            </h3>
            <div className="space-y-3">
              <SearchableSelect
                label="Select Existing Owner"
                value={form.owner_id}
                onChange={e => set('owner_id', e)}
                options={[{ value: '', label: 'Create new owner' }, ...people.map(p => ({ value: p.id, label: p.name }))]}
              />
              {!form.owner_id && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <Input label="Name *" value={form.new_owner_name} onChange={e => set('new_owner_name', e.target.value)} />
                  <Input label="Phone" value={form.new_owner_phone} onChange={e => set('new_owner_phone', e.target.value)} />
                  <Input label="Email" type="email" value={form.new_owner_email} onChange={e => set('new_owner_email', e.target.value)} />
                  <Input label="Business Name" value={form.new_business_name} onChange={e => set('new_business_name', e.target.value)} className="col-span-3" placeholder="Optional — can be added later" />
                </div>
              )}
            </div>
          </div>

          {/* Select Business */}
          {form.owner_id && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Business
              </h3>
              <div className="space-y-3">
                <SearchableSelect
                  label="Select Existing Business"
                  value={form.business_id}
                  onChange={e => set('business_id', e)}
                  options={[{ value: '', label: 'Create new business' }, ...businesses.map(b => ({ value: b.id, label: b.business_name }))]}
                  disabled={businessesLoading}
                />
                {!form.business_id && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <Input label="Business Name *" value={form.new_business_name} onChange={e => set('new_business_name', e.target.value)} className="col-span-2" />
                    <Input label="Industry" value={form.new_business_industry} onChange={e => set('new_business_industry', e.target.value)} />
                    <Input label="Street Address" value={form.new_business_address} onChange={e => set('new_business_address', e.target.value)} />
                    <Input label="City" value={form.new_business_city} onChange={e => set('new_business_city', e.target.value)} />
                    <Input label="State" value={form.new_business_state} onChange={e => set('new_business_state', e.target.value)} />
                    <Input label="Zip" value={form.new_business_zip} onChange={e => set('new_business_zip', e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                // Must have owner: existing selection OR new name filled
                (!form.owner_id && !form.new_owner_name.trim()) ||
                // Business only required when picking an existing owner
                (!!form.owner_id && !form.business_id && !form.new_business_name.trim())
              }
            >
              Next <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Lead Contact Info */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Contact Info
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Owner Phone" value={form.owner_phone} onChange={e => set('owner_phone', e.target.value)} />
              <Input label="Business Phone" value={form.business_phone} onChange={e => set('business_phone', e.target.value)} />
              <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} className="col-span-2" />
              <Input label="Street Address" value={form.address} onChange={e => set('address', e.target.value)} className="col-span-2" />
              <Input label="City" value={form.city} onChange={e => set('city', e.target.value)} />
              <Input label="State" value={form.state} onChange={e => set('state', e.target.value)} />
              <Input label="Zip" value={form.zip} onChange={e => set('zip', e.target.value)} />
              <Input label="Industry" value={form.industry} onChange={e => set('industry', e.target.value)} />
            </div>
          </div>

          {/* Processing info */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Processing Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Monthly Volume ($)" type="number" value={form.monthly_processing_volume} onChange={e => set('monthly_processing_volume', e.target.value)} placeholder="50000" />
              <Input label="Current Processor" value={form.current_processor} onChange={e => set('current_processor', e.target.value)} />
              <Input label="Current Rate (%)" type="number" step="0.01" value={form.current_rate} onChange={e => set('current_rate', e.target.value)} placeholder="2.5" />
              <Select
                label="Suggested POS System"
                value={form.pos_system}
                onChange={e => set('pos_system', e.target.value)}
                options={POS_SYSTEMS.map(p => ({ value: p, label: p }))}
                placeholder="Select suggested POS..."
              />
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Pipeline & Assignment
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Pipeline Stage"
                value={form.pipeline_stage}
                onChange={e => set('pipeline_stage', e.target.value)}
                options={PIPELINE_STAGES.map(s => ({ value: s, label: s }))}
              />
              <Select
                label="Status"
                value={form.status}
                onChange={e => set('status', e.target.value)}
                options={[
                  { value: 'Prospect', label: 'Prospect' },
                  { value: 'Active Client', label: 'Active Client' },
                  { value: 'Inactive', label: 'Inactive' },
                ]}
              />
              <Select
                label="Lead Source"
                value={form.lead_source}
                onChange={e => set('lead_source', e.target.value)}
                options={LEAD_SOURCES.map(s => ({ value: s, label: s }))}
                placeholder="Select source..."
              />
              <Select
                label="Assigned Rep"
                value={form.assigned_rep_id}
                onChange={e => set('assigned_rep_id', e.target.value)}
                options={reps.map(r => ({ value: r.id, label: r.name }))}
              />
            </div>
          </div>

          {/* Referral */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Referral
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Referred By"
                value={form.referred_by}
                onChange={e => set('referred_by', e.target.value)}
                placeholder="Name of referrer"
              />
              <Input
                label="Referral Bonus ($)"
                type="number"
                value={form.referral_bonus_amount}
                onChange={e => set('referral_bonus_amount', e.target.value)}
                placeholder="0"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Referral Bonus Paid
                </label>
                <div className="flex items-center gap-3 h-9">
                  <button
                    type="button"
                    onClick={() => set('referral_bonus_paid', !form.referral_bonus_paid)}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                      form.referral_bonus_paid ? 'bg-purple-600' : 'bg-white/10'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${
                      form.referral_bonus_paid ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {form.referral_bonus_paid ? 'Yes — paid' : 'No — unpaid'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <Textarea label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Add any notes about this lead..." />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-between gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)} icon={<ChevronLeft size={14} />}>Back</Button>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" loading={loading}>Create Lead</Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
