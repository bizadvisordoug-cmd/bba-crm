'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign, TrendingUp, CheckCircle, Clock, ChevronRight,
  Plus, X, Save, AlertCircle, Trash2, Building2, Edit3,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Drawer } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { CommissionRecord, CommissionLineItem, PaymentProcessor, User } from '@/types'

type BusinessOption = {
  id: string
  business_name: string
  processor_id?: string | null
  commission_percentage?: number | null
  owner?: { id: string; name: string } | null
}

const bizLabel = (b: BusinessOption) =>
  b.owner?.name ? `${b.business_name} (${b.owner.name})` : b.business_name

interface CommissionsClientProps {
  records: (CommissionRecord & { rep: User })[]
  processors: PaymentProcessor[]
  reps: User[]
  businesses: BusinessOption[]
  year: number
  month: number
  currentUserId: string
  overdueCount: number
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const fmt$ = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function statusBadge(status: 'pending' | 'partial' | 'paid') {
  if (status === 'paid')    return <Badge variant="green">Paid</Badge>
  if (status === 'partial') return <Badge variant="amber">Partial</Badge>
  return <Badge variant="gray">Pending</Badge>
}

export function CommissionsClient({ records: initialRecords, processors, reps, businesses, year, month, currentUserId, overdueCount }: CommissionsClientProps) {
  const supabase = createClient()
  const MONTH_NAME = MONTH_NAMES[month - 1]

  useEffect(() => {
    console.log('[CommissionsClient] businesses received:', businesses.length, businesses)
  }, [])

  // Alert banner state
  const todayDay = new Date().getDate()
  const isPaymentEntryTime = todayDay >= 26
  const [entryDismissed, setEntryDismissed] = useState(false)
  const [overdueDismissed, setOverdueDismissed] = useState(false)

  const dismissEntry = async () => {
    setEntryDismissed(true)
    await supabase.from('commission_notifications').upsert(
      { user_id: currentUserId, type: 'commission_entry', year, month, dismissed: true, dismissed_at: new Date().toISOString() },
      { onConflict: 'user_id,type,year,month' }
    )
  }

  const dismissOverdue = () => setOverdueDismissed(true)

  const [records, setRecords] = useState(initialRecords)
  const [selectedRecord, setSelectedRecord] = useState<(CommissionRecord & { rep: User }) | null>(null)
  const [lineItems, setLineItems] = useState<CommissionLineItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [markPaidError, setMarkPaidError] = useState('')

  const [showAddRecord, setShowAddRecord] = useState(false)
  const [addRecordForm, setAddRecordForm] = useState<{ rep_id: string }>({ rep_id: '' })
  const [addRecordSaving, setAddRecordSaving] = useState(false)
  const [addRecordError, setAddRecordError] = useState('')

  const [showAddItem, setShowAddItem] = useState(false)
  const [addItemForm, setAddItemForm] = useState({
    processor: '',
    lead_id: '',
    business_id: '',
    amount_from_processor: '',
    commission_rate: '50',
    notes: '',
  })
  const [addItemSaving, setAddItemSaving] = useState(false)
  const [addItemError, setAddItemError] = useState('')
  // Non-null while the same form is being used to correct an existing item
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  const [confirmDeleteRecordId, setConfirmDeleteRecordId] = useState<string | null>(null)
  const [deletingRecord, setDeletingRecord] = useState(false)

  // Computed
  const totalOwed = records.reduce((s, r) => s + (r.total_owed ?? 0), 0)
  const totalPaid = records.reduce((s, r) => s + (r.total_paid ?? 0), 0)
  const paidCount = records.filter(r => r.status === 'paid').length
  const pendingCount = records.filter(r => r.status !== 'paid').length

  // Live commission amount in add-item form
  const liveCommissionAmount = (() => {
    const amt = parseFloat(addItemForm.amount_from_processor)
    const rate = parseFloat(addItemForm.commission_rate)
    if (!isNaN(amt) && !isNaN(rate)) return amt * (rate / 100)
    return null
  })()

  const loadLineItems = useCallback(async (recordId: string) => {
    setLoadingItems(true)
    const { data } = await supabase
      .from('commission_line_items')
      .select('*, lead:leads(id, business_name), business:businesses(id, business_name)')
      .eq('commission_record_id', recordId)
      .order('created_at')
    setLineItems((data ?? []) as CommissionLineItem[])
    setLoadingItems(false)
  }, [supabase])

  const handleSelectRecord = (record: CommissionRecord & { rep: User }) => {
    setSelectedRecord(record)
    setLineItems([])
    closeItemForm()
    setMarkPaidError('')
    loadLineItems(record.id)
  }

  const handleMarkPaid = async (record: CommissionRecord & { rep: User }) => {
    setMarkingPaid(true)
    setMarkPaidError('')
    try {
      const { error } = await supabase
        .from('commission_records')
        .update({ total_paid: record.total_owed })
        .eq('id', record.id)
      if (error) throw error
      const updated = { ...record, total_paid: record.total_owed, status: 'paid' as const, paid_date: new Date().toISOString() }
      setRecords(prev => prev.map(r => r.id === record.id ? updated : r))
      setSelectedRecord(updated)
      // Fire-and-forget email statement to rep
      fetch('/api/commissions/send-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_record_id: record.id }),
      }).then(res => {
        if (!res.ok) res.json().then(d => console.warn('[CommissionsClient] statement email error:', d.error))
      }).catch(err => console.warn('[CommissionsClient] statement email failed:', err))
    } catch (err) {
      setMarkPaidError(err instanceof Error ? err.message : 'Failed to mark as paid')
    } finally {
      setMarkingPaid(false)
    }
  }

