import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { FeatureCollection, MultiPolygon, Position } from 'geojson'
import type {
  AdminBoundaries, AdminCrosswalkConfig, AdminCrosswalkDataset, BuildingTypeConfig,
  BuildingTypeDataset, CapacityCoverage, CoverageDataset, DataManifest, DataMetadata,
  DistrictCrosswalk, DistrictDataset, DistrictSummary, RegionDataset, RegionSummary,
  SourceFingerprint, SummaryMeasures, TypeDataset, TypeSummary,
} from '../../src/types/solar.ts'

export const TOLERANCE = 0.000001
export const REFERENCES = {
  total_buildings: 1_747_249, eligible_buildings: 1_470_399,
  pvout_available: 1_466_275, pvout_missing: 4_124,
  capacity_mwp: 18_627.766993, annual_gwh: 25_117.476452,
} as const
export const INPUT_FILES = [
  'admin_kabkot_dki.geojson', 'admin_kecamatan_dki.geojson',
  'summary_capacity_dki.csv', 'summary_eligibility_dki.csv',
  'summary_generation_dki.csv', 'summary_jenis_dashboard.csv',
  'summary_kecamatan_dashboard.csv', 'summary_pvout_coverage.csv',
] as const
export type RawInputs = Record<(typeof INPUT_FILES)[number], string>
type Row = Record<string, string>
type RawGeo = FeatureCollection<MultiPolygon, Record<string, unknown>>

const STATS = ['fid', 'WADMKK', 'count', 'unique', 'min', 'max', 'range', 'sum', 'mean',
  'median', 'stddev', 'minority', 'majority', 'q1', 'q3', 'iqr']
const MEASURES = ['total_buildings', 'eligible_buildings', 'eligibility_rate', 'capacity_mwp',
  'pvout_available', 'annual_gwh', 'pvout_missing', 'pvout_coverage']
const COUNT_FIELDS = ['total_buildings', 'eligible_buildings', 'pvout_available', 'pvout_missing'] as const

