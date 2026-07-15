export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { CampaignsClient } from '@/components/campaigns/CampaignsClient'

export default async function CampaignsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*, steps:campaign_steps(*)')
    .order('name')

  // Use service role to bypass RLS and see all campaign enrollments
  const supabaseServiceRole = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } }
  )

  // Fetch enrollments and leads separately to avoid join issues
  const { data: enrollmentsRaw, error: enrollmentsError } = await supabaseServiceRole
    .from('campaign_enrollments')
    .select('*')
    .eq('status', 'active')
    .order('enrolled_at', { ascending: false })
    .limit(50)

  const { data: leadsMap, error: leadsError } = await supabaseServiceRole
    .from('leads')
    .select('id, business_name, owner_name, email, assigned_rep_id')

  const { data: campaignsMap, error: campaignsError } = await supabaseServiceRole
    .from('campaigns')
    .select('id, name')

  if (enrollmentsError) console.error('Enrollments error:', enrollmentsError)
  if (leadsError) console.error('Leads error:', leadsError)
  if (campaignsError) console.error('Campaigns error:', campaignsError)
  console.log('Enrollments fetched:', enrollmentsRaw?.length, 'Leads:', leadsMap?.length, 'Campaigns:', campaignsMap?.length)

  // Hydrate enrollments with lead and campaign data
  const enrollments = (enrollmentsRaw || []).map((e: any) => ({
    ...e,
    lead: leadsMap?.find((l: any) => l.id === e.lead_id),
    campaign: campaignsMap?.find((c: any) => c.id === e.campaign_id),
  }))

  const { data: emailStats } = await supabase
    .from('email_logs')
    .select('sent_at, opened_at, clicked_at, replied_at')
    .limit(1000)

  const totalSent = emailStats?.length || 0
  const totalOpened = emailStats?.filter(e => e.opened_at).length || 0
  const totalClicked = emailStats?.filter(e => e.clicked_at).length || 0
  const totalReplied = emailStats?.filter(e => e.replied_at).length || 0

  const leadsQuery = supabase
    .from('leads')
    .select('id, email, assigned_rep_id, owner:people(name), business:businesses(business_name)')
    .order('business_name')
  if (!isAdmin) leadsQuery.eq('assigned_rep_id', user!.id)
  const { data: leadsRaw } = await leadsQuery

  // Flatten the joins for easier access in the component
  const leads = (leadsRaw || []).map((l: any) => ({
    id: l.id,
    email: l.email,
    assigned_rep_id: l.assigned_rep_id,
    owner_name: Array.isArray(l.owner) ? l.owner[0]?.name || '' : l.owner?.name || '',
    business_name: Array.isArray(l.business) ? l.business[0]?.business_name || '' : l.business?.business_name || '',
  }))

  return (
    <CampaignsClient
      campaigns={campaigns || []}
      enrollments={enrollments || []}
      leads={leads || []}
      stats={{ totalSent, totalOpened, totalClicked, totalReplied }}
      currentUserId={user!.id}
      isAdmin={isAdmin}
    />
  )
}
