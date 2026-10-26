import type { Feature, MultiPolygon, Position } from 'geojson'
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'
import type { DashboardFilters, ReadonlyDashboardData } from '../types/dashboard.ts'
import { selectBuildingTypeLabels } from '../selectors/dashboard.ts'

export const BUILDING_SOURCE_LAYER = 'buildings_eligible_pvout'
export const BUILDING_MIN_ZOOM = 14
export const POLYGON_FILTER: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon']
export type MapMetric = 'capacity_mwp' | 'annual_gwh' | 'eligibility_rate'
export const METRIC_LABELS: Record<MapMetric, string> = {
  capacity_mwp: 'Kapasitas surya', annual_gwh: 'Energi tahunan', eligibility_rate: 'Kelayakan bangunan',
}
export function buildingFilter(data: ReadonlyDashboardData, filters: Readonly<DashboardFilters>): FilterSpecification {
  const conditions: ExpressionSpecification[] = [POLYGON_FILTER, ['==', ['get', 'eligible'], 1]]
  const region = data.adminCrosswalk.regions.find(r => r.id === filters.regionId)
  if (region) conditions.push(['in', ['get', 'WADMKK'], ['literal', [region.wilayah, region.raw_name]]])
  const district = data.adminCrosswalk.districts.find(d => d.id === filters.districtId)
  if (district) conditions.push(['in', ['get', 'WADMKC'], ['literal', [district.kecamatan, district.raw_name]]])
  const labels = selectBuildingTypeLabels(data, filters.typeId)
  if (labels.status === 'available' && labels.labels) conditions.push(['in', ['get', 'jenis_group'], ['literal', [...labels.labels]]])
  return ['all', ...conditions]
}

/** Bounds are navigation only, never statistical measurements. */
export function geometryBounds(geometry: MultiPolygon | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly (readonly (readonly number[])[])[])[] }): [[number, number], [number, number]] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const polygon of geometry.coordinates) for (const ring of polygon) for (const point of ring) {
    west = Math.min(west, point[0]!); south = Math.min(south, point[1]!)
    east = Math.max(east, point[0]!); north = Math.max(north, point[1]!)
  }
  return [[west, south], [east, north]]
}
export function tileCenter(x: number, y: number, z = 16): [number, number] {
  return [x / 2 ** z * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI]
}
export const DEMO_LOCATIONS = {
  urban: { label: 'Cengkareng', region: 'Jakarta Barat', district: 'Cengkareng', center: tileCenter(52200.5, 33888.5) },
  islands: { label: 'Pulau Tidung', region: 'Kepulauan Seribu', district: 'Kepulauan Seribu Selatan', center: tileCenter(52155.03, 33824.94) },
} as const

export function featureCenter(feature: Feature<MultiPolygon>): Position {
  const [a, b] = geometryBounds(feature.geometry)
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}
