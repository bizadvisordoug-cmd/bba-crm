export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { TasksClient } from '@/components/tasks/TasksClient'

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  const taskQuery = supabase
    .from('tasks')
    .select('*, lead:leads(id, business_name), assigned_to_user:users(id, name)')
    .order('due_date', { ascending: true })

  if (!isAdmin) taskQuery.eq('assigned_to', user!.id)
  const { data: tasks } = await taskQuery

  const { data: leads } = await supabase
    .from('leads')
    .select('id, business_name')
    .order('business_name')

  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .order('name')

  return (
    <TasksClient
      tasks={tasks || []}
      leads={leads || []}
      users={users || []}
      currentUserId={user!.id}
      isAdmin={isAdmin}
    />
  )
}
