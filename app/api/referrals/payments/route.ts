import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// Records a referral payout. Paying a partner is a company-level action, so
// this is admin-only — reps can see referral activity on their own leads but
// cannot log payments. (The RLS on referral_payment_records enforces the same
// split; this check produces a clearer error than a policy rejection.)

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
    const {
      lead_id,
      partner_id,
      referred_by,
      amount,
      percentage,
      date_paid,
      payment_type,
      period_year,
      period_month,
      notes,
      no_payment_due,
    } = body

    const nothingDue = no_payment_due === true

    if (!lead_id || !referred_by || !date_paid) {
      return NextResponse.json(
        { error: 'lead_id, referred_by and date_paid are required' },
        { status: 400 }
      )
    }

    // A "nothing owed this period" marker carries no amount of its own.
    const finalAmount = nothingDue ? 0 : amount

    if (!nothingDue && (finalAmount === undefined || finalAmount === null)) {
      return NextResponse.json({ error: 'amount is required' }, { status: 400 })
    }

    if (payment_type === 'residual' && (!period_year || !period_month)) {
      return NextResponse.json(
        { error: 'Residual payments require period_year and period_month' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('referral_payment_records')
      .insert({
        lead_id,
        partner_id:   partner_id ?? null,
        referred_by,
        amount:       finalAmount,
        percentage:   percentage ?? null,
        date_paid,
        payment_type: payment_type ?? null,
        // One-time bonuses carry no period; the partial unique index only
        // applies to rows where both are set.
        period_year:  payment_type === 'residual' ? period_year  : null,
        period_month: payment_type === 'residual' ? period_month : null,
        notes:        notes ?? null,
        no_payment_due: nothingDue,
      })
      .select('*, lead:leads(id, business_name)')
      .single()

    if (error) {
      // Partial unique index on (lead_id, period_year, period_month)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That residual has already been recorded for this month' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // A one-time bonus is settled by a single payment, so flip the lead's flag
    // to keep the lead record and the payout ledger in agreement. A
    // "nothing due" marker is not a settlement, so it leaves the flag alone.
    if (payment_type === 'one_time' && !nothingDue) {
      await supabase
        .from('leads')
        .update({ referral_paid: true })
        .eq('id', lead_id)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[Referral Payments] POST failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const auth = await requireAdmin(supabase)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Reopen the one-time bonus if this was the payment that settled it.
    const { data: record } = await supabase
      .from('referral_payment_records')
      .select('lead_id, payment_type, no_payment_due')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('referral_payment_records')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Only a real settlement flipped the flag, so only that should reverse it.
    if (record?.payment_type === 'one_time' && !record.no_payment_due && record.lead_id) {
      await supabase
        .from('leads')
        .update({ referral_paid: false })
        .eq('id', record.lead_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Referral Payments] DELETE failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
