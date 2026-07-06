'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Filter, Trash2, Download, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { StageBadge, StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { LeadDrawer } from '@/components/crm/LeadDrawer'
import { LeadFormModal } from '@/components/crm/LeadFormModal'
import { LeadImportModal } from '@/components/crm/LeadImportModal'
import { formatDate, formatCurrency, isOverdue, PIPELINE_STAGES, POS_SYSTEMS } from '@/lib/utils'
import type { Lead, PipelineStage, LeadStatus } from '@/types'

interface CRMClientProps {
  leads: Lead[]
  currentUserId: string
  isAdmin: boolean
  canDeleteLeads: boolean
  reps: { id: string; name: string; email: string }[]
}

export function CRMClient({ leads: initialLeads, currentUserId, isAdmin, canDeleteLeads, reps }: CRMClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [search, setSearch] = useState('')
  const [filterRep, setFilterRep] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPOS, setFilterPOS] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [exporting, setExporting] = useState(false)

  const filtered = useMemo(() => {
    return leads.filter(l => {
      const q = search.toLowerCase()
      if (q) {
        const businessMatch = (l.business_name || l.business?.business_name || '').toLowerCase().includes(q)
        const ownerMatch = (l.owner_name || l.owner?.name || '').toLowerCase().includes(q)
        const emailMatch = (l.email || '').toLowerCase().includes(q)
        if (!businessMatch && !ownerMatch && !emailMatch) return false
      }
      if (filterRep && l.assigned_rep_id !== filterRep) return false
      if (filterStage && l.pipeline_stage !== filterStage) return false
      if (filterStatus && l.status !== filterStatus) return false
      if (filterPOS && l.pos_system !== filterPOS) return false
      return true
    })
  }, [leads, search, filterRep, filterStage, filterStatus, filterPOS])

  const handleLeadUpdate = (updated: Lead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelectedLead(updated)
  }

  const handleLeadCreate = (newLead: Lead) => {
    setLeads(prev => [newLead, ...prev])
    setShowAddModal(false)
  }

  const handleLeadsImport = (imported: Lead[]) => {
    setLeads(prev => [...imported, ...prev])
  }

  const downloadTemplate = () => {
    const headers = [
      'business_name', 'owner_name', 'address', 'city', 'state', 'zip',
      'owner_phone', 'business_phone', 'email', 'industry',
      'monthly_processing_volume', 'current_processor', 'current_rate',
      'pos_system', 'lead_source', 'referred_by', 'referral_bonus_amount', 'notes',
    ]
    const csv = headers.join(',') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportLeads = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: null }),
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
      a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExporting(false)
    }
  }

  // Pure UI updater — called after deletion is already confirmed server-side
  const removeLeadFromState = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id))
    if (selectedLead?.id === id) setSelectedLead(null)
    setConfirmDeleteId(null)
  }

  // Called from the table trash confirm button — hits the API then updates UI
  const deleteLeadFromTable = async (id: string) => {
    setDeleteInProgress(true)
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Delete failed')
      }
      removeLeadFromState(id)
    } catch (err) {
      console.error('[CRM] delete error:', err)
      setConfirmDeleteId(null)
    } finally {
      setDeleteInProgress(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle={`${filtered.length} of ${leads.length} leads`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={downloadTemplate}>
              Template
            </Button>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportLeads} loading={exporting}>
              Export
            </Button>
            <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => setShowImportModal(true)}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setShowAddModal(true)}>
              Add Lead
            </Button>
          </div>
        }
      />

      {/* Search & filters */}
      <GlassCard animate={false} className="mb-6 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by business, owner, email..."
              className="w-full h-9 pl-9 pr-4 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Filter size={14} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters {(filterRep || filterStage || filterStatus || filterPOS) && (
              <span className="badge-purple text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                {[filterRep, filterStage, filterStatus, filterPOS].filter(Boolean).length}
              </span>
            )}
          </Button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                {isAdmin && (
                  <select
                    value={filterRep}
                    onChange={e => setFilterRep(e.target.value)}
                    style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                  >
                    <option value="">All Reps</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
                <select
                  value={filterStage}
                  onChange={e => setFilterStage(e.target.value)}
                  style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                >
                  <option value="">All Stages</option>
                  {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                >
                  <option value="">All Statuses</option>
                  <option value="Prospect">Prospect</option>
                  <option value="Active Client">Active Client</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <select
                  value={filterPOS}
                  onChange={e => setFilterPOS(e.target.value)}
                  style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                >
                  <option value="">All Suggested POS</option>
                  {POS_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {(filterRep || filterStage || filterStatus || filterPOS) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setFilterRep(''); setFilterStage(''); setFilterStatus(''); setFilterPOS('') }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="text-left text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              <th className="pb-3 pr-4 pl-2">Owner</th>
              <th className="pb-3 pr-4">Business</th>
              <th className="pb-3 pr-4">Stage</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Suggested POS</th>
              <th className="pb-3 pr-4">Rep</th>
              <th className="pb-3 pr-4">Follow Up</th>
              <th className="pb-3 pr-4">Volume</th>
              <th className="pb-3 pr-4">Renewal</th>
              {canDeleteLeads && <th className="pb-3 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canDeleteLeads ? 10 : 9} className="py-16 text-center text-[var(--text-muted)] text-sm">
                  No leads found.{' '}
                  <button className="text-purple-400 hover:underline" onClick={() => setShowAddModal(true)}>
                    Add your first lead →
                  </button>
                </td>
              </tr>
            )}
            {filtered.map((lead, i) => {
              const overdue = lead.next_follow_up && isOverdue(lead.next_follow_up)
              return (
                <motion.tr
                  key={lead.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setSelectedLead(lead)}
                  className="cursor-pointer hover:bg-white/[0.03] transition-colors group"
                >
                  <td className="py-3 pr-4 pl-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={lead.owner?.name || lead.owner_name || ''} size="sm" />
                      <span className="text-sm font-medium text-white">{lead.owner?.name || lead.owner_name || '—'}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-sm font-medium group-hover:text-purple-300 transition-colors" style={{ color: 'var(--text-primary)' }}>
                      {lead.business?.business_name || lead.business_name || '—'}
                    </span>
                  </td>
                  <td className="py-3 pr-4"><StageBadge stage={lead.pipeline_stage as any} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={lead.status as any} /></td>
                  <td className="py-3 pr-4">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{lead.pos_system || '—'}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {lead.assigned_rep ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={(lead.assigned_rep as any).name} size="xs" />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {(lead.assigned_rep as any).name?.split(' ')[0]}
                        </span>
                      </div>
                    ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    {lead.next_follow_up ? (
                      <span className={`text-xs font-medium ${overdue ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                        {overdue && '⚠ '}{formatDate(lead.next_follow_up)}
                      </span>
                    ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(lead.monthly_processing_volume)}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {lead.contract_expiration ? (
                      <span className={`text-xs ${isOverdue(lead.contract_expiration) ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                        {formatDate(lead.contract_expiration)}
                      </span>
                    ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                  {canDeleteLeads && (isAdmin || lead.assigned_rep_id === currentUserId) && (
                    <td className="py-3" onClick={e => e.stopPropagation()}>
                      {confirmDeleteId === lead.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-400 whitespace-nowrap">Delete?</span>
                          <button
                            onClick={() => deleteLeadFromTable(lead.id)}
                            disabled={deleteInProgress}
                            className="text-xs px-2 py-0.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(lead.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
                          title="Delete lead"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  )}
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Lead drawer */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={removeLeadFromState}
          reps={reps}
          isAdmin={isAdmin}
          canDeleteLeads={canDeleteLeads}
          currentUserId={currentUserId}
        />
      )}

      {/* Add modal */}
      <LeadFormModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreate={handleLeadCreate}
        reps={reps}
        currentUserId={currentUserId}
      />

      {/* Import modal */}
      <LeadImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        currentUserId={currentUserId}
        onImport={handleLeadsImport}
      />
    </div>
  )
}
