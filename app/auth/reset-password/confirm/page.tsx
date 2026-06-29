'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Zap, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { Button } from '@/components/ui/Button'

type PageState = 'loading' | 'ready' | 'success' | 'error'

function validate(password: string, confirm: string): string {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirm) return 'Passwords do not match.'
  return ''
}

export default function ConfirmResetPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [linkError, setLinkError] = useState('')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const exchangeCode = useCallback(async () => {
    const code = searchParams.get('code')
    if (!code) {
      setLinkError('No reset code found in this link. Request a new one.')
      setPageState('error')
      return
    }
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      setPageState('ready')
    } catch (err: unknown) {
      setLinkError(
        err instanceof Error && err.message
          ? err.message
          : 'This reset link is invalid or has expired. Please request a new one.'
      )
      setPageState('error')
    }
  }, [searchParams])

  useEffect(() => {
    exchangeCode()
  }, [exchangeCode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validate(password, confirm)
    if (validationError) { setFormError(validationError); return }
    setFormError('')
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPageState('success')
      setTimeout(() => router.push('/auth/login'), 2500)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080b12' }}>
      <AmbientBackground />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <Zap size={26} className="text-white" />
            </motion.div>
            <h1 className="text-xl font-bold text-white">
              {pageState === 'success' ? 'Password updated' : 'Set new password'}
            </h1>
            <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-secondary)' }}>
              {pageState === 'success'
                ? 'Redirecting you to sign in…'
                : 'Choose a strong password for your account'}
            </p>
          </div>

          {/* Loading */}
          {pageState === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={24} className="text-purple-400 animate-spin" />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Verifying reset link…</p>
            </div>
          )}

          {/* Invalid link */}
          {pageState === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5"
            >
              <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                <AlertCircle size={28} className="text-red-400" />
                <div>
                  <p className="font-semibold text-white text-sm">Link invalid or expired</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{linkError}</p>
                </div>
              </div>
              <Link href="/auth/reset-password">
                <Button variant="primary" size="lg" className="w-full">
                  Request a new link
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="ghost" size="lg" className="w-full" icon={<ArrowLeft size={15} />}>
                  Back to sign in
                </Button>
              </Link>
            </motion.div>
          )}

          {/* Success */}
          {pageState === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5"
            >
              <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                <CheckCircle size={28} className="text-green-400" />
                <div>
                  <p className="font-semibold text-white text-sm">All set!</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Your password has been updated. Sending you to sign in…
                  </p>
                </div>
              </div>
              <Link href="/auth/login">
                <Button variant="secondary" size="lg" className="w-full" icon={<ArrowLeft size={15} />}>
                  Go to sign in now
                </Button>
              </Link>
            </motion.div>
          )}

          {/* Password form */}
          {pageState === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  New password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setFormError('') }}
                    placeholder="Min. 8 characters"
                    required
                    autoFocus
                    className="w-full h-10 pl-9 pr-10 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setFormError('') }}
                    placeholder="Re-enter password"
                    required
                    className="w-full h-10 pl-9 pr-10 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Strength hint */}
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {8 - password.length} more character{8 - password.length !== 1 ? 's' : ''} needed
                </p>
              )}

              {formError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {formError}
                </motion.div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={saving}
                className="w-full mt-2"
              >
                Update password
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Breakthrough Business Advisors © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  )
}
