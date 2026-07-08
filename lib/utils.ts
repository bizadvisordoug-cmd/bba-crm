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
    // If it's a date-only string (YYYY-MM-DD), format without timezone conversion
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-')
      return format(new Date(year, parseInt(month) - 1, parseInt(day)), 'MMM d, yyyy')
    }
    return format(new Date(date), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    // If it's a date-only string (YYYY-MM-DD), format without timezone conversion
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-')
      return format(new Date(year, parseInt(month) - 1, parseInt(day)), 'MMM d, yyyy h:mm a')
    }
    return format(new Date(date), 'MMM d, yyyy h:mm a')
  } catch {
    return '—'
  }
}

export function isOverdue(date: string | null | undefined): boolean {
  if (!date) return false
  let dateObj: Date
  // If it's a date-only string (YYYY-MM-DD), parse without timezone conversion
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-')
    dateObj = new Date(year, parseInt(month) - 1, parseInt(day))
  } else {
    dateObj = new Date(date)
  }
  // Compare dates only (ignore time)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return isBefore(dateObj, today)
}

export function isDueSoon(date: string | null | undefined, days = 7): boolean {
  if (!date) return false
  let dateObj: Date
  // If it's a date-only string (YYYY-MM-DD), parse without timezone conversion
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-')
    dateObj = new Date(year, parseInt(month) - 1, parseInt(day))
  } else {
    dateObj = new Date(date)
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const soon = addDays(today, days)
  return isAfter(dateObj, today) && isBefore(dateObj, soon)
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')
  // If it's 10 digits (US), prepend +1
  if (digits.length === 10) return `+1${digits}`
  // If it's 11 digits and starts with 1, prepend +
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  // If it already starts with +, return as-is
  if (phone.startsWith('+')) return phone
  // Otherwise prepend +1
  return `+1${digits}`
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
