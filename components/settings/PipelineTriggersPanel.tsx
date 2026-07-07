'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit3, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase'

interface Trigger {
  id: string
  stage_name: string
  trigger_type: string
  recipient_type: string
  email_subject: string
  email_body: string
  enabled: boolean
}

const PIPELINE_STAGES = [
  'New Lead',
  'Contacted',
  'Appointment Set',
  'Contract Sent',
  'Signed',
  'Equipment Ordered',
  'Install Scheduled',
  'Active Client',
]

const RECIPIENT_TYPES = [
  { value: 'assigned_rep', label: 'Send to Assigned Sales Rep' },
  { value: 'lead_owner', label: 'Send to Lead Owner (Person)' },
]

export function PipelineTriggersPanel() {
  const supabase = createClient()
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Partial<Trigger>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTrigger, setNewTrigger] = useState<Partial<Trigger>>({
    stage_name: PIPELINE_STAGES[0],
    trigger_type: 'email',
    recipient_type: 'assigned_rep',
    email_subject: '',
    email_body: '',
    enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTriggers()
  }, [])

  const fetchTriggers = async () => {
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('pipeline_stage_triggers')
        .select('*')
        .order('stage_name', { ascending: true })

      if (err) throw err
      setTriggers(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load triggers')
    } finally {
      setLoading(false)
    }
  }

  const handleAddTrigger = async () => {
    if (!newTrigger.email_subject?.trim() || !newTrigger.email_body?.trim()) {
      setError('Subject and body are required')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('pipeline_stage_triggers')
        .insert({
          stage_name: newTrigger.stage_name,
          trigger_type: newTrigger.trigger_type,
          recipient_type: newTrigger.recipient_type,
          email_subject: newTrigger.email_subject.trim(),
          email_body: newTrigger.email_body.trim(),
          enabled: newTrigger.enabled,
        })

      if (err) throw err
      setNewTrigger({
        stage_name: PIPELINE_STAGES[0],
        trigger_type: 'email',
        recipient_type: 'assigned_rep',
        email_subject: '',
        email_body: '',
        enabled: true,
      })
      setShowAddForm(false)
      await fetchTriggers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add trigger')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateTrigger = async (id: string) => {
    if (!editingData.email_subject?.trim() || !editingData.email_body?.trim()) {
      setError('Subject and body are required')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('pipeline_stage_triggers')
        .update({
          email_subject: editingData.email_subject.trim(),
          email_body: editingData.email_body.trim(),
          enabled: editingData.enabled,
        })
        .eq('id', id)

      if (err) throw err
      setEditingId(null)
      await fetchTriggers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trigger')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTrigger = async (id: string) => {
    if (!window.confirm('Delete this trigger?')) return

    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('pipeline_stage_triggers')
        .delete()
        .eq('id', id)

      if (err) throw err
      await fetchTriggers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete trigger')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400">Loading triggers...</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add New Trigger */}
      {!showAddForm ? (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setShowAddForm(true)}
        >
          Add Trigger
        </Button>
      ) : (
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.03] space-y-3">
          <h3 className="text-sm font-semibold text-white">New Trigger</h3>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Pipeline Stage"
              value={newTrigger.stage_name || ''}
              onChange={e => setNewTrigger(t => ({ ...t, stage_name: e.target.value }))}
              options={PIPELINE_STAGES.map(s => ({ value: s, label: s }))}
            />
            <Select
              label="Send To"
              value={newTrigger.recipient_type || ''}
              onChange={e => setNewTrigger(t => ({ ...t, recipient_type: e.target.value }))}
              options={RECIPIENT_TYPES}
            />
          </div>

          <Input
            label="Email Subject"
            value={newTrigger.email_subject || ''}
            onChange={e => setNewTrigger(t => ({ ...t, email_subject: e.target.value }))}
            placeholder="e.g., 'Welcome to Active Client Stage!'"
          />

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email Body
            </label>
            <textarea
              value={newTrigger.email_body || ''}
              onChange={e => setNewTrigger(t => ({ ...t, email_body: e.target.value }))}
              placeholder="Email template (plain text)&#10;&#10;Use variables:&#10;{LEAD_NAME} - Business name&#10;{OWNER_NAME} - Contact person&#10;{REP_NAME} - Assigned sales rep"
              rows={6}
              className="w-full p-2 rounded-lg text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddTrigger}
              disabled={saving}
            >
              {saving ? 'Creating…' : 'Create Trigger'}
            </Button>
          </div>
        </div>
      )}

      {/* Triggers List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Active Triggers</h3>
        {triggers.length === 0 ? (
          <p className="text-xs text-gray-500 p-3 text-center bg-white/[0.02] rounded-lg">
            No triggers configured yet. Create one to automate emails when leads move to stages.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
            {triggers.map(trigger => (
              <div key={trigger.id} className="border-l-2 border-purple-500/30 bg-white/[0.02] rounded p-3">
                {editingId === trigger.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-white">{trigger.stage_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                        {RECIPIENT_TYPES.find(r => r.value === trigger.recipient_type)?.label}
                      </span>
                    </div>

                    <Input
                      label="Subject"
                      value={editingData.email_subject || ''}
                      onChange={e => setEditingData(d => ({ ...d, email_subject: e.target.value }))}
                    />

                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Body
                      </label>
                      <textarea
                        value={editingData.email_body || ''}
                        onChange={e => setEditingData(d => ({ ...d, email_body: e.target.value }))}
                        rows={4}
                        className="w-full p-2 rounded text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50"
                      />
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => handleUpdateTrigger(trigger.id)}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-50"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{trigger.stage_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                          {RECIPIENT_TYPES.find(r => r.value === trigger.recipient_type)?.label}
                        </span>
                        {!trigger.enabled && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-300">Disabled</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{trigger.email_subject}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(trigger.id)
                          setEditingData(trigger)
                        }}
                        className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTrigger(trigger.id)}
                        disabled={saving}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
        <div className="font-medium">💡 How it works:</div>
        <div>1. Create a trigger for a specific pipeline stage</div>
        <div>2. Choose who receives the email (sales rep or lead owner)</div>
        <div>3. When a lead moves to that stage, the email is sent automatically</div>
        <div className="pt-1 text-blue-200">Available variables: {'{LEAD_NAME}'}, {'{OWNER_NAME}'}, {'{REP_NAME}'}</div>
      </div>
    </div>
  )
}
