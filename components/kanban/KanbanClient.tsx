'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { Plus, Filter } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { LeadDrawer } from '@/components/crm/LeadDrawer'
import { LeadFormModal } from '@/components/crm/LeadFormModal'
import { createClient } from '@/lib/supabase'
import { PIPELINE_STAGES } from '@/lib/utils'
import type { Lead, PipelineStage } from '@/types'

interface KanbanClientProps {
  leads: Lead[]
  reps: { id: string; name: string; email: string }[]
  currentUserId: string
  isAdmin: boolean
  canDeleteLeads: boolean
}

export function KanbanClient({ leads: initialLeads, reps, currentUserId, isAdmin, canDeleteLeads }: KanbanClientProps) {
  const supabase = createClient()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterRep, setFilterRep] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const filtered = useMemo(() =>
    leads.filter(l => !filterRep || l.assigned_rep_id === filterRep),
    [leads, filterRep]
  )

  const byStage = useMemo(() => {
    const map: Record<PipelineStage, Lead[]> = {} as any
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    filtered.forEach(l => {
      if (map[l.pipeline_stage as PipelineStage]) {
        map[l.pipeline_stage as PipelineStage].push(l)
      }
    })
    return map
  }, [filtered])

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) {
      console.log('[Kanban] No drop target')
      return
    }
    const leadId = active.id as string
    const newStage = over.id as PipelineStage

    console.log(`[Kanban] Drop detected: ${leadId} → ${newStage}`)
    console.log(`[Kanban] Is valid stage? ${PIPELINE_STAGES.includes(newStage)}`)
    if (!PIPELINE_STAGES.includes(newStage)) {
      console.log(`[Kanban] Invalid stage: ${newStage}`)
      return
    }
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.pipeline_stage === newStage) return

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipeline_stage: newStage } : l))

    await supabase
      .from('leads')
      .update({ pipeline_stage: newStage })
      .eq('id', leadId)

    await supabase.from('activity_log').insert({
      lead_id: leadId,
      user_id: currentUserId,
      action: 'moved lead',
      details: `${lead.business_name}: ${lead.pipeline_stage} → ${newStage}`,
    })

    // Execute pipeline stage triggers
    try {
      await fetch('/api/leads/execute-triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: leadId,
          newStageName: newStage,
        }),
      })
    } catch (err) {
      console.error('[Kanban] Failed to execute triggers:', err)
    }
  }

  const handleLeadUpdate = (updated: Lead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelectedLead(updated)
  }

  const handleLeadCreate = (newLead: Lead) => {
    setLeads(prev => [newLead, ...prev])
    setShowAddModal(false)
  }

  return (
    <div>
      <PageHeader
        title="Pipeline Board"
        subtitle={`${leads.length} deals across ${PIPELINE_STAGES.length} stages`}
        actions={
          <div className="flex items-center gap-3">
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
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setShowAddModal(true)}>
              Add Lead
            </Button>
          </div>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-board">
          {PIPELINE_STAGES.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={byStage[stage] || []}
              onCardClick={setSelectedLead}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead && (
            <div className="rotate-3 opacity-90">
              <KanbanCard lead={activeLead} onClick={() => {}} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={(id) => {
            setLeads(prev => prev.filter(l => l.id !== id))
            setSelectedLead(null)
          }}
          reps={reps}
          isAdmin={isAdmin}
          canDeleteLeads={canDeleteLeads}
          currentUserId={currentUserId}
        />
      )}

      <LeadFormModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreate={handleLeadCreate}
        reps={reps}
        currentUserId={currentUserId}
      />
    </div>
  )
}
