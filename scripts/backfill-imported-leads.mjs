// One-off backfill: create people + businesses for leads that were imported
// with only the flat text fields (owner_name / business_name) and never linked
// to the relational tables. Links each lead via owner_id / business_id.
//
// Usage:
//   node scripts/backfill-imported-leads.mjs          (dry run — no writes)
//   node scripts/backfill-imported-leads.mjs --apply  (perform the writes)
//
// Reads Supabase credentials from .env.local (service role key).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Node on Windows can't verify Supabase's TLS cert without the system CA store.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ── Load .env.local ──────────────────────────────────────────────────────────
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) { console.error('Missing Supabase URL or service role key in .env.local'); process.exit(1) }

const APPLY = process.argv.includes('--apply')
const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

const norm = s => (s || '').trim().toLowerCase()

async function main() {
  console.log(APPLY ? '=== APPLY MODE — writes WILL be made ===' : '=== DRY RUN — no writes ===')

  // 1. Leads missing an owner link but carrying a text owner/business name.
  const { data: leads, error: leadErr } = await sb
    .from('leads')
    .select('id, owner_name, business_name, owner_phone, business_phone, email, address, city, state, zip, industry, owner_id, business_id')
    .is('owner_id', null)
  if (leadErr) throw leadErr

  const needOwner = leads.filter(l => l.owner_name && l.owner_name.trim())
  const noOwnerName = leads.filter(l => !l.owner_name || !l.owner_name.trim())
  console.log(`\nLeads with owner_id NULL: ${leads.length}`)
  console.log(`  → have an owner_name to backfill: ${needOwner.length}`)
  console.log(`  → NO owner_name (will be skipped): ${noOwnerName.length}`, noOwnerName.map(l => l.business_name))

  // 2. Resolve owners. We deliberately do NOT reuse pre-existing people by name:
  //    matching on a name (esp. a bare first name like "Jamie") risks linking a
  //    business to an unrelated existing person. A duplicate name is far safer
  //    than a wrong attribution, and the app's own "create owner" flow doesn't
  //    dedupe either. We only dedupe *within this batch* by exact name so one
  //    owner who owns two imported locations gets a single person row.
  const peopleByName = new Map() // norm name -> id (filled as we create)

  // 3. Plan people to create (unique owner_name within the batch).
  const toCreatePeople = new Map() // norm name -> {name, phone, email}
  for (const l of needOwner) {
    const key = norm(l.owner_name)
    if (!toCreatePeople.has(key)) {
      toCreatePeople.set(key, { name: l.owner_name.trim(), phone: l.owner_phone || null, email: l.email || null })
    }
  }
  console.log(`People to CREATE: ${toCreatePeople.size}`)
  for (const p of toCreatePeople.values()) console.log(`  + ${p.name}`)

  if (APPLY && toCreatePeople.size) {
    const rows = [...toCreatePeople.values()]
    const { data: inserted, error } = await sb.from('people').insert(rows).select('id, name')
    if (error) throw error
    for (const p of inserted) peopleByName.set(norm(p.name), p.id)
    console.log(`\n✓ Inserted ${inserted.length} people`)
  }

  // 4. Plan businesses — one per lead that has a business_name (each lead is a
  //    distinct location). Link to the resolved owner. Dedupe within batch by
  //    (owner_id + business name) so an exact repeat doesn't double-insert.
  const bizPlan = [] // { leadId, owner_id, business_name, address, city, state, zip, industry, business_phone, business_email }
  for (const l of needOwner) {
    if (!l.business_name || !l.business_name.trim()) continue
    const ownerId = peopleByName.get(norm(l.owner_name)) // may be undefined in dry run
    bizPlan.push({
      leadId: l.id,
      owner_id: ownerId || null,
      business_name: l.business_name.trim(),
      address: l.address || null, city: l.city || null, state: l.state || null,
      zip: l.zip || null, industry: l.industry || null,
      business_phone: l.business_phone || null, business_email: l.email || null,
    })
  }
  console.log(`\nBusinesses to CREATE + link: ${bizPlan.length}`)
  for (const b of bizPlan) console.log(`  + ${b.business_name}  (owner: ${b.owner_id ? 'linked' : 'PENDING'})`)

  if (APPLY) {
    let linked = 0
    for (const b of bizPlan) {
      const { leadId, ...bizRow } = b
      bizRow.owner_id = peopleByName.get(norm(needOwner.find(l => l.id === leadId).owner_name)) || null
      const { data: biz, error: bizErr } = await sb.from('businesses').insert(bizRow).select('id').single()
      if (bizErr) throw bizErr
      const { error: updErr } = await sb.from('leads')
        .update({ owner_id: bizRow.owner_id, business_id: biz.id })
        .eq('id', leadId)
      if (updErr) throw updErr
      linked++
    }
    console.log(`\n✓ Created ${linked} businesses and linked ${linked} leads`)

    // Link any owner-only leads (business_name empty) so the owner still shows.
    for (const l of needOwner.filter(l => !l.business_name || !l.business_name.trim())) {
      const ownerId = peopleByName.get(norm(l.owner_name))
      if (ownerId) await sb.from('leads').update({ owner_id: ownerId }).eq('id', l.id)
    }
  }

  console.log('\nDone.', APPLY ? 'Changes applied.' : 'No changes made (dry run).')
}

main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1) })
