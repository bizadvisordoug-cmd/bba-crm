import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { AmbientBackground } from '@/components/ui/AmbientBackground'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('name, email, role, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <AmbientBackground />
      <Sidebar user={profile} />
      {/* Spacer that mirrors the fixed sidebar width so main content is never under it */}
      <div className="hidden lg:block flex-shrink-0" style={{ width: '15rem' }} />
      <MobileNav />
      <main className="relative z-10 flex-1 min-w-0 min-h-screen pb-24 lg:pb-0">
        <div className="max-w-screen-2xl mx-auto p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
