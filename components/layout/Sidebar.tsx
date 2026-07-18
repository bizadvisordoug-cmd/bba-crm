'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  BookUser,
  Columns3,
  Mail,
  Map,
  Calendar,
  Settings,
  LogOut,
  Zap,
  ChevronRight,
  DollarSign,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const BASE_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Users },
  { href: '/people', label: 'People', icon: BookUser },
  { href: '/kanban', label: 'Pipeline', icon: Columns3 },
  { href: '/tasks', label: 'My Tasks', icon: CheckCircle2 },
  { href: '/campaigns', label: 'Campaigns', icon: Mail },
]
const ADMIN_NAV = [{ href: '/crm/commissions', label: 'Commissions', icon: DollarSign }]
const REP_NAV   = [{ href: '/my-commissions',   label: 'My Commissions', icon: DollarSign }]
const TAIL_NAV  = [
  { href: '/map',      label: 'Map',      icon: Map },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  user?: { name: string; email: string; role: string; avatar_url?: string } | null
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = user?.role === 'owner' || user?.role === 'vp_operations'
  const navItems = [...BASE_NAV, ...(isAdmin ? ADMIN_NAV : REP_NAV), ...TAIL_NAV]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 z-40 flex-col"
      style={{
        background: 'rgba(8, 11, 18, 0.95)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="p-5 border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-3 group">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-white leading-tight">Breakthrough</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Business Advisors</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative',
                active
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.05]'
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.2)' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                />
              )}
              <Icon size={17} className={cn('relative z-10 flex-shrink-0', active && 'text-purple-400')} />
              <span className="relative z-10">{item.label}</span>
              {active && <ChevronRight size={14} className="relative z-10 ml-auto text-purple-400 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      {user && (
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl glass mb-1">
            <Avatar name={user.name} size="sm" src={user.avatar_url} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{user.name}</div>
              <div className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>
                {user.role.replace('_', ' ')}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}
