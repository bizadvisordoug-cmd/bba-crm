'use client'

import { useState, useEffect } from 'react'
import {
  Phone, Mail, Edit3, Save, X, Building2, Trash2, Plus, ExternalLink, DollarSign, Zap,
} from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase'
import type { Person, Lead } from '@/types'

export type FullBusiness = {
  id: string
  business_name: string
  industry?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  business_phone?: string | null
  business_email?: string | null
  commission_percentage?: number | null
}

export type PersonWithBusinesses = Omit<Person, 'phone' | 'email'> & {
  phone?: string | null
  email?: string | null
  businesses: FullBusiness[]
}

interface PeopleDrawerProps {
  person: PersonWithBusinesses
  open: boolean
  onClose: () => void
  onUpdate: (person: PersonWithBusinesses) => void
  onDelete?: (id: string) => void
  onViewLead?: (lead: Lead) => void
  isAdmin: boolean
}

const EMPTY_BIZ_FORM = { name: '', industry: '', address: '', city: '', state: '', zip: '', business_phone: '', business_email: '', commission_percentage: '' }

export function PeopleDrawer({ person, open, onClose, onUpdate, onDelete, onViewLead, isAdmin }: PeopleDrawerProps) {
  const supabase = createClient()

  // Person edit state
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({ name: person.name, phone: person.phone || '', email: person.email || '' })

  // Business state
  const [businesses, setBusinesses] = useState<FullBusiness[]>(person.businesses || [])
  const [editingBizId, setEditingBizId] = useState<string | null>(null)
  const [bizForm, setBizForm] = useState<Partial<FullBusiness>>({})
  const [savingBiz, setSavingBiz] = useState(false)
  const [bizError, setBizError] = useState('')
  const [addingBiz, setAddingBiz] = useState(false)
  const [newBizForm, setNewBizForm] = useState(EMPTY_BIZ_FORM)
  const [addingBizSaving, setAddingBizSaving] = useState(false)
  const [confirmDeleteBizId, setConfirmDeleteBizId] = useState<string | null>(null)
  const [deletingBiz, setDeletingBiz] = useState(false)

  // Person delete state
  const [confirmDeletePerson, setConfirmDeletePerson] = useState(false)
  const [deletingPerson, setDeletingPerson] = useState(false)
  const [deletePersonError, setDeletePersonError] = useState('')

  // Associated leads
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)

  // Sync state when a different person is selected
  useEffect(() => {
    setEditing(false)
    setSaveError('')
    setForm({ name: person.name, phone: person.phone || '', email: person.email || '' })
    setBusinesses(person.businesses || [])
    setEditingBizId(null)
    setBizForm({})
    setBizError('')
    setAddingBiz(false)
    setNewBizForm(EMPTY_BIZ_FORM)
    setConfirmDeleteBizId(null)
    setConfirmDeletePerson(false)
    setDeletePersonError('')

    // Fetch associated leads
    setLoadingLeads(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('owner_id', person.id)
        if (!error && data) {
          setLeads(data as Lead[])
        }
      } finally {
        setLoadingLeads(false)
      }
    })()
  }, [person.id, supabase])

  // ── Person edit ─────────────────────────────────────────────────────────────

  const handleSavePerson = async () => {
    if (!form.name.trim()) { setSaveError('Name is required'); return }
    setSaving(true)
    setSaveError('')
    try {
      const { data, error } = await supabase
        .from('people')
        .update({ name: form.name.trim(), phone: form.phone || null, email: form.email || null })
        .eq('id', person.id)
        .select()
        .single()
      if (error) throw error
      onUpdate({ ...data, phone: data.phone ?? null, email: data.email ?? null, businesses })
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Business edit ────────────────────────────────────────────────────────────

  const startEditBiz = (biz: FullBusiness) => {
    setEditingBizId(biz.id)
    setBizForm({
      business_name: biz.business_name,
      industry: biz.industry ?? '',
      address: biz.address ?? '',
      city: biz.city ?? '',
      state: biz.state ?? '',
      zip: biz.zip ?? '',
      business_phone: biz.business_phone ?? '',
      business_email: biz.business_email ?? '',
      commission_percentage: biz.commission_percentage ?? null,
    })
    setBizError('')
    setAddingBiz(false)
    setConfirmDeleteBizId(null)
  }

  const handleSaveBiz = async (bizId: string) => {
    if (!bizForm.business_name?.trim()) { setBizError('Business name is required'); return }
    setSavingBiz(true)
    setBizError('')
    try {
      const { data, error } = await supabase
        .from('businesses')
        .update({
          business_name: bizForm.business_name.trim(),
          industry: bizForm.industry || null,
          address: bizForm.address || null,
          city: bizForm.city || null,
          state: bizForm.state || null,
          zip: bizForm.zip || null,
          business_phone: bizForm.business_phone || null,
          business_email: bizForm.business_email || null,
          commission_percentage: bizForm.commission_percentage ?? null,
        })
        .eq('id', bizId)
        .select()
        .single()
      if (error) throw error

      // Sync business contact info to all related leads
      if (bizForm.business_phone || bizForm.business_email) {
        await supabase
          .from('leads')
          .update({
            business_phone: bizForm.business_phone || null,
            email: bizForm.business_email || null,
          })
          .eq('business_id', bizId)
      }

      const updated = businesses.map(b => b.id === bizId ? data : b)
      setBusinesses(updated)
      onUpdate({ ...person, name: form.name, phone: form.phone || null, email: form.email || null, businesses: updated } as PersonWithBusinesses)
      setEditingBizId(null)
    } catch (err) {
      setBizError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingBiz(false)
    }
  }

  // ── Business add ─────────────────────────────────────────────────────────────

  const handleAddBiz = async () => {
    if (!newBizForm.name.trim()) { setBizError('Business name is required'); return }
    setAddingBizSaving(true)
    setBizError('')
    try {
      const { data, error } = await supabase
        .from('businesses')
        .insert({
          owner_id: person.id,
          business_name: newBizForm.name.trim(),
          industry: newBizForm.industry || null,
          address: newBizForm.address || null,
          city: newBizForm.city || null,
          state: newBizForm.state || null,
          zip: newBizForm.zip || null,
          business_phone: newBizForm.business_phone || null,
          business_email: newBizForm.business_email || null,
          commission_percentage: newBizForm.commission_percentage ? parseFloat(newBizForm.commission_percentage) : null,
        })
        .select()
        .single()
      if (error) throw error
      const updated = [...businesses, data]
      setBusinesses(updated)
      onUpdate({ ...person, name: form.name, phone: form.phone || null, email: form.email || null, businesses: updated } as PersonWithBusinesses)
      setNewBizForm(EMPTY_BIZ_FORM)
      setAddingBiz(false)
    } catch (err) {
      setBizError(err instanceof Error ? err.message : 'Failed to add business')
    } finally {
      setAddingBizSaving(false)
    }
  }

  // ── Business delete ───────────────────────────────────────────────────────────

  const handleDeleteBiz = async (bizId: string) => {
    if (confirmDeleteBizId !== bizId) { setConfirmDeleteBizId(bizId); return }
    setDeletingBiz(true)
    try {
      const { error } = await supabase.from('businesses').delete().eq('id', bizId)
      if (error) throw error
      const updated = businesses.filter(b => b.id !== bizId)
      setBusinesses(updated)
      onUpdate({ ...person, name: form.name, phone: form.phone || null, email: form.email || null, businesses: updated })
      setConfirmDeleteBizId(null)
    } catch (err) {
      setBizError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingBiz(false)
    }
  }

  // ── Person delete ─────────────────────────────────────────────────────────────

  const handleDeletePerson = async () => {
    setDeletingPerson(true)
    setDeletePersonError('')
    try {
      // Block delete if any leads are assigned to this person
      const { data: linked } = await supabase
        .from('leads')
        .select('id')
        .eq('owner_id', person.id)
        .limit(1)

      if (linked && linked.length > 0) {
        setDeletePersonError('This person has leads in the CRM. Remove or reassign those leads first.')
        setConfirmDeletePerson(false)
        return
      }

      const { error } = await supabase.from('people').delete().eq('id', person.id)
      if (error) throw error
      onDelete?.(person.id)
      onClose()
    } catch (err) {
      setDeletePersonError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingPerson(false)
      setConfirmDeletePerson(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const bizLocation = (biz: FullBusiness) =>
    [biz.city, biz.state].filter(Boolean).join(', ') || biz.address || null

  return (
    <Drawer open={open} onClose={onClose} width="580px">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar name={person.name} size="md" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="mb-0"
              />
            ) : (
              <h2 className="text-lg font-bold text-white truncate">{person.name}</h2>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" icon={<X size={14} />}
                onClick={() => { setEditing(false); setForm({ name: person.name, phone: person.phone || '', email: person.email || '' }); setSaveError('') }}
              >Cancel</Button>
              <Button variant="primary" size="sm" icon={<Save size={14} />} loading={saving} onClick={handleSavePerson}>Save</Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" icon={<Edit3 size={14} />} onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
      </div>

      {saveError && <p className="text-xs text-red-400 mb-3 -mt-2">{saveError}</p>}

      {/* ── Contact Info ── */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Owner Contact</h3>
        {editing ? (
          <div className="space-y-3">
            <Input label="Owner Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 123-4567" />
            <Input label="Owner Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
          </div>
        ) : (
          <div className="space-y-2">
            {person.phone && (
              <a href={`tel:${person.phone}`} className="flex items-center gap-2 text-sm hover:text-purple-400 transition-colors">
                <Phone size={13} className="text-[var(--text-muted)]" />
                <div className="flex-1">
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Owner Phone</div>
                  <span style={{ color: 'var(--text-secondary)' }}>{person.phone}</span>
                </div>
              </a>
            )}
            {person.email && (
              <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-sm hover:text-purple-400 transition-colors">
                <Mail size={13} className="text-[var(--text-muted)]" />
                <div className="flex-1">
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Owner Email</div>
                  <span style={{ color: 'var(--text-secondary)' }}>{person.email}</span>
                </div>
              </a>
            )}
            {!person.phone && !person.email && (
              <p className="text-xs text-[var(--text-muted)]">No contact info.{' '}
                <button className="text-purple-400 hover:underline" onClick={() => setEditing(true)}>Add →</button>
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Businesses ── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Businesses ({businesses.length})
          </h3>
          {!addingBiz && (
            <button
              onClick={() => { setAddingBiz(true); setEditingBizId(null); setConfirmDeleteBizId(null); setBizError('') }}
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Plus size={13} />
              Add Business
            </button>
          )}
        </div>

        {bizError && <p className="text-xs text-red-400 mb-2">{bizError}</p>}

        <div className="space-y-2">
          {businesses.map(biz => (
            <div key={biz.id}>
              {editingBizId === biz.id ? (
                /* ── Inline edit form ── */
                <div className="p-3 rounded-xl border border-purple-500/30 bg-white/[0.03]">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Input
                      label="Business Name *"
                      className="col-span-2"
                      value={bizForm.business_name ?? ''}
                      onChange={e => setBizForm(f => ({ ...f, business_name: e.target.value }))}
                    />
                    <Input
                      label="Industry"
                      value={bizForm.industry ?? ''}
                      onChange={e => setBizForm(f => ({ ...f, industry: e.target.value }))}
                    />
                    <Input
                      label="Street Address"
                      className="col-span-3"
                      value={bizForm.address ?? ''}
                      onChange={e => setBizForm(f => ({ ...f, address: e.target.value }))}
                    />
                    <Input label="City" value={bizForm.city ?? ''} onChange={e => setBizForm(f => ({ ...f, city: e.target.value }))} />
                    <Input label="State" value={bizForm.state ?? ''} onChange={e => setBizForm(f => ({ ...f, state: e.target.value }))} />
                    <Input label="Zip" value={bizForm.zip ?? ''} onChange={e => setBizForm(f => ({ ...f, zip: e.target.value }))} />
                    <Input
                      label="Business Phone"
                      type="tel"
                      className="col-span-2"
                      value={bizForm.business_phone ?? ''}
                      onChange={e => setBizForm(f => ({ ...f, business_phone: e.target.value }))}
                      placeholder="+1 (555) 123-4567"
                    />
                    <Input
                      label="Business Email"
                      type="email"
                      className="col-span-3"
                      value={bizForm.business_email ?? ''}
                      onChange={e => setBizForm(f => ({ ...f, business_email: e.target.value }))}
                      placeholder="business@example.com"
                    />
                    <Input
                      label="Commission %"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={bizForm.commission_percentage?.toString() ?? ''}
                      onChange={e => setBizForm(f => ({ ...f, commission_percentage: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="Default"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setEditingBizId(null); setBizError('') }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveBiz(biz.id)}
                      disabled={savingBiz}
                      className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-colors"
                    >
                      {savingBiz ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : confirmDeleteBizId === biz.id ? (
                /* ── Delete confirmation ── */
                <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                  <p className="text-sm text-white mb-1">Delete <span className="font-medium">{biz.business_name}</span>?</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    This removes the business record but does not affect CRM leads.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDeleteBizId(null)}
                      className="flex-1 py-1.5 text-xs rounded-lg border border-white/10 text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteBiz(biz.id)}
                      disabled={deletingBiz}
                      className="flex-1 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-colors"
                    >
                      {deletingBiz ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View row ── */
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] group">
                  <Building2 size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{biz.business_name}</p>
                    {(biz.industry || bizLocation(biz)) && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {[biz.industry, bizLocation(biz)].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(biz.business_phone || biz.business_email) && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {[biz.business_phone, biz.business_email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {biz.commission_percentage != null && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 flex-shrink-0">
                      {biz.commission_percentage}%
                    </span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEditBiz(biz)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-white transition-all"
                      title="Edit business"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => { setConfirmDeleteBizId(biz.id); setEditingBizId(null) }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all"
                      title="Delete business"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Add business form ── */}
          {addingBiz && (
            <div className="p-3 rounded-xl border border-purple-500/30 bg-white/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                New Business
              </p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <Input
                  label="Business Name *"
                  className="col-span-2"
                  value={newBizForm.name}
                  onChange={e => setNewBizForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
                <Input
                  label="Industry"
                  value={newBizForm.industry}
                  onChange={e => setNewBizForm(f => ({ ...f, industry: e.target.value }))}
                />
                <Input
                  label="Street Address"
                  className="col-span-3"
                  value={newBizForm.address}
                  onChange={e => setNewBizForm(f => ({ ...f, address: e.target.value }))}
                />
                <Input label="City" value={newBizForm.city} onChange={e => setNewBizForm(f => ({ ...f, city: e.target.value }))} />
                <Input label="State" value={newBizForm.state} onChange={e => setNewBizForm(f => ({ ...f, state: e.target.value }))} />
                <Input label="Zip" value={newBizForm.zip} onChange={e => setNewBizForm(f => ({ ...f, zip: e.target.value }))} />
                <Input
                  label="Business Phone"
                  type="tel"
                  className="col-span-2"
                  value={newBizForm.business_phone}
                  onChange={e => setNewBizForm(f => ({ ...f, business_phone: e.target.value }))}
                  placeholder="+1 (555) 123-4567"
                />
                <Input
                  label="Business Email"
                  type="email"
                  className="col-span-3"
                  value={newBizForm.business_email}
                  onChange={e => setNewBizForm(f => ({ ...f, business_email: e.target.value }))}
                  placeholder="business@example.com"
                />
                <Input
                  label="Commission %"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={newBizForm.commission_percentage}
                  onChange={e => setNewBizForm(f => ({ ...f, commission_percentage: e.target.value }))}
                  placeholder="Leave blank for default"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setAddingBiz(false); setNewBizForm(EMPTY_BIZ_FORM); setBizError('') }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddBiz}
                  disabled={addingBizSaving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-colors"
                >
                  {addingBizSaving ? 'Adding…' : 'Add Business'}
                </button>
              </div>
            </div>
          )}

          {businesses.length === 0 && !addingBiz && (
            <p className="text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>
              No businesses yet.{' '}
              <button className="text-purple-400 hover:underline" onClick={() => setAddingBiz(true)}>
                Add one →
              </button>
            </p>
          )}
        </div>
      </section>

      {/* ── Associated Leads ── */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          Leads ({leads.length})
        </h3>
        {loadingLeads ? (
          <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : leads.length === 0 ? (
          <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>No leads yet.</p>
        ) : (
          <div className="space-y-2">
            {leads.map(lead => {
              const stageColors: Record<string, string> = {
                'New Lead': '#6b7280',
                'Contacted': '#3b82f6',
                'Appointment Set': '#8b5cf6',
                'Contract Sent': '#f59e0b',
                'Signed': '#06b6d4',
                'Equipment Ordered': '#a855f7',
                'Install Scheduled': '#60a5fa',
                'Active Client': '#10b981',
              }
              return (
                <button
                  key={lead.id}
                  onClick={() => onViewLead?.(lead)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-purple-500/30 transition-all group"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: stageColors[lead.pipeline_stage as string] || '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{lead.business_name || lead.owner_name || 'Untitled'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {lead.pipeline_stage}
                      </p>
                      {lead.current_processor && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          • {lead.current_processor}
                        </p>
                      )}
                      {lead.monthly_processing_volume ? (
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          • ${(lead.monthly_processing_volume / 1000).toFixed(0)}k/mo
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <ExternalLink size={13} className="text-[var(--text-muted)] group-hover:text-purple-400 flex-shrink-0 transition-colors" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Danger zone (admin only) ── */}
      {isAdmin && onDelete && (
        <div className="pt-5 border-t border-white/[0.06]">
          {deletePersonError && (
            <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {deletePersonError}
            </div>
          )}
          {!confirmDeletePerson ? (
            <button
              onClick={() => { setConfirmDeletePerson(true); setDeletePersonError('') }}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} />
              Delete Person
            </button>
          ) : (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
              <p className="text-sm font-medium text-white mb-1">Delete {person.name}?</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                This cannot be undone. The person and their associated businesses will be removed.
                This will fail if they have active leads in the CRM.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeletePerson(false)}
                  className="flex-1 py-2 text-xs font-medium rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePerson}
                  disabled={deletingPerson}
                  className="flex-1 py-2 text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {deletingPerson ? 'Deleting…' : 'Yes, delete permanently'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
