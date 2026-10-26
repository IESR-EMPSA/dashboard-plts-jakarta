import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { AdminCrosswalkConfig, BuildingTypeConfig } from '../src/types/solar.ts'
import {
  INPUT_FILES, aggregate, canonicalType, compileDataset, coveredGeneration, loadDataset,
  normalizeGeometry, numeric, parseCsv, ratio, serializeDataset, sha256,
} from '../scripts/lib/data-pipeline.ts'
import type { RawInputs } from '../scripts/lib/data-pipeline.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inputs = Object.fromEntries(await Promise.all(INPUT_FILES.map(async name =>
  [name, await readFile(resolve(root, 'data/raw', name), 'utf8')]))) as RawInputs
const admin = JSON.parse(await readFile(resolve(root, 'data/crosswalks/admin.json'), 'utf8')) as AdminCrosswalkConfig
const types = JSON.parse(await readFile(resolve(root, 'data/crosswalks/building-types.json'), 'utf8')) as BuildingTypeConfig
const bundle = await loadDataset(root)
const compile = (raw = inputs, a = admin, t = types) => compileDataset(raw, a, t, bundle.regions.metadata)

function mutateCsv(file: keyof RawInputs, change: (rows: string[][]) => void): RawInputs {
  const rows = parseCsv(inputs[file])
  change(rows)
  const csv = rows.map(r => r.map(v => /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v).join(',')).join('\r\n') + '\r\n'
  return { ...inputs, [file]: csv }
}

