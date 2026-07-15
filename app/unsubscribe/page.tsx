export const dynamic = 'force-dynamic'

'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function UnsubscribePage() {
  const searchParams = useSearchParams()
  const enrollmentId = searchParams.get('enrollment')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const unsubscribe = async () => {
      if (!enrollmentId) {
        setStatus('error')
        setMessage('Invalid unsubscribe link - no enrollment ID provided')
        return
      }

      try {
        // Update enrollment status to 'unsubscribed'
        const supabase = createClient()
        const { error } = await supabase
          .from('campaign_enrollments')
          .update({ status: 'unsubscribed' })
          .eq('id', enrollmentId)

        if (error) {
          setStatus('error')
          setMessage(`Failed to unsubscribe: ${error.message}`)
          return
        }

        setStatus('success')
        setMessage('You have been unsubscribed from this campaign.')
      } catch (err) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    }

    unsubscribe()
  }, [enrollmentId])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Campaign Unsubscribe</h1>

        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
            <p className="text-gray-300">Processing...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-full">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 font-medium">{message}</p>
            <p className="text-sm text-gray-400">You will no longer receive emails from this campaign.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-red-500/20 rounded-full">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-400 font-medium">{message}</p>
            <p className="text-sm text-gray-400">Please contact support if you continue to receive emails.</p>
          </div>
        )}
      </div>
    </div>
  )
}
