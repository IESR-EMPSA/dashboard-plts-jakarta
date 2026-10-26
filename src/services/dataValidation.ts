import type { DataManifest, DataMetadata, SummaryMeasures } from '../types/solar.ts'
import type { BoundaryLevel, DashboardData, ReadonlyDashboardData } from '../types/dashboard.ts'
import { assertData, SolarDataError } from './dataError.ts'

export const DATA_FILES = {
  regions: 'summary_wilayah.json', districts: 'summary_kecamatan.json', types: 'summary_jenis.json',
  coverage: 'summary_pvout_coverage.json', adminCrosswalk: 'admin_crosswalk.json',
  buildingTypes: 'building_type_crosswalk.json',
} as const
export const BOUNDARY_FILES = { region: 'admin_kabkot.geojson', district: 'admin_kecamatan.geojson' } as const
export const RECONCILIATION_TOLERANCE = 0.000001
const countKeys = ['total_buildings', 'eligible_buildings', 'pvout_available', 'pvout_missing'] as const
type RecordValue = Record<string, unknown>

export function record(value: unknown, label: string): RecordValue {
  assertData(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`)
  return value as RecordValue
}
export function text(value: unknown, label: string): string {
  assertData(typeof value === 'string' && value.trim() !== '', `${label}: expected nonempty string`)
  return value
}
export function finite(value: unknown, label: string): number {
  assertData(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label}: expected finite nonnegative number`)
  return value
}
function integer(value: unknown, label: string): number {
  const n = finite(value, label)
  assertData(Number.isSafeInteger(n), `${label}: expected safe integer`)
  return n
}
function nullable(value: unknown, label: string): number | null {
  return value === null ? null : finite(value, label)
}
function list(value: unknown, label: string): unknown[] {
  assertData(Array.isArray(value), `${label}: expected array`)
  return value
}
function records(value: unknown, label: string): RecordValue[] {
  return list(value, label).map((r, i) => record(r, `${label}[${i}]`))
}
function unique(values: unknown[], label: string): void {
  assertData(new Set(values).size === values.length, `${label}: duplicate or ambiguous values`)
}
function equal(a: unknown, b: unknown, label: string): void {
  assertData(a === b, `${label}: mismatch`)
}
function near(a: number | null, b: number | null, label: string, tolerance = RECONCILIATION_TOLERANCE): void {
  assertData(a === null || b === null ? a === b : Math.abs(a - b) <= tolerance, `${label}: numeric/null mismatch`)
}
export function countRatio(n: number, d: number): number | null { return d === 0 ? null : n / d }
function checksum(value: unknown, label: string): void {
  assertData(/^[a-f0-9]{64}$/.test(text(value, label)), `${label}: invalid SHA-256`)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

export function validateMetadata(value: unknown, expected?: DataMetadata): asserts value is DataMetadata {
  const m = record(value, 'metadata')
  if (m.schema_version !== '1.0.0') throw new SolarDataError('version', 'Unsupported solar data schema version')
  text(m.data_version, 'metadata.data_version')
  equal(m.coverage, 'DKI Jakarta', 'coverage')
  equal(m.generation_scope, 'PVOUT-covered eligible buildings only', 'generation scope')
  equal(m.verification, 'export_arithmetic_validated; source_model_topology_and_rights_pending', 'verification limits')
  const units = record(m.units, 'metadata.units')
  for (const [key, value] of Object.entries({ capacity: 'MWp', generation: 'GWh/year', area: 'm2', ratios: '0–1' })) equal(units[key], value, `units.${key}`)
  const producer = record(m.producer, 'metadata.producer')
  text(producer.name, 'producer.name'); text(producer.version, 'producer.version'); checksum(producer.sha256, 'producer.sha256')
  const sources = records(m.sources, 'metadata.sources')
  assertData(sources.length > 0, 'Missing provenance sources')
  unique(sources.map(s => text(s.path, 'source.path')), 'Source paths')
  for (const s of sources) {
    integer(s.bytes, 'source.bytes'); checksum(s.sha256, 'source.sha256')
    assertData(['statistics', 'boundaries', 'crosswalk', 'building_visualization'].includes(text(s.role, 'source.role')), 'Unknown source role')
  }
  if (expected && canonical(m) !== canonical(expected)) throw new SolarDataError('version', 'Mixed data releases or incompatible provenance')
}

export function validateManifest(value: unknown): asserts value is DataManifest {
  const m = record(value, 'manifest')
  validateMetadata(m.metadata)
  const v = record(m.validation, 'manifest.validation')
  for (const key of [...countKeys, 'regions', 'districts', 'building_types', 'district_aliases_applied', 'unmatched_administrative_joins']) integer(v[key], `manifest.${key}`)
  equal(v.unmatched_administrative_joins, 0, 'Unmatched administrative joins')
  finite(v.capacity_mwp, 'manifest.capacity_mwp'); nullable(v.annual_gwh, 'manifest.annual_gwh')
  assertData(finite(v.tolerance, 'manifest.tolerance') > 0 && (v.tolerance as number) <= RECONCILIATION_TOLERANCE, 'Unexpected validation tolerance')
  const outputs = records(m.outputs, 'manifest.outputs')
  const expected = [...Object.values(DATA_FILES), ...Object.values(BOUNDARY_FILES)].map(f => `public/data/${f}`)
  unique(outputs.map(o => text(o.path, 'output.path')), 'Manifest output paths')
  equal(outputs.length, expected.length, 'Manifest output count')
  for (const o of outputs) {
    assertData(expected.includes(text(o.path, 'output.path')), 'Unexpected manifest output')
    integer(o.bytes, 'output.bytes'); integer(o.records, 'output.records'); checksum(o.sha256, 'output.sha256')
  }
}

function coverage(r: RecordValue, label: string): void {
  const eligible = integer(r.eligible_buildings, `${label}.eligible_buildings`)
  const available = integer(r.pvout_available, `${label}.pvout_available`)
  const missing = integer(r.pvout_missing, `${label}.pvout_missing`)
  equal(available + missing, eligible, `${label}.PVOUT counts`)
  near(nullable(r.pvout_coverage, `${label}.pvout_coverage`), countRatio(available, eligible), `${label}.count coverage`, 1e-12)
  const capacity = finite(r.capacity_mwp, `${label}.capacity_mwp`)
  const covered = finite(r.capacity_with_pvout_mwp, `${label}.capacity_with_pvout_mwp`)
  const uncovered = finite(r.capacity_without_pvout_mwp, `${label}.capacity_without_pvout_mwp`)
  near(covered + uncovered, capacity, `${label}.MWp coverage sum`)
  near(nullable(r.pvout_capacity_coverage, `${label}.pvout_capacity_coverage`), countRatio(covered, capacity), `${label}.MWp coverage ratio`, 1e-12)
  if (available === 0) near(covered, 0, `${label}.no covered capacity`)
  if (missing === 0) near(uncovered, 0, `${label}.no missing capacity`)
}
function measures(value: unknown, label: string): asserts value is SummaryMeasures {
  const r = record(value, label)
  for (const k of countKeys) integer(r[k], `${label}.${k}`)
  const total = r.total_buildings as number, eligible = r.eligible_buildings as number
  assertData(eligible <= total, `${label}: eligible exceeds all-building denominator`)
  equal((r.pvout_available as number) + (r.pvout_missing as number), eligible, `${label}.PVOUT counts`)
  finite(r.capacity_mwp, `${label}.capacity_mwp`)
  const annual = nullable(r.annual_gwh, `${label}.annual_gwh`)
  equal(annual === null, r.pvout_available === 0, `${label}.generation availability`)
  near(nullable(r.eligibility_rate, `${label}.eligibility_rate`), countRatio(eligible, total), `${label}.eligibility ratio`, 1e-12)
  near(nullable(r.pvout_coverage, `${label}.pvout_coverage`), countRatio(r.pvout_available as number, eligible), `${label}.PVOUT ratio`, 1e-12)
}
function aggregate(rows: readonly SummaryMeasures[]): SummaryMeasures {
  const total = rows.reduce((s, r) => s + r.total_buildings, 0)
  const eligible = rows.reduce((s, r) => s + r.eligible_buildings, 0)
  const available = rows.reduce((s, r) => s + r.pvout_available, 0)
  const knownEnergy = rows.filter(r => r.annual_gwh !== null)
  return { total_buildings: total, eligible_buildings: eligible, pvout_available: available,
    pvout_missing: rows.reduce((s, r) => s + r.pvout_missing, 0),
    capacity_mwp: rows.reduce((s, r) => s + r.capacity_mwp, 0),
    annual_gwh: knownEnergy.length ? knownEnergy.reduce((s, r) => s + r.annual_gwh!, 0) : null,
    eligibility_rate: countRatio(eligible, total), pvout_coverage: countRatio(available, eligible) }
}
function reconcile(a: SummaryMeasures, b: SummaryMeasures, label: string): void {
  for (const k of countKeys) equal(a[k], b[k], `${label}.${k}`)
  near(a.capacity_mwp, b.capacity_mwp, `${label}.capacity_mwp`)
  near(a.annual_gwh, b.annual_gwh, `${label}.annual_gwh`)
}
function keys(rows: RecordValue[], fields: string[], label: string): void {
  for (const k of fields) unique(rows.map(r => text(r[k], `${label}.${k}`)), `${label}.${k}`)
}
function unambiguousLabels(rows: RecordValue[], labels: (r: RecordValue) => string[], label: string): void {
  const owners = new Map<string, unknown>()
  for (const row of rows) for (const name of labels(row)) {
    assertData(!owners.has(name) || owners.get(name) === row.id, `${label}: ambiguous identifier/name`)
    owners.set(name, row.id)
  }
}

export function validateDashboardData(value: unknown): asserts value is DashboardData {
  const data = record(value, 'dashboard data')
  validateManifest(data.manifest)
  const manifest = data.manifest, meta = manifest.metadata
  for (const key of Object.keys(DATA_FILES)) validateMetadata(record(data[key], key).metadata, meta)
  const r = record(data.regions, 'regions'), d = record(data.districts, 'districts'), t = record(data.types, 'types')
  measures(r.overall, 'overall'); coverage(record(r.overall, 'overall'), 'overall')
  const regions = records(r.regions, 'regions'), districts = records(d.districts, 'districts'), types = records(t.types, 'types')
  const validation = manifest.validation
  equal(regions.length, validation.regions, 'Region count'); equal(districts.length, validation.districts, 'District count'); equal(types.length, validation.building_types, 'Type count')
  keys(regions, ['id', 'wilayah'], 'regions'); keys(districts, ['id', 'join_key'], 'districts'); keys(types, ['id', 'jenis_group'], 'types')
  for (const row of regions) { measures(row, 'region'); coverage(row, 'region') }
  for (const row of districts) {
    measures(row, 'district')
    const parent = regions.find(p => p.id === row.region_id)
    assertData(parent && row.wilayah === parent.wilayah, 'District has inconsistent parent')
    assertData(text(row.id, 'district.id').startsWith(`${text(row.region_id, 'region_id')}.`), 'District code parent mismatch')
    equal(row.join_key, `${row.wilayah}|${text(row.kecamatan, 'district name')}`, 'District join key')
  }
  for (const row of types) measures(row, 'type')
  const typedRegions = regions as unknown as SummaryMeasures[], typedDistricts = districts as unknown as SummaryMeasures[]
  reconcile(aggregate(typedRegions), r.overall, 'Regions→DKI')
  reconcile(aggregate(typedDistricts), r.overall, 'Districts→DKI')
  reconcile(aggregate(types as unknown as SummaryMeasures[]), r.overall, 'Types→DKI')
  for (const region of regions) reconcile(aggregate(districts.filter(row => row.region_id === region.id) as unknown as SummaryMeasures[]), region as unknown as SummaryMeasures, 'Districts→region')
  for (const k of countKeys) equal(r.overall[k], validation[k], `Manifest ${k}`)
  near(r.overall.capacity_mwp, validation.capacity_mwp, 'Manifest capacity')
  near(r.overall.annual_gwh, validation.annual_gwh, 'Manifest generation')

  const c = record(data.coverage, 'coverage'), coverageRegions = records(c.regions, 'coverage regions')
  coverage(record(c.overall, 'coverage overall'), 'coverage overall')
  equal(coverageRegions.length, regions.length, 'Coverage region count'); keys(coverageRegions, ['region_id'], 'coverage regions')
  const coverageFields = ['eligible_buildings', 'pvout_available', 'pvout_missing', 'capacity_mwp', 'capacity_with_pvout_mwp', 'capacity_without_pvout_mwp', 'pvout_coverage', 'pvout_capacity_coverage']
  for (const row of coverageRegions) {
    coverage(row, 'coverage region')
    const parent = regions.find(r => r.id === row.region_id)
    assertData(parent && parent.wilayah === row.wilayah, 'Coverage region has no matching summary')
    for (const k of coverageFields) near(row[k] as number | null, parent[k] as number | null, `Coverage ${k}`)
  }
  for (const k of coverageFields) near(record(c.overall, 'coverage overall')[k] as number | null, record(r.overall, 'overall')[k] as number | null, `Coverage overall ${k}`)
  for (const k of ['capacity_with_pvout_mwp', 'capacity_without_pvout_mwp']) near(regions.reduce((s, row) => s + (row[k] as number), 0), record(r.overall, 'overall')[k] as number, `Coverage totals ${k}`)

  const admin = record(data.adminCrosswalk, 'admin crosswalk')
  const cr = records(admin.regions, 'region crosswalk'), cd = records(admin.districts, 'district crosswalk'), aliases = records(admin.district_aliases, 'district aliases')
  equal(cr.length, regions.length, 'Region crosswalk count'); equal(cd.length, districts.length, 'District crosswalk count')
  keys(cr, ['id', 'raw_name', 'wilayah'], 'region crosswalk'); keys(cd, ['id', 'join_key'], 'district crosswalk')
  unambiguousLabels(cr, r => [r.id, r.raw_name, r.wilayah].map(v => text(v, 'region label')), 'Region crosswalk')
  unique(aliases.map(a => `${text(a.region_id, 'alias region')}|${text(a.raw_name, 'alias raw name')}`), 'District aliases')
  for (const row of cr) assertData(regions.some(r => r.id === row.id && r.wilayah === row.wilayah), 'Region crosswalk mismatch')
  for (const row of cd) {
    const district = districts.find(d => d.id === row.id)
    assertData(district, 'Unmatched district crosswalk')
    for (const k of ['region_id', 'wilayah', 'kecamatan', 'join_key']) equal(row[k], district[k], `District crosswalk ${k}`)
    text(row.raw_name, 'raw district'); assertData(typeof row.alias_applied === 'boolean', 'Expected alias_applied boolean')
    const alias = aliases.find(a => a.region_id === row.region_id && a.raw_name === row.raw_name)
    equal(row.alias_applied, Boolean(alias), 'Alias application')
    equal(row.kecamatan, alias ? text(alias.kecamatan, 'alias target') : row.raw_name, 'Alias target')
  }
  equal(aliases.length, validation.district_aliases_applied, 'Alias count')
  equal(cd.filter(r => r.alias_applied).length, aliases.length, 'Unused district alias')
  for (const parent of regions) unambiguousLabels(cd.filter(d => d.region_id === parent.id), r =>
    [r.id, r.raw_name, r.kecamatan].map(v => text(v, 'district label')), 'District crosswalk')
  const categories = records(record(data.buildingTypes, 'building types').categories, 'categories')
  equal(categories.length, types.length, 'Canonical category count'); keys(categories, ['id', 'jenis_group'], 'categories')
  const labels: string[] = []
  for (const cat of categories) {
    assertData(types.some(t => t.id === cat.id && t.jenis_group === cat.jenis_group), 'Category/summary mismatch')
    const raw = list(cat.raw_labels, 'raw labels').map(v => text(v, 'raw label'))
    assertData(raw.includes(cat.jenis_group as string), 'Canonical label must map to itself'); labels.push(...raw)
  }
  unique(labels, 'Building type aliases')
  unambiguousLabels(categories, r => [text(r.id, 'type id'), ...(r.raw_labels as string[])], 'Building type lookup')
  for (const [key, filename] of Object.entries(DATA_FILES)) {
    const actual = key === 'adminCrosswalk' ? cd.length : key === 'buildingTypes' ? categories.length :
      key === 'regions' || key === 'coverage' ? regions.length : key === 'districts' ? districts.length : types.length
    equal(manifest.outputs.find(o => o.path === `public/data/${filename}`)!.records, actual, `Manifest records for ${key}`)
  }
}

export function validateBoundaries(value: unknown, level: BoundaryLevel, data: ReadonlyDashboardData): void {
  const geo = record(value, `${level} boundaries`)
  validateMetadata(geo.metadata, data.manifest.metadata as DataMetadata)
  equal(geo.type, 'FeatureCollection', 'Boundary collection type'); assertData(!('crs' in geo), 'Expected normalized CRS84 GeoJSON')
  const features = records(geo.features, 'features')
  const expected = level === 'region' ? data.regions.regions : data.districts.districts
  equal(features.length, expected.length, 'Boundary feature count'); keys(features, ['id'], 'Boundary IDs')
  for (const feature of features) {
    equal(feature.type, 'Feature', 'Feature type')
    const p = record(feature.properties, 'properties'), summary = expected.find(r => r.id === feature.id)
    assertData(summary, 'Boundary has no matching summary ID'); equal(p.id, feature.id, 'Feature/property ID')
    equal(p.wilayah, summary.wilayah, 'Boundary region name')
    equal(p.region_id, level === 'region' ? summary.id : 'region_id' in summary ? summary.region_id : undefined, 'Boundary parent ID')
    if (level === 'district' && 'kecamatan' in summary) {
      equal(p.kecamatan, summary.kecamatan, 'Boundary district name'); equal(p.join_key, summary.join_key, 'Boundary join key')
    }
    const geometry = record(feature.geometry, 'geometry'); equal(geometry.type, 'MultiPolygon', 'Geometry type')
    const polygons = list(geometry.coordinates, 'coordinates'); assertData(polygons.length > 0, 'Empty boundary geometry')
    for (const polygon of polygons) {
      const rings = list(polygon, 'polygon'); assertData(rings.length > 0, 'Empty polygon')
      for (const ring of rings) {
        const positions = list(ring, 'ring'); assertData(positions.length >= 4, 'Short boundary ring')
        for (const position of positions) {
          const point = list(position, 'position')
          assertData(point.length === 2 && point.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(point[0] as number) <= 180 && Math.abs(point[1] as number) <= 90, 'Invalid normalized CRS84 coordinate')
        }
        equal(canonical(positions[0]), canonical(positions.at(-1)), 'Unclosed boundary ring')
      }
    }
  }
  equal(data.manifest.outputs.find(o => o.path === `public/data/${BOUNDARY_FILES[level]}`)!.records, features.length, 'Boundary manifest count')
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
