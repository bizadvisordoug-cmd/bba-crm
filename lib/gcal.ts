// Google Calendar sync — server-side only.
// Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and a stored refresh token.

interface GCalEvent {
  id: string
  summary?: string
  description?: string
  status: 'confirmed' | 'tentative' | 'cancelled' | string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end:   { dateTime?: string; date?: string; timeZone?: string }
}

interface GCalListResponse {
  items?: GCalEvent[]
  nextPageToken?: string
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// Token value may be stored as a bare string or as { refresh_token: '...' }
function extractRefreshToken(tokenValue: unknown): string | null {
  if (!tokenValue) return null
  if (typeof tokenValue === 'string') return tokenValue
  return (tokenValue as Record<string, string>)?.refresh_token ?? null
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.access_token as string) ?? null
  } catch {
    return null
  }
}

// ── Event fetch (handles pagination) ─────────────────────────────────────────

async function fetchEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GCalEvent[]> {
  const all: GCalEvent[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      timeMin:      timeMin.toISOString(),
      timeMax:      timeMax.toISOString(),
      singleEvents: 'true',   // expand recurring events into individual instances
      orderBy:      'startTime',
      maxResults:   '500',
      ...(pageToken ? { pageToken } : {}),
    })

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
    )
    if (!res.ok) break

    const body: GCalListResponse = await res.json()
    all.push(...(body.items ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)

  return all
}

// ── Write operations (CRM → Google Calendar) ─────────────────────────────────

export interface GCalEventPayload {
  title: string
  startTime: string   // ISO 8601
  endTime: string     // ISO 8601
  description?: string
}

/**
 * Creates an event in the rep's primary Google Calendar.
 * Returns the new event's Google ID, or null if the rep has no token /
 * credentials are missing / the API call fails.
 * Never throws — callers should treat null as "GCal unavailable".
 */
export async function createGCalEvent(
  tokenValue: unknown,
  payload: GCalEventPayload,
): Promise<string | null> {
  console.log('[gcal] createGCalEvent called — title:', payload.title,
    'start:', payload.startTime, 'end:', payload.endTime,
    'tokenPresent:', !!tokenValue, 'tokenType:', typeof tokenValue)

  const refreshToken = extractRefreshToken(tokenValue)
  if (!refreshToken) {
    console.warn('[gcal] createGCalEvent: could not extract refresh token — tokenValue:', tokenValue)
    return null
  }
  console.log('[gcal] createGCalEvent: refresh token extracted, calling getAccessToken')

  const accessToken = await getAccessToken(refreshToken)
  if (!accessToken) {
    console.warn('[gcal] createGCalEvent: getAccessToken returned null — GOOGLE_CLIENT_ID set:', !!process.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_SECRET set:', !!process.env.GOOGLE_CLIENT_SECRET)
    return null
  }
  console.log('[gcal] createGCalEvent: access token obtained, posting to Google API')

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary:     payload.title,
          description: payload.description ?? '',
          start: { dateTime: payload.startTime, timeZone: 'UTC' },
          end:   { dateTime: payload.endTime,   timeZone: 'UTC' },
        }),
      },
    )
    const text = await res.text()
    console.log('[gcal] createGCalEvent: Google API response status:', res.status, '— body:', text.slice(0, 400))
    if (!res.ok) {
      console.warn('[gcal] createEvent failed', res.status, text)
      return null
    }
    const data = JSON.parse(text)
    console.log('[gcal] createGCalEvent: success, event id:', data.id)
    return (data.id as string) ?? null
  } catch (err) {
    console.warn('[gcal] createEvent error', err)
    return null
  }
}

/**
 * Deletes an event from the rep's primary Google Calendar by its Google event ID.
 * Silently ignores 404s (event already deleted) and missing tokens.
 * Never throws.
 */
export async function deleteGCalEvent(
  tokenValue: unknown,
  googleEventId: string,
): Promise<void> {
  const refreshToken = extractRefreshToken(tokenValue)
  if (!refreshToken) return

  const accessToken = await getAccessToken(refreshToken)
  if (!accessToken) return

  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    // 204 = deleted, 404 = already gone — both are fine
  } catch (err) {
    console.warn('[gcal] deleteEvent error', err)
  }
}

