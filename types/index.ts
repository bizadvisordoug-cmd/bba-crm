export type UserRole = 'owner' | 'vp_operations' | 'salesperson'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_pass?: string
  twilio_number?: string
  google_calendar_token?: string
  avatar_url?: string
  created_at: string
}

export type PipelineStage =
  | 'New Lead'
  | 'Contacted'
  | 'Appointment Set'
  | 'Contract Sent'
  | 'Signed'
  | 'Equipment Ordered'
  | 'Install Scheduled'
  | 'Active Client'

export type LeadStatus = 'Prospect' | 'Active Client' | 'Inactive'

export type POSSystem =
  | 'Shift4 Dine'
  | 'Stackably'
  | 'Clover'
  | 'Dejavoo'
  | 'Spot On'
  | 'Basic Terminal'

export type LeadSource = 'Referral' | 'Cold Call' | 'Cold Email' | 'Other'

export interface Person {
  id: string
  name: string
  phone?: string
  email?: string
  created_at: string
}

export interface Business {
  id: string
  owner_id?: string
  owner?: Person
  processor_id?: string
  processor?: PaymentProcessor
  business_name: string
  address?: string
  city?: string
  state?: string
  zip?: string
  industry?: string
  commission_percentage?: number | null
  created_at: string
}

export interface PaymentProcessor {
  id: string
  name: string
  deposit_day: number
  commission_pct: number
  active: boolean
  notes?: string
  created_at: string
  updated_at: string
}

/** commission_rates — agreed % per rep on a specific deal */
export interface CommissionRate {
  id: string
  lead_id: string
  lead?: Lead
  rep_id: string
  rep?: User
  processor_id?: string
  processor?: PaymentProcessor
  commission_percentage: number
  notes?: string
  created_at: string
}

/** monthly_processor_payments — what a processor paid the company in a given month */
export interface MonthlyProcessorPayment {
  id: string
  processor: string
  year: number
  month: number
  total_amount_paid: number
  date_received?: string
  notes?: string
  created_at: string
  updated_at: string
}

/** commission_records — per-rep per-month totals */
export interface CommissionRecord {
  id: string
  rep_id: string
  rep?: User
  year: number
  month: number
  total_owed: number
  total_paid: number
  status: 'pending' | 'partial' | 'paid'
  paid_date?: string
  notes?: string
  created_at: string
  updated_at: string
  line_items?: CommissionLineItem[]
}

/** commission_line_items — per-deal breakdown inside a commission record */
export interface CommissionLineItem {
  id: string
  commission_record_id: string
  lead_id?: string
  lead?: Lead
  business_id?: string
  business?: Business
  processor: string
  amount_from_processor: number
  commission_rate: number
  commission_amount: number
  notes?: string
  created_at: string
}

export interface Lead {
  id: string
  owner_id?: string
  owner?: Person
  business_id?: string
  business?: Business
  business_name?: string
  owner_name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  owner_phone?: string
  business_phone?: string
  email?: string
  industry?: string
  monthly_processing_volume?: number
  current_processor?: string
  current_rate?: number
  pos_system?: POSSystem
  lead_source?: LeadSource
  referred_by?: string
  referral_type?: 'one_time' | 'residual'
  referral_amount?: number
  referral_percentage?: number
  referral_paid?: boolean
  referral_bonus_amount?: number
  referral_bonus_paid?: boolean
  assigned_rep_id?: string
  assigned_rep?: User
  last_contacted?: string
  next_follow_up?: string
  install_date?: string
  contract_expiration?: string
  active_campaign_name?: string
  active_campaign_step?: number
  notes?: string
  pipeline_stage: PipelineStage
  status: LeadStatus
  lat?: number
  lng?: number
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  lead_id?: string
  lead?: Lead
  assigned_to: string
  assigned_user?: User
  title: string
  type: 'Call' | 'Email' | 'Follow Up' | 'Meeting' | 'Other'
  due_date: string
  completed: boolean
  created_at: string
}

export type CampaignType =
  | 'cold_prospect'
  | 'warm_shift4'
  | 'warm_stackably'
  | 'warm_clover'
  | 'warm_dejavoo'
  | 'warm_spoton'
  | 'warm_basic'
  | 'onboarding'
  | 'renewal'
  | 'reengagement'
  | 'referral_ask'

export type StepType = 'email' | 'sms'

export interface CampaignStep {
  id: string
  campaign_id: string
  step_number: number
  type: StepType
  delay_days: number
  subject?: string
  body: string
}

export interface Campaign {
  id: string
  name: string
  type: CampaignType
  description: string
  steps: CampaignStep[]
  created_at: string
}

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'unsubscribed'

export interface CampaignEnrollment {
  id: string
  lead_id: string
  lead?: Lead
  campaign_id: string
  campaign?: Campaign
  current_step: number
  status: EnrollmentStatus
  enrolled_at: string
}

export interface EmailLog {
  id: string
  lead_id: string
  campaign_enrollment_id?: string
  subject: string
  sent_at: string
  opened_at?: string
  clicked_at?: string
  replied_at?: string
}

export interface SmsLog {
  id: string
  lead_id: string
  message: string
  sent_at: string
  direction: 'inbound' | 'outbound'
}

export interface Document {
  id: string
  lead_id: string
  name: string
  label: 'Contract' | 'Equipment Photo' | 'ID' | 'Other'
  url: string
  uploaded_at: string
}

export interface Appointment {
  id: string
  lead_id?: string
  lead?: Lead
  rep_id: string
  rep?: User
  start_time: string
  end_time: string
  title: string
  notes?: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
}

export interface ActivityLog {
  id: string
  lead_id?: string
  lead?: Lead
  user_id: string
  user?: User
  action: string
  details?: string
  created_at: string
}

export interface DashboardStats {
  totalLeads: number
  activeClients: number
  pipelineByStage: Record<PipelineStage, number>
  tasksDueToday: Task[]
  tasksDueThisWeek: Task[]
  upcomingRenewals: Lead[]
  recentActivity: ActivityLog[]
  campaignStats: {
    emailsSent: number
    openRate: number
    replyRate: number
  }
}
