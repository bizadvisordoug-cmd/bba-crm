'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Lead } from '@/types'
import Link from 'next/link'
import { Calendar, AlertCircle } from 'lucide-react'

export default function RenewalsPage() {
  const supabase = createClient()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRenewals = async () => {
      try {
        setLoading(true)
        setError(null)

        // Calculate date range: today to 90 days from now
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const in90Days = new Date(today)
        in90Days.setDate(in90Days.getDate() + 90)

        const todayStr = today.toISOString().split('T')[0]
        const in90DaysStr = in90Days.toISOString().split('T')[0]

        const { data, error: err } = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'Active Client')
          .gte('contract_expiration', todayStr)
          .lte('contract_expiration', in90DaysStr)
          .order('contract_expiration', { ascending: true })

        if (err) throw err
        setLeads(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load renewals')
      } finally {
        setLoading(false)
      }
    }

    fetchRenewals()
  }, [supabase])

  const getDaysUntilExpiration = (expirationDate: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expDate = new Date(expirationDate)
    expDate.setHours(0, 0, 0, 0)
    const days = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  const getUrgencyColor = (days: number) => {
    if (days <= 7) return 'text-red-500 bg-red-50'
    if (days <= 30) return 'text-orange-500 bg-orange-50'
    return 'text-yellow-500 bg-yellow-50'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Contract Renewals</h1>
        <p className="text-gray-600">Active Clients with contracts expiring in the next 90 days</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading renewals...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto mb-2 text-gray-400" size={32} />
          <p className="text-gray-500">No renewals in the next 90 days</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Business</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Owner</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Rep</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Expiration Date</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Days Left</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {leads.map((lead) => {
                const daysLeft = lead.contract_expiration ? getDaysUntilExpiration(lead.contract_expiration) : 0
                return (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {lead.business_name || 'Untitled'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {lead.owner_name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {lead.assigned_rep?.name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400" />
                        {lead.contract_expiration ? formatDate(lead.contract_expiration) : '—'}
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-sm font-semibold text-center rounded ${getUrgencyColor(daysLeft)}`}>
                      {daysLeft} days
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/crm?lead=${lead.id}`}
                        className="text-purple-600 hover:text-purple-700 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-sm text-gray-500">
        Total: {leads.length} renewal{leads.length !== 1 ? 's' : ''} in the next 90 days
      </div>
    </div>
  )
}
