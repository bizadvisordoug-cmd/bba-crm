import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS entirely. Server-only: never import this
// from a 'use client' component. SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_
// prefix so Next.js won't inline it into client bundles, but treat it as a
// secret regardless.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key'
  return createClient(url, key, { auth: { persistSession: false } })
}
