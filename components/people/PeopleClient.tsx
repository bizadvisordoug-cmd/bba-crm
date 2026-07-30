'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Mail, Phone, Building2, GitMerge, Check, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { Avatar } from '@/components/ui/Avatar'
import { PeopleDrawer, type PersonWithBusinesses } from '@/components/people/PeopleDrawer'
import { PersonFormModal } from '@/components/people/PersonFormModal'
import { MergePeopleModal } from '@/components/people/MergePeopleModal'

interface PeopleClientProps {
  people: PersonWithBusinesses[]
  currentUserId: string
  isAdmin: boolean
}

export function PeopleClient({ people: initialPeople, isAdmin }: PeopleClientProps) {
  const [people, setPeople] = useState<PersonWithBusinesses[]>(initialPeople)
  const [search, setSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<PersonWithBusinesses | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // Multi-select + merge
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMerge, setShowMerge] = useState(false)

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowMerge(false)
  }

  const peopleToMerge = people.filter(p => selectedIds.has(p.id))

  const handleMerged = (survivor: PersonWithBusinesses, removedIds: string[]) => {
    setPeople(prev => prev
      .filter(p => !removedIds.includes(p.id))
      .map(p => p.id === survivor.id ? survivor : p))
    exitSelectMode()
  }

  const filtered = useMemo(() => {
    return people.filter(p => {
      const q = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.phone?.toLowerCase().includes(q)) ||
        (p.email?.toLowerCase().includes(q))
      )
    })
  }, [people, search])

  const handlePersonCreate = (newPerson: PersonWithBusinesses) => {
    setPeople(prev => [newPerson, ...prev])
    setShowAddModal(false)
  }

  const handlePersonUpdate = (updated: PersonWithBusinesses) => {
    setPeople(prev => prev.map(p => p.id === updated.id ? updated : p))
    setSelectedPerson(updated)
  }

  const handlePersonDelete = (personId: string) => {
    setPeople(prev => prev.filter(p => p.id !== personId))
    setSelectedPerson(null)
  }

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={`${filtered.length} of ${people.length} contacts`}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              selectMode ? (
                <Button variant="ghost" size="sm" icon={<X size={15} />} onClick={exitSelectMode}>
                  Cancel
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={<GitMerge size={15} />} onClick={() => setSelectMode(true)}>
                  Select &amp; Merge
                </Button>
              )
            )}
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setShowAddModal(true)}>
              Add Contact
            </Button>
          </div>
        }
      />

      {/* Search */}
      <GlassCard animate={false} className="mb-6 p-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full h-9 pl-9 pr-4 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
      </GlassCard>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-[var(--text-muted)] text-sm">
            No contacts found.{' '}
            <button className="text-purple-400 hover:underline" onClick={() => setShowAddModal(true)}>
              Add your first contact →
            </button>
          </div>
        )}
        {filtered.map((person, i) => (
          <motion.div
            key={person.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            onClick={() => selectMode ? toggleSelected(person.id) : setSelectedPerson(person)}
            className={`glass rounded-xl p-4 cursor-pointer transition-colors group ${
              selectMode && selectedIds.has(person.id)
                ? 'ring-2 ring-purple-500/60 bg-purple-500/[0.06]'
                : 'hover:bg-white/[0.06]'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                {selectMode && (
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                    selectedIds.has(person.id) ? 'border-purple-400 bg-purple-500' : 'border-white/30'
                  }`}>
                    {selectedIds.has(person.id) && <Check size={13} className="text-white" />}
                  </span>
                )}
                <Avatar name={person.name} size="md" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate group-hover:text-purple-300 transition-colors">{person.name}</h3>
                  {person.email && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {person.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-1.5 mb-4">
              {person.phone && (
                <a
                  href={`tel:${person.phone}`}
                  className="flex items-center gap-2 text-xs hover:text-purple-400 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Phone size={12} />
                  {person.phone}
                </a>
              )}
            </div>

            {/* Businesses */}
            {person.businesses && person.businesses.length > 0 && (
              <div className="pt-3 border-t border-white/[0.06]">
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  {person.businesses.length} Business{person.businesses.length !== 1 ? 'es' : ''}
                </p>
                <div className="space-y-1">
                  {person.businesses.slice(0, 3).map(biz => (
                    <div key={biz.id} className="flex items-start gap-2 text-xs">
                      <Building2 size={12} className="mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-white truncate">{biz.business_name}</div>
                        {biz.industry && (
                          <div style={{ color: 'var(--text-muted)' }} className="truncate">
                            {biz.industry}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {person.businesses.length > 3 && (
                    <p className="text-[10px] text-purple-400 pt-1">+{person.businesses.length - 3} more</p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Floating merge bar */}
      <AnimatePresence>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl glass-strong border border-white/[0.1] shadow-2xl"
          >
            <span className="text-sm text-white">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-[var(--text-muted)] hover:text-white transition-colors"
            >
              Clear
            </button>
            <Button
              variant="primary"
              size="sm"
              icon={<GitMerge size={14} />}
              disabled={selectedIds.size < 2}
              onClick={() => setShowMerge(true)}
            >
              Merge
            </Button>
            {selectedIds.size < 2 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Select 2+ to merge</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      {showMerge && peopleToMerge.length >= 2 && (
        <MergePeopleModal
          open={showMerge}
          people={peopleToMerge}
          onClose={() => setShowMerge(false)}
          onMerged={handleMerged}
        />
      )}

      <PersonFormModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreate={handlePersonCreate}
      />

      {selectedPerson && (
        <PeopleDrawer
          person={selectedPerson}
          open={!!selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onUpdate={handlePersonUpdate}
          onDelete={handlePersonDelete}
          onViewLead={() => {
            // Close the PeopleDrawer when viewing a lead detail
            // Parent (People page) should handle navigating to the CRM or opening LeadDrawer
            setSelectedPerson(null)
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
