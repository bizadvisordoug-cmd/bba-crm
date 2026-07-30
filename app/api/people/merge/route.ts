import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// Merge several people (contacts) into one. Everything that points at a person
// — leads.owner_id and businesses.owner_id — is re-pointed to the survivor
// BEFORE the duplicates are deleted, so no leads/businesses are orphaned. The
// resolved name/phone/email come from the client (which lets the user pick one
// value or combine several). Admin only; uses the service-role client so the
// reassignment isn't blocked by row-level security.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only admins can merge contacts.' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const { survivorId, mergeIds, fields } = body ?? {}

  if (!survivorId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return NextResponse.json({ error: 'survivorId and a non-empty mergeIds array are required.' }, { status: 400 })
  }
  if (mergeIds.includes(survivorId)) {
    return NextResponse.json({ error: 'The primary contact cannot also be in the merge list.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const allIds: string[] = [survivorId, ...mergeIds]

  // Guard against stale ids (a duplicate someone else already deleted/merged).
  const { data: existing, error: exErr } = await admin.from('people').select('id').in('id', allIds)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 })
  if (!existing || existing.length !== allIds.length) {
    return NextResponse.json({ error: 'One or more of these contacts no longer exist — refresh and try again.' }, { status: 409 })
  }

  // 1. Re-point references to the survivor before deleting the duplicates.
  const { error: leadsErr } = await admin.from('leads').update({ owner_id: survivorId }).in('owner_id', mergeIds)
  if (leadsErr) return NextResponse.json({ error: `Failed to reassign leads: ${leadsErr.message}` }, { status: 400 })

  const { error: bizErr } = await admin.from('businesses').update({ owner_id: survivorId }).in('owner_id', mergeIds)
  if (bizErr) return NextResponse.json({ error: `Failed to reassign businesses: ${bizErr.message}` }, { status: 400 })

  // 2. Apply the resolved contact details to the survivor. Name must stay set.
  const updatePayload: Record<string, string | null> = {}
  if (fields && typeof fields === 'object') {
    const name = typeof fields.name === 'string' ? fields.name.trim() : ''
    if (name) updatePayload.name = name
    if ('phone' in fields) updatePayload.phone = (fields.phone && String(fields.phone).trim()) || null
    if ('email' in fields) updatePayload.email = (fields.email && String(fields.email).trim()) || null
  }
  if (Object.keys(updatePayload).length > 0) {
    const { error: updErr } = await admin.from('people').update(updatePayload).eq('id', survivorId)
    if (updErr) return NextResponse.json({ error: `Failed to update the primary contact: ${updErr.message}` }, { status: 400 })
  }

  // 3. Delete the now-empty duplicates.
  const { error: delErr } = await admin.from('people').delete().in('id', mergeIds)
  if (delErr) return NextResponse.json({ error: `Failed to remove duplicates: ${delErr.message}` }, { status: 400 })

  // 4. Return the survivor with its (now combined) businesses for the UI.
  const { data: survivor, error: selErr } = await admin
    .from('people')
    .select('*, businesses(*)')
    .eq('id', survivorId)
    .single()
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 })

  return NextResponse.json({ survivor })
}
