import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createApp } from 'vue'
import type { GeoJSONSourceSpecification } from 'maplibre-gl'
import type { AdminBoundaries, DataManifest } from '../src/types/solar.ts'
import type { ReadonlyDashboardData, SolarDataService } from '../src/types/dashboard.ts'
import { createSolarDataService } from '../src/services/solarDataService.ts'
import { SolarDataError } from '../src/services/dataError.ts'
import { adaptBuildingProperties, createNormalizers } from '../src/services/normalization.ts'
import { copyBoundaryGeoJson } from '../src/services/boundaryGeoJson.ts'
import { selectBuildingTypeLabels, selectDkiKpis, selectDistrictKpis, selectDistrictStatistics, selectKpis, selectRegionKpis, selectTypeKpis, selectTypeStatistics } from '../src/selectors/dashboard.ts'
import { createDashboardStore } from '../src/stores/dashboard.ts'
import { dashboardKey, useDashboard } from '../src/composables/useDashboard.ts'
import { formatNumber, gwhToTwh, mwpToGwp, ratioToPercent } from '../src/utils/format.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = new Map(await Promise.all((await readdir(resolve(root, 'public/data'))).map(async name =>
  [name, await readFile(resolve(root, 'public/data', name), 'utf8')] as const)))
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
function server(assets = files) {
  const calls: string[] = []
  const fetch: typeof globalThis.fetch = async input => {
    const name = new URL(String(input), 'https://local.test').pathname.split('/').at(-1)!
    calls.push(name)
    const body = assets.get(name)
    return body === undefined ? new Response('Not found', { status: 404 }) : new Response(body, { headers: { 'Content-Type': 'application/json' } })
  }
  return { calls, fetch }
}
function service(assets = files) {
  const fixture = server(assets)
  return { ...fixture, service: createSolarDataService({ fetch: fixture.fetch }) }
}
const baseline = service()
const data = await baseline.service.loadSummaries()
const regionGeometry = await baseline.service.loadBoundaries('region')
const districtGeometry = await baseline.service.loadBoundaries('district')
const emptyFilters = { regionId: null, districtId: null, typeId: null }

