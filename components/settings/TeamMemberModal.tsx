'use client'

import { useState } from 'react'
import { Check, Shield } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'

interface TeamMemberModalProps {
  user: any
  open: boolean
  onClose: () => void
  onSave: (updated: any) => void
}

const ROLE_OPTIONS = [
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'vp_operations', label: 'VP Operations' },
  { value: 'owner', label: 'Owner' },
]

const ROLE_BADGE_VARIANT: Record<string, 'purple' | 'blue' | 'gray'> = {
  owner: 'purple',
  vp_operations: 'blue',
  salesperson: 'gray',
}

export function TeamMemberModal({ user, open, onClose, onSave }: TeamMemberModalProps) {
  const [name, setName] = useState(user.name || '')
  const [email, setEmail] = useState(user.email || '')
  const [role, setRole] = useState(user.role || 'salesperson')
  const [canDeleteLeads, setCanDeleteLeads] = useState(user.can_delete_leads ?? false)
  const [canExportLeads, setCanExportLeads] = useState(user.can_export_leads ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const roleIsLocked = user.role === 'owner' || user.role === 'vp_operations'
  const emailChanged = email.trim() !== user.email

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/team/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: name.trim(),
          email: email.trim(),
          role,
          canDeleteLeads,
          canExportLeads,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')

      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onSave(json.user)
        onClose()
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Team Member" size="sm">
      {/* Avatar + live-updating identity preview */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={name} size="lg" src={user.avatar_url} />
        <div>
          <div className="text-base font-semibold text-white">{name || user.name}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {email || user.email}
            {emailChanged && (
              <span className="ml-1.5 text-amber-400 text-[10px] font-medium">
                (unsaved)
              </span>
            )}
          </div>
          <div className="mt-1.5">
            <Badge variant={ROLE_BADGE_VARIANT[role] ?? 'gray'}>
              {role.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <Input
          label="Full Name"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        {/* Email — editable, synced to both auth.users and public.users via API */}
        <Input
          label="Email Address"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          hint={emailChanged ? 'Will update login email and CRM profile.' : undefined}
        />

        {/* Role */}
        {roleIsLocked ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Role</label>
            <div
              className="h-9 w-full rounded-xl px-3 text-sm flex items-center capitalize"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
            >
              {role.replace('_', ' ')}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Owner and VP Operations roles are locked.
            </span>
          </div>
        ) : (
          <Select
            label="Role"
            value={role}
            onChange={e => setRole(e.target.value)}
            options={ROLE_OPTIONS}
          />
        )}

        {/* Permissions — only relevant for salesperson */}
        {role === 'salesperson' && (
          <div className="mt-2 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={13} className="text-purple-400" />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Permissions
              </span>
            </div>
            <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.06] space-y-3">
              {/* Can Delete Leads */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">Can Delete Leads</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Allow this rep to permanently delete leads from the CRM and Kanban board.
                  </div>
                </div>
                <button
                  onClick={() => setCanDeleteLeads(!canDeleteLeads)}
                  className={`relative mt-0.5 w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
                    canDeleteLeads ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    canDeleteLeads ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Can Export Leads */}
              <div className="flex items-start gap-3 pt-3 border-t border-white/[0.06]">
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">Can Export Leads</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Allow this rep to export their leads as CSV or Excel files.
                  </div>
                </div>
                <button
                  onClick={() => setCanExportLeads(!canExportLeads)}
                  className={`relative mt-0.5 w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
                    canExportLeads ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    canExportLeads ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={saving}
          icon={saved ? <Check size={14} /> : undefined}
          onClick={handleSave}
          disabled={!name.trim() || !email.trim()}
        >
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  )
}