// ── Main sync entry point ─────────────────────────────────────────────────────
// Called from the Calendar server component on every page load.
// Strategy: delete all previously-synced rows in the time window, then reinsert
// the current event list from Google. This cleanly handles edits and deletions
// without needing a unique-constraint upsert.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncGCalEvents(userId: string, tokenValue: unknown, supabase: any): Promise<void> {
  const refreshToken = extractRefreshToken(tokenValue)
  if (!refreshToken) return

  const accessToken = await getAccessToken(refreshToken)
  if (!accessToken) return

  // Sync window: 60 days back → 120 days ahead
  const timeMin = new Date(Date.now() - 60  * 864e5)
  const timeMax = new Date(Date.now() + 120 * 864e5)

  const events = await fetchEvents(accessToken, timeMin, timeMax)
  console.log('[gcal sync] fetched', events.length, 'events from Google Calendar')

  // Only keep events that still exist in Google Calendar
  const active = events.filter(e => e.status !== 'cancelled')
  const activeIds = new Set(active.map(e => e.id))
  console.log('[gcal sync] active (non-cancelled) events:', active.length)
  console.log('[gcal sync] activeIds:', [...activeIds])

  // ── Step 1: delete-then-reinsert for gcal_synced rows ───────────────────────
  const { error: deleteGcalSyncedErr } = await supabase
    .from('appointments')
    .delete()
    .eq('rep_id', userId)
    .eq('gcal_synced', true)
    .gte('start_time', timeMin.toISOString())
    .lte('start_time', timeMax.toISOString())
  console.log('[gcal sync] step 1 — deleted gcal_synced rows, error:', deleteGcalSyncedErr?.message ?? null)

  // ── Step 2: prune orphaned CRM-created appointments ─────────────────────────
  console.log('[gcal sync] step 2 — querying CRM appointments with google_event_id set (gcal_synced=false)')
  const { data: crmWithGcal, error: crmQueryErr } = await supabase
    .from('appointments')
    .select('id, google_event_id, title, start_time')
    .eq('rep_id', userId)
    .eq('gcal_synced', false)
    .not('google_event_id', 'is', null)
    .gte('start_time', timeMin.toISOString())
    .lte('start_time', timeMax.toISOString())

  console.log('[gcal sync] CRM rows with google_event_id:', crmWithGcal?.length ?? 0,
    'query error:', crmQueryErr?.message ?? null)
  if (crmWithGcal?.length) {
    console.log('[gcal sync] CRM rows found:', JSON.stringify(crmWithGcal, null, 2))
  }

  const orphans = (crmWithGcal ?? [])
    .filter((row: { id: string; google_event_id: string }) => !activeIds.has(row.google_event_id))
  console.log('[gcal sync] orphans (google_event_id not in activeIds):', orphans.length)

  if (orphans.length > 0) {
    orphans.forEach((row: { id: string; google_event_id: string; title: string; start_time: string }) => {
      console.log('[gcal sync] deleting orphan:', row.id, '|', row.title, '|', row.start_time, '| gcal id:', row.google_event_id)
    })
    const orphanIds = orphans.map((row: { id: string }) => row.id)
    const { error: orphanDeleteErr, count } = await supabase
      .from('appointments')
      .delete({ count: 'exact' })
      .in('id', orphanIds)
    console.log('[gcal sync] orphan delete result — count:', count, 'error:', orphanDeleteErr?.message ?? null)
  }

  if (active.length === 0) return

  const rows = active.map(event => {
    const isAllDay = !event.start.dateTime
    // All-day events carry only a date string (e.g. "2024-06-25").
    // We store it with a T00:00:00Z suffix and use the is_all_day flag in the
    // client to compare date strings directly, avoiding timezone distortion.
    const startTime = event.start.dateTime ?? `${event.start.date}T00:00:00.000Z`
    const endTime   = event.end.dateTime   ?? `${event.end.date}T00:00:00.000Z`

    return {
      rep_id:          userId,
      google_event_id: event.id,
      title:           event.summary?.trim() || '(No title)',
      start_time:      startTime,
      end_time:        endTime,
      notes:           event.description ?? null,
      status:          'scheduled' as const,
      is_all_day:      isAllDay,
      gcal_synced:     true,
      lead_id:         null,
    }
  })

  // ── Step 3: insert the fetched events ────────────────────────────────────
  // A single bulk insert is fast, but this data comes from an external
  // calendar we don't fully control — one bad/conflicting row (e.g. an
  // exclusion-constraint hit) fails the whole statement atomically. Try the
  // bulk path first; if it's rejected, fall back to inserting row-by-row so
  // one bad event can't blank out every other real event in the sync.
  const { error: bulkInsertErr } = await supabase.from('appointments').insert(rows)

  if (!bulkInsertErr) {
    console.log('[gcal sync] inserted', rows.length, 'rows successfully')
    return
  }

  console.error('[gcal sync] bulk insert failed:', bulkInsertErr.message, '— retrying rows individually')
  let inserted = 0
  let failed = 0
  for (const row of rows) {
    const { error: rowErr } = await supabase.from('appointments').insert(row)
    if (rowErr) {
      failed++
      console.error('[gcal sync] row insert failed —', row.title, '|', row.start_time, '| error:', rowErr.message)
    } else {
      inserted++
    }
  }
  console.log('[gcal sync] individual retry complete — inserted:', inserted, 'failed:', failed, 'of', rows.length)
}
