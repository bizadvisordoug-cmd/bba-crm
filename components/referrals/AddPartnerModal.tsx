'use client'

import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface AddPartnerModalProps {
  onClose: () => void
  onCreated: () => void
}

export function AddPartnerModal({ onClose, onCreated }: AddPartnerModalProps) {
  const [form, setForm] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (key: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/referrals/partners', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to create partner')
        return
      }

      onCreated()
    } catch {
      setError('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'rgba(16,20,32,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-4">Add Referral Partner</h2>

        <form onSubmit={submit} className="space-y-3">
          <Input
            label="Partner Name"
            required
            placeholder="Name as it appears on leads"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            hint="Must match the Referred By value on the lead to group payouts."
          />
          <Input
            label="Contact Name"
            placeholder="Optional"
            value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            placeholder="Optional"
            value={form.contact_email}
            onChange={e => set('contact_email', e.target.value)}
          />
          <Input
            label="Phone"
            placeholder="Optional"
            value={form.contact_phone}
            onChange={e => set('contact_phone', e.target.value)}
          />
          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            className="min-h-[70px]"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? 'Saving...' : 'Add Partner'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
