'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Zap, Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { Button } from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/reset-password/confirm`
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (authError) throw authError
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
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
            <h1 className="text-xl font-bold text-white">Reset your password</h1>
            <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-secondary)' }}>
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5"
            >
              <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                <CheckCircle size={28} className="text-green-400" />
                <div>
                  <p className="font-semibold text-white text-sm">Check your email</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    We sent a reset link to <span className="text-white font-medium">{email}</span>.
                    It expires in 1 hour.
                  </p>
                </div>
              </div>
              <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                Didn&apos;t get it? Check your spam folder or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="text-purple-400 hover:text-purple-300 transition-colors underline underline-offset-2"
                >
                  try again
                </button>
                .
              </p>
              <Link href="/auth/login">
                <Button variant="secondary" size="lg" className="w-full" icon={<ArrowLeft size={15} />}>
                  Back to sign in
                </Button>
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Email address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@breakthroughba.com"
                    required
                    autoFocus
                    className="w-full h-10 pl-9 pr-4 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all"
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
              >
                Send reset link
              </Button>

              <Link href="/auth/login">
                <Button variant="ghost" size="lg" className="w-full" icon={<ArrowLeft size={15} />}>
                  Back to sign in
                </Button>
              </Link>
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
