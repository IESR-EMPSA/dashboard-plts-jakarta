import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { archiveMiddleware, MAX_RANGE_BYTES, parseByteRange } from '../scripts/dev/pmtilesPlugin.ts'
import { buildingFilter, geometryBounds, POLYGON_FILTER, BUILDING_SOURCE_LAYER } from '../src/map/mapModel.ts'
import { createSolarDataService } from '../src/services/solarDataService.ts'
import { numberId } from '../src/utils/presentation.ts'

const service = createSolarDataService({ fetch: async input => {
  const name = new URL(String(input), 'https://local.test').pathname.split('/').at(-1)!
  return new Response(await readFile(new URL(`../public/data/${name}`, import.meta.url)), { headers: { 'Content-Type': 'application/json' } })
} })
const data = await service.loadSummaries()
const empty = { regionId: null, districtId: null, typeId: null }

test('every composed building filter retains the proven Polygon predicate and eligible-only scope', () => {
  for (const region of data.adminCrosswalk.regions) {
    const districts = data.adminCrosswalk.districts.filter(d => d.region_id === region.id)
    for (const district of districts) for (const type of data.types.types) {
      const filter = buildingFilter(data, { regionId: region.id, districtId: district.id, typeId: type.id }) as unknown[]
      assert.deepEqual(filter[1], POLYGON_FILTER)
      assert.deepEqual(filter[2], ['==', ['get', 'eligible'], 1])
      assert(JSON.stringify(filter).includes(region.raw_name))
      assert(JSON.stringify(filter).includes(district.raw_name))
    }
  }
  assert.deepEqual(buildingFilter(data, empty), ['all', POLYGON_FILTER, ['==', ['get', 'eligible'], 1]])
  assert.equal(BUILDING_SOURCE_LAYER, 'buildings_eligible_pvout')
})
test('type aliases are included in map filters independently of unsupported joint statistics', () => {
  const type = data.buildingTypes.categories.find(t => t.raw_labels.length > 1)!
  const filter = JSON.stringify(buildingFilter(data, { ...empty, typeId: type.id }))
  for (const label of type.raw_labels) assert(filter.includes(label))
})
test('navigation bounds include all outer and island polygons', () => {
  assert.deepEqual(geometryBounds({ type: 'MultiPolygon', coordinates: [[[[106,-6],[107,-6],[107,-5],[106,-6]]],[[[105,-4],[105.5,-4],[105,-3],[105,-4]]]] }), [[105,-6],[107,-3]])
})
test('display uses Indonesian numbers and preserves unavailable values', () => {
  assert.equal(numberId(1470399, 0), '1.470.399')
  assert.equal(numberId(18.6277669929), '18,63')
  assert.equal(numberId(null), 'Tidak tersedia')
  assert.equal(numberId(0), '0,00')
})
test('range parser accepts bounded, suffix and clamped ranges, rejects whole and oversized requests', () => {
  assert.deepEqual(parseByteRange('bytes=0-15', 100), { start: 0, end: 15 })
  assert.deepEqual(parseByteRange('bytes=-16', 100), { start: 84, end: 99 })
  assert.deepEqual(parseByteRange('bytes=90-150', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 })
  for (const value of [undefined, 'bytes=', 'bytes=4-2', 'bytes=-0', 'bytes=100-101', 'bytes=0-3,8-9']) assert.equal(parseByteRange(value, 100), null)
  assert.equal(parseByteRange('bytes=0-', MAX_RANGE_BYTES + 1), null)
})
test('local middleware streams exact bytes, rejects whole archive and arbitrary archive paths', async () => {
  const fixture = new URL('../package.json', import.meta.url)
  const bytes = await readFile(fixture)
  const { fileURLToPath } = await import('node:url')
  const middleware = archiveMiddleware(fileURLToPath(fixture))
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  try {
    const range = await fetch(`${base}/_local/buildings.pmtiles`, { headers: { Range: 'bytes=0-15' } })
    assert.equal(range.status, 206)
    assert.equal(range.headers.get('content-range'), `bytes 0-15/${bytes.length}`)
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 16))
    assert.equal((await fetch(`${base}/_local/buildings.pmtiles`)).status, 416)
    assert.equal((await fetch(`${base}/_local/buildings.pmtiles`, { headers: { Range: 'bytes=0-15', 'If-Match': 'invalid' } })).status, 412)
    const head = await fetch(`${base}/_local/buildings.pmtiles`, { method: 'HEAD' })
    assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), bytes.length)
    assert.equal((await fetch(`${base}/data/processed/test.pmtiles`)).status, 403)
    assert.equal((await fetch(`${base}/data/raw/test.mbtiles`)).status, 403)
    assert.equal((await fetch(`${base}/data/raw/test%2Embtiles`)).status, 403)
    assert.equal((await fetch(`${base}/_local/buildings.pmtiles`, { method: 'POST' })).status, 405)
    assert.equal((await fetch(`${base}/_local/buildings.pmtiles/arbitrary`)).status, 404)
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
