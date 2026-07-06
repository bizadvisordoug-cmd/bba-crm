import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has export permission
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('can_export_leads')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.can_export_leads) {
      return NextResponse.json({ error: 'Export permission denied' }, { status: 403 })
    }

    const { format, leadId } = await req.json()

    if (!['csv', 'excel'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
    }

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

    if (format === 'csv') {
      return exportAsCSV(leads, leadId ? `lead-${leadId}` : 'leads')
    } else {
      return exportAsExcel(leads, leadId ? `lead-${leadId}` : 'leads')
    }
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

async function exportAsExcel(leads: any[], filename: string) {
  // Dynamically import xlsx to avoid issues
  const ExcelJS = await import('exceljs').then(m => m.default || m)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Leads')

  // Add headers
  worksheet.columns = [
    { header: 'Business Name', key: 'business_name', width: 30 },
    { header: 'Owner Name', key: 'owner_name', width: 20 },
    { header: 'Owner Phone', key: 'owner_phone', width: 15 },
    { header: 'Business Phone', key: 'business_phone', width: 15 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Pipeline Stage', key: 'pipeline_stage', width: 18 },
  ]

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }

  // Add data rows
  leads.forEach(lead => {
    worksheet.addRow({
      business_name: lead.business_name || '',
      owner_name: lead.owner_name || '',
      owner_phone: lead.owner_phone || '',
      business_phone: lead.business_phone || '',
      email: lead.email || '',
      pipeline_stage: lead.pipeline_stage || '',
    })
  })

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  })
}