  const handleAddRecord = async () => {
    if (!addRecordForm.rep_id) { setAddRecordError('Select a rep'); return }
    setAddRecordSaving(true)
    setAddRecordError('')
    try {
      // Check for duplicate
      const { data: existing } = await supabase
        .from('commission_records')
        .select('id')
        .eq('rep_id', addRecordForm.rep_id)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle()
      if (existing) { setAddRecordError('A statement already exists for this rep this month'); setAddRecordSaving(false); return }

      const { data: inserted, error } = await supabase
        .from('commission_records')
        .insert({ rep_id: addRecordForm.rep_id, year, month, total_owed: 0, total_paid: 0 })
        .select('*, rep:users(id, name, email, role, avatar_url)')
        .single()
      if (error) throw error
      setRecords(prev => [...prev, inserted as CommissionRecord & { rep: User }])
      setAddRecordForm({ rep_id: '' })
      setShowAddRecord(false)
    } catch (err) {
      setAddRecordError(err instanceof Error ? err.message : 'Failed to create statement')
    } finally {
      setAddRecordSaving(false)
    }
  }

  const startEditLineItem = (item: CommissionLineItem) => {
    setEditingItemId(item.id)
    setAddItemForm({
      processor: item.processor,
      lead_id: item.lead_id ?? '',
      business_id: item.business_id ?? '',
      amount_from_processor: item.amount_from_processor.toString(),
      commission_rate: item.commission_rate.toString(),
      notes: item.notes ?? '',
    })
    setAddItemError('')
    setShowAddItem(true)
  }

  const closeItemForm = () => {
    setShowAddItem(false)
    setEditingItemId(null)
    setAddItemError('')
    setAddItemForm({ processor: '', lead_id: '', business_id: '', amount_from_processor: '', commission_rate: '50', notes: '' })
  }

