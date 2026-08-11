export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ReferralsClient } from '@/components/referrals/ReferralsClient'

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>
}

export default async function ReferralsPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  // Payouts are usually reconciled for a prior month — the processor pays in
  // arrears — so the period is selectable rather than pinned to today.
  const params = await searchParams
  const now    = new Date()
  const year   = Number(params.year)  || now.getFullYear()
  const month  = Number(params.month) || now.getMonth() + 1

  const leadQuery = supabase
    .from('leads')
    .select(`
      id, business_name, referred_by, referral_partner_id, referral_type,
      referral_amount, referral_percentage, referral_paid,
      monthly_processing_volume, pos_system, status, assigned_rep_id,
      assigned_rep:users(id, name)
    `)
    .not('referral_type', 'is', null)
  if (!isAdmin) leadQuery.eq('assigned_rep_id', user!.id)
  const { data: leads, error: leadsError } = await leadQuery

  if (leadsError) console.error('[ReferralsPage] leads query error:', leadsError)

  const leadIds = (leads ?? []).map(l => l.id)

  // How much the company actually received per deal for this period. Referral
  // payouts are a cut of this, not of the merchant's processing volume.
  //
  // Fetched in two steps rather than one embedded filter: line items carry no
  // period of their own, it lives on the parent commission_record.
  const { data: periodRecords } = await supabase
    .from('commission_records')
    .select('id')
    .eq('year', year)
    .eq('month', month)

  const recordIds = (periodRecords ?? []).map(r => r.id)

  let lineItems: any[] = []
  if (recordIds.length > 0 && leadIds.length > 0) {
    const { data, error: lineError } = await supabase
      .from('commission_line_items')
      .select('lead_id, processor, amount_from_processor')
      .in('commission_record_id', recordIds)
      .in('lead_id', leadIds)
    if (lineError) console.error('[ReferralsPage] line items query error:', lineError)
    lineItems = data ?? []
  }

  // A deal split between reps produces one line item per rep, each repeating
  // the same amount_from_processor. Take the max rather than summing, or the
  // received amount would be double counted.
  const receivedByLead: Record<string, { amount: number; processor: string | null }> = {}
  for (const item of lineItems) {
    if (!item.lead_id) continue
    const amount = Number(item.amount_from_processor) || 0
    const existing = receivedByLead[item.lead_id]
    if (!existing || amount > existing.amount) {
      receivedByLead[item.lead_id] = { amount, processor: item.processor ?? null }
    }
  }

  const [{ data: partners }, { data: payments }] = await Promise.all([
    supabase
      .from('referral_partners')
      .select('*')
      .order('name'),
    leadIds.length > 0
      ? supabase
          .from('referral_payment_records')
          .select('*, lead:leads(id, business_name)')
          .in('lead_id', leadIds)
          .order('date_paid', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ])

  return (
    <ReferralsClient
      leads={(leads ?? []) as any}
      partners={(partners ?? []) as any}
      payments={(payments ?? []) as any}
      receivedByLead={receivedByLead}
      isAdmin={isAdmin}
      year={year}
      month={month}
    />
  )
}
