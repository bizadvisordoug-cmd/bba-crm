'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase'
import { clearPOSSystemsCache } from '@/lib/pos-systems'

interface POSSystem {
  id: string
  name: string
  display_order: number
  active: boolean
}

export function POSSystemsPanel() {
  const supabase = createClient()
  const [systems, setSystems] = useState<POSSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newSystemName, setNewSystemName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadSystems()
  }, [])

  const loadSystems = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('pos_systems')
        .select('*')
        .order('display_order')

      if (err) throw err
      setSystems(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load POS systems')
    } finally {
      setLoading(false)
    }
  }

  const addSystem = async () => {
    if (!newSystemName.trim()) {
      setError('System name is required')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const maxOrder = Math.max(...systems.map(s => s.display_order), -1)
      const { error: err } = await supabase
        .from('pos_systems')
        .insert([{ name: newSystemName.trim(), display_order: maxOrder + 1, active: true }])

      if (err) throw err

      setNewSystemName('')
      clearPOSSystemsCache()
      await loadSystems()
      setSuccess('POS system added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add POS system')
    } finally {
      setSaving(false)
    }
  }

  const updateSystem = async (id: string, updates: Partial<POSSystem>) => {
    setError('')
    setSuccess('')

    try {
      const { error: err } = await supabase
        .from('pos_systems')
        .update(updates)
        .eq('id', id)

      if (err) throw err

      clearPOSSystemsCache()
      await loadSystems()
      setSuccess('POS system updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update POS system')
    }
  }

  const deleteSystem = async (id: string) => {
    if (!confirm('Delete this POS system?')) return

    setError('')
    setSuccess('')

    try {
      const { error: err } = await supabase
        .from('pos_systems')
        .delete()
        .eq('id', id)

      if (err) throw err

      clearPOSSystemsCache()
      await loadSystems()
      setSuccess('POS system deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete POS system')
    }
  }

  const moveSystem = async (index: number, direction: 'up' | 'down') => {
    const newSystems = [...systems]
    const [movedSystem] = newSystems.splice(index, 1)

    if (direction === 'up' && index > 0) {
      newSystems.splice(index - 1, 0, movedSystem)
    } else if (direction === 'down' && index < newSystems.length - 1) {
      newSystems.splice(index + 1, 0, movedSystem)
    } else {
      return
    }

    // Update display order for all systems
    const updates = newSystems.map((s, i) => ({
      ...s,
      display_order: i,
    }))

    try {
      for (const system of updates) {
        await supabase
          .from('pos_systems')
          .update({ display_order: system.display_order })
          .eq('id', system.id)
      }
      clearPOSSystemsCache()
      setSystems(updates)
      setSuccess('Order updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">POS Systems</h3>
        <p className="text-sm text-gray-400 mb-6">Manage available POS systems for lead qualification</p>

        {/* Add new system */}
        <div className="flex gap-2 mb-6">
          <Input
            placeholder="Add new POS system..."
            value={newSystemName}
            onChange={e => setNewSystemName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSystem()}
          />
          <Button onClick={addSystem} disabled={saving} size="sm">
            <Plus size={16} />
          </Button>
        </div>

        {/* Messages */}
        {error && <div className="p-3 bg-red-900/20 border border-red-500/50 rounded text-red-300 text-sm mb-4">{error}</div>}
        {success && <div className="p-3 bg-green-900/20 border border-green-500/50 rounded text-green-300 text-sm mb-4">{success}</div>}

        {/* Systems list */}
        {loading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : systems.length === 0 ? (
          <div className="text-gray-400 text-sm">No POS systems yet</div>
        ) : (
          <div className="space-y-2">
            {systems.map((system, idx) => (
              <div key={system.id} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                <GripVertical size={16} className="text-gray-500 cursor-move flex-shrink-0" />

                <div className="flex-1 flex items-center gap-3">
                  <Input
                    value={system.name}
                    onChange={e => updateSystem(system.id, { name: e.target.value })}
                    className="flex-1"
                  />
                </div>

                {/* Move buttons */}
                <div className="flex gap-1">
                  <Button
                    onClick={() => moveSystem(idx, 'up')}
                    disabled={idx === 0}
                    size="sm"
                    variant="ghost"
                    title="Move up"
                  >
                    ▲
                  </Button>
                  <Button
                    onClick={() => moveSystem(idx, 'down')}
                    disabled={idx === systems.length - 1}
                    size="sm"
                    variant="ghost"
                    title="Move down"
                  >
                    ▼
                  </Button>
                </div>

                {/* Delete button */}
                <Button
                  onClick={() => deleteSystem(system.id)}
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
