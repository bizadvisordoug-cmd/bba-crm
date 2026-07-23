'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, MessageSquare, Play, Pause, ChevronDown, ChevronRight, Users, BarChart3, Send, Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GlassCard, StatCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { CampaignStepModal } from './CampaignStepModal'
import { CampaignCreateModal } from './CampaignCreateModal'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface CampaignsClientProps {
  campaigns: any[]
  enrollments: any[]
  leads: any[]
  stats: { totalSent: number; totalOpened: number; totalClicked: number; totalReplied: number }
  currentUserId: string
  isAdmin: boolean
}

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  cold_prospect:   'Cold Prospect',
  warm_shift4:     'Warm — Shift4',
  warm_stackably:  'Warm — Stackably',
  warm_clover:     'Warm — Clover',
  warm_dejavoo:    'Warm — Dejavoo',
  warm_spoton:     'Warm — Spot On',
  warm_basic:      'Warm — Basic Terminal',
  onboarding:      'Onboarding',
  renewal:         'Renewal',
  reengagement:    'Re-engagement',
  referral_ask:    'Referral Ask',
  custom:          'Custom',
}

export function CampaignsClient({
  campaigns: initialCampaigns,
  enrollments: initialEnrollments,
  leads,
  stats,
  currentUserId,
  isAdmin,
}: CampaignsClientProps) {
  const supabase = createClient()

  // ── Core state ──────────────────────────────────────────────────────────────
  const [campaignsList, setCampaignsList] = useState(initialCampaigns)
  const [enrollments, setEnrollments] = useState(initialEnrollments)
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'campaigns' | 'active' | 'stats'>('campaigns')
  const [showShared, setShowShared] = useState(false)

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [enrollModal, setEnrollModal] = useState<any | null>(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [enrollLeadSearch, setEnrollLeadSearch] = useState('')
  const [enrolling, setEnrolling] = useState(false)

  // campaign detail modal
  const [campaignDetailModal, setCampaignDetailModal] = useState<any | null>(null)
  const [campaignDetailFilter, setCampaignDetailFilter] = useState<'all' | 'active' | 'paused' | 'completed' | 'unsubscribed'>('all')

  // step modal: edit an existing step or add a new one
  const [stepModal, setStepModal] = useState<{ campaign: any; step: any | null } | null>(null)

  // create campaign modal
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false)

  // ── Derived ──────────────────────────────────────────────────────────────────
  const openRate  = stats.totalSent ? Math.round((stats.totalOpened  / stats.totalSent) * 100) : 0
  const clickRate = stats.totalSent ? Math.round((stats.totalClicked / stats.totalSent) * 100) : 0
  const replyRate = stats.totalSent ? Math.round((stats.totalReplied / stats.totalSent) * 100) : 0

  const stepModalNextNumber = stepModal
    ? Math.max(0, ...(stepModal.campaign.steps?.map((s: any) => s.step_number) ?? [0])) + 1
    : 1

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleEnroll = async () => {
    if (selectedLeadIds.length === 0 || !enrollModal) return
    setEnrolling(true)
    try {
      let enrolledCount = 0

      for (const leadId of selectedLeadIds) {
        const { data } = await supabase
          .from('campaign_enrollments')
          .insert({ lead_id: leadId, campaign_id: enrollModal.id, current_step: 1, status: 'active' })
          .select('*, lead:leads(id, business_name, owner_name, email), campaign:campaigns(name)')
          .single()

        if (data) {
          enrolledCount++
          setEnrollments(prev => [data, ...prev])

          await supabase.from('activity_log').insert({
            lead_id: leadId,
            user_id: currentUserId,
            action: 'enrolled in campaign',
            details: enrollModal.name,
          })

          // Send the first campaign email/SMS
          try {
            await fetch('/api/campaigns/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enrollmentId: data.id }),
            })
          } catch (err) {
            console.error('Error sending first campaign message:', err)
          }
        }
      }

      setEnrollModal(null)
      setSelectedLeadIds([])
      setEnrollLeadSearch('')
    } catch (err) {
      console.error(err)
    } finally {
      setEnrolling(false)
    }
  }

  const handlePause = async (enrollmentId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    await supabase.from('campaign_enrollments').update({ status: newStatus }).eq('id', enrollmentId)
    setEnrollments(prev => prev.map(e => e.id === enrollmentId ? { ...e, status: newStatus } : e))
  }

  const handleUnenroll = async (enrollmentId: string) => {
    await supabase.from('campaign_enrollments').delete().eq('id', enrollmentId)
    setEnrollments(prev => prev.filter(e => e.id !== enrollmentId))
  }

  const handleStepSaved = (campaignId: string, savedStep: any) => {
    setCampaignsList(prev => prev.map(c => {
      if (c.id !== campaignId) return c
      const exists = c.steps?.some((s: any) => s.id === savedStep.id)
      return {
        ...c,
        steps: exists
          ? c.steps.map((s: any) => s.id === savedStep.id ? savedStep : s)
          : [...(c.steps ?? []), savedStep],
      }
    }))
  }

  const handleStepDeleted = (campaignId: string, stepId: string) => {
    setCampaignsList(prev => prev.map(c => {
      if (c.id !== campaignId) return c
      return { ...c, steps: c.steps?.filter((s: any) => s.id !== stepId) }
    }))
  }

  const handleCampaignCreated = (campaign: any) => {
    setCampaignsList(prev => [campaign, ...prev])
    setExpandedCampaign(campaign.id)
    setActiveTab('campaigns')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Email & SMS sequences for your pipeline"
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setCreateCampaignOpen(true)}
          >
            New Campaign
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Emails Sent"  value={stats.totalSent.toLocaleString()}  icon={<Send size={16} />}         color="purple" delay={0.05} />
        <StatCard label="Open Rate"    value={`${openRate}%`}   sub={`${stats.totalOpened} opened`}  icon={<Mail size={16} />}         color="blue"   delay={0.1}  />
        <StatCard label="Click Rate"   value={`${clickRate}%`}  sub={`${stats.totalClicked} clicked`} icon={<BarChart3 size={16} />}    color="green"  delay={0.15} />
        <StatCard label="Reply Rate"   value={`${replyRate}%`}  sub={`${stats.totalReplied} replied`} icon={<MessageSquare size={16} />} color="amber"  delay={0.2}  />
      </div>

      {/* Tabs and Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
          {(['campaigns', 'active', 'stats'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                activeTab === t ? 'bg-white/[0.08] text-white' : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              {t === 'active'
                ? `Active (${enrollments.filter(e => e.status === 'active').length})`
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'campaigns' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowShared(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                !showShared ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              My Campaigns
            </button>
            <button
              onClick={() => setShowShared(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showShared ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              Shared
            </button>
          </div>
        )}
      </div>

      {/* ── Campaigns list ── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-3">
          {campaignsList
            .filter((c: any) => showShared ? c.is_shared : !c.is_shared)
            .map((campaign, i) => {
            const expanded  = expandedCampaign === campaign.id
            const activeCount = enrollments.filter(e => e.campaign_id === campaign.id && e.status === 'active').length
            const sortedSteps = [...(campaign.steps ?? [])].sort((a: any, b: any) => a.step_number - b.step_number)

            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-2xl overflow-hidden"
              >
                {/* Campaign header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.03] transition-colors"
                  onClick={() => setExpandedCampaign(expanded ? null : campaign.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.2)' }}
                    >
                      <Mail size={15} className="text-purple-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{campaign.name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {sortedSteps.length} step{sortedSteps.length !== 1 ? 's' : ''} ·{' '}
                        {CAMPAIGN_TYPE_LABELS[campaign.type] || campaign.type}
                        {activeCount > 0 && (
                          <span className="ml-2 badge-green px-1.5 py-0.5 rounded-full text-[10px]">
                            {activeCount} active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Users size={13} />}
                        onClick={e => { e.stopPropagation(); setCampaignDetailModal(campaign) }}
                      >
                        Manage ({activeCount})
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={13} />}
                      onClick={e => { e.stopPropagation(); setEnrollModal(campaign) }}
                    >
                      Enroll
                    </Button>
                    {expanded
                      ? <ChevronDown size={16} className="text-[var(--text-muted)]" />
                      : <ChevronRight size={16} className="text-[var(--text-muted)]" />}
                  </div>
                </div>

                {/* Expanded step list */}
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/[0.06] p-4"
                  >
                    {campaign.description && (
                      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                        {campaign.description}
                      </p>
                    )}

                    <div className="space-y-2">
                      {sortedSteps.map((step: any) => (
                        <button
                          key={step.id}
                          className="w-full flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-transparent hover:border-white/[0.08] transition-all text-left group"
                          onClick={() => setStepModal({ campaign, step })}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                            step.type === 'sms' ? 'badge-green' : 'badge-blue'
                          }`}>
                            {step.step_number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {step.type === 'sms'
                                ? <Badge variant="green">SMS</Badge>
                                : <Badge variant="blue">Email</Badge>}
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Day {step.delay_days}
                              </span>
                              {step.subject && (
                                <span className="text-xs text-white font-medium truncate">
                                  · {step.subject}
                                </span>
                              )}
                            </div>
                            <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                              {step.body.slice(0, 160)}{step.body.length > 160 ? '…' : ''}
                            </p>
                          </div>
                          <Pencil
                            size={13}
                            className="text-[var(--text-muted)] group-hover:text-purple-400 transition-colors flex-shrink-0 mt-0.5"
                          />
                        </button>
                      ))}
                    </div>

                    {/* Add Step button */}
                    <button
                      type="button"
                      onClick={() => setStepModal({ campaign, step: null })}
                      className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-white/20 text-xs text-[var(--text-secondary)] hover:border-purple-500/40 hover:text-white hover:bg-white/[0.03] transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={13} />
                      Add Step
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )
          })}

          {campaignsList.length === 0 && (
            <div className="text-center py-20 text-[var(--text-muted)] text-sm">
              No campaigns yet.{' '}
              <button
                className="text-purple-400 hover:underline"
                onClick={() => setCreateCampaignOpen(true)}
              >
                Create your first campaign →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Active enrollments ── */}
      {activeTab === 'active' && (
        <div className="space-y-2">
          {enrollments.length === 0 ? (
            <div className="text-center py-20 text-[var(--text-muted)] text-sm">
              No active enrollments. Enroll a lead in a campaign to get started.
            </div>
          ) : (
            enrollments.map((enrollment, i) => (
              <motion.div
                key={enrollment.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass rounded-xl p-4 flex items-center gap-4"
              >
                <Avatar name={enrollment.lead?.business_name || 'Unknown'} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{enrollment.lead?.business_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {enrollment.campaign?.name} · Step {enrollment.current_step} · Started {formatDate(enrollment.enrolled_at)}
                  </div>
                </div>
                <Badge variant={enrollment.status === 'active' ? 'green' : enrollment.status === 'paused' ? 'amber' : 'gray'}>
                  {enrollment.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={enrollment.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                  onClick={() => handlePause(enrollment.id, enrollment.status)}
                >
                  {enrollment.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Users size={13} />}
                  onClick={() => handleUnenroll(enrollment.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Unenroll
                </Button>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ── Stats tab ── */}
      {activeTab === 'stats' && (
        <GlassCard>
          <h3 className="font-semibold text-white mb-4">Campaign Performance</h3>
          <div className="space-y-4">
            {campaignsList.map(campaign => {
              const campEnrollments = enrollments.filter(e => e.campaign_id === campaign.id)
              return (
                <div key={campaign.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.03]">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{campaign.name}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {campEnrollments.length} total enrollments
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">
                      {campEnrollments.filter(e => e.status === 'active').length} active
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {campEnrollments.filter(e => e.status === 'completed').length} completed
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* ── Enroll modal ── */}
      <Modal open={!!enrollModal} onClose={() => { setEnrollModal(null); setEnrollLeadSearch(''); setSelectedLeadIds([]) }} title={`Enroll in: ${enrollModal?.name}`} size="sm">
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Select Leads ({selectedLeadIds.length})
              </label>
              {selectedLeadIds.length > 0 && (
                <button
                  onClick={() => setSelectedLeadIds([])}
                  className="text-xs text-purple-400 hover:text-purple-300"
                >
                  Clear all
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Search by business name, owner, or email..."
              value={enrollLeadSearch}
              onChange={e => setEnrollLeadSearch(e.target.value)}
              className="h-9 w-full rounded-xl px-3 text-sm bg-white/[0.04] border border-white/[0.08] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-purple-500/10 transition-all duration-200"
            />
            {/* Lead list with checkboxes */}
            <div className="max-h-64 overflow-y-auto rounded-xl bg-white/[0.04] border border-white/[0.08]">
              {leads
                .filter(l => l.business_name && l.owner_name)
                .filter(l => {
                  const search = enrollLeadSearch.toLowerCase()
                  return (
                    l.business_name?.toLowerCase().includes(search) ||
                    l.owner_name?.toLowerCase().includes(search) ||
                    l.email?.toLowerCase().includes(search)
                  )
                })
                .slice(0, 50)
                .map(l => (
                  <label
                    key={l.id}
                    className="flex items-start gap-3 px-3 py-2 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(l.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedLeadIds(prev => [...prev, l.id])
                        } else {
                          setSelectedLeadIds(prev => prev.filter(id => id !== l.id))
                        }
                      }}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{l.business_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {l.owner_name} · {l.email || 'no email'}
                      </div>
                    </div>
                  </label>
                ))}
              {leads.filter(l => l.business_name && l.owner_name).length === 0 && (
                <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  No valid leads available
                </div>
              )}
              {enrollLeadSearch && leads.filter(l => l.business_name && l.owner_name).filter(l => {
                const search = enrollLeadSearch.toLowerCase()
                return (
                  l.business_name?.toLowerCase().includes(search) ||
                  l.owner_name?.toLowerCase().includes(search) ||
                  l.email?.toLowerCase().includes(search)
                )
              }).length === 0 && (
                <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  No leads match "{enrollLeadSearch}"
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setEnrollModal(null); setEnrollLeadSearch(''); setSelectedLeadIds([]) }}>Cancel</Button>
            <Button variant="primary" loading={enrolling} onClick={handleEnroll} disabled={selectedLeadIds.length === 0}>
              Enroll {selectedLeadIds.length > 0 ? `(${selectedLeadIds.length})` : 'Leads'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Step edit / add modal ── */}
      {stepModal && (
        <CampaignStepModal
          key={stepModal.step?.id ?? 'new'}
          open={!!stepModal}
          onClose={() => setStepModal(null)}
          campaignId={stepModal.campaign.id}
          step={stepModal.step}
          nextStepNumber={stepModalNextNumber}
          onSave={saved => {
            handleStepSaved(stepModal.campaign.id, saved)
            setStepModal(null)
          }}
          onDelete={stepId => {
            handleStepDeleted(stepModal.campaign.id, stepId)
            setStepModal(null)
          }}
        />
      )}

      {/* ── Create campaign modal ── */}
      <CampaignCreateModal
        open={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        onCreated={handleCampaignCreated}
      />

      {/* ── Campaign detail modal ── */}
      <Modal
        open={!!campaignDetailModal}
        onClose={() => setCampaignDetailModal(null)}
        title={campaignDetailModal?.name}
        size="lg"
      >
        <div className="space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-2 border-b border-white/[0.06]">
            {(['all', 'active', 'paused', 'completed', 'unsubscribed'] as const).map(status => {
              const count = campaignDetailModal
                ? status === 'all'
                  ? enrollments.filter(e => e.campaign_id === campaignDetailModal.id).length
                  : enrollments.filter(e => e.campaign_id === campaignDetailModal.id && e.status === status).length
                : 0
              return (
                <button
                  key={status}
                  onClick={() => setCampaignDetailFilter(status)}
                  className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 ${
                    campaignDetailFilter === status
                      ? 'border-purple-500 text-white'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  {status} ({count})
                </button>
              )
            })}
          </div>

          {/* Enrollments list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {campaignDetailModal && enrollments
              .filter(e => e.campaign_id === campaignDetailModal.id)
              .filter(e => campaignDetailFilter === 'all' || e.status === campaignDetailFilter)
              .map(enrollment => (
                <div
                  key={enrollment.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {enrollment.lead?.business_name || 'Unknown'}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] flex gap-2">
                      <span>{enrollment.lead?.owner_name || 'No owner'}</span>
                      <span>·</span>
                      <span>Step {enrollment.current_step}</span>
                      <span>·</span>
                      <span>{formatDate(enrollment.enrolled_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <Badge variant={enrollment.status === 'active' ? 'green' : enrollment.status === 'paused' ? 'amber' : 'gray'}>
                      {enrollment.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => handleUnenroll(enrollment.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Unenroll"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

            {campaignDetailModal && enrollments.filter(e => e.campaign_id === campaignDetailModal.id).filter(e => campaignDetailFilter === 'all' || e.status === campaignDetailFilter).length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                No enrollments in this status
              </div>
            )}
          </div>

          {/* Close button */}
          <div className="flex justify-end gap-2 pt-4 border-t border-white/[0.06]">
            <Button variant="ghost" onClick={() => setCampaignDetailModal(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
