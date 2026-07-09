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

        // Fetch from API route that has service role access
        const response = await fetch('/api/renewals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ todayStr, in90DaysStr }),
        })

        if (!response.ok) throw new Error('Failed to fetch renewals')
        const data = await response.json()
        setLeads(data)
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
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-white">Business</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-white">Owner</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-white">Rep</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-white">Expiration Date</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-white">Days Left</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {leads.map((lead) => {
                const daysLeft = lead.contract_expiration ? getDaysUntilExpiration(lead.contract_expiration) : 0
                return (
                  <tr key={lead.id} className="hover:bg-gray-800/50 bg-gray-900/30">
                    <td className="px-6 py-4 text-sm font-medium text-white">
                      {lead.business_name || (lead.business && typeof lead.business === 'object' && (lead.business as any).business_name) || 'Untitled'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {lead.owner_name || (lead.owner && typeof lead.owner === 'object' && (lead.owner as any).name) || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {lead.assigned_rep?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-500" />
                        {lead.contract_expiration ? formatDate(lead.contract_expiration) : '—'}
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-sm font-semibold text-center rounded ${getUrgencyColor(daysLeft)}`}>
                      {daysLeft} days
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/crm?lead=${lead.id}`}
                        className="text-purple-400 hover:text-purple-300 font-medium"
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