  const handleSaveLineItem = async () => {
    if (!selectedRecord) return
    if (!addItemForm.processor) { setAddItemError('Select a processor'); return }
    const amtFromProc = parseFloat(addItemForm.amount_from_processor)
    if (isNaN(amtFromProc) || amtFromProc <= 0) { setAddItemError('Enter a valid amount'); return }
    const rate = parseFloat(addItemForm.commission_rate)
    if (isNaN(rate) || rate <= 0 || rate > 100) { setAddItemError('Enter a valid commission rate (0.01–100)'); return }
    const commissionAmount = amtFromProc * (rate / 100)

    const itemPayload = {
      commission_record_id: selectedRecord.id,
      processor: addItemForm.processor,
      lead_id: addItemForm.lead_id || null,
      business_id: addItemForm.business_id || null,
      amount_from_processor: amtFromProc,
      commission_rate: rate,
      commission_amount: commissionAmount,
      notes: addItemForm.notes || null,
    }
    console.log('[CommissionsClient] saving line item:', editingItemId ?? '(new)', itemPayload)

    setAddItemSaving(true)
    setAddItemError('')
    try {
      const query = editingItemId
        ? supabase.from('commission_line_items').update(itemPayload).eq('id', editingItemId)
        : supabase.from('commission_line_items').insert(itemPayload)
      const { data: item, error } = await query
        .select('*, lead:leads(id, business_name), business:businesses(id, business_name)')
        .single()
      if (error) {
        console.error('[CommissionsClient] save error:', error)
        throw error
      }
      setLineItems(prev => editingItemId
        ? prev.map(i => i.id === editingItemId ? item as CommissionLineItem : i)
        : [...prev, item as CommissionLineItem])

      // Re-fetch record for updated total_owed (DB trigger updates it)
      const { data: refreshed } = await supabase
        .from('commission_records')
        .select('*, rep:users(id, name, email, role, avatar_url)')
        .eq('id', selectedRecord.id)
        .single()
      if (refreshed) {
        const updated = refreshed as CommissionRecord & { rep: User }
        setSelectedRecord(updated)
        setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
      }

      closeItemForm()
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : 'Failed to save line item')
    } finally {
      setAddItemSaving(false)
    }
  }

  const handleDeleteLineItem = async (itemId: string) => {
    await supabase.from('commission_line_items').delete().eq('id', itemId)
    setLineItems(prev => prev.filter(i => i.id !== itemId))
    // Re-fetch record for updated total_owed
    if (selectedRecord) {
      const { data: refreshed } = await supabase
        .from('commission_records')
        .select('*, rep:users(id, name, email, role, avatar_url)')
        .eq('id', selectedRecord.id)
        .single()
      if (refreshed) {
        const updated = refreshed as CommissionRecord & { rep: User }
        setSelectedRecord(updated)
        setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
      }
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    setDeletingRecord(true)
    try {
      await supabase.from('commission_records').delete().eq('id', recordId)
      setRecords(prev => prev.filter(r => r.id !== recordId))
      setSelectedRecord(null)
      setConfirmDeleteRecordId(null)
    } catch {
      // silent
    } finally {
      setDeletingRecord(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Commissions"
        subtitle={`${MONTH_NAME} ${year}`}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => { setShowAddRecord(v => !v); setAddRecordError('') }}
          >
            New Statement
          </Button>
        }
      />

      {/* Alert banners */}
      {(isPaymentEntryTime && !entryDismissed) && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.07]">
          <div className="flex items-center gap-3">
            <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
            <p className="text-sm text-white">
              📌 Enter processor payments for <span className="font-semibold">{MONTH_NAME} {year}</span>
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                — it's the {todayDay}th, deposits should be in.
              </span>
            </p>
          </div>
          <button onClick={dismissEntry} className="p-1 rounded-lg hover:bg-white/[0.06] flex-shrink-0 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>
      )}
      {(overdueCount > 0 && !overdueDismissed) && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.05]">
          <div className="flex items-center gap-3">
            <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
            <p className="text-sm text-white">
              <span className="font-semibold">{overdueCount} commission {overdueCount === 1 ? 'statement' : 'statements'}</span>
              {' '}from previous months still unpaid.
            </p>
          </div>
          <button onClick={dismissOverdue} className="p-1 rounded-lg hover:bg-white/[0.06] flex-shrink-0 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <GlassCard animate={false}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/20">
                <DollarSign size={17} className="text-purple-400" />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Owed</p>
                <p className="text-lg font-bold text-white">{fmt$(totalOwed)}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <GlassCard animate={false}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-500/20">
                <CheckCircle size={17} className="text-green-400" />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Paid</p>
                <p className="text-lg font-bold text-white">{fmt$(totalPaid)}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard animate={false}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/20">
                <Clock size={17} className="text-amber-400" />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Outstanding</p>
                <p className="text-lg font-bold text-white">{fmt$(totalOwed - totalPaid)}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Add record panel */}
      {showAddRecord && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-4"
        >
          <GlassCard animate={false}>
            <h3 className="text-sm font-semibold text-white mb-3">New Commission Statement</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Rep</label>
                <select
                  value={addRecordForm.rep_id}
                  onChange={e => setAddRecordForm({ rep_id: e.target.value })}
                  style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 12px', width: '100%' }}
                >
                  <option value="">Select rep…</option>
                  {reps.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <Button variant="primary" size="sm" icon={<Save size={13} />} loading={addRecordSaving} onClick={handleAddRecord}>
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddRecord(false); setAddRecordError('') }}>
                Cancel
              </Button>
            </div>
            {addRecordError && (
              <p className="text-xs text-red-400 mt-2">{addRecordError}</p>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* Rep table */}
      <GlassCard animate={false} className="overflow-hidden p-0">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_120px_110px_110px_110px_90px_32px] gap-3 px-4 py-3 border-b border-white/[0.06]">
          {['Rep', 'Period', 'Owed', 'Paid', 'Outstanding', 'Status', ''].map((h, i) => (
            <span key={i} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {h}
            </span>
          ))}
        </div>

        {records.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No commission statements for this month. Click 'New Statement' to create one.
            </p>
          </div>
        ) : (
          records.map((record, i) => {
            const outstanding = (record.total_owed ?? 0) - (record.total_paid ?? 0)
            return (
              <button
                key={record.id}
                onClick={() => handleSelectRecord(record)}
                className={`w-full grid grid-cols-[1fr_120px_110px_110px_110px_90px_32px] gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors ${
                  i < records.length - 1 ? 'border-b border-white/[0.04]' : ''
                } ${selectedRecord?.id === record.id ? 'bg-purple-500/5' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={record.rep?.name ?? ''} size="sm" src={record.rep?.avatar_url} />
                  <span className="text-sm font-medium text-white truncate">{record.rep?.name}</span>
                </div>
                <span className="text-sm self-center" style={{ color: 'var(--text-secondary)' }}>
                  {MONTH_NAMES[month - 1].slice(0, 3)} {year}
                </span>
                <span className="text-sm self-center text-white">{fmt$(record.total_owed ?? 0)}</span>
                <span className="text-sm self-center" style={{ color: 'var(--text-secondary)' }}>{fmt$(record.total_paid ?? 0)}</span>
                <span className={`text-sm self-center font-medium ${outstanding > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                  {fmt$(outstanding)}
                </span>
                <div className="self-center">{statusBadge(record.status)}</div>
                <ChevronRight size={14} className="self-center text-[var(--text-muted)]" />
              </button>
            )
          })
        )}
      </GlassCard>

      {/* Drawer */}
      <Drawer open={!!selectedRecord} onClose={() => { setSelectedRecord(null); setConfirmDeleteRecordId(null) }} width="620px">
        {selectedRecord && (
          <>
            {/* Drawer header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar name={selectedRecord.rep?.name ?? ''} size="md" src={selectedRecord.rep?.avatar_url} />
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedRecord.rep?.name}</h2>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {MONTH_NAME} {year}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedRecord(null); setConfirmDeleteRecordId(null) }}
                className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Status + amounts summary */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-5">
              <div className="flex-1">
                {statusBadge(selectedRecord.status)}
              </div>
              <div className="text-right">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Owed</p>
                <p className="text-base font-bold text-white">{fmt$(selectedRecord.total_owed ?? 0)}</p>
              </div>
              <div className="w-px h-8 bg-white/[0.08]" />
              <div className="text-right">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Paid</p>
                <p className="text-base font-bold text-white">{fmt$(selectedRecord.total_paid ?? 0)}</p>
              </div>
              <div className="w-px h-8 bg-white/[0.08]" />
              <div className="text-right">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Outstanding</p>
                <p className={`text-base font-bold ${(selectedRecord.total_owed - selectedRecord.total_paid) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                  {fmt$((selectedRecord.total_owed ?? 0) - (selectedRecord.total_paid ?? 0))}
                </p>
              </div>
            </div>

            {/* Mark as Paid */}
            {selectedRecord.status !== 'paid' && (
              <div className="mb-5">
                <Button
                  variant="primary"
                  icon={<CheckCircle size={14} />}
                  loading={markingPaid}
                  onClick={() => handleMarkPaid(selectedRecord)}
                >
                  Mark as Paid
                </Button>
                {markPaidError && (
                  <p className="text-xs text-red-400 mt-2">{markPaidError}</p>
                )}
              </div>
            )}

            {/* Line Items */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Line Items</h3>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={13} />}
                onClick={() => showAddItem ? closeItemForm() : setShowAddItem(true)}
              >
                Add Item
              </Button>
            </div>

            {/* Add / edit item form */}
            {showAddItem && (
              <div className="mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                {editingItemId && (
                  <p className="text-xs font-semibold text-white">Edit Line Item</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <SearchableSelect
                      label="Business"
                      placeholder={businesses.length === 0 ? 'No businesses yet…' : 'Search businesses…'}
                      options={businesses.map(b => ({ value: b.id, label: bizLabel(b) }))}
                      value={addItemForm.business_id || undefined}
                      onChange={bizId => {
                        const biz = businesses.find(b => b.id === bizId)
                        // Auto-set processor from business.processor_id; fall back to current selection
                        const bizProc = biz?.processor_id
                          ? processors.find(p => p.id === biz.processor_id)
                          : undefined
                        const procName = bizProc?.name ?? addItemForm.processor
                        const activeProc = bizProc ?? processors.find(p => p.name === procName)
                        const rate = biz?.commission_percentage != null
                          ? biz.commission_percentage
                          : (activeProc?.commission_pct ?? 50)
                        setAddItemForm(f => ({
                          ...f,
                          business_id: bizId ?? '',
                          processor: procName,
                          commission_rate: rate.toString(),
                        }))
                      }}
                      clearable
                    />
                    {businesses.length === 0 && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Create businesses in the People tab first.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Processor</label>
                    <select
                      value={addItemForm.processor}
                      onChange={e => {
                        const procName = e.target.value
                        const proc = processors.find(p => p.name === procName)
                        const biz = businesses.find(b => b.id === addItemForm.business_id)
                        const rate = biz?.commission_percentage != null
                          ? biz.commission_percentage
                          : (proc?.commission_pct ?? 50)
                        setAddItemForm(f => ({ ...f, processor: procName, commission_rate: rate.toString() }))
                      }}
                      style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 12px', width: '100%' }}
                    >
                      <option value="">Select processor…</option>
                      {processors.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Amount from Processor ($)"
                    type="number"
                    step="0.01"
                    value={addItemForm.amount_from_processor}
                    onChange={e => setAddItemForm(f => ({ ...f, amount_from_processor: e.target.value }))}
                    placeholder="0.00"
                  />
                  <Input
                    label="Commission Rate (%)"
                    type="number"
                    step="0.1"
                    value={addItemForm.commission_rate}
                    onChange={e => setAddItemForm(f => ({ ...f, commission_rate: e.target.value }))}
                    placeholder="50"
                  />
                </div>
                {liveCommissionAmount !== null && (
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Commission amount: <span className="text-white">{fmt$(liveCommissionAmount)}</span>
                  </p>
                )}
                <Input
                  label="Notes (optional)"
                  value={addItemForm.notes}
                  onChange={e => setAddItemForm(f => ({ ...f, notes: e.target.value }))}
                />
                {addItemError && (
                  <p className="text-xs text-red-400">{addItemError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" size="sm" icon={<Save size={13} />} loading={addItemSaving} onClick={handleSaveLineItem}>
                    {editingItemId ? 'Save Changes' : 'Save Item'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={closeItemForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Line items — grouped by business */}
            {loadingItems ? (
              <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Loading items…</div>
            ) : lineItems.length === 0 ? (
              <div className="py-8 text-center text-sm rounded-xl bg-white/[0.02] border border-white/[0.04]" style={{ color: 'var(--text-muted)' }}>
                No line items yet. Click "Add Item" to record a deal.
              </div>
            ) : (() => {
              // Group by business_id (null → '__none__')
              const groups = lineItems.reduce<Map<string, { label: string; items: CommissionLineItem[]; subtotal: number }>>((acc, item) => {
                const key = item.business_id ?? '__none__'
                const label = (item as any).business?.business_name ?? 'No Business'
                if (!acc.has(key)) acc.set(key, { label, items: [], subtotal: 0 })
                const g = acc.get(key)!
                g.items.push(item)
                g.subtotal += item.commission_amount
                return acc
              }, new Map())

              return (
                <div className="space-y-4">
                  {[...groups.entries()].map(([key, group]) => (
                    <div key={key}>
                      {/* Business group header */}
                      <div className="flex items-center justify-between mb-1.5 px-1">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={12} className="text-[var(--text-muted)]" />
                          <span className="text-xs font-semibold text-white">{group.label}</span>
                        </div>
                        <span className="text-xs font-semibold text-white">{fmt$(group.subtotal)}</span>
                      </div>
                      {/* Items in this business */}
                      <div className="space-y-1">
                        {group.items.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] group/item"
                          >
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <span className="text-xs font-medium text-white">{item.processor}</span>
                              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <span>{fmt$(item.amount_from_processor)} recv</span>
                                <span>·</span>
                                <span>{item.commission_rate}%</span>
                                <span>·</span>
                                <span className="text-white font-medium">{fmt$(item.commission_amount)}</span>
                              </div>
                              {item.notes && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.notes}</p>}
                            </div>
                            <button
                              onClick={() => startEditLineItem(item)}
                              className="p-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors"
                              style={{ color: editingItemId === item.id ? '#fff' : 'var(--text-muted)' }}
                              title="Edit item"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteLineItem(item.id)}
                              className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400"
                              style={{ color: 'var(--text-muted)' }}
                              title="Delete item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Grand total */}
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <span className="text-xs font-semibold text-purple-300">Total Commission</span>
                    <span className="text-sm font-bold text-white">{fmt$(lineItems.reduce((s, i) => s + i.commission_amount, 0))}</span>
                  </div>
                </div>
              )
            })()}

            {/* Delete record */}
            <div className="mt-8 pt-5 border-t border-white/[0.06]">
              {confirmDeleteRecordId !== selectedRecord.id ? (
                <button
                  onClick={() => setConfirmDeleteRecordId(selectedRecord.id)}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete Statement
                </button>
              ) : (
                <div className="rounded-xl p-4 border border-red-500/20 bg-red-500/5">
                  <p className="text-sm text-white font-medium mb-1">
                    Delete {selectedRecord.rep?.name}'s {MONTH_NAME} statement?
                  </p>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                    This will permanently remove this commission record and all its line items.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDeleteRecordId(null)}
                      className="flex-1 py-2 text-xs font-medium rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteRecord(selectedRecord.id)}
                      disabled={deletingRecord}
                      className="flex-1 py-2 text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {deletingRecord ? 'Deleting…' : 'Yes, delete permanently'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
