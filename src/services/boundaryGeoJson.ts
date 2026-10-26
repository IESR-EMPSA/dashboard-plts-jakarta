import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { AdminProperties } from '../types/solar.ts'
import type { ReadonlyBoundaries } from '../types/dashboard.ts'

/** Mutable renderer-owned copy; cached publication data and provenance stay immutable. */
export function copyBoundaryGeoJson(boundaries: ReadonlyBoundaries): FeatureCollection<MultiPolygon, AdminProperties> {
  return structuredClone({ type: 'FeatureCollection', features: boundaries.features }) as FeatureCollection<MultiPolygon, AdminProperties>
}
