'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Phone, Mail, MapPin, Calendar, DollarSign, FileText,
  Edit3, Save, X, Building2, User, AlertTriangle, CheckCircle,
  Clock, Tag, RefreshCw, Send, Trash2, Upload, ExternalLink, Download,
} from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { StageBadge, StatusBadge, Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { NotesSection } from '@/components/crm/NotesSection'
import { ReferralAgreementsSection } from '@/components/crm/ReferralAgreementsSection'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency, formatPercent, isOverdue, PIPELINE_STAGES, LEAD_SOURCES } from '@/lib/utils'
import { getPOSSystems } from '@/lib/pos-systems'
import { geocodeAddress } from '@/lib/geocode'
import type { Lead } from '@/types'

interface LeadDrawerProps {
  lead: Lead
  open: boolean
  onClose: () => void
  onUpdate: (lead: Lead) => void
  onDelete: (id: string) => void
  reps: { id: string; name: string }[]
  isAdmin: boolean
  canDeleteLeads: boolean
  currentUserId: string
}

export function LeadDrawer({ lead, open, onClose, onUpdate, onDelete, reps, isAdmin, canDeleteLeads, currentUserId }: LeadDrawerProps) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'documents' | 'activity' | 'referrals'>('overview')
  const [form, setForm] = useState<Partial<Lead>>(lead)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [posSystems, setPosSystems] = useState<string[]>([])

  // Helper to format date for input display (avoids timezone conversion)
  const formatDateForInput = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    // If it's already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
    // Otherwise parse and reformat
    try {
      const [year, month, day] = dateStr.split('T')[0].split('-')
      return `${year}-${month}-${day}`
    } catch {
      return ''
    }
  }
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [people, setPeople] = useState<Array<{id: string; name: string}>>([])
  const [businesses, setBusinesses] = useState<Array<{id: string; business_name: string}>>([])
  const [ownerMode, setOwnerMode] = useState<'select' | 'create'>('select')
  const [businessMode, setBusinessMode] = useState<'select' | 'create'>('select')
  const [newOwner, setNewOwner] = useState({ name: '', phone: '', email: '' })
  const [newBusiness, setNewBusiness] = useState({ name: '', address: '', city: '', state: '', zip: '', industry: '' })
  const [exporting, setExporting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  // Commission rate
  const [commissionRate, setCommissionRate] = useState<number | null>(null)
  const [commissionRateId, setCommissionRateId] = useState<string | null>(null)
  const [commissionPct, setCommissionPct] = useState('')

  useEffect(() => {
    // Fetch POS systems once when component mounts
    getPOSSystems().then(setPosSystems)
  }, [])

  useEffect(() => {
    if (!editing) {
      setOwnerMode('select')
      setBusinessMode('select')
      setNewOwner({ name: '', phone: '', email: '' })
      setNewBusiness({ name: '', address: '', city: '', state: '', zip: '', industry: '' })
      setCommissionPct('')
      return
    }
    supabase.from('people').select('id, name').order('name').then(({ data }) => setPeople(data ?? []))
    // Fetch commission rate for this lead + assigned rep
    if (lead.assigned_rep_id) {
      supabase
        .from('commission_rates')
        .select('id, commission_percentage')
        .eq('lead_id', lead.id)
        .eq('rep_id', lead.assigned_rep_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setCommissionRate(data.commission_percentage)
            setCommissionRateId(data.id)
            setCommissionPct(data.commission_percentage.toString())
          } else {
            setCommissionRate(null)
            setCommissionRateId(null)
            setCommissionPct('')
          }
        })
    }
  }, [editing])

  useEffect(() => {
    if (!editing || !form.owner_id || ownerMode === 'create') { setBusinesses([]); return }
    supabase.from('businesses').select('id, business_name').eq('owner_id', form.owner_id).order('business_name')
      .then(({ data }) => setBusinesses(data ?? []))
  }, [editing, form.owner_id, ownerMode])

  // Admins can delete any lead; salespeople only their own
  const canDelete = isAdmin || (canDeleteLeads && lead.assigned_rep_id === currentUserId)

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Delete failed')
      }
      onDelete(lead.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const set = (k: keyof Lead, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleExport = async (format: 'csv' | 'excel') => {
    setExporting(true)
    setShowExportMenu(false)
    try {
      const res = await fetch('/api/export/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, leadId: lead.id }),
      })
      if (!res.ok) {
        const json = await res.json()
        alert(json.error || 'Export failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = format === 'excel' ? 'xlsx' : 'csv'
      a.download = `${lead.business_name || 'lead'}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      // Strip join sub-objects — these are not columns in leads and cause a PostgREST error
      const { assigned_rep: _rep, owner: _owner, business: _biz, ...payload } = form

      // Create new person if needed, resolve owner_id
      if (ownerMode === 'create') {
        if (!newOwner.name.trim()) { setSaveError('Owner name is required'); setSaving(false); return }
        const { data: person, error: personErr } = await supabase
          .from('people')
          .insert({ name: newOwner.name.trim(), phone: newOwner.phone || null, email: newOwner.email || null })
          .select('id')
          .single()
        if (personErr) throw personErr
        payload.owner_id = person.id
        payload.business_id = undefined
      }

      // Create new business if needed, resolve business_id
      if (businessMode === 'create') {
        if (!newBusiness.name.trim()) { setSaveError('Business name is required'); setSaving(false); return }
        const ownerId = ownerMode === 'create' ? payload.owner_id : payload.owner_id
        const { data: biz, error: bizErr } = await supabase
          .from('businesses')
          .insert({
            owner_id: ownerId || null,
            business_name: newBusiness.name.trim(),
            address: newBusiness.address || null,
            city: newBusiness.city || null,
            state: newBusiness.state || null,
            zip: newBusiness.zip || null,
            industry: newBusiness.industry || null,
          })
          .select('id')
          .single()
        if (bizErr) throw bizErr
        payload.business_id = biz.id
      }

      // Geocode if any address field is present and changed (or coords are missing)
      const addressChanged =
        payload.address !== lead.address ||
        payload.city !== lead.city ||
        payload.state !== lead.state ||
        payload.zip !== lead.zip
      const hasAddress = [payload.address, payload.city, payload.state, payload.zip].some(Boolean)
      if (hasAddress && (addressChanged || !lead.lat || !lead.lng)) {
        const coords = await geocodeAddress({
          address: payload.address,
          city: payload.city,
          state: payload.state,
          zip: payload.zip,
        })
        if (coords) {
          payload.lat = coords.lat
          payload.lng = coords.lng
          console.log('[LeadDrawer] geocoded:', coords)
        } else {
          console.warn('[LeadDrawer] geocoding returned no results for address')
        }
      }

      console.log('[LeadDrawer] original form dates:', {
        last_contacted: form.last_contacted,
        next_follow_up: form.next_follow_up,
        install_date: form.install_date,
        contract_expiration: form.contract_expiration,
      })
      console.log('[LeadDrawer] saving payload:', JSON.stringify(payload, null, 2))
      const { data, error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', lead.id)
        .select('*, assigned_rep:users(id, name, email), owner:people(id, name, phone, email), business:businesses(id, owner_id, business_name, address, city, state, zip, industry)')
        .single()

      console.log('[LeadDrawer] returned from Supabase:', {
        next_follow_up: data?.next_follow_up,
        last_contacted: data?.last_contacted,
        install_date: data?.install_date,
        contract_expiration: data?.contract_expiration,
      })
      if (error) {
        console.error('[LeadDrawer] Supabase error:', error)
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(' | ')
        setSaveError(`DB error ${error.code}: ${msg}`)
        return
      }

      // Sync business phone/email back to business record
      if (payload.business_id && (payload.business_phone || payload.email)) {
        await supabase
          .from('businesses')
          .update({
            business_phone: payload.business_phone || null,
            business_email: payload.email || null,
          })
          .eq('id', payload.business_id)
      }

      onUpdate(data)

      // Execute pipeline stage triggers if stage changed (from drawer form)
      if (payload.pipeline_stage && payload.pipeline_stage !== lead.pipeline_stage) {
        try {
          await fetch('/api/leads/execute-triggers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId: lead.id,
              newStageName: payload.pipeline_stage,
            }),
          })
        } catch (err) {
          console.error('[LeadDrawer] Failed to execute triggers:', err)
        }
      }

      // Save commission rate if entered
      if (commissionPct.trim()) {
        const val = parseFloat(commissionPct)
        if (!isNaN(val)) {
          if (commissionRateId) {
            await supabase
              .from('commission_rates')
              .update({ commission_percentage: val })
              .eq('id', commissionRateId)
          } else {
            const repId = payload.assigned_rep_id || lead.assigned_rep_id
            if (repId) {
              const { data: newRate } = await supabase
                .from('commission_rates')
                .insert({ lead_id: lead.id, rep_id: repId, commission_percentage: val })
                .select('id')
                .single()
              if (newRate) setCommissionRateId(newRate.id)
            }
          }
          setCommissionRate(val)
        }
      }

      setEditing(false)
    } catch (err) {
      console.error('[LeadDrawer] unexpected error:', err)
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const tabs = ['overview', 'notes', 'documents', 'activity', 'referrals'] as const

  return (
    <Drawer open={open} onClose={onClose} width="580px">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 -mt-0">
        <div className="flex items-center gap-3 flex-1">
          <Avatar name={lead.owner?.name || lead.owner_name || ''} size="md" />
          <div>
            <h2 className="text-lg font-bold text-white">{lead.business?.business_name || lead.business_name}</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {lead.owner?.name || lead.owner_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => { setEditing(false); setForm(lead); setSaveError('') }}>Cancel</Button>
              <Button variant="primary" size="sm" icon={<Save size={14} />} loading={saving} onClick={handleSave}>Save</Button>
            </>
          ) : (
            <>
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download size={14} />}
                  loading={exporting}
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  Export
                </Button>
                {showExportMenu && (
                  <div className="absolute top-full mt-1 right-0 bg-[#1a1f2e] border border-white/[0.15] rounded-lg shadow-lg z-10">
                    <button
                      onClick={() => handleExport('csv')}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-white/[0.08] first:rounded-t-lg"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={() => handleExport('excel')}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-white/[0.08] last:rounded-b-lg"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Export as Excel
                    </button>
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" icon={<Edit3 size={14} />} onClick={() => setEditing(true)}>Edit</Button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-red-400 mb-3 px-1">{saveError}</p>
      )}

      {/* Stage + Status */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {editing ? (
          <>
            <select
              value={form.pipeline_stage || ''}
              onChange={e => set('pipeline_stage', e.target.value as any)}
              style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
            >
              {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={form.status || ''}
              onChange={e => set('status', e.target.value as any)}
              style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
            >
              <option value="Prospect">Prospect</option>
              <option value="Active Client">Active Client</option>
              <option value="Inactive">Inactive</option>
            </select>
          </>
        ) : (
          <>
            <StageBadge stage={lead.pipeline_stage as any} />
            <StatusBadge status={lead.status as any} />
            {lead.next_follow_up && isOverdue(lead.next_follow_up) && (
              <Badge variant="red"><AlertTriangle size={10} className="mr-1" />Follow-up overdue</Badge>
            )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
              activeTab === t ? 'bg-white/[0.08] text-white' : 'text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Owner & Business */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Owner & Business</h3>
            {editing ? (
              <div className="space-y-4">
                {/* Owner */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Owner</label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = ownerMode === 'select' ? 'create' : 'select'
                        setOwnerMode(next)
                        if (next === 'create') setBusinessMode('create')
                        else setBusinessMode('select')
                      }}
                      className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {ownerMode === 'select' ? '+ Create new owner' : '← Select existing owner'}
                    </button>
                  </div>
                  {ownerMode === 'select' ? (
                    <SearchableSelect
                      value={form.owner_id || ''}
                      onChange={v => setForm(f => ({ ...f, owner_id: v || undefined, business_id: undefined }))}
                      options={people.map(p => ({ value: p.id, label: p.name }))}
                      placeholder="Search owners..."
                    />
                  ) : (
                    <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <Input label="Name *" value={newOwner.name} onChange={e => setNewOwner(o => ({ ...o, name: e.target.value }))} />
                      <Input label="Phone" value={newOwner.phone} onChange={e => setNewOwner(o => ({ ...o, phone: e.target.value }))} />
                      <Input label="Email" type="email" value={newOwner.email} onChange={e => setNewOwner(o => ({ ...o, email: e.target.value }))} />
                    </div>
                  )}
                </div>

                {/* Business */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Business</label>
                    <button
                      type="button"
                      onClick={() => setBusinessMode(m => m === 'select' ? 'create' : 'select')}
                      className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {businessMode === 'select' ? '+ Create new business' : '← Select existing business'}
                    </button>
                  </div>
                  {businessMode === 'select' ? (
                    <SearchableSelect
                      value={form.business_id || ''}
                      onChange={v => setForm(f => ({ ...f, business_id: v || undefined }))}
                      options={businesses.map(b => ({ value: b.id, label: b.business_name }))}
                      placeholder={
                        ownerMode === 'create'
                          ? 'Will be linked to new owner on save'
                          : form.owner_id
                            ? businesses.length === 0 ? 'No businesses — use "Create new business"' : 'Search businesses...'
                            : 'Select an owner first'
                      }
                      disabled={ownerMode === 'create' || !form.owner_id}
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <Input label="Business Name *" value={newBusiness.name} onChange={e => setNewBusiness(b => ({ ...b, name: e.target.value }))} className="col-span-2" />
                      <Input label="Industry" value={newBusiness.industry} onChange={e => setNewBusiness(b => ({ ...b, industry: e.target.value }))} />
                      <Input label="Street Address" value={newBusiness.address} onChange={e => setNewBusiness(b => ({ ...b, address: e.target.value }))} />
                      <Input label="City" value={newBusiness.city} onChange={e => setNewBusiness(b => ({ ...b, city: e.target.value }))} />
                      <Input label="State" value={newBusiness.state} onChange={e => setNewBusiness(b => ({ ...b, state: e.target.value }))} />
                      <Input label="Zip" value={newBusiness.zip} onChange={e => setNewBusiness(b => ({ ...b, zip: e.target.value }))} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="glass rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <User size={13} className="text-[var(--text-muted)]" />
                  <span className="text-sm text-white">{lead.owner?.name || lead.owner_name || <span className="text-[var(--text-muted)]">No owner linked</span>}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-[var(--text-muted)]" />
                  <span className="text-sm text-white">{lead.business?.business_name || lead.business_name || <span className="text-[var(--text-muted)]">No business linked</span>}</span>
                </div>
                {lead.business?.industry && (
                  <div className="flex items-center gap-2">
                    <Tag size={13} className="text-[var(--text-muted)]" />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{lead.business.industry}</span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Contact */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Contact</h3>
            <div className="space-y-2">
              {editing ? (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Owner Phone" value={form.owner_phone || ''} onChange={e => set('owner_phone', e.target.value)} />
                  <Input label="Business Phone" value={form.business_phone || ''} onChange={e => set('business_phone', e.target.value)} />
                  <Input label="Email" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className="col-span-2" />
                  <Input label="Street Address" value={form.address || ''} onChange={e => set('address', e.target.value)} className="col-span-2" />
                  <Input label="City" value={form.city || ''} onChange={e => set('city', e.target.value)} />
                  <Input label="State" value={form.state || ''} onChange={e => set('state', e.target.value)} />
                  <Input label="Zip" value={form.zip || ''} onChange={e => set('zip', e.target.value)} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {lead.owner_phone && (
                    <a href={`tel:${lead.owner_phone}`} className="flex items-center gap-2 text-sm hover:text-purple-400 transition-colors">
                      <Phone size={13} className="text-[var(--text-muted)]" />
                      <span style={{ color: 'var(--text-secondary)' }}>{lead.owner_phone}</span>
                    </a>
                  )}
                  {lead.business_phone && (
                    <a href={`tel:${lead.business_phone}`} className="flex items-center gap-2 text-sm hover:text-purple-400 transition-colors">
                      <Building2 size={13} className="text-[var(--text-muted)]" />
                      <span style={{ color: 'var(--text-secondary)' }}>{lead.business_phone}</span>
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm hover:text-purple-400 transition-colors">
                      <Mail size={13} className="text-[var(--text-muted)]" />
                      <span style={{ color: 'var(--text-secondary)' }}>{lead.email}</span>
                    </a>
                  )}
                  {(lead.address || lead.city || lead.state || lead.zip) && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin size={13} className="text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {[lead.address, lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.city || lead.state, lead.zip].filter(Boolean).join(' ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Processing */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Processing</h3>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Monthly Volume ($)" type="number" value={form.monthly_processing_volume?.toString() || ''} onChange={e => set('monthly_processing_volume', parseFloat(e.target.value))} />
                <Input label="Current Processor" value={form.current_processor || ''} onChange={e => set('current_processor', e.target.value)} />
                <Input label="Current Rate (%)" type="number" step="0.01" value={form.current_rate?.toString() || ''} onChange={e => set('current_rate', parseFloat(e.target.value))} />
                <Select label="Suggested POS System" value={form.pos_system || ''} onChange={e => set('pos_system', e.target.value as any)} options={posSystems.map(p => ({ value: p, label: p }))} placeholder="Select..." />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem icon={<DollarSign size={13} />} label="Monthly Volume" value={formatCurrency(lead.monthly_processing_volume)} />
                <InfoItem icon={<Tag size={13} />} label="Current Rate" value={formatPercent(lead.current_rate)} />
                <InfoItem icon={<Building2 size={13} />} label="Processor" value={lead.current_processor} />
                <InfoItem icon={<Tag size={13} />} label="Suggested POS System" value={lead.pos_system} />
              </div>
            )}
          </section>

          {/* Commission */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Commission</h3>
            {editing ? (
              <div className="flex items-center gap-3">
                <div className="relative w-32">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={commissionPct}
                    onChange={e => setCommissionPct(e.target.value)}
                    placeholder="50.0"
                    className="w-full h-9 pr-7 pl-3 rounded-xl text-sm"
                    style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)' }}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">%</span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">rep commission rate for this deal</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <DollarSign size={13} className="text-[var(--text-muted)]" />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {commissionRate !== null ? `${commissionRate}% commission rate` : 'No commission rate set'}
                </span>
                {!editing && (
                  <button onClick={() => setEditing(true)} className="text-xs text-purple-400 hover:text-purple-300 ml-1">Set →</button>
                )}
              </div>
            )}
          </section>

          {/* Timeline */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Timeline</h3>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Last Contacted" type="date" value={formatDateForInput(form.last_contacted)} onChange={e => set('last_contacted', e.target.value)} />
                <Input label="Next Follow-Up" type="date" value={formatDateForInput(form.next_follow_up)} onChange={e => set('next_follow_up', e.target.value)} />
                <Input label="Install Date" type="date" value={formatDateForInput(form.install_date)} onChange={e => set('install_date', e.target.value)} />
                <Input label="Contract Expiration" type="date" value={formatDateForInput(form.contract_expiration)} onChange={e => set('contract_expiration', e.target.value)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem icon={<Clock size={13} />} label="Last Contacted" value={formatDate(lead.last_contacted)} />
                <InfoItem
                  icon={<Calendar size={13} />}
                  label="Next Follow-Up"
                  value={formatDate(lead.next_follow_up)}
                  alert={lead.next_follow_up ? isOverdue(lead.next_follow_up) : false}
                />
                <InfoItem icon={<CheckCircle size={13} />} label="Install Date" value={formatDate(lead.install_date)} />
                <InfoItem
                  icon={<RefreshCw size={13} />}
                  label="Contract Exp."
                  value={formatDate(lead.contract_expiration)}
                  alert={lead.contract_expiration ? isOverdue(lead.contract_expiration) : false}
                />
              </div>
            )}
          </section>

          {/* Source & Referral */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Source & Referral</h3>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <Select label="Lead Source" value={form.lead_source || ''} onChange={e => set('lead_source', e.target.value as any)} options={LEAD_SOURCES.map(s => ({ value: s, label: s }))} placeholder="Select..." />
                <Input label="Referred By" value={form.referred_by || ''} onChange={e => set('referred_by', e.target.value)} />
                <Input label="Referral Bonus ($)" type="number" value={form.referral_bonus_amount?.toString() || ''} onChange={e => set('referral_bonus_amount', parseFloat(e.target.value))} />
                <div className="flex items-center gap-2 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => set('referral_bonus_paid', !form.referral_bonus_paid)}
                      className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.referral_bonus_paid ? 'bg-purple-600' : 'bg-white/10'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${form.referral_bonus_paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">Bonus paid</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem icon={<User size={13} />} label="Lead Source" value={lead.lead_source} />
                <InfoItem icon={<User size={13} />} label="Referred By" value={lead.referred_by} />
                {lead.referral_bonus_amount && (
                  <InfoItem
                    icon={<DollarSign size={13} />}
                    label="Referral Bonus"
                    value={`${formatCurrency(lead.referral_bonus_amount)} ${lead.referral_bonus_paid ? '✓ Paid' : '· Unpaid'}`}
                  />
                )}
              </div>
            )}
          </section>

          {/* Assigned rep */}
          {(isAdmin || editing) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Assignment</h3>
              {editing ? (
                <Select
                  label="Assigned Rep"
                  value={form.assigned_rep_id || ''}
                  onChange={e => set('assigned_rep_id', e.target.value)}
                  options={reps.map(r => ({ value: r.id, label: r.name }))}
                />
              ) : (
                lead.assigned_rep && (
                  <div className="flex items-center gap-3">
                    <Avatar name={(lead.assigned_rep as any).name} size="sm" />
                    <span className="text-sm text-white">{(lead.assigned_rep as any).name}</span>
                  </div>
                )
              )}
            </section>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <NotesSection leadId={lead.id} currentUserId={currentUserId} />
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div>
          <DocumentsSection leadId={lead.id} />
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div>
          <ActivitySection leadId={lead.id} />
        </div>
      )}

      {/* Referrals Tab */}
      {activeTab === 'referrals' && (
        <div>
          <ReferralAgreementsSection leadId={lead.id} canEdit={editing} />
        </div>
      )}

      {/* Delete — admin only, hidden while editing */}
      {deleteError && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {deleteError}
        </div>
      )}

      {canDelete && !editing && (
        <div className="mt-8 pt-5 border-t border-white/[0.06]">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} />
              Delete Lead
            </button>
          ) : (
            <div className="rounded-xl p-4 border border-red-500/20 bg-red-500/5">
              <p className="text-sm text-white font-medium mb-1">
                Delete {lead.business?.business_name || lead.business_name || 'this lead'}?
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                This cannot be undone. All data for this lead will be permanently removed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 text-xs font-medium rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete permanently'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

function InfoItem({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value?: string | null; alert?: boolean }) {
  if (!value) return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs text-[var(--text-muted)]">—</span>
    </div>
  )
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className={`text-sm ${alert ? 'text-red-400 font-medium' : 'text-[var(--text-secondary)]'}`}>{value}</span>
      </div>
    </div>
  )
}

const DOC_LABELS = ['Contract', 'Equipment Photo', 'ID', 'Other'] as const
type DocLabel = typeof DOC_LABELS[number]

function fileTypeEmoji(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️'
  if (ext === 'pdf') return '📄'
  if (['doc', 'docx'].includes(ext)) return '📝'
  return '📎'
}

function DocumentsSection({ leadId }: { leadId: string }) {
  const [docs, setDocs]                   = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [uploading, setUploading]         = useState(false)
  const [label, setLabel]                 = useState<DocLabel>('Other')
  const [uploadError, setUploadError]     = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const { createClient } = require('@/lib/supabase')
    const sb = createClient()
    sb.from('documents')
      .select('*')
      .eq('lead_id', leadId)
      .order('uploaded_at', { ascending: false })
      .then(({ data }: { data: any[] | null }) => {
        if (!cancelled) { setDocs(data ?? []); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [leadId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const { createClient } = await import('@/lib/supabase')
      const sb = createClient()

      const storagePath = `${leadId}/${Date.now()}_${file.name}`
      const { error: storageErr } = await sb.storage
        .from('documents')
        .upload(storagePath, file, { upsert: false })
      if (storageErr) throw storageErr

      const { data: { publicUrl } } = sb.storage
        .from('documents')
        .getPublicUrl(storagePath)

      const { data: doc, error: dbErr } = await sb
        .from('documents')
        .insert({ lead_id: leadId, name: file.name, label, url: publicUrl })
        .select()
        .single()
      if (dbErr) throw dbErr

      setDocs(prev => [doc, ...prev])
    } catch (err: any) {
      console.error('[docs upload]', err)
      setUploadError(err?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (doc: any) => {
    if (confirmDeleteId !== doc.id) { setConfirmDeleteId(doc.id); return }
    setDeleting(true)
    try {
      const { createClient } = await import('@/lib/supabase')
      const sb = createClient()

      // Derive the storage path from the public URL:
      // https://<ref>.supabase.co/storage/v1/object/public/documents/<path>
      const marker = '/object/public/documents/'
      const storagePath = doc.url.includes(marker)
        ? doc.url.split(marker)[1]
        : null
      if (storagePath) await sb.storage.from('documents').remove([storagePath])

      await sb.from('documents').delete().eq('id', doc.id)
      setDocs(prev => prev.filter(d => d.id !== doc.id))
      setConfirmDeleteId(null)
    } catch (err) {
      console.error('[docs delete]', err)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="py-12 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
      Loading documents…
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Upload row */}
      <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Document type
            </label>
            <select
              value={label}
              onChange={e => setLabel(e.target.value as DocLabel)}
              style={{
                background: '#1a1f2e',
                color: '#e2e8f8',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '7px 12px',
                width: '100%',
                fontSize: '13px',
              }}
            >
              {DOC_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload size={13} />}
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload File'}
          </Button>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          PDF, JPG, PNG, GIF, DOCX · Max 10 MB
        </p>
        {uploadError && (
          <p className="text-[11px] text-red-400">{uploadError}</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
          <FileText size={28} className="mx-auto mb-2 opacity-30" />
          No documents uploaded yet
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] group"
            >
              <span className="text-xl flex-shrink-0">{fileTypeEmoji(doc.name)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{doc.name}</div>
                <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>{doc.label}</span>
                  <span>·</span>
                  <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View / Download"
                  className="p-1.5 rounded-lg transition-all hover:bg-white/[0.06]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ExternalLink size={13} />
                </a>
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deleting && confirmDeleteId === doc.id}
                  onBlur={() => setConfirmDeleteId(null)}
                  title={confirmDeleteId === doc.id ? 'Click again to confirm delete' : 'Delete document'}
                  className={`p-1.5 rounded-lg transition-all ${
                    confirmDeleteId === doc.id
                      ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                      : 'hover:text-red-400 hover:bg-red-500/10'
                  }`}
                  style={confirmDeleteId !== doc.id ? { color: 'var(--text-muted)' } : {}}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivitySection({ leadId }: { leadId: string }) {
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50)
      setActivities(data || [])
      setLoading(false)
    }
    fetchActivities()
  }, [leadId, supabase])

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)] text-sm">
        <Clock size={32} className="mx-auto mb-2 opacity-30" />
        Activity log for this lead will appear here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map(activity => (
        <div key={activity.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm">
          <div className="flex items-start gap-3">
            <Clock size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium">{activity.action}</div>
              {activity.details && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {activity.details}
                </div>
              )}
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {new Date(activity.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
