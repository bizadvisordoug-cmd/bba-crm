'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, Calendar } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { formatDate, isOverdue, formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

interface KanbanCardProps {
  lead: Lead
  onClick: () => void
  isDragging?: boolean
}

export function KanbanCard({ lead, onClick, isDragging }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  }

  // Use related data if direct fields are empty
  const businessName = lead.business_name || (lead.businesses && Array.isArray(lead.businesses) && lead.businesses[0]?.business_name) || 'Untitled Lead'
  const ownerName = lead.owner_name || (lead.people && Array.isArray(lead.people) && lead.people[0]?.name) || ''

  const followUpOverdue = lead.next_follow_up && isOverdue(lead.next_follow_up)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'glass rounded-xl p-3 cursor-pointer select-none',
        'hover:bg-white/[0.07] hover:border-white/[0.12] transition-all duration-150',
        'active:scale-95',
        isDragging && 'shadow-2xl ring-2 ring-purple-500/30',
        followUpOverdue && 'border-red-500/20'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">{businessName}</div>
          <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{ownerName}</div>
        </div>
        {lead.assigned_rep && (
          <Avatar name={(lead.assigned_rep as any).name} size="xs" className="flex-shrink-0" />
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {followUpOverdue ? (
            <div className="flex items-center gap-1 text-[10px] text-red-400">
              <AlertTriangle size={10} />
              {formatDate(lead.next_follow_up)}
            </div>
          ) : lead.next_follow_up ? (
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <Calendar size={10} />
              {formatDate(lead.next_follow_up)}
            </div>
          ) : null}
        </div>
        {lead.monthly_processing_volume && (
          <span className="text-[10px] font-medium badge-gray px-1.5 py-0.5 rounded-md">
            {formatCurrency(lead.monthly_processing_volume)}/mo
          </span>
        )}
      </div>
    </div>
  )
}
