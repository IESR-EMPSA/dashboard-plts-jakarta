// Offline delivery QA only. Dashboard totals are never calculated here.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const mapRequire = createRequire(require.resolve('maplibre-gl/package.json'))
// Reuse installed MapLibre decoder dependencies; do not install application dependencies for QA.
const { VectorTile } = await import(pathToFileURL(mapRequire.resolve('@mapbox/vector-tile')))
const { PbfReader } = await import(pathToFileURL(mapRequire.resolve('pbf')))
const cli = resolve(root, '.tools/pmtiles/pmtiles.exe')
const input = resolve(root, 'data/raw/buildings_eligible_pvout.mbtiles')
const output = resolve(root, 'data/processed/buildings_eligible_dki.pmtiles')
const qa = resolve(root, 'data/processed/qa')
await mkdir(qa, { recursive: true })
const run = args => execFileSync(cli, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const hashFile = async path => {
  const h = createHash('sha256')
  for await (const bytes of createReadStream(path)) h.update(bytes)
  return h.digest('hex')
}
const inflate = bytes => bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes
const decode = bytes => new VectorTile(new PbfReader(inflate(bytes)))
const db = new DatabaseSync(input, { readOnly: true })
try {
  const original = Object.fromEntries(db.prepare('SELECT name,value FROM metadata').all().map(r => [r.name, r.value]))
  const header = JSON.parse(run(['show', output, '--header-json']))
  const metadata = JSON.parse(run(['show', output, '--metadata']))
  const show = run(['show', output])
  const verify = execFileSync(cli, ['verify', output], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(header.tile_type, 'mvt')
  assert.equal(header.tile_compression, 'gzip')
  assert.equal(header.minzoom, 14)
  assert.equal(header.maxzoom, 16)
  assert.deepEqual(header.bounds, original.bounds.split(',').map(Number))
  assert.deepEqual(metadata.vector_layers, JSON.parse(original.json).vector_layers)
  for (const [key, value] of Object.entries(original))
    if (!['json', 'bounds'].includes(key)) assert.deepEqual(metadata[key], value, `Metadata mismatch: ${key}`)
  const layerName = metadata.vector_layers[0].id
  assert.equal(layerName, 'buildings_eligible_pvout')
  const manifest = JSON.parse(await readFile(resolve(root, 'public/data/data_manifest.json'), 'utf8'))
  const inputSha = await hashFile(input)
  assert.equal(inputSha, manifest.metadata.sources.find(s => s.role === 'building_visualization').sha256, 'MBTiles changed since preprocessing')
  const categories = JSON.parse(await readFile(resolve(root, 'data/crosswalks/building-types.json'), 'utf8')).categories
  const canonical = raw => {
    const matches = categories.filter(t => t.raw_labels.includes(raw))
    assert.equal(matches.length, 1, `Unknown tile type label: ${raw}`)
    return matches[0].jenis_group
  }
  const targets = new Set(['1742057', '1743468', '1741673'])
  const targetInstances = []
  const samples = new Map()
  const addSample = (z, x, tmsY, reason) => {
    const key = `${z}/${x}/${2 ** z - 1 - tmsY}`
    if (!samples.has(key)) samples.set(key, { z, x, y: 2 ** z - 1 - tmsY, reasons: [] })
    samples.get(key).reasons.push(reason)
  }
  const zooms = []
  for (const z of [14, 15, 16]) {
    const identities = new Map(), rawTypes = {}, canonicalTypes = {}, status = {}, geometryTypes = {}
    let tiles = 0, instances = 0, unknownWithoutGeometry = 0, polygonWithoutGeometry = 0, geometryErrors = 0
    const sampleScopes = new Set()
    for (const tile of db.prepare('SELECT tile_column,tile_row,tile_data FROM tiles WHERE zoom_level=? ORDER BY tile_column,tile_row').iterate(z)) {
      tiles++
      const layer = decode(tile.tile_data).layers[layerName]
      assert(layer, 'Missing expected source layer')
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i), p = f.properties
        instances++
        geometryTypes[f.type] = (geometryTypes[f.type] ?? 0) + 1
        if (f.type === 0 && f._geometry < 0) unknownWithoutGeometry++
        if (f.type === 3 && f._geometry < 0) polygonWithoutGeometry++
        assert.equal(typeof p.building_uid, 'string')
        assert.equal(p.eligible, 1)
        const previous = identities.get(p.building_uid)
        const flag = f.type === 3 ? 1 : 2
        identities.set(p.building_uid, (previous ?? 0) | flag)
        if (previous === undefined) {
          rawTypes[p.jenis_group] = (rawTypes[p.jenis_group] ?? 0) + 1
          const label = canonical(p.jenis_group)
          canonicalTypes[label] = (canonicalTypes[label] ?? 0) + 1
          status[p.pvout_status] = (status[p.pvout_status] ?? 0) + 1
          assert(['Available', 'NoData'].includes(p.pvout_status))
          for (const key of ['pvout_1', 'annual_kwh', 'annual_gwh'])
            assert.equal(p[key] == null, p.pvout_status === 'NoData', `PVOUT property ${key}`)
        }
        const scope = `${p.WADMKK}|${p.pvout_status}`
        if (!sampleScopes.has(scope)) { addSample(z, tile.tile_column, tile.tile_row, scope); sampleScopes.add(scope) }
        if (z === 16 && targets.has(p.building_uid)) {
          let geometry = null, error = null
          try { geometry = f.loadGeometry().map(r => r.map(v => [v.x, v.y])) }
          catch (e) { error = e.message; geometryErrors++ }
          targetInstances.push({ uid: p.building_uid, z, x: tile.tile_column, y: 2 ** z - 1 - tile.tile_row,
            type: f.type, geometry_field_present: f._geometry >= 0, extent: f.extent, geometry, error })
          addSample(z, tile.tile_column, tile.tile_row, `affected UID ${p.building_uid}`)
        }
      }
    }
    const masks = {}
    for (const mask of identities.values()) masks[mask] = (masks[mask] ?? 0) + 1
    const largest = db.prepare('SELECT tile_column,tile_row,length(tile_data) AS bytes FROM tiles WHERE zoom_level=? ORDER BY length(tile_data) DESC LIMIT 1').get(z)
    addSample(z, largest.tile_column, largest.tile_row, 'largest compressed tile')
    const record = { zoom: z, tiles, instances, distinct_building_uids: identities.size, geometry_types: geometryTypes,
      uid_geometry_masks: masks, mask_legend: { 1: 'polygon only', 2: 'unknown only', 3: 'polygon and unknown' },
      unknown_without_geometry_field: unknownWithoutGeometry, polygon_without_geometry_field: polygonWithoutGeometry,
      raw_categories: rawTypes, canonical_categories: canonicalTypes, pvout_statuses: status,
      targeted_geometry_errors: geometryErrors, largest_tile_bytes: largest.bytes }
    zooms.push(record)
    console.log(JSON.stringify(record))
  }
  const comparisons = []
  for (const s of samples.values()) {
    const row = db.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?').get(s.z, s.x, 2 ** s.z - 1 - s.y)
    const extracted = execFileSync(cli, ['tile', output, String(s.z), String(s.x), String(s.y)], { maxBuffer: 16 * 1024 * 1024 })
    const originalBytes = Buffer.from(row.tile_data)
    assert(originalBytes.equals(extracted), `Compressed tile content changed at ${s.z}/${s.x}/${s.y}`)
    const a = decode(originalBytes).layers[layerName], b = decode(extracted).layers[layerName]
    assert.equal(a.length, b.length)
    const example = []
    for (const i of new Set([0, Math.floor(a.length / 2), a.length - 1])) {
      const af = a.feature(i), bf = b.feature(i)
      assert.equal(af.id, bf.id)
      assert.deepEqual(af.properties, bf.properties)
      example.push({ native_id: af.id, building_uid: af.properties.building_uid,
        pvout_status: af.properties.pvout_status, geometry_type: af.type })
    }
    comparisons.push({ ...s, bytes: extracted.length, sha256: hash(extracted),
      compressed_bytes_identical: true, feature_instances: a.length, examples: example })
  }
  const relationships = [...targets].map(uid => {
    const copies = targetInstances.filter(f => f.uid === uid)
    return { uid, unknown_instances: copies.filter(f => f.type === 0).map(empty => ({
      tile: { z: empty.z, x: empty.x, y: empty.y }, geometry_field_present: empty.geometry_field_present,
      error: empty.error, polygon_copies: copies.filter(f => f.type === 3).map(full => {
        const vertices = full.geometry.flat()
        const minX = Math.min(...vertices.map(v => full.x + v[0] / full.extent))
        const maxX = Math.max(...vertices.map(v => full.x + v[0] / full.extent))
        const minY = Math.min(...vertices.map(v => full.y + v[1] / full.extent))
        const maxY = Math.max(...vertices.map(v => full.y + v[1] / full.extent))
        return { tile: { z: full.z, x: full.x, y: full.y }, world_tile_bbox: [minX, minY, maxX, maxY],
          bbox_intersects_empty_tile_interior: minX < empty.x + 1 && maxX > empty.x && minY < empty.y + 1 && maxY > empty.y }
      })
    })) }
  })
  const release = JSON.parse(await readFile(resolve(root, '.tools/pmtiles/release.json'), 'utf8'))
  const report = {
    purpose: 'Delivery and geometry QA only; not a dashboard statistics source', data_version: manifest.metadata.data_version,
    cli: { ...release, version_output: run(['version']).trim(), executable_sha256: await hashFile(cli) },
    source: { path: 'data/raw/buildings_eligible_pvout.mbtiles', bytes: (await stat(input)).size, sha256: inputSha,
      sqlite_quick_check: db.prepare('PRAGMA quick_check').all(), metadata: original },
    output: { path: 'data/processed/buildings_eligible_dki.pmtiles', bytes: (await stat(output)).size,
      mib: (await stat(output)).size / 1048576, sha256: await hashFile(output), header, metadata,
      show, verify_exit_code: 0, verify_stdout: verify.trim() },
    zooms, representative_tiles: comparisons, affected_uid_relationships: relationships,
    geometry_inference: 'Absent geometry fields prove empty instances. Adjacent polygon copies and bbox relationships support a clipping/export-artifact explanation; the original exporter/GeoPackage must confirm the cause. Container conversion preserves sampled bytes and does not repair artifacts.',
    browser_status: 'See browser-report.json when the separate isolated diagnostic has run',
  }
  await writeFile(resolve(qa, 'archive-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output: report.output.path, bytes: report.output.bytes, mib: report.output.mib,
    representative_tiles_compared: comparisons.length, all_sampled_compressed_bytes_identical: true,
    relationships, report: 'data/processed/qa/archive-report.json' }, null, 2))
} finally { db.close() }
