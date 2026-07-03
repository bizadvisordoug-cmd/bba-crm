'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { AlertCircle, Save } from 'lucide-react'

interface ReminderSetting {
  id: string
  pipeline_stage: string
  reminder_days: number | null
  enabled: boolean
  user_id: string
}

const DEFAULT_STAGES = [
  { stage: 'New Lead', days: 3 },
  { stage: 'Contacted', days: 5 },
  { stage: 'Appointment Set', days: 7 },
  { stage: 'Contract Sent', days: 2 },
  { stage: 'Signed', days: null },
  { stage: 'Equipment Ordered', days: null },
  { stage: 'Install Scheduled', days: null },
  { stage: 'Active Client', days: null },
]

export function PipelineRemindersPanel() {
  const [settings, setSettings] = useState<ReminderSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        // Fetch user's settings
        const { data: existingSettings, error: fetchError } = await supabase
          .from('pipeline_reminder_settings')
          .select('*')
          .eq('user_id', user.id)
          .order('pipeline_stage')
        if (fetchError) throw fetchError

        // If user has no settings, create defaults
        if (!existingSettings || existingSettings.length === 0) {
          const defaultSettings = DEFAULT_STAGES.map(({ stage, days }) => ({
            pipeline_stage: stage,
            reminder_days: days,
            enabled: days !== null,
            user_id: user.id,
          }))

          const { data: newSettings, error: insertError } = await supabase
            .from('pipeline_reminder_settings')
            .insert(defaultSettings)
            .select()
          if (insertError) throw insertError
          setSettings(newSettings || [])
        } else {
          setSettings(existingSettings)
        }
      } catch (err) {
        console.error('Failed to fetch reminder settings:', err)
        setError('Failed to load pipeline reminder settings.')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const updateSetting = (id: string, field: 'reminder_days' | 'enabled', value: any) => {
    setSettings(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, [field]: value }
          : s
      )
    )
  }

  const saveSettings = async () => {
    setSaving(true)
    setSaveStatus('idle')
    try {
      for (const setting of settings) {
        await supabase
          .from('pipeline_reminder_settings')
          .update({ reminder_days: setting.reminder_days, enabled: setting.enabled })
          .eq('id', setting.id)
      }
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </GlassCard>
    )
  }

  if (error) {
    return (
      <GlassCard className="p-6">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Pipeline Stage Reminders</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Configure how many days a lead can sit in each stage before sending a batch reminder email to the assigned rep at 8am daily.
          </p>
        </div>

        {saveStatus === 'success' && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
            ✓ Settings saved successfully
          </div>
        )}

        {saveStatus === 'error' && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={14} />
            Failed to save settings
          </div>
        )}

        <div className="space-y-3">
          {settings.map(setting => (
            <div key={setting.id} className="flex items-center gap-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="flex-1">
                <div className="font-medium text-white mb-1">{setting.pipeline_stage}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Days before reminder
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setting.enabled}
                    onChange={e => updateSetting(setting.id, 'enabled', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Enabled
                  </span>
                </label>

                {setting.enabled && (
                  <input
                    type="number"
                    min="1"
                    value={setting.reminder_days || ''}
                    onChange={e => updateSetting(setting.id, 'reminder_days', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Days"
                    className="w-20 px-2 py-1 text-sm rounded-lg bg-white/[0.04] border border-white/[0.08] text-white focus:outline-none focus:border-purple-500/50"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="primary"
          icon={<Save size={14} />}
          onClick={saveSettings}
          loading={saving}
          className="w-full"
        >
          Save Reminder Settings
        </Button>
      </div>
    </GlassCard>
  )
}
