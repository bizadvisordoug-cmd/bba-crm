export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MapClient } from '@/components/map/MapClient'

export default async function MapPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role, can_delete_leads')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'
  const canDeleteLeads = isAdmin || profile?.can_delete_leads === true

  const query = supabase
    .from('leads')
    .select('id, business_name, owner_name, address, city, state, zip, pipeline_stage, status, assigned_rep_id, pos_system, lat, lng, business:businesses(business_name), assigned_rep:users(id, name)')
    .not('lat', 'is', null)

  if (!isAdmin) query.eq('assigned_rep_id', user!.id)
  const { data: leads } = await query

  const { data: reps } = await supabase.from('users').select('id, name').order('name')

  return (
    <MapClient
      leads={leads || []}
      reps={reps || []}
      isAdmin={isAdmin}
      canDeleteLeads={canDeleteLeads}
      currentUserId={user!.id}
    />
  )
}