/** Mutations are isolated negative test cases, never written to public or raw data. */
function changed(name: string, mutate: (document: any) => void, updateManifest = true): Map<string, string> {
  const copy = new Map(files), document: unknown = JSON.parse(copy.get(name)!)
  mutate(document)
  const body = JSON.stringify(document)
  copy.set(name, body)
  if (name !== 'data_manifest.json' && updateManifest) {
    const manifest = JSON.parse(copy.get('data_manifest.json')!) as DataManifest
    const entry = manifest.outputs.find(o => o.path === `public/data/${name}`)!
    entry.bytes = Buffer.byteLength(body); entry.sha256 = hash(body)
    copy.set('data_manifest.json', JSON.stringify(manifest))
  }
  return copy
}
function code(expected: string) {
  return (error: unknown) => error instanceof SolarDataError && error.code === expected
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('summary requests are deduplicated, cached and independent of large boundary requests', async () => {
  const f = service(), first = f.service.loadSummaries(), second = f.service.loadSummaries()
  assert.equal(first, second)
  const snapshot = await first
  assert.equal(await f.service.loadSummaries(), snapshot)
  assert.equal(f.calls.length, 7)
  assert(!f.calls.some(n => n.endsWith('.geojson')))
  assert(Object.isFrozen(snapshot.regions.overall))
  assert.throws(() => { (snapshot.regions.overall as { total_buildings: number }).total_buildings = 0 })
})
test('lazy boundary requests are cached and all feature IDs agree with summary IDs', async () => {
  const f = service()
  const first = f.service.loadBoundaries('district'), second = f.service.loadBoundaries('district')
  assert.equal(first, second)
  const districts = await first, regions = await f.service.loadBoundaries('region')
  assert.equal(f.calls.length, 9)
  assert.deepEqual(districts.features.map(f => f.id), data.districts.districts.map(d => d.id))
  assert.deepEqual(regions.features.map(f => f.id), data.regions.regions.map(r => r.id))
  assert(Object.isFrozen(districts.features[0]!.geometry.coordinates))
})
test('all DKI, six region, 44 district and seven type selectors use validated summary records', () => {
  const result = selectDkiKpis(data)
  assert.equal(result.status, 'available')
  if (result.status !== 'available') throw Error('Expected DKI data')
  assert.equal(result.data.total_buildings, 1_747_249)
  assert.equal(result.data.eligible_buildings, 1_470_399)
  assert.equal(result.data.pvout_available, 1_466_275)
  assert.equal(result.data.pvout_missing, 4_124)
  assert(Math.abs(result.data.capacity_mwp - 18_627.766993) < 0.000001)
  assert(Math.abs(result.data.annual_gwh! - 25_117.476452) < 0.000001)
  assert.equal(result.data.eligibility_rate, 1_470_399 / 1_747_249)
  for (const [rows, selector] of [[data.regions.regions, selectRegionKpis], [data.districts.districts, selectDistrictKpis], [data.types.types, selectTypeKpis]] as const) {
    for (const record of rows) {
      const selected = selector(data, record.id)
      assert.equal(selected.status, 'available')
      if (selected.status === 'available') {
        assert.equal(selected.data.total_buildings, record.total_buildings)
        assert.equal(selected.data.capacity_mwp, record.capacity_mwp)
        assert.equal(selected.data.annual_gwh, record.annual_gwh)
      }
    }
  }
})
test('null generation, partial coverage and count versus MWp denominators stay distinct', () => {
  const north = data.districts.districts.find(d => d.kecamatan === 'Kepulauan Seribu Utara')!
  const selected = selectDistrictKpis(data, north.id)
  if (selected.status !== 'available') throw Error('Missing district')
  assert.equal(selected.data.annual_gwh, null)
  assert.equal(selected.data.generation_availability, 'unavailable')
  assert(selected.data.capacity_mwp > 0)
  assert.equal(selected.data.capacity_coverage.status, 'unsupported')
  const dki = selectDkiKpis(data)
  if (dki.status !== 'available' || dki.data.capacity_coverage.status !== 'available') throw Error('Missing DKI coverage')
  assert.equal(dki.data.generation_availability, 'partial')
  assert.notEqual(dki.data.pvout_coverage, dki.data.capacity_coverage.data.pvout_capacity_coverage)
  for (const t of data.types.types) {
    const selection = selectTypeKpis(data, t.id)
    if (selection.status !== 'available') throw Error('Missing type')
    assert.equal(selection.data.capacity_coverage.status, 'unsupported')
  }
})
test('administrative × type KPIs are explicitly unsupported and never fall back to marginal totals', () => {
  const district = data.districts.districts[0]!, typeId = data.types.types[0]!.id
  for (const districtId of [null, district.id]) {
    const result = selectKpis(data, { regionId: district.region_id, districtId, typeId })
    assert.equal(result.status, 'unsupported')
    assert(!('data' in result))
    if (result.status === 'unsupported') assert.equal(result.requiredAggregate, 'summary_kecamatan_jenis')
  }
  assert.equal(selectKpis(data, { ...emptyFilters, typeId }).status, 'available')
  assert.equal(selectKpis(data, { ...emptyFilters, districtId: district.id }).status, 'invalid')
  assert.equal(selectKpis(data, { ...emptyFilters, regionId: 'unknown' }).status, 'invalid')
  assert.equal(selectKpis(data, { ...emptyFilters, typeId: 'unknown' }).status, 'invalid')
})
test('marginal chart selectors declare DKI or region scope instead of implying type cross-filtering', () => {
  assert.equal(selectTypeStatistics(data).scope.kind, 'dki')
  assert.equal(selectTypeStatistics(data).types.length, 7)
  const region = data.regions.regions.find(r => r.wilayah === 'Jakarta Barat')!
  const districts = selectDistrictStatistics(data, region.id)
  assert.equal(districts.status, 'available')
  if (districts.status !== 'available') throw Error('Missing district comparison')
  assert.equal(districts.scope.kind, 'region')
  assert.equal(districts.districts.length, 8)
  assert.equal(selectDistrictStatistics(data, 'unknown').status, 'invalid')
})
test('future tile filtering receives every declared raw category alias', () => {
  const labels = selectBuildingTypeLabels(data, 'hunian')
  assert.equal(labels.status, 'available')
  if (labels.status === 'available') assert.deepEqual(labels.labels, ['Hunian', 'HUNIAN'])
  assert.equal(selectBuildingTypeLabels(data, 'unknown').status, 'invalid')
  const unfiltered = selectBuildingTypeLabels(data, null)
  if (unfiltered.status === 'available') assert.equal(unfiltered.labels, null)
})
test('renderer-owned GeoJSON is MapLibre-compatible and cannot mutate cached boundary coordinates', () => {
  const clone = copyBoundaryGeoJson(regionGeometry)
  const mapData: GeoJSONSourceSpecification['data'] = clone
  assert.equal(mapData.type, 'FeatureCollection')
  assert.equal(clone.features[0]!.id, regionGeometry.features[0]!.id)
  assert(!('metadata' in clone))
  const original = regionGeometry.features[0]!.geometry.coordinates[0]![0]![0]![0]!
  clone.features[0]!.geometry.coordinates[0]![0]![0]![0] = original + 0.001
  assert.equal(regionGeometry.features[0]!.geometry.coordinates[0]![0]![0]![0], original)
})
test('shared Vue store exposes loading states, dependent districts and reactive scope-safe KPIs', async () => {
  const fixture = service(), store = createDashboardStore(fixture.service)
  const kpiStatus = () => store.kpis.value.status
  assert.equal(store.status.value, 'idle')
  assert.equal(kpiStatus(), 'not-ready')
  assert.throws(() => store.setRegion('31.01'), code('invalid-filter'))
  const first = store.load()
  assert.equal(store.status.value, 'loading')
  assert.equal(store.load(), first)
  assert.equal(await first, true)
  assert.equal(store.status.value, 'ready')
  assert.equal(store.regionOptions.value.length, 6)
  assert.equal(store.typeOptions.value.length, 7)
  assert.equal(store.districtOptions.value.length, 0)
  store.setRegion('31.73')
  assert.equal(store.districtOptions.value.length, 8)
  const district = store.districtOptions.value[0]!
  store.setDistrict(district.id)
  store.setRegion('31.73')
  assert.equal(store.filters.districtId, district.id)
  store.setBuildingType('hunian')
  assert.equal(kpiStatus(), 'unsupported')
  assert.equal(store.typeStatistics.value?.scope.kind, 'dki')
  store.setRegion('31.74')
  assert.equal(store.filters.districtId, null)
  assert.equal(store.filters.typeId, 'hunian')
  assert.throws(() => store.setDistrict(district.id), code('invalid-filter'))
  assert.equal(store.filters.regionId, '31.74')
  store.setRegion(null)
  assert.equal(kpiStatus(), 'available') // DKI type-only aggregate
  store.resetFilters()
  assert.deepEqual({ ...store.filters }, emptyFilters)
  assert.equal(fixture.calls.length, 7)
})
test('Vue provider consumption shares one store while separate applications remain isolated', async () => {
  const store = createDashboardStore(service().service), another = createDashboardStore(service().service)
  const app = createApp({ render: () => null })
  app.provide(dashboardKey, store)
  app.runWithContext(() => assert.equal(useDashboard(), store))
  await store.load()
  store.setRegion('31.01')
  assert.equal(another.filters.regionId, null)
  assert.equal(another.status.value, 'idle')
})
test('cache failures are retryable and HTTP errors retain structured context', async () => {
  const fixture = server(), fetcher: typeof fetch = async (input, init) => {
    if (!failed && String(input).endsWith('summary_kecamatan.json')) { failed = true; return new Response('', { status: 503 }) }
    return fixture.fetch(input, init)
  }
  let failed = false
  const loader = createSolarDataService({ fetch: fetcher })
  await assert.rejects(loader.loadSummaries(), error => error instanceof SolarDataError && error.code === 'http' && error.status === 503 && error.resource === 'summary_kecamatan.json')
  assert.equal((await loader.loadSummaries()).regions.regions.length, 6)
  assert.equal(fixture.calls.filter(n => n === 'data_manifest.json').length, 2)
})
test('network, malformed JSON and timed-out requests produce explicit errors', async () => {
  await assert.rejects(createSolarDataService({ fetch: async () => { throw Error('Offline') } }).loadSummaries(), code('network'))
  await assert.rejects(createSolarDataService({ fetch: async () => new Response('<html>not JSON</html>') }).loadSummaries(), code('parse'))
  const timedOut: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
  await assert.rejects(createSolarDataService({ fetch: timedOut, requestTimeoutMs: 10 }).loadSummaries(), code('timeout'))
})
test('manifest size/hash verification rejects changed measurements before exposure', async () => {
  const altered = new Map(files)
  altered.set('summary_jenis.json', files.get('summary_jenis.json')!.replace('Hunian', 'HUnian'))
  await assert.rejects(service(altered).service.loadSummaries(), code('integrity'))
})
test('unsupported schemas and mixed data releases are rejected', async () => {
  const unsupported = changed('data_manifest.json', d => { d.metadata.schema_version = '2.0.0' })
  await assert.rejects(service(unsupported).service.loadSummaries(), code('version'))
  const mixed = changed('summary_jenis.json', d => { d.metadata.data_version = 'different-release' })
  await assert.rejects(service(mixed).service.loadSummaries(), code('version'))
})
test('runtime validation rejects bad numerics, wrong denominators and zero substituted for missing generation', async () => {
  for (const mutation of [
    (d: any) => { d.districts[0].total_buildings = '3314' },
    (d: any) => { d.districts[0].annual_gwh = 0 },
    (d: any) => { d.districts[0].eligibility_rate = 1 },
    (d: any) => { d.districts[0].capacity_mwp += 1 },
    (d: any) => { d.districts[0].region_id = '31.73' },
  ]) await assert.rejects(service(changed('summary_kecamatan.json', mutation)).service.loadSummaries(), code('validation'))
})
test('runtime validation rejects duplicate/unknown crosswalk labels and inconsistent capacity coverage', async () => {
  const aliases = changed('building_type_crosswalk.json', d => { d.categories[1].raw_labels.push('HUNIAN') })
  await assert.rejects(service(aliases).service.loadSummaries(), code('validation'))
  const unknown = changed('admin_crosswalk.json', d => { d.regions[0].id = 'unknown' })
  await assert.rejects(service(unknown).service.loadSummaries(), code('validation'))
  const ambiguous = changed('building_type_crosswalk.json', d => { d.categories[1].raw_labels.push('hunian') })
  await assert.rejects(service(ambiguous).service.loadSummaries(), code('validation'))
  const coverage = changed('summary_pvout_coverage.json', d => { d.regions[0].pvout_capacity_coverage = d.regions[0].pvout_coverage })
  await assert.rejects(service(coverage).service.loadSummaries(), code('validation'))
})
test('lazy boundary validation rejects invalid IDs, geometry and release metadata', async () => {
  for (const mutation of [
    (d: any) => { d.features[0].properties.id = 'unknown' },
    (d: any) => { d.features[0].geometry.coordinates[0][0][0][0] = 999 },
    (d: any) => { d.features[0].geometry.type = 'Point' },
  ]) await assert.rejects(service(changed('admin_kabkot.geojson', mutation)).service.loadBoundaries('region'), code('validation'))
  const mixed = changed('admin_kabkot.geojson', d => { d.metadata.data_version = 'other-release' })
  await assert.rejects(service(mixed).service.loadBoundaries('region'), code('version'))
})
test('store errors expose no fabricated KPIs and retry succeeds', async () => {
  const fixture = server()
  let offline = true
  const loader = createSolarDataService({ fetch: (input, init) => offline ? Promise.reject(Error('Offline')) : fixture.fetch(input, init) })
  const store = createDashboardStore(loader)
  assert.equal(await store.load(), false)
  assert.equal(store.status.value, 'error')
  assert.equal(store.error.value?.code, 'network')
  assert.equal(store.data.value, null)
  assert.equal(store.kpis.value.status, 'not-ready')
  offline = false
  assert.equal(await store.load(), true)
  assert.equal(store.error.value, null)
  assert.equal(await store.loadBoundaries('region'), true)
  assert.equal(store.boundaries.region.status.value, 'ready')
  assert.equal(store.boundaries.district.status.value, 'idle')
})
test('refresh prevents a superseded summary request from overwriting current state', async () => {
  const oldRequest = deferred<ReadonlyDashboardData>(), newRequest = deferred<ReadonlyDashboardData>()
  const requests = [oldRequest, newRequest]
  const loader: SolarDataService = { loadSummaries: () => requests.shift()!.promise,
    loadBoundaries: async () => regionGeometry, clearCache: () => {} }
  const store = createDashboardStore(loader), first = store.load()
  await Promise.resolve()
  const fresh = store.refresh()
  const newSnapshot = structuredClone(data)
  newRequest.resolve(newSnapshot)
  assert.equal(await fresh, true)
  oldRequest.resolve(data)
  assert.equal(await first, false)
  assert.equal(store.data.value, newSnapshot)
})
test('refresh invalidates in-flight boundaries and leaves the current release unpolluted', async () => {
  const pending = deferred<typeof regionGeometry>()
  const loader: SolarDataService = { loadSummaries: async () => data, loadBoundaries: () => pending.promise, clearCache: () => {} }
  const store = createDashboardStore(loader)
  await store.load()
  const first = store.loadBoundaries('region')
  await Promise.resolve(); await Promise.resolve()
  await store.refresh()
  pending.resolve(regionGeometry)
  assert.equal(await first, false)
  assert.equal(store.boundaries.region.data.value, null)
  assert.equal(store.boundaries.region.status.value, 'idle')
})
test('crosswalk normalization resolves actual administrative aliases and uppercase building labels', () => {
  const normal = createNormalizers(data)
  assert.equal(normal.region('Administrasi Kepulauan Seribu')?.id, '31.01')
  assert.equal(normal.region('Kota Administrasi Jakarta Barat')?.wilayah, 'Jakarta Barat')
  for (const alias of data.adminCrosswalk.district_aliases)
    assert.equal(normal.district(alias.region_id, alias.raw_name)?.kecamatan, alias.kecamatan)
  assert.equal(normal.buildingType('HUNIAN')?.jenis_group, 'Hunian')
  assert.equal(normal.buildingType('PEMERINTAHAN')?.jenis_group, 'Pemerintahan')
  assert.equal(normal.district('31.73', 'Tebet'), null)
  assert.equal(normal.buildingType('hunIan'), null)
})
const tile = { building_uid: '1742057', WADMKK: 'Kepulauan Seribu', WADMKC: 'Kepulauan Seribu Selatan', jenis_group: 'NON HUNIAN',
  eligible: 1, area_m2: 149.73217847803608, useable_m2: 49.41161889775191,
  capacity_kwp: 10.294087270364981, capacity_mwp: 0.01029408727036498, pvout_status: 'NoData' }
test('future tile adapter preserves measurements and identity, maps usable area, and retains missingness', () => {
  const before = structuredClone(tile), result = adaptBuildingProperties(tile, data)
  assert.deepEqual(tile, before)
  assert.equal(result.building_uid, tile.building_uid)
  assert.equal(result.usable_m2, tile.useable_m2)
  assert.equal(result.capacity_kwp, tile.capacity_kwp)
  assert.equal(result.jenis_group, 'Non Hunian')
  assert.equal(result.region_id, '31.01')
  assert.equal(result.annual_kwh, null)
  assert.equal(result.annual_gwh, null)
  assert.equal(result.pvout_1, null)
  const availableZero = adaptBuildingProperties({ ...tile, pvout_status: 'Available', pvout_1: 0, annual_kwh: 0, annual_gwh: 0 }, data)
  assert.equal(availableZero.annual_gwh, 0)
  const alias = adaptBuildingProperties({ ...tile, WADMKK: 'Kota Administrasi Jakarta Barat', WADMKC: 'Pal Merah' }, data)
  assert.equal(alias.WADMKC, 'Palmerah')
})
test('tile adapter rejects ambiguous IDs, unknown categories, ineligible and contradictory properties', () => {
  for (const changes of [{ building_uid: 1742057 }, { jenis_group: 'unknown' }, { eligible: 0 },
    { annual_kwh: 0 }, { pvout_status: 'Available' }, { WADMKK: 'Jakarta Barat' }, { usable_m2: 0 }, { capacity_kwp: '10' }])
    assert.throws(() => adaptBuildingProperties({ ...tile, ...changes }, data), code('invalid-building'))
})
test('display conversion preserves null and zero without changing source measurements', () => {
  assert.equal(mwpToGwp(data.regions.overall.capacity_mwp), data.regions.overall.capacity_mwp / 1000)
  assert.equal(gwhToTwh(null), null)
  assert.equal(gwhToTwh(0), 0)
  assert.equal(ratioToPercent(0.25), 25)
  assert.equal(formatNumber(null), 'Data unavailable')
  assert.equal(formatNumber(0), '0.00')
  assert.equal(formatNumber(1.23456, { decimals: 3 }), '1.235')
  assert.equal(data.regions.overall.capacity_mwp, 18627.76699292319)
})
test('published manifest and both boundary collections remain the original validated release', () => {
  const manifest = JSON.parse(files.get('data_manifest.json')!) as DataManifest
  for (const entry of manifest.outputs) {
    const content = files.get(entry.path.replace('public/data/', ''))!
    assert.equal(hash(content), entry.sha256)
    assert.equal(Buffer.byteLength(content), entry.bytes)
  }
  assert.equal((regionGeometry as AdminBoundaries).features.length, 6)
  assert.equal((districtGeometry as AdminBoundaries).features.length, 44)
})