test('CSV supports BOM, quoted commas/newlines, escaped quotes and trailing empty cells', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n1,"two, ""quoted""\nlines",\r\n'),
    [['a', 'b', 'c'], ['1', 'two, "quoted"\nlines', '']])
})
test('CSV rejects malformed quotes, duplicate headers and incorrect row lengths', () => {
  for (const source of ['a,b\n"open,2', 'a,b\n"one"x,2', 'a,a\n1,2', 'a,b\n1,2,3', 'a,b\n1"x,2'])
    assert.throws(() => parseCsv(source))
})
test('strict numeric parsing preserves nullable blanks and rejects unsafe/invalid values', () => {
  assert.equal(numeric('', 'annual_gwh', true), null)
  assert.equal(numeric('0', 'annual_gwh', true), 0)
  assert.equal(numeric('1.25e2', 'capacity'), 125)
  for (const value of ['', 'NaN', 'Infinity', '0x10', '1,234', '-1']) assert.throws(() => numeric(value, 'value'))
  assert.throws(() => numeric('1.5', 'count', false, true))
  assert.throws(() => numeric('9007199254740992', 'count', false, true))
})
test('covered generation retains all-null missingness and actual zero', () => {
  assert.equal(coveredGeneration([null, null]), null)
  assert.equal(coveredGeneration([null, 0]), 0)
  assert.equal(coveredGeneration([2, null, 3]), 5)
  assert.equal(ratio(0, 10), 0)
  assert.equal(ratio(0, 0), null)
})
test('real exports reconcile and use all analyzed buildings as the denominator', () => {
  const m = bundle.regions.overall
  assert.equal(m.total_buildings, 1_747_249)
  assert.equal(m.eligible_buildings, 1_470_399)
  assert.equal(m.pvout_available, 1_466_275)
  assert.equal(m.pvout_missing, 4_124)
  assert(Math.abs(m.capacity_mwp - 18_627.766993) < 0.000001)
  assert(Math.abs(m.annual_gwh! - 25_117.476452) < 0.000001)
  assert.equal(m.eligibility_rate, m.eligible_buildings / m.total_buildings)
  assert.notEqual(m.pvout_coverage, m.pvout_capacity_coverage)
})
test('all-null district generation survives serialization and a district rollup', () => {
  const north = bundle.districts.districts.find(d => d.kecamatan === 'Kepulauan Seribu Utara')!
  assert.equal(north.annual_gwh, null)
  assert(north.capacity_mwp > 0)
  assert.equal(aggregate([north]).annual_gwh, null)
  const serialized = JSON.parse(serializeDataset(bundle).get('summary_kecamatan.json')!)
  assert.equal(serialized.districts.find((d: { id: string }) => d.id === north.id).annual_gwh, null)
})
test('all administrative joins are one-to-one, including the five explicit aliases', () => {
  assert.equal(bundle.adminCrosswalk.regions.length, 6)
  assert.equal(bundle.adminCrosswalk.districts.length, 44)
  assert.equal(bundle.adminCrosswalk.districts.filter(d => d.alias_applied).length, 5)
  for (const d of bundle.districts.districts) {
    const f = bundle.districtBoundaries.features.find(f => f.id === d.id)!
    assert.equal(f.properties.join_key, d.join_key)
    assert.equal(f.properties.region_id, d.region_id)
  }
})
test('type aliases are explicit, canonical and unknown values fail', () => {
  assert.equal(canonicalType('HUNIAN', types), 'Hunian')
  assert.equal(canonicalType('NON HUNIAN', types), 'Non Hunian')
  assert.equal(canonicalType('PEMERINTAHAN', types), 'Pemerintahan')
  assert.throws(() => canonicalType('hunian', types), /Unknown or ambiguous/)
  const bad = structuredClone(types)
  bad.categories[1]!.raw_labels.push('HUNIAN')
  assert.throws(() => compile(inputs, admin, bad), /duplicate or ambiguous/)
})
test('geometry derivative drops only zero Z, normalizes winding and leaves source untouched', () => {
  const geometry = { type: 'MultiPolygon' as const, coordinates: [[[[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]]]] }
  const before = structuredClone(geometry), result = normalizeGeometry(geometry)
  assert.deepEqual(geometry, before)
  assert.deepEqual(result.coordinates[0]![0], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])
  const nonzero = structuredClone(geometry)
  nonzero.coordinates[0]![0]![0]![2] = 5
  assert.throws(() => normalizeGeometry(nonzero), /Nonzero Z/)
})
test('published boundaries keep every source position and use minimal stable properties', () => {
  for (const [name, normalized] of [['admin_kabkot_dki.geojson', bundle.regionBoundaries],
    ['admin_kecamatan_dki.geojson', bundle.districtBoundaries]] as const) {
    const source = JSON.parse(inputs[name])
    assert.equal(normalized.features.length, source.features.length)
    const positions = (coordinates: unknown): string[] => {
      const a = coordinates as unknown[]
      return typeof a[0] === 'number' ? [JSON.stringify(a.slice(0, 2))] : a.flatMap(positions)
    }
    const rawPositions = source.features.flatMap((f: { geometry: { coordinates: unknown } }) => positions(f.geometry.coordinates)).sort()
    const cleanPositions = normalized.features.flatMap(f => positions(f.geometry.coordinates)).sort()
    assert.deepEqual(cleanPositions, rawPositions)
    assert(!('crs' in normalized))
    assert(normalized.features.every(f => f.id === f.properties.id && !('WIADKK' in f.properties)))
  }
})
test('missing generation cannot be silently converted to zero', () => {
  const changed = mutateCsv('summary_kecamatan_dashboard.csv', rows => {
    const row = rows.find(r => r[1] === 'Kepulauan Seribu Utara')!
    row[rows[0]!.indexOf('annual_gwh')] = '0'
  })
  assert.throws(() => compile(changed), /availability mismatch/)
})
test('a missing capacity value fails instead of becoming zero', () => {
  const changed = mutateCsv('summary_jenis_dashboard.csv', rows => {
    rows[1]![rows[0]!.indexOf('capacity_mwp')] = ''
  })
  assert.throws(() => compile(changed), /missing numeric/)
})
test('inconsistent PVOUT counts and export sums fail reconciliation', () => {
  const badCount = mutateCsv('summary_kecamatan_dashboard.csv', rows => {
    const i = rows[0]!.indexOf('pvout_available')
    rows[1]![i] = String(Number(rows[1]![i]) - 1)
  })
  assert.throws(() => compile(badCount), /PVOUT counts/)
  const badCapacity = mutateCsv('summary_jenis_dashboard.csv', rows => {
    const i = rows[0]!.indexOf('capacity_mwp')
    rows[1]![i] = String(Number(rows[1]![i]) + 1)
  })
  assert.throws(() => compile(badCapacity), /Type→DKI.capacity_mwp/)
})
test('unknown/duplicate district joins and incomplete aliases fail', () => {
  const unknown = mutateCsv('summary_kecamatan_dashboard.csv', rows => {
    rows[1]![1] = 'Unrecognized district'
    rows[1]![rows[0]!.indexOf('join_key')] = `${rows[1]![2]}|Unrecognized district`
  })
  assert.throws(() => compile(unknown), /Unmatched district/)
  const duplicate = mutateCsv('summary_kecamatan_dashboard.csv', rows => { rows[2] = [...rows[1]!] })
  assert.throws(() => compile(duplicate), /duplicate/)
  const badAdmin = structuredClone(admin)
  badAdmin.district_aliases[0]!.raw_name = 'Unexpected raw name'
  assert.throws(() => compile(inputs, badAdmin), /five district aliases/)
})
test('unexpected source schema/CRS or duplicate geometry codes stop generation', () => {
  const changed = mutateCsv('summary_capacity_dki.csv', rows => { rows[0]![1] = 'region' })
  assert.throws(() => compile(changed), /schema mismatch/)
  const geo = JSON.parse(inputs['admin_kecamatan_dki.geojson'])
  geo.features[1].properties.KDCPUM = geo.features[0].properties.KDCPUM
  assert.throws(() => compile({ ...inputs, 'admin_kecamatan_dki.geojson': JSON.stringify(geo) }), /duplicate/)
  const badCrs = JSON.parse(inputs['admin_kabkot_dki.geojson'])
  badCrs.crs.properties.name = 'EPSG:3857'
  assert.throws(() => compile({ ...inputs, 'admin_kabkot_dki.geojson': JSON.stringify(badCrs) }), /unexpected CRS/)
})
test('serialization is byte-deterministic and manifest hashes cover all other outputs', () => {
  const first = serializeDataset(bundle), second = serializeDataset(compile())
  assert.deepEqual([...first], [...second])
  assert.equal(first.size, 9)
  const manifest = JSON.parse(first.get('data_manifest.json')!)
  for (const output of manifest.outputs) {
    const content = first.get(output.path.replace('public/data/', ''))!
    assert.equal(output.sha256, sha256(content))
    assert.equal(output.bytes, Buffer.byteLength(content))
  }
  assert(bundle.regions.metadata.sources.some(s => s.role === 'building_visualization'))
})
