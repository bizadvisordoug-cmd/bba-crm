'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2, ImageIcon, Upload, X, Lock, Unlock, Move } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase'

const TOKENS = ['[FirstName]', '[BusinessName]', '[RepName]', '[SystemName]']
const HEADER_MAX_W = 600
const BODY_MAX_W   = 560

// ── Resize handle ──────────────────────────────────────────────────────────────
// Dragging right = wider, left = narrower. Fires onResize(newWidth) continuously.
interface ResizeHandleProps {
  currentWidth: number
  minWidth?: number
  maxWidth?: number
  onResize: (w: number) => void
}

function ResizeHandle({ currentWidth, minWidth = 80, maxWidth = HEADER_MAX_W, onResize }: ResizeHandleProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX   = e.clientX
    const startW   = currentWidth
    const onMove   = (ev: MouseEvent) => {
      const next = Math.round(Math.max(minWidth, Math.min(maxWidth, startW + ev.clientX - startX)))
      onResize(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [currentWidth, minWidth, maxWidth, onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      title="Drag to resize"
      className="absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center cursor-se-resize rounded-tl-md opacity-0 group-hover:opacity-100 transition-opacity select-none z-10"
      style={{ background: 'rgba(124,58,237,0.85)' }}
    >
      <Move size={10} className="text-white rotate-45" />
    </div>
  )
}

// ── Image dimension row ────────────────────────────────────────────────────────
interface DimRowProps {
  width: number
  height: number
  lockRatio: boolean
  maxWidth?: number
  onWidthChange: (w: number) => void
  onHeightChange: (h: number) => void
  onLockToggle: () => void
  heightReadOnly?: boolean
}

function DimRow({ width, height, lockRatio, maxWidth = HEADER_MAX_W, onWidthChange, onHeightChange, onLockToggle, heightReadOnly }: DimRowProps) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>W</span>
        <input
          type="number"
          min={80}
          max={maxWidth}
          value={width}
          onChange={e => onWidthChange(Math.max(80, Math.min(maxWidth, Number(e.target.value) || 80)))}
          className="w-16 h-7 px-2 text-xs rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-purple-500/50 text-center"
        />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>px</span>
      </div>
      <button
        type="button"
        onClick={onLockToggle}
        title={lockRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
        className="p-1 rounded-md transition-colors hover:bg-white/[0.08]"
        style={{ color: lockRatio ? '#a78bfa' : 'var(--text-muted)' }}
      >
        {lockRatio ? <Lock size={12} /> : <Unlock size={12} />}
      </button>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>H</span>
        <input
          type="number"
          min={20}
          value={height}
          readOnly={heightReadOnly || lockRatio}
          onChange={e => !lockRatio && onHeightChange(Math.max(20, Number(e.target.value) || 20))}
          className="w-16 h-7 px-2 text-xs rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-purple-500/50 text-center disabled:opacity-50"
          style={{ opacity: lockRatio ? 0.5 : 1 }}
        />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>px</span>
      </div>
      {lockRatio && (
        <span className="text-[10px] text-purple-400 ml-1">locked</span>
      )}
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Step {
  id: string
  campaign_id: string
  step_number: number
  type: 'email' | 'sms'
  delay_days: number
  subject?: string | null
  body: string
  header_image_url?: string | null
  header_image_width?: number | null
}

interface PendingBodyImg {
  url: string
  naturalW: number
  naturalH: number
  displayW: number
  displayH: number
  lockRatio: boolean
}

interface CampaignStepModalProps {
  open: boolean
  onClose: () => void
  campaignId: string
  step?: Step | null
  nextStepNumber?: number
  onSave: (step: Step) => void
  onDelete?: (stepId: string) => void
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CampaignStepModal({
  open, onClose, campaignId, step, nextStepNumber = 1, onSave, onDelete,
}: CampaignStepModalProps) {
  const supabase = createClient()
  const isEdit = !!step

  const [form, setForm] = useState({
    type:               (step?.type ?? 'email') as 'email' | 'sms',
    delay_days:         step?.delay_days ?? 0,
    subject:            step?.subject ?? '',
    body:               step?.body ?? '',
    header_image_url:   step?.header_image_url ?? '',
    header_image_width: step?.header_image_width ?? HEADER_MAX_W,
  })

  // Natural pixel dimensions of the uploaded header image
  const [headerNatural, setHeaderNatural] = useState({ w: 0, h: 0 })
  // Derived display height (from aspect ratio)
  const headerDisplayH = headerNatural.w > 0
    ? Math.round(form.header_image_width / headerNatural.w * headerNatural.h)
    : 0

  // Body image being configured before insertion
  const [pendingBodyImg, setPendingBodyImg] = useState<PendingBodyImg | null>(null)

  const [saving, setSaving]               = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]                 = useState('')
  const [uploadingHeader, setUploadingHeader]   = useState(false)
  const [uploadingBodyImg, setUploadingBodyImg] = useState(false)

  const bodyRef          = useRef<HTMLTextAreaElement>(null)
  const subjectRef       = useRef<HTMLInputElement>(null)
  const headerImgInput   = useRef<HTMLInputElement>(null)
  const bodyImgInput     = useRef<HTMLInputElement>(null)
  const lastFocusRef     = useRef<'subject' | 'body'>('body')
  const bodySelectionRef = useRef({ start: 0, end: 0 })

  // Reset form and detect natural dims when modal opens or step changes
  useEffect(() => {
    if (!open) return
    const nextForm = {
      type:               step?.type ?? 'email' as 'email' | 'sms',
      delay_days:         step?.delay_days ?? 0,
      subject:            step?.subject ?? '',
      body:               step?.body ?? '',
      header_image_url:   step?.header_image_url ?? '',
      header_image_width: step?.header_image_width ?? HEADER_MAX_W,
    }
    setForm(nextForm)
    setConfirmDelete(false)
    setError('')
    setPendingBodyImg(null)
    setHeaderNatural({ w: 0, h: 0 })

    if (nextForm.header_image_url) {
      const img = new window.Image()
      img.onload = () => setHeaderNatural({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = nextForm.header_image_url
    }
  }, [open, step])

  // Detect natural dims when a new header is uploaded
  useEffect(() => {
    if (!form.header_image_url) { setHeaderNatural({ w: 0, h: 0 }); return }
    const img = new window.Image()
    img.onload = () => setHeaderNatural({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = form.header_image_url
  }, [form.header_image_url])

  const set = (k: string, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }))

  // ── Token insertion ──────────────────────────────────────────────────────────

  const insertToken = (token: string) => {
    const target = lastFocusRef.current === 'subject' ? subjectRef.current : bodyRef.current
    if (!target) return
    const s = target.selectionStart ?? target.value.length
    const e = target.selectionEnd ?? target.value.length
    const next = target.value.slice(0, s) + token + target.value.slice(e)
    if (lastFocusRef.current === 'subject') {
      setForm(f => ({ ...f, subject: next }))
    } else {
      setForm(f => ({ ...f, body: next }))
    }
    requestAnimationFrame(() => {
      target.setSelectionRange(s + token.length, s + token.length)
      target.focus()
    })
  }

  // ── Image uploads ────────────────────────────────────────────────────────────

  const uploadImage = async (file: File, folder: 'headers' | 'body') => {
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('email-images').upload(path, file, { upsert: false })
    if (upErr) throw upErr
    return supabase.storage.from('email-images').getPublicUrl(path).data.publicUrl
  }

  const handleHeaderImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingHeader(true)
    setError('')
    try {
      const url = await uploadImage(file, 'headers')
      setForm(f => ({ ...f, header_image_url: url, header_image_width: HEADER_MAX_W }))
    } catch {
      setError('Header image upload failed — check the email-images bucket exists.')
    } finally {
      setUploadingHeader(false)
    }
  }

  const handleBodyImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    // Snapshot cursor before the file dialog stole focus
    const { start, end } = bodySelectionRef.current
    bodySelectionRef.current = { start, end }
    setUploadingBodyImg(true)
    setError('')
    try {
      const url = await uploadImage(file, 'body')
      // Detect natural dims
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new window.Image()
        el.onload = () => res(el)
        el.onerror = rej
        el.src = url
      })
      const naturalW = img.naturalWidth  || BODY_MAX_W
      const naturalH = img.naturalHeight || 300
      const displayW = Math.min(naturalW, BODY_MAX_W)
      const displayH = Math.round(displayW / naturalW * naturalH)
      setPendingBodyImg({ url, naturalW, naturalH, displayW, displayH, lockRatio: true })
    } catch {
      setError('Body image upload failed — check the email-images bucket exists.')
    } finally {
      setUploadingBodyImg(false)
    }
  }

  const insertPendingBodyImg = () => {
    if (!pendingBodyImg) return
    const { url, displayW, displayH, lockRatio } = pendingBodyImg
    const heightStyle = lockRatio ? 'height:auto' : `height:${displayH}px`
    const tag = `<img src="${url}" alt="" style="width:${displayW}px;${heightStyle};max-width:100%;display:block;margin:12px 0;">`
    const { start, end } = bodySelectionRef.current
    setForm(f => {
      const body = f.body
      const next = body.slice(0, start) + '\n' + tag + '\n' + body.slice(end)
      return { ...f, body: next }
    })
    setPendingBodyImg(null)
    requestAnimationFrame(() => {
      const newPos = start + tag.length + 2
      bodyRef.current?.setSelectionRange(newPos, newPos)
      bodyRef.current?.focus()
    })
  }

  // Pending body image resize helpers
  const setPendingW = (w: number) => {
    setPendingBodyImg(p => {
      if (!p) return p
      const h = p.lockRatio ? Math.round(w / p.naturalW * p.naturalH) : p.displayH
      return { ...p, displayW: w, displayH: h }
    })
  }
  const setPendingH = (h: number) => {
    setPendingBodyImg(p => p ? { ...p, displayH: h } : p)
  }
  const togglePendingLock = () => {
    setPendingBodyImg(p => {
      if (!p) return p
      const lockRatio = !p.lockRatio
      const displayH  = lockRatio ? Math.round(p.displayW / p.naturalW * p.naturalH) : p.displayH
      return { ...p, lockRatio, displayH }
    })
  }

  // ── Save / Delete ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.body.trim()) { setError('Body / message is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        type:       form.type,
        delay_days: Number(form.delay_days),
        subject:    form.type === 'email' ? (form.subject || null) : null,
        body:       form.body,
      }

      // Guard columns added by later migrations — include only if already present
      const urlColumnExists   = isEdit && step != null && 'header_image_url'   in step
      const widthColumnExists = isEdit && step != null && 'header_image_width'  in step

      if (form.type === 'email' && (urlColumnExists || !!form.header_image_url)) {
        payload.header_image_url = form.header_image_url || null
      }
      if (form.type === 'email' && (widthColumnExists || form.header_image_width !== HEADER_MAX_W)) {
        payload.header_image_width = form.header_image_width || null
      }

      if (isEdit) {
        const { error: err } = await supabase.from('campaign_steps').update(payload).eq('id', step!.id)
        if (err) throw err
        onSave({ ...step!, ...payload } as Step)
      } else {
        const { data, error: err } = await supabase
          .from('campaign_steps')
          .insert({ campaign_id: campaignId, step_number: nextStepNumber, ...payload })
          .select('id')
          .single()
        if (err) throw err
        onSave({ id: data.id, campaign_id: campaignId, step_number: nextStepNumber, ...payload } as Step)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      const { error: err } = await supabase.from('campaign_steps').delete().eq('id', step!.id)
      if (err) throw err
      onDelete?.(step!.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit Step ${step?.step_number}` : 'Add New Step'}
      size="xl"
    >
      <div className="space-y-4">

        {/* Type + delay */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Type</label>
            <div className="flex rounded-xl overflow-hidden border border-white/[0.08]">
              {(['email', 'sms'] as const).map(t => (
                <button key={t} type="button" onClick={() => set('type', t)}
                  className={`flex-1 py-2 text-sm font-medium transition-all ${
                    form.type === t ? 'bg-purple-600/30 text-purple-300' : 'text-[var(--text-secondary)] hover:bg-white/[0.04]'
                  }`}>
                  {t === 'email' ? 'Email' : 'SMS'}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Send on Day"
            type="number"
            min={0}
            value={form.delay_days}
            onChange={e => set('delay_days', parseInt(e.target.value) || 0)}
            hint="Days after enrollment (0 = immediately)"
          />
        </div>

        {/* ── Email-only ── */}
        {form.type === 'email' && (
          <>
            {/* Subject */}
            <Input
              ref={subjectRef}
              label="Subject Line"
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              onFocus={() => { lastFocusRef.current = 'subject' }}
              placeholder="e.g. Quick question about your payment processing…"
            />

            {/* Header image */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Email Header Image
                <span className="ml-1.5 font-normal" style={{ color: 'var(--text-muted)' }}>
                  — full-width banner at the top of the email (optional)
                </span>
              </label>

              <input ref={headerImgInput} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={handleHeaderImageChange} />

              {form.header_image_url ? (
                <div className="space-y-2">
                  {/* Preview */}
                  <div className="relative group rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]"
                    style={{ maxHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={form.header_image_url}
                      alt="Email header"
                      style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }}
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
                      <button type="button" onClick={() => headerImgInput.current?.click()}
                        className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors pointer-events-auto">
                        Change
                      </button>
                      <button type="button" onClick={() => setForm(f => ({ ...f, header_image_url: '' }))}
                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors pointer-events-auto">
                        <X size={14} />
                      </button>
                    </div>
                    {/* Resize handle */}
                    <ResizeHandle
                      currentWidth={form.header_image_width}
                      maxWidth={HEADER_MAX_W}
                      onResize={w => set('header_image_width', w)}
                    />
                  </div>

                  {/* Dimension controls */}
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Width</span>
                      <input
                        type="number"
                        min={100}
                        max={HEADER_MAX_W}
                        value={form.header_image_width}
                        onChange={e => set('header_image_width', Math.max(100, Math.min(HEADER_MAX_W, Number(e.target.value) || 100)))}
                        className="w-16 h-7 px-2 text-xs rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-purple-500/50 text-center"
                      />
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>px</span>
                    </div>
                    <Lock size={11} className="text-purple-400" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Height</span>
                      <input
                        type="number"
                        value={headerDisplayH || '—'}
                        readOnly
                        className="w-16 h-7 px-2 text-xs rounded-lg bg-white/[0.03] border border-white/[0.06] text-center"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>px</span>
                    </div>
                    <span className="text-[10px] text-purple-400">
                      {form.header_image_width}/{headerDisplayH || '?'}px · drag corner to resize
                    </span>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => headerImgInput.current?.click()} disabled={uploadingHeader}
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-white/20 hover:border-purple-500/40 hover:bg-white/[0.02] transition-all text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-50">
                  {uploadingHeader
                    ? <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    : <ImageIcon size={22} />
                  }
                  <span className="text-xs">{uploadingHeader ? 'Uploading…' : 'Click to upload header image'}</span>
                  <span className="text-[10px]">JPG, PNG, GIF, WebP · recommended 600×200 px</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Body */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {form.type === 'email' ? 'Email Body' : 'SMS Message'}
              {form.type === 'email' && (
                <span className="ml-1.5 font-normal" style={{ color: 'var(--text-muted)' }}>
                  — plain text + images
                </span>
              )}
            </label>
            {form.type === 'email' && (
              <>
                <input ref={bodyImgInput} type="file" accept=".jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={handleBodyImageChange} />
                <button
                  type="button"
                  onClick={() => {
                    // snapshot cursor before dialog opens
                    if (bodyRef.current) {
                      bodySelectionRef.current = {
                        start: bodyRef.current.selectionStart ?? bodyRef.current.value.length,
                        end:   bodyRef.current.selectionEnd   ?? bodyRef.current.value.length,
                      }
                    }
                    bodyImgInput.current?.click()
                  }}
                  disabled={uploadingBodyImg || !!pendingBodyImg}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-50"
                >
                  {uploadingBodyImg
                    ? <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                    : <ImageIcon size={12} />
                  }
                  {uploadingBodyImg ? 'Uploading…' : 'Insert Image'}
                </button>
              </>
            )}
          </div>

          {/* Body image configurator — appears between toolbar and textarea */}
          {pendingBodyImg && (
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-purple-300">Configure image before inserting</p>
                <button type="button" onClick={() => setPendingBodyImg(null)}
                  className="p-1 rounded-lg hover:bg-white/[0.06] transition-colors" style={{ color: 'var(--text-muted)' }}>
                  <X size={13} />
                </button>
              </div>

              {/* Preview with resize handle */}
              <div className="flex justify-center">
                <div className="relative group inline-block" style={{ maxWidth: '100%' }}>
                  <img
                    src={pendingBodyImg.url}
                    alt="Preview"
                    style={{
                      width: Math.min(pendingBodyImg.displayW, 480),
                      height: pendingBodyImg.lockRatio
                        ? 'auto'
                        : Math.round(Math.min(pendingBodyImg.displayW, 480) / pendingBodyImg.displayW * pendingBodyImg.displayH),
                      display: 'block',
                      borderRadius: 8,
                      objectFit: 'contain',
                    }}
                  />
                  <ResizeHandle
                    currentWidth={pendingBodyImg.displayW}
                    maxWidth={BODY_MAX_W}
                    onResize={setPendingW}
                  />
                </div>
              </div>

              {/* Dimension inputs */}
              <DimRow
                width={pendingBodyImg.displayW}
                height={pendingBodyImg.displayH}
                lockRatio={pendingBodyImg.lockRatio}
                maxWidth={BODY_MAX_W}
                onWidthChange={setPendingW}
                onHeightChange={setPendingH}
                onLockToggle={togglePendingLock}
              />

              <div className="flex gap-2 pt-1">
                <Button variant="primary" size="sm" onClick={insertPendingBodyImg}>
                  Insert into email
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendingBodyImg(null)}>
                  Cancel
                </Button>
                <span className="ml-auto text-[10px] self-center" style={{ color: 'var(--text-muted)' }}>
                  {pendingBodyImg.displayW} × {pendingBodyImg.lockRatio
                    ? Math.round(pendingBodyImg.displayW / pendingBodyImg.naturalW * pendingBodyImg.naturalH)
                    : pendingBodyImg.displayH} px
                </span>
              </div>
            </div>
          )}

          <textarea
            ref={bodyRef}
            value={form.body}
            onChange={e => set('body', e.target.value)}
            onFocus={() => { lastFocusRef.current = 'body' }}
            onBlur={e => {
              bodySelectionRef.current = {
                start: e.target.selectionStart ?? e.target.value.length,
                end:   e.target.selectionEnd   ?? e.target.value.length,
              }
            }}
            rows={12}
            placeholder={
              form.type === 'email'
                ? 'Hi [FirstName],\n\nI wanted to reach out about [BusinessName]…'
                : 'Hi [FirstName], this is [RepName] from [SystemName]…'
            }
            className="w-full rounded-xl px-3 py-2.5 text-sm resize-y bg-white/[0.04] border border-white/[0.08] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all font-mono leading-relaxed"
          />
        </div>

        {/* Token helper */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Personalization tokens — click to insert at cursor:
          </p>
          <div className="flex flex-wrap gap-2">
            {TOKENS.map(t => (
              <button key={t} type="button" onClick={() => insertToken(t)}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors">
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <div>
            {isEdit && (
              <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handleDelete} loading={deleting}>
                {confirmDelete ? 'Confirm Delete' : 'Delete Step'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              {isEdit ? 'Save Changes' : 'Add Step'}
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
