'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit3, Trash2, GripVertical, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase'

interface PipelineStage {
  id: number
  name: string
  order: number
}

export function PipelineStagesPanel() {
  const supabase = createClient()
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newStageName, setNewStageName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<number | null>(null)

  useEffect(() => {
    fetchStages()
  }, [])

  const fetchStages = async () => {
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('pipeline_stages')
        .select('*')
        .order('order', { ascending: true })

      if (err) throw err
      setStages(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stages')
    } finally {
      setLoading(false)
    }
  }

  const handleAddStage = async () => {
    if (!newStageName.trim()) return

    setSaving(true)
    setError('')
    try {
      const maxOrder = stages.length > 0 ? Math.max(...stages.map(s => s.order)) : 0
      const { error: err } = await supabase
        .from('pipeline_stages')
        .insert({
          name: newStageName.trim(),
          order: maxOrder + 1,
        })

      if (err) throw err
      setNewStageName('')
      await fetchStages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stage')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStage = async (id: number, newName: string) => {
    if (!newName.trim()) return

    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('pipeline_stages')
        .update({ name: newName.trim() })
        .eq('id', id)

      if (err) throw err
      setEditingId(null)
      await fetchStages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stage')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStage = async (id: number) => {
    if (!window.confirm('Are you sure? This cannot be undone.')) return

    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id)

      if (err) throw err
      await fetchStages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete stage')
    } finally {
      setSaving(false)
    }
  }

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    const newStages = [...stages]
    const [movedStage] = newStages.splice(fromIndex, 1)
    newStages.splice(toIndex, 0, movedStage)

    // Update order values
    setSaving(true)
    setError('')
    try {
      for (let i = 0; i < newStages.length; i++) {
        const { error: err } = await supabase
          .from('pipeline_stages')
          .update({ order: i + 1 })
          .eq('id', newStages[i].id)

        if (err) throw err
      }
      await fetchStages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder stages')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400">Loading pipeline stages...</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add New Stage */}
      <div className="p-4 rounded-lg border border-white/10 bg-white/[0.03]">
        <h3 className="text-sm font-semibold text-white mb-3">Add Pipeline Stage</h3>
        <div className="flex gap-2">
          <Input
            value={newStageName}
            onChange={e => setNewStageName(e.target.value)}
            placeholder="New stage name (e.g., 'Demo Scheduled')"
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddStage()
            }}
          />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleAddStage}
            disabled={!newStageName.trim() || saving}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Pipeline Stages List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Pipeline Stages</h3>
        <div className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-2">
          {stages.length === 0 ? (
            <p className="text-xs text-gray-500 p-3 text-center">No pipeline stages configured.</p>
          ) : (
            stages.map((stage, index) => (
              <div
                key={stage.id}
                draggable
                onDragStart={() => setDraggingId(stage.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (draggingId !== null && draggingId !== stage.id) {
                    const fromIndex = stages.findIndex(s => s.id === draggingId)
                    handleReorder(fromIndex, index)
                  }
                  setDraggingId(null)
                }}
                onDragEnd={() => setDraggingId(null)}
                className={`flex items-center gap-2 p-3 rounded-lg transition-all ${
                  draggingId === stage.id
                    ? 'bg-purple-500/20 opacity-50'
                    : 'hover:bg-white/[0.05]'
                } cursor-grab active:cursor-grabbing`}
              >
                <GripVertical size={14} className="text-gray-600 flex-shrink-0" />

                {editingId === stage.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateStage(stage.id, editingName)}
                      disabled={saving}
                      className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 transition-colors"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-white">{stage.name}</span>
                    <span className="text-xs text-gray-500 px-2 py-1 rounded bg-white/5">
                      #{stage.order}
                    </span>
                    <button
                      onClick={() => {
                        setEditingId(stage.id)
                        setEditingName(stage.name)
                      }}
                      className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteStage(stage.id)}
                      disabled={saving}
                      className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        💡 Drag stages to reorder them. They appear in this order throughout the CRM.
      </p>
    </div>
  )
}
