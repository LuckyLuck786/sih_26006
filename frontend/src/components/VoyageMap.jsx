import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { tonnes } from '../lib/format'
import { Panel, Pill } from './ui'
import { fetchNearbyVessels } from '../services/api'

/**
 * Voyage map on OpenStreetMap tiles.
 *
 * OSM is free and needs no API key, so the map works for anyone who
 * clones this repository. Leaflet's default marker icons reference image
 * assets that break under bundlers, so every marker here is a
 * CircleMarker instead — no asset resolution required.
 *
 * Vessel positions come from our own /api/ais proxy, which calls Data
 * Docked server-side when a key is configured and otherwise reports the
 * simulated fleet. The badge always says which one is being shown.
 */

function FitBounds({ bounds }) {
  const map = useMap()

  useEffect(() => {
    if (bounds?.length === 2) {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [bounds, map])

  return null
}

/**
 * Sample the great circle between two points.
 *
 * A straight line on a Mercator projection badly misrepresents an ocean
 * route; interpolating along the great circle is much closer to the path
 * a vessel actually steers.
 */
function greatCirclePoints(from, to, segments = 64) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI

  const [lat1, lon1] = [toRad(from[0]), toRad(from[1])]
  const [lat2, lon2] = [toRad(to[0]), toRad(to[1])]

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    )

  if (!d || Number.isNaN(d)) return [from, to]

  const points = []

  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments
    const a = Math.sin((1 - f) * d) / Math.sin(d)
    const b = Math.sin(f * d) / Math.sin(d)

    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2)
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2)
    const z = a * Math.sin(lat1) + b * Math.sin(lat2)

    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))])
  }

  return points
}

export default function VoyageMap({ route, fleet = [] }) {
  const [ais, setAis] = useState({ source: 'simulated', vessels: [] })

  const hasRoute = route?.load_port_lat != null && route?.discharge_port_lat != null

  useEffect(() => {
    if (!hasRoute) return undefined

    let cancelled = false

    fetchNearbyVessels({
      latitude: route.discharge_port_lat,
      longitude: route.discharge_port_lon,
    }).then((result) => {
      if (!cancelled) setAis(result)
    })

    return () => {
      cancelled = true
    }
  }, [hasRoute, route?.discharge_port_lat, route?.discharge_port_lon])

  if (!hasRoute) return null

  const from = [route.load_port_lat, route.load_port_lon]
  const to = [route.discharge_port_lat, route.discharge_port_lon]

  const live = ais.source === 'live' && Array.isArray(ais.vessels) && ais.vessels.length > 0

  // Fall back to the tracked fleet whenever live AIS is unavailable, so
  // the map is never empty during a demo.
  const vessels = live
    ? ais.vessels
        .map((v) => ({
          // Live AIS returns name/typeSpecific with coordinates as
          // strings; the simulated fleet uses vessel_name/vessel_type.
          name: v.name || v.vessel_name || 'Vessel',
          type: v.typeSpecific || v.vessel_type || '',
          mmsi: v.mmsi,
          speed: v.speed,
          lat: Number(v.latitude),
          lon: Number(v.longitude),
        }))
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
    : fleet.map((v) => ({
        name: v.vessel_name,
        type: v.vessel_type,
        lat: v.latitude,
        lon: v.longitude,
        capacity: v.capacity,
        status: v.status,
      }))

  return (
    <Panel
      eyebrow="Voyage & fleet"
      title={`${route.load_port} → ${route.discharge_port}`}
      subtitle={`${route.distance_nm?.toLocaleString()} nm great-circle routing`}
      right={
        <Pill tone={live ? 'bg-surface text-positive' : 'bg-sunken text-ink-muted'}>
          {live ? 'Live AIS' : 'Simulated fleet'}
        </Pill>
      }
    >
      <div className="overflow-hidden border border-rule">
        <MapContainer
          center={from}
          zoom={3}
          scrollWheelZoom={false}
          style={{ height: 380, width: '100%', background: '#e8eef2' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds bounds={[from, to]} />

          <Polyline
            positions={greatCirclePoints(from, to)}
            pathOptions={{ color: '#0d9488', weight: 2.5, dashArray: '6 6' }}
          />

          {vessels.map((vessel, index) => (
            <CircleMarker
              key={`${vessel.name}-${index}`}
              center={[vessel.lat, vessel.lon]}
              radius={4}
              pathOptions={{
                color: '#475569',
                fillColor: vessel.status === 'available' ? '#22c55e' : '#94a3b8',
                fillOpacity: 0.9,
                weight: 1,
              }}
            >
              <Tooltip>
                <span className="text-xs">
                  <strong>{vessel.name}</strong>
                  {vessel.type ? ` · ${vessel.type}` : ''}
                  {vessel.capacity ? <> · {tonnes(vessel.capacity)}</> : null}
                </span>
              </Tooltip>
            </CircleMarker>
          ))}

          <CircleMarker
            center={from}
            radius={9}
            pathOptions={{ color: '#ffffff', fillColor: '#0f766e', fillOpacity: 1, weight: 2.5 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              <span className="text-xs font-bold">
                {route.load_port} ({route.load_port_unlocode})
              </span>
            </Tooltip>
          </CircleMarker>

          <CircleMarker
            center={to}
            radius={9}
            pathOptions={{ color: '#ffffff', fillColor: '#b45309', fillOpacity: 1, weight: 2.5 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              <span className="text-xs font-bold">
                {route.discharge_port} ({route.discharge_port_unlocode})
              </span>
            </Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>

      <p className="mt-3 text-xs leading-5 text-ink-muted">
        {live
          ? `Showing ${vessels.length} live AIS positions near ${route.discharge_port}, via Data Docked.`
          : `Showing the ${vessels.length}-vessel tracked fleet. Configure DATADOCKED_API_KEY on the server to overlay live AIS positions.`}
      </p>
    </Panel>
  )
}
