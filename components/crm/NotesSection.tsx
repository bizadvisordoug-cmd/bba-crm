'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

const NOTE_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
]

interface Note {
  id: string
  content: string
  note_type: string
  created_at: string
  user_id: string
}

export function NotesSection({ leadId, currentUserId }: { leadId: string; currentUserId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [newNoteType, setNewNoteType] = useState<string>('other')
  const [adding, setAdding] = useState(false)
  const supabase = createClient()

  const fetchNotes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
    setNotes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchNotes()
  }, [leadId])

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setAdding(true)
    try {
      await supabase.from('lead_notes').insert({
        lead_id: leadId,
        user_id: currentUserId,
        note_type: newNoteType,
        content: newNote,
      })
      setNewNote('')
      setNewNoteType('other')
      await fetchNotes()
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    await supabase.from('lead_notes').delete().eq('id', noteId)
    await fetchNotes()
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add Note Form */}
      <div className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex gap-2">
          <select
            value={newNoteType}
            onChange={e => setNewNoteType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-purple-500/50"
          >
            {NOTE_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <Textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note... (call log, site visit details, etc.)"
          className="min-h-[100px]"
        />
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={handleAddNote}
          loading={adding}
          disabled={!newNote.trim()}
        >
          Add Note
        </Button>
      </div>

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)] text-sm">
          <FileText size={32} className="mx-auto mb-2 opacity-30" />
          No notes yet. Add one above to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div key={note.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                      {NOTE_TYPES.find(t => t.value === note.note_type)?.label || note.note_type}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(note.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                    {note.content}
                  </p>
                </div>
                {note.user_id === currentUserId && (
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0 p-1"
                    title="Delete note"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
