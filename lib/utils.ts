import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import type { PipelineStage, LeadStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    return format(new Date(date), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    return format(new Date(date), 'MMM d, yyyy h:mm a')
  } catch {
    return '—'
  }
}

export function isOverdue(date: string | null | undefined): boolean {
  if (!date) return false
  return isBefore(new Date(date), new Date())
}

export function isDueSoon(date: string | null | undefined, days = 7): boolean {
  if (!date) return false
  const d = new Date(date)
  return isAfter(d, new Date()) && isBefore(d, addDays(new Date(), days))
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'New Lead',
  'Contacted',
  'Appointment Set',
  'Contract Sent',
  'Signed',
  'Equipment Ordered',
  'Install Scheduled',
  'Active Client',
]

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, string> = {
  'New Lead': 'badge-gray',
  'Contacted': 'badge-blue',
  'Appointment Set': 'badge-purple',
  'Contract Sent': 'badge-amber',
  'Signed': 'badge-cyan',
  'Equipment Ordered': 'badge-purple',
  'Install Scheduled': 'badge-blue',
  'Active Client': 'badge-green',
}

export const STATUS_COLORS: Record<LeadStatus, string> = {
  'Prospect': 'badge-amber',
  'Active Client': 'badge-green',
  'Inactive': 'badge-gray',
}

export const REPS = [
  { id: 'shanon', name: 'Shanon Boos', email: 'shanon@breakthroughba.com', initials: 'SB', color: '#7c3aed' },
  { id: 'doug', name: 'Doug Williams', email: 'doug@breakthroughba.com', initials: 'DW', color: '#2563eb' },
  { id: 'hardip', name: 'Hardip', email: 'hardip@breakthroughba.com', initials: 'H', color: '#10b981' },
]

export const POS_SYSTEMS = ['Shift4 Dine', 'Stackably', 'Clover', 'Dejavoo', 'Spot On', 'Basic Terminal'] as const

export const LEAD_SOURCES = ['Referral', 'Cold Call', 'Cold Email', 'Trade Show', 'Other'] as const

export function getRepById(id: string) {
  return REPS.find(r => r.id === id)
}

export function getRepInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(2)}%`
}

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (_, key) => vars[key] || `[${key}]`)
}
