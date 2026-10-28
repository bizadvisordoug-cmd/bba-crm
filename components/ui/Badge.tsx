import { cn } from '@/lib/utils'
import type { PipelineStage, LeadStatus } from '@/types'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'cyan' | 'gray'
  className?: string
}

export function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span className={cn(`badge-${variant}`, 'inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium', className)}>
      {children}
    </span>
  )
}

const STAGE_VARIANTS: Record<PipelineStage, BadgeProps['variant']> = {
  'New Lead': 'gray',
  'Contacted': 'blue',
  'Appointment Set': 'purple',
  'Contract Sent': 'amber',
  'Signed': 'cyan',
  'Equipment Ordered': 'purple',
  'Install Scheduled': 'blue',
  'Active Client': 'green',
  'Lost': 'red',
}

const STATUS_VARIANTS: Record<LeadStatus, BadgeProps['variant']> = {
  'Prospect': 'amber',
  'Active Client': 'green',
  'Inactive': 'gray',
}

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return <Badge variant={STAGE_VARIANTS[stage]}>{stage}</Badge>
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{status}</Badge>
}
