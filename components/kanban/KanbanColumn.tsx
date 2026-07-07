'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'framer-motion'
import { KanbanCard } from './KanbanCard'
import { PIPELINE_STAGE_COLORS } from '@/lib/utils'
import type { Lead, PipelineStage } from '@/types'

interface KanbanColumnProps {
  stage: PipelineStage
  leads: Lead[]
  onCardClick: (lead: Lead) => void
}

const STAGE_HEADER_COLORS: Record<PipelineStage, string> = {
  'New Lead': '#6b7280',
  'Contacted': '#3b82f6',
  'Appointment Set': '#8b5cf6',
  'Contract Sent': '#f59e0b',
  'Signed': '#06b6d4',
  'Equipment Ordered': '#a855f7',
  'Install Scheduled': '#60a5fa',
  'Active Client': '#10b981',
}

export function KanbanColumn({ stage, leads, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  console.log(`[KanbanColumn] Registered drop zone: ${stage}`)

  return (
    <div className="kanban-column">
      {/* Header */}
      <div
        className="flex items-center justify-between mb-3 px-2"
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: STAGE_HEADER_COLORS[stage] }}
          />
          <span className="text-xs font-semibold text-white">{stage}</span>
        </div>
        <span
          className="text-xs font-medium rounded-full px-2 py-0.5"
          style={{
            background: `${STAGE_HEADER_COLORS[stage]}20`,
            color: STAGE_HEADER_COLORS[stage],
          }}
        >
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="min-h-[200px] rounded-2xl transition-all duration-200 space-y-2 p-2"
        style={{
          background: isOver
            ? 'rgba(124,58,237,0.08)'
            : 'rgba(255,255,255,0.02)',
          border: `1px solid ${isOver ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.04)'}`,
        }}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead, i) => (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <KanbanCard lead={lead} onClick={() => onCardClick(lead)} />
            </motion.div>
          ))}
          {leads.length === 0 && (
            <div className="flex items-center justify-center h-24 text-xs" style={{ color: 'var(--text-muted)' }}>
              Drop here
            </div>
          )}
        </SortableContext>
        {leads.length > 0 && (
          <div className="flex items-center justify-center py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}
