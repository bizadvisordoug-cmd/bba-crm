import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has export permission (admins can always export)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('can_export_leads, role')
      .eq('id', user.id)
      .single()

    const isAdmin = userData?.role === 'owner' || userData?.role === 'vp_operations'
    if (userError || (!isAdmin && !userData?.can_export_leads)) {
      return NextResponse.json({ error: 'Export permission denied' }, { status: 403 })
    }

    const { leadId } = await req.json()

    // Fetch leads
    let query = supabase
      .from('leads')
      .select('id, business_name, owner_name, owner_phone, business_phone, email, pipeline_stage')
      .eq('assigned_rep_id', user.id)

    if (leadId) {
      query = query.eq('id', leadId)
    }

    const { data: leads, error: leadsError } = await query

    if (leadsError || !leads) {
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No leads to export' }, { status: 404 })
    }

    return exportAsCSV(leads, leadId ? `lead-${leadId}` : 'leads')
  } catch (err) {
    console.error('Export error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function exportAsCSV(leads: any[], filename: string) {
  const headers = ['Business Name', 'Owner Name', 'Owner Phone', 'Business Phone', 'Email', 'Pipeline Stage']
  const rows = leads.map(lead => [
    lead.business_name || '',
    lead.owner_name || '',
    lead.owner_phone || '',
    lead.business_phone || '',
    lead.email || '',
    lead.pipeline_stage || '',
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}
