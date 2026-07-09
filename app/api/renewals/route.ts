import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { todayStr, in90DaysStr } = await req.json()

    // Use service role to bypass RLS and see all leads
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    )

    const { data, error } = await supabase
      .from('leads')
      .select('id, business_name, owner_name, contract_expiration, assigned_rep_id, assigned_rep:users(name)')
      .eq('status', 'Active Client')
      .not('contract_expiration', 'is', null)
      .gte('contract_expiration', todayStr)
      .lte('contract_expiration', in90DaysStr)
      .order('contract_expiration', { ascending: true })

    if (error) {
      console.error('Renewals query error:', error)
      return NextResponse.json({ error: 'Failed to fetch renewals' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Renewals API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
