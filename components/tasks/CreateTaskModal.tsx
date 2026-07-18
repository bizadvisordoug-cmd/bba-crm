'use client'

import { useState } from 'react'

interface Lead {
  id: string
  business_name: string
}

interface User {
  id: string
  name: string
}

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  leads: Lead[]
  users: User[]
  onTaskCreated: () => void
}

export function CreateTaskModal({
  isOpen,
  onClose,
  leads,
  users,
  onTaskCreated,
}: CreateTaskModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const taskData = {
      lead_id: formData.get('lead_id'),
      assigned_to: formData.get('assigned_to'),
      title: formData.get('title'),
      type: formData.get('type'),
      due_date: formData.get('due_date'),
    }

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      })

      if (!response.ok) {
        setError('Failed to create task')
        return
      }

      onTaskCreated()
      onClose()
      e.currentTarget.reset()
    } catch (err) {
      setError('An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-slate-900">Create New Task</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-900">Lead</label>
            <select
              name="lead_id"
              required
              className="w-full border border-slate-300 rounded p-2 text-sm text-slate-900 bg-white"
            >
              <option value="">Select a lead...</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.business_name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-900">Title</label>
            <input
              type="text"
              name="title"
              required
              placeholder="Task title"
              className="w-full border border-slate-300 rounded p-2 text-sm text-slate-900 bg-white placeholder-slate-400"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-900">Type</label>
            <select
              name="type"
              required
              className="w-full border border-slate-300 rounded p-2 text-sm text-slate-900 bg-white"
              defaultValue="Follow Up"
            >
              <option>Call</option>
              <option>Email</option>
              <option>Follow Up</option>
              <option>Meeting</option>
              <option>Other</option>
            </select>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-900">Due Date</label>
            <input
              type="datetime-local"
              name="due_date"
              required
              className="w-full border border-slate-300 rounded p-2 text-sm text-slate-900 bg-white"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-900">Assign To</label>
            <select
              name="assigned_to"
              required
              className="w-full border border-slate-300 rounded p-2 text-sm text-slate-900 bg-white"
            >
              <option value="">Select a person...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
