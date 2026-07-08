'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  User, Mail, Phone, Users, Eye, EyeOff, Save, Check,
  MapPin, UserPlus, ChevronRight, Upload, Wifi, CheckCircle, AlertCircle,
  DollarSign, Clock, Workflow, Zap, Grid3x3,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'
import { TeamMemberModal } from './TeamMemberModal'
import { InviteTeamModal } from './InviteTeamModal'
import { CommissionsSettingsPanel } from './CommissionsSettingsPanel'
import { PipelineRemindersPanel } from './PipelineRemindersPanel'
import { PipelineStagesPanel } from './PipelineStagesPanel'
import { PipelineTriggersPanel } from './PipelineTriggersPanel'
import { POSSystemsPanel } from './POSSystemsPanel'

interface SettingsClientProps {
  profile: any
  allUsers: any[]
  isAdmin: boolean
}

type TestResult = { ok: boolean; message: string }

export function SettingsClient({ profile: initialProfile, allUsers, isAdmin }: SettingsClientProps) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'profile' | 'email' | 'integrations' | 'map' | 'team' | 'commissions' | 'pipeline-reminders' | 'pipeline-stages' | 'pipeline-triggers' | 'pos-systems'>('profile')
  const [profile, setProfile] = useState(initialProfile)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Password visibility
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [showIncomingPass, setShowIncomingPass] = useState(false)

  // Avatar upload
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Connection test state
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState<TestResult | null>(null)
  const [testingIncoming, setTestingIncoming] = useState(false)
  const [incomingTestResult, setIncomingTestResult] = useState<TestResult | null>(null)

  // Map sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ done: number; total: number; failed: number } | null>(null)

  // Team
  const [teamUsers, setTeamUsers] = useState<any[]>(allUsers)
  const [selectedTeamUser, setSelectedTeamUser] = useState<any | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const searchParams = useSearchParams()
  const [calendarStatus, setCalendarStatus] = useState<'connected' | 'error' | null>(null)

  useEffect(() => {
    const s = searchParams.get('calendar')
    if (s === 'connected') { setCalendarStatus('connected'); setActiveTab('integrations') }
    if (s === 'error')     { setCalendarStatus('error');     setActiveTab('integrations') }
  }, [searchParams])

  const set = (k: string, v: any) => setProfile((p: any) => ({ ...p, [k]: v }))

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSyncMapPins = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, business_name')
        .is('lat', null)
      if (error) throw error

      const candidates = (leads ?? []).filter(
        (l: any) => l.address || l.city || l.state || l.zip
      )

      let done = 0, failed = 0
      for (const lead of candidates) {
        const coords = await geocodeAddress({
          address: lead.address, city: lead.city, state: lead.state, zip: lead.zip,
        })
        if (coords) {
          const { error: upErr } = await supabase.from('leads')
            .update({ lat: coords.lat, lng: coords.lng }).eq('id', lead.id)
          if (upErr) { failed++; continue }
          done++
        } else {
          failed++
        }
        await new Promise(r => setTimeout(r, 50))
      }
      setSyncResult({ done, total: candidates.length, failed })
    } catch (err) {
      console.error('[SyncMapPins]', err)
      setSyncResult({ done: 0, total: 0, failed: -1 })
    } finally {
      setSyncing(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      set('avatar_url', publicUrl)
    } catch (err) {
      console.error('[Avatar upload]', err)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('users').update(profile).eq('id', profile.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleTestSmtp = async () => {
    setTestingSmtp(true)
    setSmtpTestResult(null)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'smtp',
          host: profile.smtp_host,
          port: profile.smtp_port || 587,
          user: profile.smtp_user,
          pass: profile.smtp_pass,
          ssl: profile.smtp_ssl || false,
        }),
      })
      const json = await res.json()
      setSmtpTestResult(json.success
        ? { ok: true,  message: 'Connected successfully' }
        : { ok: false, message: json.error || 'Connection failed' })
    } catch {
      setSmtpTestResult({ ok: false, message: 'Request failed' })
    } finally {
      setTestingSmtp(false)
    }
  }

  const handleTestIncoming = async () => {
    const protocol = profile.incoming_mail_protocol || 'imap'
    setTestingIncoming(true)
    setIncomingTestResult(null)
    try {
      const isImap = protocol === 'imap'
      console.log('POP3 test request body:', {
        protocol,
        host:     isImap ? profile.imap_host : profile.pop_host,
        mailUser: isImap ? profile.imap_user : profile.pop_user,
        pass:     isImap ? profile.imap_pass : profile.pop_pass,
        port:     isImap ? (profile.imap_port || 993) : (profile.pop_port || 995),
        ssl:      isImap ? (profile.imap_ssl ?? true) : (profile.pop_ssl ?? true),
      })
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: protocol,
          host: isImap ? profile.imap_host : profile.pop_host,
          port: isImap ? (profile.imap_port || 993) : (profile.pop_port || 995),
          user: isImap ? profile.imap_user : profile.pop_user,
          pass: isImap ? profile.imap_pass : profile.pop_pass,
          ssl:  isImap ? (profile.imap_ssl ?? true) : (profile.pop_ssl ?? true),
        }),
      })
      const json = await res.json()
      setIncomingTestResult(json.success
        ? { ok: true,  message: 'Connected successfully' }
        : { ok: false, message: json.error || 'Connection failed' })
    } catch {
      setIncomingTestResult({ ok: false, message: 'Request failed' })
    } finally {
      setTestingIncoming(false)
    }
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'profile',      label: 'Profile',      icon: User   },
    { key: 'email',        label: 'Email',         icon: Mail   },
    { key: 'integrations', label: 'Integrations',  icon: Phone  },
    { key: 'map',          label: 'Map',            icon: MapPin },
    ...(isAdmin ? [{ key: 'pipeline-stages', label: 'Pipeline Stages', icon: Workflow }] : []),
    ...(isAdmin ? [{ key: 'pipeline-triggers', label: 'Pipeline Triggers', icon: Zap }] : []),
    ...(isAdmin ? [{ key: 'pipeline-reminders', label: 'Pipeline Reminders', icon: Clock }] : []),
    ...(isAdmin ? [{ key: 'team', label: 'Team', icon: Users }] : []),
    ...(isAdmin ? [{ key: 'commissions', label: 'Commissions', icon: DollarSign }] : []),
    ...(isAdmin ? [{ key: 'pos-systems', label: 'POS Systems', icon: Grid3x3 }] : []),
  ] as const

  // ── SSL toggle helper ─────────────────────────────────────────────────────

  function SslToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
            checked ? 'bg-purple-600' : 'bg-white/20'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`} />
        </button>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </label>
    )
  }

  function TestResultBadge({ result }: { result: TestResult }) {
    return (
      <span className={`flex items-center gap-1.5 text-sm ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
        {result.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
        {result.message}
      </span>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Settings"
        actions={
          <Button
            variant="primary"
            icon={saved ? <Check size={14} /> : <Save size={14} />}
            onClick={handleSave}
            loading={saving}
          >
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        }
      />

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <div className="w-44 flex-shrink-0 space-y-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left ${
                activeTab === key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl">

          {/* Profile */}
          {activeTab === 'profile' && (
            <GlassCard>
              <h2 className="font-semibold text-white mb-5">Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Profile Picture
                  </label>
                  <div className="flex items-center gap-4">
                    <Avatar name={profile.name || 'User'} size="lg" src={avatarPreview || profile.avatar_url} />
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.gif"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Upload size={14} />}
                        onClick={() => fileInputRef.current?.click()}
                        loading={uploading}
                      >
                        {uploading ? 'Uploading…' : 'Upload Photo'}
                      </Button>
                      <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>JPG, PNG or GIF</p>
                    </div>
                  </div>
                </div>
                <Input
                  label="Full Name"
                  value={profile.name || ''}
                  onChange={e => set('name', e.target.value)}
                />
                <Input
                  label="Email Address"
                  type="email"
                  value={profile.email || ''}
                  onChange={e => set('email', e.target.value)}
                  hint="This is your login email"
                />
              </div>
            </GlassCard>
          )}

          {/* Email — Outgoing + Incoming */}
          {activeTab === 'email' && (
            <div className="space-y-5">

              {/* ── Outgoing (SMTP) ─────────────────────────────────── */}
              <GlassCard>
                <div className="mb-5">
                  <h2 className="font-semibold text-white">Outgoing Mail (SMTP)</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Campaign emails are sent from your own SMTP server using these credentials.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="SMTP Host"
                      value={profile.smtp_host || ''}
                      onChange={e => set('smtp_host', e.target.value)}
                      placeholder="smtp.gmail.com"
                    />
                    <Input
                      label="Port"
                      type="number"
                      value={profile.smtp_port?.toString() || '587'}
                      onChange={e => set('smtp_port', parseInt(e.target.value))}
                      placeholder="587"
                    />
                  </div>
                  <Input
                    label="Username"
                    value={profile.smtp_user || ''}
                    onChange={e => set('smtp_user', e.target.value)}
                    placeholder="you@gmail.com"
                  />
                  <div className="relative">
                    <Input
                      label="Password / App Password"
                      type={showSmtpPass ? 'text' : 'password'}
                      value={profile.smtp_pass || ''}
                      onChange={e => set('smtp_pass', e.target.value)}
                      placeholder="App password or SMTP password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      className="absolute right-3 top-7 text-[var(--text-muted)] hover:text-white transition-colors"
                    >
                      {showSmtpPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <SslToggle
                    checked={profile.smtp_ssl || false}
                    onChange={v => set('smtp_ssl', v)}
                    label="Use SSL/TLS — enable for port 465; leave off for port 587 (STARTTLS)"
                  />

                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                    <strong>Gmail:</strong> Enable 2FA → create an App Password at myaccount.google.com/apppasswords.
                    Use port 587 (STARTTLS, SSL off) or 465 (SSL on).
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Wifi size={13} />}
                      onClick={handleTestSmtp}
                      loading={testingSmtp}
                    >
                      Test SMTP Connection
                    </Button>
                    {smtpTestResult && <TestResultBadge result={smtpTestResult} />}
                  </div>
                </div>
              </GlassCard>

              {/* ── Incoming Mail (IMAP / POP3) ──────────────────────── */}
              <GlassCard>
                <div className="mb-5">
                  <h2 className="font-semibold text-white">Incoming Mail</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Connect your inbox so the CRM can read replies and sync email activity.
                  </p>
                </div>

                {/* Protocol toggle */}
                <div className="mb-5">
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Protocol</p>
                  <div className="flex rounded-xl overflow-hidden border border-white/[0.08] w-fit">
                    {(['imap', 'pop3'] as const).map(proto => (
                      <button
                        key={proto}
                        type="button"
                        onClick={() => set('incoming_mail_protocol', proto)}
                        className={`px-5 py-2 text-sm font-medium transition-all ${
                          (profile.incoming_mail_protocol || 'imap') === proto
                            ? 'bg-purple-600 text-white'
                            : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {proto.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* IMAP fields */}
                  {(profile.incoming_mail_protocol || 'imap') === 'imap' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="IMAP Host"
                          value={profile.imap_host || ''}
                          onChange={e => set('imap_host', e.target.value)}
                          placeholder="imap.gmail.com"
                        />
                        <Input
                          label="Port"
                          type="number"
                          value={profile.imap_port?.toString() || '993'}
                          onChange={e => set('imap_port', parseInt(e.target.value))}
                          placeholder="993"
                        />
                      </div>
                      <Input
                        label="Username"
                        value={profile.imap_user || ''}
                        onChange={e => set('imap_user', e.target.value)}
                        placeholder="you@gmail.com"
                      />
                      <div className="relative">
                        <Input
                          label="Password / App Password"
                          type={showIncomingPass ? 'text' : 'password'}
                          value={profile.imap_pass || ''}
                          onChange={e => set('imap_pass', e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowIncomingPass(!showIncomingPass)}
                          className="absolute right-3 top-7 text-[var(--text-muted)] hover:text-white transition-colors"
                        >
                          {showIncomingPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <SslToggle
                        checked={profile.imap_ssl ?? true}
                        onChange={v => set('imap_ssl', v)}
                        label="Use SSL/TLS (recommended — port 993)"
                      />
                    </>
                  )}

                  {/* POP3 fields */}
                  {profile.incoming_mail_protocol === 'pop3' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="POP3 Host"
                          value={profile.pop_host || ''}
                          onChange={e => set('pop_host', e.target.value)}
                          placeholder="pop.gmail.com"
                        />
                        <Input
                          label="Port"
                          type="number"
                          value={profile.pop_port?.toString() || '995'}
                          onChange={e => set('pop_port', parseInt(e.target.value))}
                          placeholder="995"
                        />
                      </div>
                      <Input
                        label="Username"
                        value={profile.pop_user || ''}
                        onChange={e => set('pop_user', e.target.value)}
                        placeholder="you@gmail.com"
                      />
                      <div className="relative">
                        <Input
                          label="Password / App Password"
                          type={showIncomingPass ? 'text' : 'password'}
                          value={profile.pop_pass || ''}
                          onChange={e => set('pop_pass', e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowIncomingPass(!showIncomingPass)}
                          className="absolute right-3 top-7 text-[var(--text-muted)] hover:text-white transition-colors"
                        >
                          {showIncomingPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <SslToggle
                        checked={profile.pop_ssl ?? true}
                        onChange={v => set('pop_ssl', v)}
                        label="Use SSL/TLS (recommended — port 995)"
                      />
                    </>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Wifi size={13} />}
                      onClick={handleTestIncoming}
                      loading={testingIncoming}
                    >
                      Test Incoming Connection
                    </Button>
                    {incomingTestResult && <TestResultBadge result={incomingTestResult} />}
                  </div>
                </div>
              </GlassCard>
            </div>
          )}

          {/* Integrations */}
          {activeTab === 'integrations' && (
            <div className="space-y-4">
              <GlassCard>
                <h2 className="font-semibold text-white mb-5">Twilio SMS</h2>
                <div className="space-y-4">
                  <Input
                    label="Twilio Phone Number"
                    value={profile.twilio_number || ''}
                    onChange={e => set('twilio_number', e.target.value)}
                    placeholder="+15555550100"
                    hint="Your Twilio sending number in E.164 format"
                  />
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Twilio Account SID and Auth Token are configured via environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).
                  </div>
                </div>
              </GlassCard>
              <GlassCard>
                <h2 className="font-semibold text-white mb-2">Google Calendar</h2>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Connect Google Calendar to sync appointments and show availability on your booking page.
                </p>

                {calendarStatus === 'connected' && (
                  <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-400">
                    <CheckCircle size={14} />
                    Google Calendar connected successfully.
                  </div>
                )}
                {calendarStatus === 'error' && (
                  <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    <AlertCircle size={14} />
                    Could not connect Google Calendar. Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
                  </div>
                )}

                {profile.google_calendar_token ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      <CheckCircle size={14} /> Calendar connected
                    </div>
                    <a href="/api/calendar/connect">
                      <Button variant="ghost" size="sm">Reconnect</Button>
                    </a>
                  </div>
                ) : (
                  <a href="/api/calendar/connect">
                    <Button variant="secondary">Connect Google Calendar</Button>
                  </a>
                )}

                <div className="mt-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <div className="font-medium text-white">Required setup in Google Cloud Console:</div>
                  <div>1. Create a project → enable <strong>Google Calendar API</strong></div>
                  <div>2. OAuth consent screen → add your email as a test user</div>
                  <div>3. Credentials → OAuth 2.0 Client ID (Web app) → add authorized redirect URI:</div>
                  <div className="font-mono bg-black/20 px-2 py-1 rounded text-[11px]">{`{NEXT_PUBLIC_APP_URL}/api/calendar/callback`}</div>
                  <div className="pt-1">Then add to <strong>.env.local</strong>:</div>
                  <div className="font-mono bg-black/20 px-2 py-1 rounded text-[11px] whitespace-pre">{`GOOGLE_CLIENT_ID=...\nGOOGLE_CLIENT_SECRET=...`}</div>
                </div>
              </GlassCard>
            </div>
          )}

          {/* Map */}
          {activeTab === 'map' && (
            <GlassCard>
              <div className="flex items-start gap-3 mb-5">
                <MapPin size={20} className="text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h2 className="font-semibold text-white">Sync Map Pins</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Geocode all existing leads that have an address but are missing map coordinates.
                    New leads are geocoded automatically when saved — this is a one-time fix for existing records.
                  </p>
                </div>
              </div>

              {syncResult && (
                <div className={`mb-5 p-3 rounded-xl text-xs border ${
                  syncResult.failed === -1
                    ? 'bg-red-500/10 border-red-500/20 text-red-300'
                    : 'bg-green-500/10 border-green-500/20 text-green-300'
                }`}>
                  {syncResult.failed === -1
                    ? 'Sync failed — check the browser console for details.'
                    : syncResult.total === 0
                      ? 'All leads with addresses already have map coordinates.'
                      : `Done: ${syncResult.done} of ${syncResult.total} leads geocoded.${
                          syncResult.failed > 0 ? ` ${syncResult.failed} could not be geocoded.` : ''
                        }`}
                </div>
              )}

              <Button
                variant="primary"
                icon={<MapPin size={14} />}
                onClick={handleSyncMapPins}
                loading={syncing}
              >
                {syncing ? 'Geocoding leads…' : 'Sync Map Pins'}
              </Button>
            </GlassCard>
          )}

          {/* Pipeline Stages (admin only) */}
          {activeTab === 'pipeline-stages' && isAdmin && (
            <GlassCard>
              <h2 className="font-semibold text-white mb-5">Pipeline Stages</h2>
              <PipelineStagesPanel />
            </GlassCard>
          )}

          {/* Pipeline Triggers (admin only) */}
          {activeTab === 'pipeline-triggers' && isAdmin && (
            <GlassCard>
              <h2 className="font-semibold text-white mb-5">Pipeline Triggers & Automation</h2>
              <PipelineTriggersPanel />
            </GlassCard>
          )}

          {/* Pipeline Reminders (admin only) */}
          {activeTab === 'pipeline-reminders' && isAdmin && (
            <PipelineRemindersPanel />
          )}

          {/* Commissions (admin only) */}
          {activeTab === 'commissions' && isAdmin && (
            <CommissionsSettingsPanel />
          )}

          {/* Team (admin only) */}
          {activeTab === 'team' && isAdmin && (
            <GlassCard>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-white">Team Members</h2>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<UserPlus size={14} />}
                  onClick={() => setShowInviteModal(true)}
                >
                  Invite Member
                </Button>
              </div>
              <div className="space-y-2">
                {teamUsers.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedTeamUser(u)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all text-left group"
                  >
                    <Avatar name={u.name} size="sm" src={u.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{u.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{u.email}</div>
                    </div>
                    <Badge variant={u.role === 'owner' ? 'purple' : u.role === 'vp_operations' ? 'blue' : 'gray'}>
                      {u.role?.replace('_', ' ')}
                    </Badge>
                    <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            </GlassCard>
          )}

          {/* POS Systems (admin only) */}
          {activeTab === 'pos-systems' && isAdmin && (
            <GlassCard>
              <POSSystemsPanel />
            </GlassCard>
          )}
        </div>
      </div>

      {selectedTeamUser && (
        <TeamMemberModal
          key={selectedTeamUser.id}
          user={selectedTeamUser}
          open={!!selectedTeamUser}
          onClose={() => setSelectedTeamUser(null)}
          onSave={(updated) => {
            setTeamUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
            setSelectedTeamUser(null)
          }}
        />
      )}

      <InviteTeamModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvite={(newUser) => {
          setTeamUsers(prev => [...prev, newUser])
          setShowInviteModal(false)
        }}
      />
    </div>
  )
}
