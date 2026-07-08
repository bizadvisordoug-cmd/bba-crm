import { createClient } from '@/lib/supabase'

const FALLBACK_POS_SYSTEMS = ['Shift4 Dine', 'Stackably', 'Clover', 'Dejavoo', 'Spot On', 'Basic Terminal']
let cachedSystems: string[] | null = null
let cacheTime = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function getPOSSystems(): Promise<string[]> {
  const now = Date.now()

  // Return cached systems if still valid
  if (cachedSystems && (now - cacheTime) < CACHE_DURATION) {
    return cachedSystems
  }

  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('pos_systems')
      .select('name')
      .eq('active', true)
      .order('display_order')

    if (!error && data && data.length > 0) {
      cachedSystems = data.map(row => row.name)
      cacheTime = now
      return cachedSystems
    }
  } catch (err) {
    console.warn('Failed to fetch POS systems from database:', err)
  }

  // Fallback to hardcoded list if database fetch fails
  return FALLBACK_POS_SYSTEMS
}

export function clearPOSSystemsCache() {
  cachedSystems = null
  cacheTime = 0
}