/** Strict RFC-style CSV parsing: escaped quotes, quoted newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', state: 'start' | 'plain' | 'quoted' | 'closed' = 'start'
  const finishField = () => { row.push(field); field = ''; state = 'start' }
  const finishRow = () => {
    finishField()
    if (row.length !== 1 || row[0] !== '') rows.push(row)
    row = []
  }
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else state = 'closed'
      } else field += char
      continue
    }
    if (char === ',') finishField()
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      finishRow()
    } else if (char === '"' && state === 'start') state = 'quoted'
    else {
      assert(state !== 'closed' && char !== '"', 'Malformed CSV: unexpected character/quote')
      field += char
      state = 'plain'
    }
  }
  assert(state !== 'quoted', 'Malformed CSV: unterminated quoted field')
  if (state !== 'start' || field !== '' || row.length > 0) finishRow()
  assert(rows.length > 0, 'CSV is empty')
  const header = rows[0]!
  unique(header, 'CSV headers')
  assert(header.every(Boolean), 'CSV has an empty header')
  assert(rows.every(r => r.length === header.length), 'CSV has inconsistent column counts')
  return rows
}

export function numeric(value: string, label: string, nullable = false, integer = false): number | null {
  const clean = value.trim()
  if (clean === '') {
    assert(nullable, `${label}: missing numeric value`)
    return null
  }
  assert(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(clean), `${label}: invalid number ${value}`)
  const n = Number(clean)
  assert(Number.isFinite(n) && n >= 0, `${label}: expected finite nonnegative number`)
  assert(!integer || Number.isSafeInteger(n), `${label}: expected safe integer`)
  return n
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

export function coveredGeneration(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null)
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0)
}

function unique(values: string[], label: string): void {
  assert(new Set(values).size === values.length, `${label}: duplicate or ambiguous key`)
}
function near(actual: number | null, expected: number | null, label: string, tolerance = TOLERANCE): void {
  if (actual === null || expected === null) assert.equal(actual, expected, `${label}: null mismatch`)
  else assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`)
}
function requiredText(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.trim() !== '', `${label}: missing text`)
  return value
}
function count(r: Row, key: string, label: string): number {
  return numeric(r[key]!, `${label}.${key}`, false, true)!
}
function number(r: Row, key: string, label: string): number {
  return numeric(r[key]!, `${label}.${key}`)!
}
function csvRows(text: string, expected: string[], label: string, expectedRows: number): Row[] {
  const [header, ...body] = parseCsv(text)
  assert.deepEqual(header, expected, `${label}: schema mismatch; review source changes`)
  assert.equal(body.length, expectedRows, `${label}: row count`)
  const rows = body.map(values => Object.fromEntries(header!.map((key, i) => [key, values[i]!])) as Row)
  unique(rows.map(r => String(count(r, 'fid', label))), `${label} row IDs`)
  return rows
}
function sum<T>(rows: T[], value: (row: T) => number): number {
  return rows.reduce((n, r) => n + value(r), 0)
}

function validateMeasures(m: SummaryMeasures, label: string): void {
  for (const key of COUNT_FIELDS) assert(Number.isSafeInteger(m[key]) && m[key] >= 0, `${label}.${key}: invalid count`)
  assert(m.eligible_buildings <= m.total_buildings, `${label}: eligible exceeds all-building denominator`)
  assert.equal(m.pvout_available + m.pvout_missing, m.eligible_buildings, `${label}: PVOUT counts`)
  assert(Number.isFinite(m.capacity_mwp) && m.capacity_mwp >= 0, `${label}: capacity`)
  assert(m.annual_gwh === null || (Number.isFinite(m.annual_gwh) && m.annual_gwh >= 0), `${label}: generation`)
  assert.equal(m.annual_gwh === null, m.pvout_available === 0, `${label}: generation/PVOUT availability mismatch`)
  near(m.eligibility_rate, ratio(m.eligible_buildings, m.total_buildings), `${label}: eligibility ratio`, 1e-12)
  near(m.pvout_coverage, ratio(m.pvout_available, m.eligible_buildings), `${label}: count coverage`, 1e-12)
}
function measures(r: Row, label: string): SummaryMeasures {
  const m: SummaryMeasures = {
    total_buildings: count(r, 'total_buildings', label),
    eligible_buildings: count(r, 'eligible_buildings', label),
    eligibility_rate: numeric(r.eligibility_rate!, `${label}.eligibility_rate`, true),
    capacity_mwp: number(r, 'capacity_mwp', label),
    annual_gwh: numeric(r.annual_gwh!, `${label}.annual_gwh`, true),
    pvout_available: count(r, 'pvout_available', label),
    pvout_missing: count(r, 'pvout_missing', label),
    pvout_coverage: numeric(r.pvout_coverage!, `${label}.pvout_coverage`, true),
  }
  validateMeasures(m, label)
  return m
}
export function aggregate(rows: SummaryMeasures[]): SummaryMeasures {
  const total_buildings = sum(rows, r => r.total_buildings)
  const eligible_buildings = sum(rows, r => r.eligible_buildings)
  const pvout_available = sum(rows, r => r.pvout_available)
  const m: SummaryMeasures = {
    total_buildings, eligible_buildings, eligibility_rate: ratio(eligible_buildings, total_buildings),
    capacity_mwp: sum(rows, r => r.capacity_mwp), annual_gwh: coveredGeneration(rows.map(r => r.annual_gwh)),
    pvout_available, pvout_missing: sum(rows, r => r.pvout_missing),
    pvout_coverage: ratio(pvout_available, eligible_buildings),
  }
  validateMeasures(m, 'aggregate')
  return m
}
function reconcile(a: SummaryMeasures, b: SummaryMeasures, label: string): void {
  for (const key of COUNT_FIELDS) assert.equal(a[key], b[key], `${label}.${key}`)
  near(a.capacity_mwp, b.capacity_mwp, `${label}.capacity_mwp`)
  near(a.annual_gwh, b.annual_gwh, `${label}.annual_gwh`)
}
function statsRows(text: string, label: string, coverage = false): Row[] {
  const header = coverage ? [...STATS.slice(0, 2), 'pvout_status', ...STATS.slice(2)] : STATS
  const rows = csvRows(text, header, label, coverage ? 7 : 6)
  for (const r of rows) {
    requiredText(r.WADMKK, `${label}.WADMKK`)
    for (const key of STATS.filter(k => k !== 'WADMKK')) numeric(r[key]!, `${label}.${key}`, false, ['fid', 'count', 'unique'].includes(key))
    assert(count(r, 'unique', label) <= count(r, 'count', label), `${label}: unique exceeds count`)
    assert(number(r, 'min', label) <= number(r, 'q1', label) && number(r, 'q1', label) <= number(r, 'median', label)
      && number(r, 'median', label) <= number(r, 'q3', label) && number(r, 'q3', label) <= number(r, 'max', label), `${label}: invalid quantiles`)
    near(number(r, 'range', label), number(r, 'max', label) - number(r, 'min', label), `${label}: range`)
    near(number(r, 'iqr', label), number(r, 'q3', label) - number(r, 'q1', label), `${label}: IQR`)
    near(number(r, 'mean', label), number(r, 'sum', label) / count(r, 'count', label), `${label}: mean`)
    if (coverage) assert(['Available', 'NoData'].includes(r.pvout_status!), `${label}: unknown PVOUT status`)
  }
  unique(rows.map(r => r.WADMKK! + (coverage ? `|${r.pvout_status}` : '')), `${label} groups`)
  return rows
}

function validateCrosswalks(admin: AdminCrosswalkConfig, types: BuildingTypeConfig): void {
  assert.equal(admin.regions.length, 6, 'Expected six region mappings')
  unique(admin.regions.map(r => requiredText(r.id, 'region id')), 'Region codes')
  unique(admin.regions.map(r => requiredText(r.raw_name, 'raw region')), 'Raw region names')
  unique(admin.regions.map(r => requiredText(r.wilayah, 'canonical region')), 'Canonical region names')
  for (const r of admin.regions) assert(/^31\.\d{2}$/.test(r.id), 'Invalid region code')
  assert.equal(admin.district_aliases.length, 5, 'Expected five explicit district aliases')
  unique(admin.district_aliases.map(a => `${a.region_id}|${requiredText(a.raw_name, 'raw district alias')}`), 'District aliases')
  unique(admin.district_aliases.map(a => `${a.region_id}|${requiredText(a.kecamatan, 'canonical district alias')}`), 'Canonical district aliases')
  for (const a of admin.district_aliases) assert(admin.regions.some(r => r.id === a.region_id), 'Alias has unknown parent')
  assert.equal(types.categories.length, 7, 'Expected seven canonical categories')
  unique(types.categories.map(t => requiredText(t.id, 'type id')), 'Type IDs')
  unique(types.categories.map(t => requiredText(t.jenis_group, 'canonical type')), 'Canonical types')
  unique(types.categories.flatMap(t => t.raw_labels.map(l => requiredText(l, 'raw type'))), 'Type aliases')
  for (const t of types.categories) assert(t.raw_labels.includes(t.jenis_group), 'Canonical type must map to itself')
}

export function canonicalType(raw: string, config: BuildingTypeConfig): string {
  const matches = config.categories.filter(t => t.raw_labels.includes(raw))
  assert.equal(matches.length, 1, `Unknown or ambiguous building type: ${raw}`)
  return matches[0]!.jenis_group
}

function readGeometry(text: string, expectedCount: number, label: string): RawGeo {
  const geo = JSON.parse(text) as RawGeo
  assert.equal(geo.type, 'FeatureCollection', `${label}: expected FeatureCollection`)
  const crs = (geo as unknown as { crs?: { properties?: { name?: string } } }).crs?.properties?.name
  assert.equal(crs, 'urn:ogc:def:crs:OGC:1.3:CRS84', `${label}: unexpected CRS; do not implicitly reproject`)
  assert(Array.isArray(geo.features) && geo.features.length === expectedCount, `${label}: feature count`)
  for (const f of geo.features) {
    assert(f.type === 'Feature' && f.geometry?.type === 'MultiPolygon' && f.properties, `${label}: geometry/properties`)
  }
  return geo
}

export function normalizeGeometry(geometry: MultiPolygon): MultiPolygon {
  assert(Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0, 'Empty MultiPolygon')
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(polygon => {
    assert(Array.isArray(polygon) && polygon.length > 0, 'Empty polygon')
    return polygon.map((ring, index) => {
      assert(Array.isArray(ring) && ring.length >= 4, 'Short polygon ring')
      const clean: Position[] = ring.map(position => {
        assert(Array.isArray(position) && (position.length === 2 || position.length === 3), 'Unexpected coordinate dimensions')
        const [x, y, z] = position
        assert(typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
          && Math.abs(x) <= 180 && Math.abs(y) <= 90, 'Invalid CRS84 coordinate')
        assert(z === undefined || z === 0, 'Nonzero Z requires review before removal')
        return [x, y]
      })
      assert.deepEqual(clean[0], clean.at(-1), 'Unclosed polygon ring')
      const [ox, oy] = clean[0]!
      let area = 0
      for (let i = 0; i < clean.length - 1; i++) {
        const a = clean[i]!, b = clean[i + 1]!
        area += (a[0]! - ox!) * (b[1]! - oy!) - (b[0]! - ox!) * (a[1]! - oy!)
      }
      assert(area !== 0, 'Degenerate polygon ring')
      return (index === 0 ? area < 0 : area > 0) ? clean.reverse() : clean
    })
  }) }
}

export interface DatasetBundle {
  regions: RegionDataset
  districts: DistrictDataset
  types: TypeDataset
  coverage: CoverageDataset
  regionBoundaries: AdminBoundaries
  districtBoundaries: AdminBoundaries
  adminCrosswalk: AdminCrosswalkDataset
  buildingTypes: BuildingTypeDataset
}

/** Pure compilation. Statistics are read only from CSV, never from the building archive. */
export function compileDataset(inputs: RawInputs, admin: AdminCrosswalkConfig, typeConfig: BuildingTypeConfig, metadata: DataMetadata): DatasetBundle {
  validateCrosswalks(admin, typeConfig)
  const regionGeo = readGeometry(inputs['admin_kabkot_dki.geojson'], 6, 'region GeoJSON')
  const districtGeo = readGeometry(inputs['admin_kecamatan_dki.geojson'], 44, 'district GeoJSON')
  const orderedRegions = [...admin.regions].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const byRawRegion = new Map(orderedRegions.map(r => [r.raw_name, r]))
  const byName = new Map(orderedRegions.map(r => [r.wilayah, r]))
  const normalizedRegions: AdminBoundaries = {
    type: 'FeatureCollection', metadata,
    features: regionGeo.features.map(f => {
      const region = byRawRegion.get(requiredText(f.properties.WADMKK, 'raw region name'))
      assert(region && f.properties.KDPKAB === region.id, 'Unmatched region geometry or code')
      return { type: 'Feature' as const, id: region.id,
        properties: { id: region.id, region_id: region.id, wilayah: region.wilayah }, geometry: normalizeGeometry(f.geometry) }
    }).sort((a, b) => a.properties.id.localeCompare(b.properties.id, 'en')),
  }
  unique(normalizedRegions.features.map(f => f.properties.id), 'Region geometry IDs')
  const crosswalk: DistrictCrosswalk[] = districtGeo.features.map(f => {
    const parent = byRawRegion.get(requiredText(f.properties.WADMKK, 'district parent name'))
    assert(parent && f.properties.KDPKAB === parent.id, 'Unmatched district parent/code')
    const id = requiredText(f.properties.KDCPUM, 'district code')
    assert(id.startsWith(parent.id + '.') && /^31\.\d{2}\.\d{2}$/.test(id), 'Inconsistent district code parent')
    const raw_name = requiredText(f.properties.WADMKC, 'raw district name')
    const alias = admin.district_aliases.find(a => a.region_id === parent.id && a.raw_name === raw_name)
    const kecamatan = alias?.kecamatan ?? raw_name
    return { id, region_id: parent.id, wilayah: parent.wilayah, raw_name, kecamatan,
      join_key: `${parent.wilayah}|${kecamatan}`, alias_applied: Boolean(alias) }
  }).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  unique(crosswalk.map(d => d.id), 'District geometry codes')
  unique(crosswalk.map(d => d.join_key), 'District geometry join keys')
  assert.equal(crosswalk.filter(d => d.alias_applied).length, 5, 'All five district aliases must be used')
  const normalizedDistricts: AdminBoundaries = {
    type: 'FeatureCollection', metadata,
    features: districtGeo.features.map(f => {
      const d = crosswalk.find(d => d.id === f.properties.KDCPUM)!
      return { type: 'Feature' as const, id: d.id, properties: { id: d.id, region_id: d.region_id,
        wilayah: d.wilayah, kecamatan: d.kecamatan, join_key: d.join_key }, geometry: normalizeGeometry(f.geometry) }
    }).sort((a, b) => a.properties.id.localeCompare(b.properties.id, 'en')),
  }
  const eligibility = statsRows(inputs['summary_eligibility_dki.csv'], 'eligibility')
  const capacity = statsRows(inputs['summary_capacity_dki.csv'], 'capacity')
  const generation = statsRows(inputs['summary_generation_dki.csv'], 'generation')
  const coverage = statsRows(inputs['summary_pvout_coverage.csv'], 'coverage', true)
  for (const [label, rows] of [['eligibility', eligibility], ['capacity', capacity], ['generation', generation], ['coverage', coverage]] as const)
    for (const r of rows) assert(byName.has(r.WADMKK!), `${label}: unknown region ${r.WADMKK}`)

  const regions: RegionSummary[] = orderedRegions.map(region => {
    const e = eligibility.find(r => r.WADMKK === region.wilayah)!
    const c = capacity.find(r => r.WADMKK === region.wilayah)!
    const g = generation.find(r => r.WADMKK === region.wilayah)!
    assert(e && c && g, `Missing regional summary: ${region.wilayah}`)
    const status = coverage.filter(r => r.WADMKK === region.wilayah)
    const available = status.find(r => r.pvout_status === 'Available')
    const missing = status.find(r => r.pvout_status === 'NoData')
    assert(available, `${region.wilayah}: missing Available coverage group`)
    const eligible_buildings = count(e, 'sum', 'eligible')
    assert.equal(count(c, 'count', 'capacity'), eligible_buildings, 'Capacity count must equal eligible')
    const pvout_available = count(available, 'count', 'coverage')
    const pvout_missing = missing ? count(missing, 'count', 'coverage') : 0
    assert.equal(count(g, 'count', 'generation'), pvout_available, 'Generation count must equal covered')
    const capacity_mwp = number(c, 'sum', 'capacity')
    const capacity_with_pvout_mwp = number(available, 'sum', 'coverage')
    const capacity_without_pvout_mwp = missing ? number(missing, 'sum', 'coverage') : 0
    near(capacity_with_pvout_mwp + capacity_without_pvout_mwp, capacity_mwp, 'Coverage MWp reconciliation')
    const m: RegionSummary = { id: region.id, wilayah: region.wilayah,
      total_buildings: count(e, 'count', 'eligibility'), eligible_buildings,
      eligibility_rate: number(e, 'mean', 'eligibility'), capacity_mwp,
      annual_gwh: pvout_available === 0 ? null : number(g, 'sum', 'generation'),
      pvout_available, pvout_missing, pvout_coverage: ratio(pvout_available, eligible_buildings),
      capacity_with_pvout_mwp, capacity_without_pvout_mwp,
      pvout_capacity_coverage: ratio(capacity_with_pvout_mwp, capacity_mwp) }
    validateMeasures(m, region.wilayah)
    return m
  })

  const districtRows = csvRows(inputs['summary_kecamatan_dashboard.csv'],
    ['fid', 'kecamatan', 'wilayah', ...MEASURES.slice(0, 3), 'join_key', ...MEASURES.slice(3)], 'districts', 44)
  unique(districtRows.map(r => requiredText(r.join_key, 'district join_key')), 'District summary join keys')
  const districts: DistrictSummary[] = districtRows.map(r => {
    const wilayah = requiredText(r.wilayah, 'summary region'), kecamatan = requiredText(r.kecamatan, 'summary district')
    assert.equal(r.join_key, `${wilayah}|${kecamatan}`, 'Incorrect stored district join key')
    const d = crosswalk.find(d => d.join_key === r.join_key)
    assert(d, `Unmatched district summary: ${r.join_key}`)
    return { id: d.id, region_id: d.region_id, wilayah, kecamatan, join_key: d.join_key, ...measures(r, d.join_key) }
  }).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  unique(districts.map(d => d.id), 'Joined district IDs')
  for (const r of regions) reconcile(aggregate(districts.filter(d => d.region_id === r.id)), r, `District→${r.wilayah}`)

  const typeRows = csvRows(inputs['summary_jenis_dashboard.csv'], ['fid', 'jenis_group', ...MEASURES], 'types', 7)
  const types: TypeSummary[] = typeRows.map(r => {
    const jenis_group = canonicalType(requiredText(r.jenis_group, 'type label'), typeConfig)
    const id = typeConfig.categories.find(t => t.jenis_group === jenis_group)!.id
    return { id, jenis_group, ...measures(r, jenis_group) }
  }).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  unique(types.map(t => t.id), 'Canonical summary types')
  const combined = aggregate(regions)
  reconcile(aggregate(districts), combined, 'District→DKI')
  reconcile(aggregate(types), combined, 'Type→DKI')
  for (const key of COUNT_FIELDS) assert.equal(combined[key], REFERENCES[key], `Reference ${key}`)
  near(combined.capacity_mwp, REFERENCES.capacity_mwp, 'Reference capacity')
  near(combined.annual_gwh, REFERENCES.annual_gwh, 'Reference covered generation')
  const nullDistricts = districts.filter(d => d.annual_gwh === null)
  assert.equal(nullDistricts.length, 1, 'Exactly one district must retain unavailable generation')
  assert.equal(nullDistricts[0]!.join_key, 'Kepulauan Seribu|Kepulauan Seribu Utara', 'Unexpected missing-generation district')
  assert(regions.every(r => r.wilayah === 'Kepulauan Seribu' || r.pvout_missing === 0), 'Unexpected missing PVOUT region')

  const capacityCoverage: CapacityCoverage = {
    capacity_with_pvout_mwp: sum(regions, r => r.capacity_with_pvout_mwp),
    capacity_without_pvout_mwp: sum(regions, r => r.capacity_without_pvout_mwp),
    pvout_capacity_coverage: ratio(sum(regions, r => r.capacity_with_pvout_mwp), combined.capacity_mwp),
  }
  return {
    regions: { metadata, overall: { ...combined, ...capacityCoverage }, regions },
    districts: { metadata, districts }, types: { metadata, types },
    coverage: { metadata, overall: { eligible_buildings: combined.eligible_buildings,
      pvout_available: combined.pvout_available, pvout_missing: combined.pvout_missing,
      pvout_coverage: combined.pvout_coverage, capacity_mwp: combined.capacity_mwp, ...capacityCoverage },
      regions: regions.map(r => ({ region_id: r.id, wilayah: r.wilayah, eligible_buildings: r.eligible_buildings,
        pvout_available: r.pvout_available, pvout_missing: r.pvout_missing, pvout_coverage: r.pvout_coverage,
        capacity_mwp: r.capacity_mwp, capacity_with_pvout_mwp: r.capacity_with_pvout_mwp,
        capacity_without_pvout_mwp: r.capacity_without_pvout_mwp, pvout_capacity_coverage: r.pvout_capacity_coverage })) },
    regionBoundaries: normalizedRegions, districtBoundaries: normalizedDistricts,
    adminCrosswalk: { metadata, regions: orderedRegions, district_aliases: admin.district_aliases, districts: crosswalk },
    buildingTypes: { metadata, categories: typeConfig.categories },
  }
}

