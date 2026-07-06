import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export async function PATCH(req: NextRequest) {
  // Verify caller is admin
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'owner' && callerProfile?.role !== 'vp_operations') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, name, email, role, canDeleteLeads, canExportLeads } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Update auth.users — admin API is immediate (no confirmation email)
  const authUpdates: Record<string, any> = {}
  if (email) authUpdates.email = email
  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdates)
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Update public.users
  const dbUpdates: Record<string, any> = {}
  if (name !== undefined) dbUpdates.name = name
  if (email !== undefined) dbUpdates.email = email
  if (role !== undefined) dbUpdates.role = role
  if (role === 'salesperson' && canDeleteLeads !== undefined) {
    dbUpdates.can_delete_leads = canDeleteLeads
  }
  if (role === 'salesperson' && canExportLeads !== undefined) {
    dbUpdates.can_export_leads = canExportLeads
  }

  const { data: updated, error: dbError } = await admin
    .from('users')
    .update(dbUpdates)
    .eq('id', userId)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })

  return NextResponse.json({ user: updated })
}
