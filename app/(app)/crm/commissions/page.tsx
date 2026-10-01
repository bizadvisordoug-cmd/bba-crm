export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { CommissionsClient } from '@/components/commissions/CommissionsClient'

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>
}

export default async function CommissionsPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'owner' || profile?.role === 'vp_operations'

  if (!isAdmin) {
    redirect('/')
  }

  // Statements are reconciled a month or more behind, and an old one often
  // needs revisiting, so the period is selectable rather than pinned to today.
  const params = await searchParams
  const now = new Date()
  const year = Number(params.year) || now.getFullYear()
  const month = Number(params.month) || now.getMonth() + 1

  // The overdue count is about today, not the period being viewed.
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() + 1

  const [
    { data: records },
    { data: processors },
    { data: reps },
    { data: businesses, error: bizError },
    { count: overdueCount },
  ] = await Promise.all([
    supabase
      .from('commission_records')
      .select('*, rep:users(id, name, email, role, avatar_url)')
      .eq('year', year)
      .eq('month', month)
      .order('total_owed', { ascending: false }),
    supabase
      .from('payment_processors')
      .select('*')
      .eq('active', true)
      .order('name'),
    supabase
      .from('users')
      .select('id, name, email, role, avatar_url')
      .order('name'),
    supabase
      .from('businesses')
      .select('*, owner:people(id, name)')
      .order('business_name'),
    supabase
      .from('commission_records')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'paid')
      .or(`year.lt.${thisYear},and(year.eq.${thisYear},month.lt.${thisMonth})`),
  ])

  if (bizError) console.error('[CommissionsPage] businesses query error:', bizError)
  console.log('[CommissionsPage] businesses fetched:', businesses?.length ?? 0)

  return (
    <CommissionsClient
      records={(records ?? []) as any}
      processors={processors ?? []}
      reps={(reps ?? []) as any}
      businesses={(businesses ?? []) as any}
      year={year}
      month={month}
      currentUserId={user!.id}
      overdueCount={overdueCount ?? 0}
    />
  )
}
