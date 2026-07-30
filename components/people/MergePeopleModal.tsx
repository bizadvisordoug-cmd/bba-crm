'use client'

import { useMemo, useState, useEffect } from 'react'
import { User, Phone, Mail, Building2, AlertTriangle, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import type { PersonWithBusinesses } from '@/components/people/PeopleDrawer'

interface MergePeopleModalProps {
  open: boolean
  people: PersonWithBusinesses[]           // the selected contacts (>= 2)
  onClose: () => void
  onMerged: (survivor: PersonWithBusinesses, removedIds: string[]) => void
}

type FieldKey = 'name' | 'phone' | 'email'
const FIELDS: { key: FieldKey; label: string; icon: typeof User }[] = [
  { key: 'name',  label: 'Name',  icon: User },
  { key: 'phone', label: 'Phone', icon: Phone },
  { key: 'email', label: 'Email', icon: Mail },
]

// Multiple chosen values are combined with this separator ("keep both").
const JOIN = ' / '

export function MergePeopleModal({ open, people, onClose, onMerged }: MergePeopleModalProps) {
  const infoScore = (p: PersonWithBusinesses) =>
    (p.phone ? 1 : 0) + (p.email ? 1 : 0) + (p.businesses?.length || 0)

  // Default primary = the most complete record, tie-broken by oldest.
  const defaultSurvivorId = useMemo(() => {
    return [...people].sort((a, b) =>
      infoScore(b) - infoScore(a) ||
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    )[0]?.id
  }, [people])

  const [survivorId, setSurvivorId] = useState(defaultSurvivorId)
  const [error, setError] = useState('')
  const [merging, setMerging] = useState(false)

  // Distinct non-empty candidate values per field, across all selected people.
  const candidates = useMemo(() => {
    const out: Record<FieldKey, string[]> = { name: [], phone: [], email: [] }
    for (const { key } of FIELDS) {
      const seen = new Map<string, string>()
      for (const p of people) {
        const raw = ((p as any)[key] || '').trim()
        if (!raw) continue
        const norm = key === 'email' ? raw.toLowerCase() : raw
        if (!seen.has(norm)) seen.set(norm, raw)
      }
      out[key] = [...seen.values()]
    }
    return out
  }, [people])

  // Chosen value(s) per field. Seed from the primary record whenever it changes.
  const [selected, setSelected] = useState<Record<FieldKey, Set<string>>>({ name: new Set(), phone: new Set(), email: new Set() })
  useEffect(() => {
    const survivor = people.find(p => p.id === survivorId)
    const next: Record<FieldKey, Set<string>> = { name: new Set(), phone: new Set(), email: new Set() }
    for (const { key } of FIELDS) {
      const own = ((survivor as any)?.[key] || '').trim()
      if (own) next[key] = new Set([own])
      else if (candidates[key].length) next[key] = new Set([candidates[key][0]])
    }
    setSelected(next)
  }, [survivorId, candidates, people])

  const toggle = (key: FieldKey, value: string) => {
    setSelected(prev => {
      const set = new Set(prev[key])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [key]: set }
    })
  }

  const resolvedValue = (key: FieldKey): string =>
    candidates[key].filter(v => selected[key].has(v)).join(JOIN)

  // Combined businesses that will end up on the survivor.
  const mergedBusinesses = useMemo(() => people.flatMap(p => p.businesses || []), [people])

  const survivor = people.find(p => p.id === survivorId)
  const nameResolved = resolvedValue('name').trim()

  const handleMerge = async () => {
    if (!survivor) return
    if (!nameResolved) { setError('Pick at least one value for Name.'); return }
    setMerging(true)
    setError('')
    try {
      const mergeIds = people.filter(p => p.id !== survivorId).map(p => p.id)
      const res = await fetch('/api/people/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survivorId,
          mergeIds,
          fields: { name: nameResolved, phone: resolvedValue('phone'), email: resolvedValue('email') },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Merge failed')
      const s = json.survivor
      onMerged({ ...s, phone: s.phone ?? null, email: s.email ?? null, businesses: s.businesses || [] }, mergeIds)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Merge ${people.length} Contacts`} size="lg">
      <div className="space-y-6">
        {/* Primary record */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Keep as primary record
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            This record is kept; the others are removed after their leads and businesses move onto it.
          </p>
          <div className="space-y-2">
            {people.map(p => {
              const active = p.id === survivorId
              return (
                <button
                  key={p.id}
                  onClick={() => setSurvivorId(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    active ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${active ? 'border-purple-400 bg-purple-500' : 'border-white/30'}`}>
                    {active && <Check size={11} className="text-white" />}
                  </div>
                  <Avatar name={p.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{p.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {[p.phone, p.email, `${p.businesses?.length || 0} biz`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Field resolution */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Resolve details
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Pick a value, or select more than one to keep both (combined with &ldquo;{JOIN.trim()}&rdquo;).
          </p>
          <div className="space-y-3">
            {FIELDS.map(({ key, label, icon: Icon }) => {
              const opts = candidates[key]
              return (
                <div key={key} className="flex items-start gap-3">
                  <div className="flex items-center gap-1.5 w-20 flex-shrink-0 pt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <Icon size={13} className="text-[var(--text-muted)]" />
                    <span className="text-xs">{label}</span>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {opts.length === 0 && (
                      <span className="text-xs py-1.5" style={{ color: 'var(--text-muted)' }}>— none —</span>
                    )}
                    {opts.map(v => {
                      const on = selected[key].has(v)
                      return (
                        <button
                          key={v}
                          onClick={() => toggle(key, v)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                            on ? 'border-purple-500/50 bg-purple-500/15 text-white' : 'border-white/[0.1] bg-white/[0.02] text-[var(--text-secondary)] hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'border-purple-400 bg-purple-500' : 'border-white/30'}`}>
                            {on && <Check size={9} className="text-white" />}
                          </span>
                          {v}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Businesses preview */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Combined businesses ({mergedBusinesses.length})
          </h3>
          {mergedBusinesses.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No businesses on these contacts.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {mergedBusinesses.map(b => (
                <span key={b.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]" style={{ color: 'var(--text-secondary)' }}>
                  <Building2 size={11} className="text-[var(--text-muted)]" />
                  {b.business_name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Result preview */}
        {survivor && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="text-[var(--text-muted)]">Result: </span>
            <span className="text-white font-medium">{nameResolved || '(name required)'}</span>
            {resolvedValue('phone') && <> · {resolvedValue('phone')}</>}
            {resolvedValue('email') && <> · {resolvedValue('email')}</>}
            {` · ${mergedBusinesses.length} business${mergedBusinesses.length !== 1 ? 'es' : ''}`}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs px-1" style={{ color: 'var(--text-muted)' }}>
          <AlertTriangle size={13} className="text-amber-400/80 flex-shrink-0" />
          {people.length - 1} duplicate{people.length - 1 !== 1 ? 's' : ''}{' '}will be permanently removed. This can&rsquo;t be undone.
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={merging}>Cancel</Button>
          <Button type="button" variant="primary" loading={merging} onClick={handleMerge}>
            Merge {people.length} → 1
          </Button>
        </div>
      </div>
    </Modal>
  )
}
