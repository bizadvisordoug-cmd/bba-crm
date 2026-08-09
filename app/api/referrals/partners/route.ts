import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Create / update referral partners. Admin-only, matching the RLS on the table.

async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'
  if (!isAdmin) return { error: 'Admin access required', status: 403 as const }

  return { user }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const auth = await requireAdmin(supabase)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { name, contact_name, contact_email, contact_phone, notes } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Partner name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('referral_partners')
      .insert({
        name:          name.trim(),
        contact_name:  contact_name?.trim()  || null,
        contact_email: contact_email?.trim() || null,
        contact_phone: contact_phone?.trim() || null,
        notes:         notes?.trim()         || null,
      })
      .select()
      .single()

    if (error) {
      // referral_partners.name is UNIQUE
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A partner with that name already exists' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[Referral Partners] POST failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const auth = await requireAdmin(supabase)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { id, name, contact_name, contact_email, contact_phone, notes, active } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined)          updates.name          = name?.trim()
    if (contact_name !== undefined)  updates.contact_name  = contact_name?.trim()  || null
    if (contact_email !== undefined) updates.contact_email = contact_email?.trim() || null
    if (contact_phone !== undefined) updates.contact_phone = contact_phone?.trim() || null
    if (notes !== undefined)         updates.notes         = notes?.trim()         || null
    if (active !== undefined)        updates.active        = active

    const { data, error } = await supabase
      .from('referral_partners')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Referral Partners] PATCH failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
