'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'
import type { Lead } from '@/types'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

interface ParsedRow {
  business_name?: string
  owner_name?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  owner_phone?: string
  business_phone?: string
  email?: string
  industry?: string
  monthly_processing_volume?: string
  current_processor?: string
  current_rate?: string
  pos_system?: string
  lead_source?: string
  referred_by?: string
  referral_bonus_amount?: string
  notes?: string
  _index: number
  _error?: string
}

interface LeadImportModalProps {
  open: boolean
  onClose: () => void
  currentUserId: string
  onImport: (leads: Lead[]) => void
}

function normalizeRow(raw: Record<string, unknown>, index: number): ParsedRow {
  const norm: Record<string, string> = {}
  for (const key of Object.keys(raw)) {
    norm[key.trim().toLowerCase()] = String(raw[key] ?? '').trim()
  }
  const row: ParsedRow = {
    business_name: norm['business_name'] || undefined,
    owner_name: norm['owner_name'] || undefined,
    address: norm['address'] || undefined,
    city: norm['city'] || undefined,
    state: norm['state'] || undefined,
    zip: norm['zip'] || undefined,
    owner_phone: norm['owner_phone'] || undefined,
    business_phone: norm['business_phone'] || undefined,
    email: norm['email'] || undefined,
    industry: norm['industry'] || undefined,
    monthly_processing_volume: norm['monthly_processing_volume'] || undefined,
    current_processor: norm['current_processor'] || undefined,
    current_rate: norm['current_rate'] || undefined,
    pos_system: norm['pos_system'] || undefined,
    lead_source: norm['lead_source'] || undefined,
    referred_by: norm['referred_by'] || undefined,
    referral_bonus_amount: norm['referral_bonus_amount'] || undefined,
    notes: norm['notes'] || undefined,
    _index: index,
  }
  if (!row.business_name) row._error = 'Missing business name'
  return row
}