export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}
export async function fingerprint(root: string, path: string, role: SourceFingerprint['role']): Promise<SourceFingerprint> {
  const full = resolve(root, path), hash = createHash('sha256')
  for await (const chunk of createReadStream(full)) hash.update(chunk)
  return { path, bytes: (await stat(full)).size, sha256: hash.digest('hex'), role }
}

export async function loadDataset(root: string): Promise<DatasetBundle> {
  const inputs = Object.fromEntries(await Promise.all(INPUT_FILES.map(async name =>
    [name, await readFile(resolve(root, 'data/raw', name), 'utf8')]))) as RawInputs
  const admin = JSON.parse(await readFile(resolve(root, 'data/crosswalks/admin.json'), 'utf8')) as AdminCrosswalkConfig
  const types = JSON.parse(await readFile(resolve(root, 'data/crosswalks/building-types.json'), 'utf8')) as BuildingTypeConfig
  const sources = await Promise.all([
    ...INPUT_FILES.map(name => fingerprint(root, `data/raw/${name}`, name.endsWith('.csv') ? 'statistics' : 'boundaries')),
    fingerprint(root, 'data/crosswalks/admin.json', 'crosswalk'),
    fingerprint(root, 'data/crosswalks/building-types.json', 'crosswalk'),
    fingerprint(root, 'data/raw/buildings_eligible_pvout.mbtiles', 'building_visualization'),
  ])
  sources.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  const producerFiles = ['scripts/lib/data-pipeline.ts', 'scripts/prepare-data.ts', 'src/types/solar.ts']
  const producer = { name: 'jakarta-solar-data', version: '1.0.0',
    sha256: sha256(JSON.stringify(await Promise.all(producerFiles.map(async path => ({ path,
      sha256: sha256(await readFile(resolve(root, path))) }))))) }
  const metadata: DataMetadata = {
    schema_version: '1.0.0', data_version: `dki-solar-${sha256(JSON.stringify({ producer, sources })).slice(0, 16)}`,
    producer, coverage: 'DKI Jakarta', units: { capacity: 'MWp', generation: 'GWh/year', area: 'm2', ratios: '0–1' },
    generation_scope: 'PVOUT-covered eligible buildings only',
    verification: 'export_arithmetic_validated; source_model_topology_and_rights_pending', sources,
  }
  return compileDataset(inputs, admin, types, metadata)
}

