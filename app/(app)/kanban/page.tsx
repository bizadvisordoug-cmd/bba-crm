export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { KanbanClient } from '@/components/kanban/KanbanClient'

export default async function KanbanPage() {
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
    .select('*, assigned_rep:users(id, name, email), owner:people(name, email), business:businesses(business_name)')
    .order('updated_at', { ascending: false })

  if (!isAdmin) query.eq('assigned_rep_id', user!.id)
  const { data: leads } = await query

  const { data: reps } = await supabase
    .from('users')
    .select('id, name, email')
    .order('name')

  return (
    <KanbanClient
      leads={leads || []}
      reps={reps || []}
      currentUserId={user!.id}
      isAdmin={isAdmin}
      canDeleteLeads={canDeleteLeads}
    />
  )
}