export function LeadImportModal({ open, onClose, currentUserId, onImport }: LeadImportModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [importedCount, setImportedCount] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)

  const validRows = rows.filter(r => !r._error)
  const errorRows = rows.filter(r => !!r._error)

  const handleFile = useCallback((file: File) => {
    setParseError(null)
    setRows([])
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsed = (results.data as Record<string, unknown>[]).map((row, i) => normalizeRow(row, i))
          if (parsed.length === 0) {
            setParseError('The file appears to be empty.')
            return
          }
          setRows(parsed)
          setStep('preview')
        },
        error: (err: { message: string }) => setParseError(`CSV parse error: ${err.message}`),
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
          if (json.length === 0) {
            setParseError('The file appears to be empty.')
            return
          }
          const parsed = json.map((row, i) => normalizeRow(row, i))
          setRows(parsed)
          setStep('preview')
        } catch (err) {
          setParseError(`Excel parse error: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      setParseError('Please upload a .csv or .xlsx file.')
    }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleConfirmImport = async () => {
    setStep('importing')
    try {
      // ── 1. Create one owner (person) per unique owner name in this batch ──
      // Leads carry flat owner_name/business_name text, but the rest of the app
      // (edit drawer selectors, People page, per-business contacts) works off the
      // relational people/businesses tables via owner_id/business_id. If we only
      // insert the text fields the imported leads can't be edited or selected.
      // Dedupe within the batch by name so one owner with several imported
      // locations gets a single person row; we do NOT match pre-existing people
      // by name (a bare first name could link to an unrelated person).
      const ownerByKey = new Map<string, { name: string; phone: string | null; email: string | null }>()
      for (const row of validRows) {
        const name = (row.owner_name || '').trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (!ownerByKey.has(key)) {
          ownerByKey.set(key, { name, phone: row.owner_phone || null, email: row.email || null })
        }
      }
      const ownerIdByKey = new Map<string, string>()
      if (ownerByKey.size > 0) {
        const { data: people, error: peopleErr } = await supabase
          .from('people')
          .insert([...ownerByKey.values()])
          .select('id, name')
        if (peopleErr) throw peopleErr
        for (const p of people) ownerIdByKey.set(p.name.trim().toLowerCase(), p.id)
      }

      // ── 2. Create a business per row (each row is a distinct location) and
      //       link it to the resolved owner, then build the lead payloads ──
      const payloads = []
      for (const row of validRows) {
        const ownerKey = (row.owner_name || '').trim().toLowerCase()
        const owner_id = ownerKey ? ownerIdByKey.get(ownerKey) ?? null : null

        let business_id: string | null = null
        if (row.business_name) {
          const { data: biz, error: bizErr } = await supabase
            .from('businesses')
            .insert({
              owner_id,
              business_name: row.business_name,
              address: row.address || null,
              city: row.city || null,
              state: row.state || null,
              zip: row.zip || null,
              industry: row.industry || null,
              business_phone: row.business_phone || null,
              business_email: row.email || null,
            })
            .select('id')
            .single()
          if (bizErr) throw bizErr
          business_id = biz.id
        }

        payloads.push({
          business_name: row.business_name!,
          owner_name: row.owner_name || '',
          owner_id,
          business_id,
          address: row.address || null,
          city: row.city || null,
          state: row.state || null,
          zip: row.zip || null,
          owner_phone: row.owner_phone || null,
          business_phone: row.business_phone || null,
          email: row.email || null,
          industry: row.industry || null,
          monthly_processing_volume: row.monthly_processing_volume ? parseFloat(row.monthly_processing_volume) : null,
          current_processor: row.current_processor || null,
          current_rate: row.current_rate ? parseFloat(row.current_rate) : null,
          pos_system: row.pos_system || null,
          lead_source: row.lead_source || null,
          referred_by: row.referred_by || null,
          referral_bonus_amount: row.referral_bonus_amount ? parseFloat(row.referral_bonus_amount) : null,
          notes: row.notes || null,
          pipeline_stage: 'New Lead',
          status: 'Prospect',
          assigned_rep_id: currentUserId,
        })
      }

      const { data: inserted, error } = await supabase
        .from('leads')
        .insert(payloads)
        .select('*, assigned_rep:users(id, name, email), owner:people(id, name, phone, email), business:businesses(id, owner_id, business_name, address, city, state, zip, industry)')

      if (error) throw error

      const count = inserted?.length ?? validRows.length
      setImportedCount(count)
      setStep('done')
      onImport((inserted as Lead[]) || [])

      // Geocode addresses in the background — non-blocking
      if (inserted) {
        ;(async () => {
          for (const lead of inserted) {
            if (lead.address || lead.city || lead.state || lead.zip) {
              const coords = await geocodeAddress({
                address: lead.address,
                city: lead.city,
                state: lead.state,
                zip: lead.zip,
              }).catch(() => null)
              if (coords) {
                await supabase
                  .from('leads')
                  .update({ lat: coords.lat, lng: coords.lng })
                  .eq('id', lead.id)
              }
              await new Promise(r => setTimeout(r, 50))
            }
          }
        })()
      }
    } catch (err) {
      console.error('[LeadImport]', err)
      setParseError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  const handleClose = () => {
    setRows([])
    setStep('idle')
    setParseError(null)
    setImportedCount(0)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Leads" size="xl">
      {/* Step: file drop zone */}
      {step === 'idle' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet size={40} className="mx-auto mb-4 text-[var(--text-muted)]" />
          <p className="text-sm font-medium text-white mb-1">Drop a CSV or Excel file here</p>
          <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>or click to browse — .csv and .xlsx supported</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileInput}
            onClick={e => e.stopPropagation()}
          />
          <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
            Choose File
          </Button>
          {parseError && (
            <p className="text-xs text-red-400 mt-4 flex items-center justify-center gap-1.5">
              <AlertCircle size={12} /> {parseError}
            </p>
          )}
        </div>
      )}

      {/* Step: preview */}
      {step === 'preview' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-center">
              <span className="font-semibold text-green-200">{validRows.length}</span>
              <span className="text-green-300"> ready to import</span>
            </div>
            {errorRows.length > 0 && (
              <div className="flex-1 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-center">
                <span className="font-semibold text-red-200">{errorRows.length}</span>
                <span className="text-red-300"> row{errorRows.length !== 1 ? 's' : ''} with errors (will be skipped)</span>
              </div>
            )}
          </div>

          {parseError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle size={12} /> {parseError}
            </div>
          )}

          <div className="overflow-auto max-h-[45vh] rounded-xl border border-white/[0.08]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: '#0d1117' }}>
                <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Business Name</th>
                  <th className="px-3 py-2.5 font-medium">Owner</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">City</th>
                  <th className="px-3 py-2.5 font-medium">State</th>
                  <th className="px-3 py-2.5 font-medium">Volume</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rows.map(row => (
                  <tr key={row._index} className={row._error ? 'bg-red-500/[0.07]' : 'hover:bg-white/[0.02]'}>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{row._index + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {row.business_name ? (
                        <span className="text-white">{row.business_name}</span>
                      ) : (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertCircle size={11} /> missing
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.owner_name || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.email || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.city || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.state || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                      {row.monthly_processing_volume ? `$${Number(row.monthly_processing_volume).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row._error ? (
                        <span className="text-red-400">{row._error}</span>
                      ) : (
                        <span className="text-green-400">Valid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-5">
            <Button variant="ghost" size="sm" onClick={() => { setRows([]); setStep('idle'); setParseError(null) }}>
              Back
            </Button>
            <Button
              variant="primary"
              disabled={validRows.length === 0}
              onClick={handleConfirmImport}
            >
              Confirm Import — {validRows.length} Lead{validRows.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* Step: importing spinner */}
      {step === 'importing' && (
        <div className="py-16 text-center">
          <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-white">Importing leads…</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>This may take a moment</p>
        </div>
      )}

      {/* Step: success */}
      {step === 'done' && (
        <div className="py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-400" />
          </div>
          <p className="text-lg font-semibold text-white mb-1">
            {importedCount} lead{importedCount !== 1 ? 's' : ''} imported successfully
          </p>
          <p className="text-xs mt-1 mb-6" style={{ color: 'var(--text-muted)' }}>
            Addresses are being geocoded for the map view
          </p>
          <Button variant="primary" onClick={handleClose}>
            Done
          </Button>
        </div>
      )}
    </Modal>
  )
}
