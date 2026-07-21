'use client'

import { useState } from 'react'
import { CreateTaskModal } from './CreateTaskModal'
import { EditTaskModal } from './EditTaskModal'

interface Task {
  id: string
  lead_id: string
  assigned_to: string
  title: string
  type: string
  due_date: string
  completed: boolean
  created_at: string
  lead?: { id: string; business_name: string }
  assigned_to_user?: { id: string; name: string }
}

interface Lead {
  id: string
  business_name: string
}

interface User {
  id: string
  name: string
}

interface TasksClientProps {
  tasks: Task[]
  leads: Lead[]
  users: User[]
  currentUserId: string
  isAdmin: boolean
}

export function TasksClient({
  tasks,
  leads,
  users,
  currentUserId,
  isAdmin,
}: TasksClientProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [allTasks, setAllTasks] = useState(tasks)

  const openCreateModal = () => setIsCreateModalOpen(true)
  const closeCreateModal = () => setIsCreateModalOpen(false)

  const openEditModal = (task: Task) => {
    setEditingTask(task)
    setIsEditModalOpen(true)
  }
  const closeEditModal = () => {
    setEditingTask(null)
    setIsEditModalOpen(false)
  }

  const handleTaskCreated = () => {
    setAllTasks(tasks)
    window.location.reload()
  }

  const handleTaskUpdated = () => {
    closeEditModal()
    window.location.reload()
  }

  const handleCompleteTask = async (taskId: string) => {
    const task = allTasks.find((t: any) => t.id === taskId)
    if (!task) return

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed }),
      })

      if (response.ok) {
        window.location.reload()
      }
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        window.location.reload()
      }
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  const incompleteTasks = allTasks.filter((t: any) => !t.completed)
  const completedTasks = allTasks.filter((t: any) => t.completed)

  const renderTaskTable = (taskList: any[], showCompleted: boolean) => (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="text-left p-4 font-semibold">Lead</th>
            <th className="text-left p-4 font-semibold">Title</th>
            <th className="text-left p-4 font-semibold">Type</th>
            <th className="text-left p-4 font-semibold">Due Date</th>
            <th className="text-left p-4 font-semibold">Assigned To</th>
            <th className="text-left p-4 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {taskList.map((task: any) => {
            const dueDateObj = new Date(task.due_date)
            const dueDateStr = dueDateObj.toLocaleDateString()
            const isOverdue = dueDateObj < new Date() && !task.completed
            const isToday = dueDateObj.toDateString() === new Date().toDateString()
            const dateClass = isOverdue ? 'text-red-600 font-semibold' : isToday ? 'text-orange-600 font-semibold' : ''

            return (
              <tr key={task.id} className={showCompleted ? 'border-b hover:bg-slate-50 opacity-60' : 'border-b hover:bg-slate-50'}>
                <td className="p-4 text-sm">{task.lead?.business_name || 'N/A'}</td>
                <td className={`p-4 text-sm ${showCompleted ? 'line-through' : 'font-medium'}`}>{task.title}</td>
                <td className="p-4 text-sm">{task.type}</td>
                <td className={`p-4 text-sm ${dateClass}`}>{dueDateStr}</td>
                <td className="p-4 text-sm">{task.assigned_to_user?.name || 'Unassigned'}</td>
                <td className="p-4 text-sm">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs rounded font-medium"
                    >
                      {showCompleted ? 'Reopen' : 'Complete'}
                    </button>
                    <button
                      onClick={() => openEditModal(task)}
                      className="px-3 py-1.5 bg-slate-600 text-white hover:bg-slate-700 text-xs rounded font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 text-xs rounded font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        leads={leads}
        users={users}
        onTaskCreated={handleTaskCreated}
      />
      <EditTaskModal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        task={editingTask}
        leads={leads}
        users={users}
        onTaskUpdated={handleTaskUpdated}
      />
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Tasks</h1>
            <p className="text-slate-600 mt-2">Manage your tasks and follow-ups</p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + New Task
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Active Tasks ({incompleteTasks.length})</h2>
          {incompleteTasks.length === 0 ? (
            <div className="rounded-lg border p-4 text-center text-slate-500">
              No active tasks
            </div>
          ) : (
            renderTaskTable(incompleteTasks, false)
          )}
        </div>

        {completedTasks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Completed Tasks ({completedTasks.length})</h2>
            {renderTaskTable(completedTasks, true)}
          </div>
        )}
      </div>
    </>
  )
}
