'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Columns3, MapPin, Mail, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Users },
  { href: '/kanban', label: 'Board', icon: Columns3 },
  { href: '/map', label: 'Map', icon: MapPin },
  { href: '/campaigns', label: 'Email', icon: Mail },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden flex items-center justify-around px-2 py-2 safe-bottom"
      style={{
        background: 'rgba(8,11,18,0.95)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all',
              active ? 'text-purple-400' : 'text-[var(--text-muted)]'
            )}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
