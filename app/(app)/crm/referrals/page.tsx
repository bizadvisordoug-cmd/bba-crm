export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ReferralsClient } from '@/components/referrals/ReferralsClient'

export default async function ReferralsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  // Every lead carrying a referral. Reps see only their own book; admins see
  // everything — matching how Commissions scopes visibility.
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

  const [{ data: partners }, { data: payments }, { data: posSystems }] = await Promise.all([
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
    supabase
      .from('pos_systems')
      .select('name, payment_day')
      .eq('active', true)
      .order('display_order'),
  ])

  return (
    <ReferralsClient
      leads={(leads ?? []) as any}
      partners={(partners ?? []) as any}
      payments={(payments ?? []) as any}
      posSystems={(posSystems ?? []) as any}
      isAdmin={isAdmin}
      year={year}
      month={month}
    />
  )
}