export function serializeDataset(bundle: DatasetBundle): Map<string, string> {
  const entries: [string, unknown, number][] = [
    ['summary_wilayah.json', bundle.regions, 6], ['summary_kecamatan.json', bundle.districts, 44],
    ['summary_jenis.json', bundle.types, 7], ['summary_pvout_coverage.json', bundle.coverage, 6],
    ['admin_kabkot.geojson', bundle.regionBoundaries, 6], ['admin_kecamatan.geojson', bundle.districtBoundaries, 44],
    ['admin_crosswalk.json', bundle.adminCrosswalk, 44], ['building_type_crosswalk.json', bundle.buildingTypes, 7],
  ]
  const files = new Map(entries.map(([name, value]) => [name, JSON.stringify(value, null, name.endsWith('.geojson') ? undefined : 2) + '\n']))
  const m = bundle.regions.overall
  const manifest: DataManifest = {
    metadata: bundle.regions.metadata,
    validation: { regions: 6, districts: 44, building_types: 7,
      district_aliases_applied: bundle.adminCrosswalk.districts.filter(d => d.alias_applied).length,
      unmatched_administrative_joins: 0, total_buildings: m.total_buildings, eligible_buildings: m.eligible_buildings,
      pvout_available: m.pvout_available, pvout_missing: m.pvout_missing,
      capacity_mwp: m.capacity_mwp, annual_gwh: m.annual_gwh, tolerance: TOLERANCE },
    outputs: entries.map(([name, , records]) => ({ path: `public/data/${name}`,
      bytes: Buffer.byteLength(files.get(name)!), sha256: sha256(files.get(name)!), records })),
  }
  files.set('data_manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  return files
}
