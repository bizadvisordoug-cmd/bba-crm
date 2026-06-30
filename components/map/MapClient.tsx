'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Filter, MapPin, Phone, User } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { StageBadge } from '@/components/ui/Badge'
import { POS_SYSTEMS } from '@/lib/utils'
import { LeadDrawer } from '@/components/crm/LeadDrawer'

const SOURCE_ID     = 'leads-source'
const LAYER_CIRCLES = 'leads-circles'
const LAYER_LABELS  = 'leads-labels'

// GeoJSON properties must be flat — store only what the layer paint/click needs
function toGeoJSON(leads: any[]) {
  return {
    type: 'FeatureCollection' as const,
    features: leads
      .filter(l => l.lat && l.lng)
      .map(l => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [l.lng, l.lat] as [number, number],
        },
        properties: {
          id:     l.id,
          status: l.status,
          label:  (l.business?.business_name || (l.business_name as string) || '?').charAt(0).toUpperCase(),
        },
      })),
  }
}

interface MapClientProps {
  leads: any[]
  reps: any[]
  isAdmin: boolean
  canDeleteLeads: boolean
  currentUserId: string
}

export function MapClient({ leads, reps, isAdmin, canDeleteLeads, currentUserId }: MapClientProps) {
  const mapContainer  = useRef<HTMLDivElement>(null)
  const map           = useRef<mapboxgl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const [localLeads, setLocalLeads] = useState<any[]>(leads)
  // Ref so Mapbox event handlers always see the current list without stale closures
  const localLeadsRef = useRef<any[]>(leads)
  useEffect(() => { localLeadsRef.current = localLeads }, [localLeads])

  const [filterRep,    setFilterRep]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPOS,    setFilterPOS]    = useState('')
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [showFilters,  setShowFilters]  = useState(false)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  const filtered = useMemo(() => localLeads.filter(l => {
    if (filterRep    && l.assigned_rep_id !== filterRep)    return false
    if (filterStatus && l.status          !== filterStatus) return false
    if (filterPOS    && l.pos_system      !== filterPOS)    return false
    return true
  }), [localLeads, filterRep, filterStatus, filterPOS])

  // ── Map initialisation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return

    mapboxgl.accessToken = mapboxToken
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-98.5795, 39.8283],
      zoom: 4,
    })
    map.current = m
    m.addControl(new mapboxgl.NavigationControl(), 'top-right')

    m.on('load', () => {
      // Source — seeded with the leads available at load time
      m.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toGeoJSON(localLeadsRef.current),
      })

      // Soft glow ring behind each circle
      m.addLayer({
        id: 'leads-glow',
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 20,
          'circle-blur': 1,
          'circle-opacity': 0.18,
          'circle-color': [
            'match', ['get', 'status'],
            'Active Client', '#10b981',
            'Inactive',      '#6b7280',
            /* Prospect */   '#3b82f6',
          ],
        },
      })

      // Main pin circle
      m.addLayer({
        id: LAYER_CIRCLES,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 14,
          'circle-color': [
            'match', ['get', 'status'],
            'Active Client', '#10b981',
            'Inactive',      '#6b7280',
            /* Prospect */   '#3b82f6',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      })

      // First-letter label on top
      m.addLayer({
        id: LAYER_LABELS,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      })

      // ── Click handler — Mapbox layer event, zero camera side-effects ──
      m.on('click', LAYER_CIRCLES, (e) => {
        const id = e.features?.[0]?.properties?.id
        if (!id) return
        const lead = localLeadsRef.current.find((l: any) => l.id === id)
        if (lead) {
          setSelectedLead(lead)
          setDrawerOpen(false)
        }
      })

      // Pointer cursor while hovering a pin
      m.on('mouseenter', LAYER_CIRCLES, () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', LAYER_CIRCLES, () => { m.getCanvas().style.cursor = '' })

      setMapLoaded(true)
    })

    return () => m.remove()
  }, [mapboxToken])

  // ── Keep GeoJSON source in sync with active filters ─────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    ;(map.current.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined)
      ?.setData(toGeoJSON(filtered))
  }, [filtered, mapLoaded])

  // ── No token fallback ────────────────────────────────────────────────────
  if (!mapboxToken) {
    return (
      <div>
        <PageHeader title="Customer Map" />
        <GlassCard className="text-center py-20">
          <MapPin size={48} className="mx-auto mb-4 opacity-30 text-purple-400" />
          <p className="text-white font-semibold mb-2">Mapbox Token Required</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Add <code className="bg-white/10 px-1.5 py-0.5 rounded text-purple-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your environment variables to enable the customer map.
          </p>
        </GlassCard>
      </div>
    )
  }

  return (
    <>
      <div>
        <PageHeader
          title="Customer Map"
          subtitle={`${filtered.length} locations`}
          actions={
            <Button
              variant="secondary"
              icon={<Filter size={14} />}
              onClick={() => setShowFilters(!showFilters)}
            >
              Filters
            </Button>
          }
        />

        <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)' }}>
          {/* Filters sidebar */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-56 flex-shrink-0 space-y-3"
            >
              <GlassCard animate={false} className="p-4 space-y-3">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Filters</h3>
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Rep</label>
                    <select
                      value={filterRep}
                      onChange={e => setFilterRep(e.target.value)}
                      style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                    >
                      <option value="">All</option>
                      {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Status</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                  >
                    <option value="">All</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Active Client">Active Client</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Suggested POS</label>
                  <select
                    value={filterPOS}
                    onChange={e => setFilterPOS(e.target.value)}
                    style={{ background: '#1a1f2e', color: '#e2e8f8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', width: '100%', cursor: 'pointer', appearance: 'auto' }}
                  >
                    <option value="">All</option>
                    {POS_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </GlassCard>

              {/* Legend */}
              <GlassCard animate={false} className="p-4">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Legend</h3>
                <div className="space-y-2">
                  {([
                    { label: 'Prospect',      color: '#3b82f6' },
                    { label: 'Active Client', color: '#10b981' },
                    { label: 'Inactive',      color: '#6b7280' },
                  ] as const).map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Map canvas */}
          <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/[0.08]">
            <div ref={mapContainer} className="w-full h-full" />

            {/* React popup overlay — styled to match the glass design system */}
            {selectedLead && (
              <motion.div
                key={selectedLead.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 rounded-2xl p-4 min-w-[260px] max-w-[300px] z-10"
                style={{
                  background: 'rgba(10,13,24,0.92)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <button
                  onClick={() => setSelectedLead(null)}
                  className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-[var(--text-muted)] hover:text-white text-xs"
                >✕</button>

                <div className="font-bold text-white text-base leading-tight mb-0.5 pr-6">
                  {selectedLead.business_name}
                </div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {selectedLead.owner_name}
                </div>

                <div className="mb-3">
                  <StageBadge stage={selectedLead.pipeline_stage} />
                </div>

                {selectedLead.assigned_rep && (
                  <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    <User size={11} className="text-[var(--text-muted)]" />
                    {selectedLead.assigned_rep.name}
                  </div>
                )}

                {(selectedLead.owner_phone || selectedLead.business_phone) && (
                  <a
                    href={`tel:${selectedLead.owner_phone || selectedLead.business_phone}`}
                    className="flex items-center gap-1.5 text-xs mb-4 hover:text-purple-400 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Phone size={11} className="text-[var(--text-muted)]" />
                    {selectedLead.owner_phone || selectedLead.business_phone}
                  </a>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => setDrawerOpen(true)}
                >
                  View Lead
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onUpdate={(updated) => {
            setLocalLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
            setSelectedLead(updated)
          }}
          onDelete={(id) => {
            setLocalLeads(prev => prev.filter(l => l.id !== id))
            setSelectedLead(null)
            setDrawerOpen(false)
          }}
          reps={reps}
          isAdmin={isAdmin}
          canDeleteLeads={canDeleteLeads}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}
