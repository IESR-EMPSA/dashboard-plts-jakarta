// Explicitly approved, surgical delivery repair. Source archives/statistics are read-only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { constants, createReadStream } from 'node:fs'
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { mvtFeature, mvtLayers, repairMvtAttributes } from './lib/mvt-attributes.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qa = resolve(root, 'data/processed/qa/archive-z13-18')
const report = JSON.parse(await readFile(resolve(qa, 'archive-report.json'), 'utf8'))
const evidence = JSON.parse(await readFile(resolve(qa, 'attribute-investigation.json'), 'utf8'))
const gpkgPath = 'data/raw/buildings_eligible_pvout.gpkg'
const repairedMb = 'data/processed/buildings_eligible_pvout_z13_z18_repaired.mbtiles'
const repairedPm = 'data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles'
const cli = resolve(root, '.tools/pmtiles/pmtiles.exe')
const run = args => execFileSync(cli, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const require = createRequire(import.meta.url)
const mapRequire = createRequire(require.resolve('maplibre-gl/package.json'))
const { VectorTile } = await import(pathToFileURL(mapRequire.resolve('@mapbox/vector-tile')))
const { PbfReader } = await import(pathToFileURL(mapRequire.resolve('pbf')))
async function fingerprint(path) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(resolve(root, path))) h.update(chunk)
  return { path, bytes: (await stat(resolve(root, path))).size, sha256: h.digest('hex') }
}
const inputs = []
for (const [path, expected] of [[gpkgPath], [report.previous.input, report.previous.input_sha256],
  [report.previous.output, report.previous.output_sha256], [report.source.path, report.source.sha256], [report.output.path, report.output.sha256]]) {
  const f = await fingerprint(path)
  if (expected) assert.equal(f.sha256, expected, `Changed source ${path}`)
  inputs.push(f)
}
const gpkg = new DatabaseSync(resolve(root, gpkgPath), { readOnly: true })
const source = new DatabaseSync(resolve(root, report.source.path), { readOnly: true })
try {
  const contents = gpkg.prepare("SELECT * FROM gpkg_contents WHERE data_type='features'").all()
  const candidates = contents.filter(c => gpkg.prepare(`PRAGMA table_info("${c.table_name.replaceAll('"', '""')}")`).all().some(f => f.name === 'building_uid'))
  assert.equal(candidates.length, 1, 'Ambiguous source layer; inspect manually')
  const layer = candidates[0].table_name, quoted = `"${layer.replaceAll('"', '""')}"`
  const schema = gpkg.prepare(`PRAGMA table_info(${quoted})`).all()
  assert.deepEqual(gpkg.prepare('PRAGMA quick_check').all().map(r => r.quick_check), ['ok'])
  const totals = gpkg.prepare(`SELECT count(*) AS buildings,count(DISTINCT building_uid) AS distinct_uids,sum(eligible) AS eligible,
    sum(capacity_mwp) AS capacity_mwp,sum(annual_gwh) AS annual_gwh,sum(pvout_status='NoData') AS missing_pvout FROM ${quoted}`).get()
  assert.equal(totals.buildings, report.baseline.distinct_uids)
  assert.equal(totals.distinct_uids, totals.buildings); assert.equal(totals.eligible, totals.buildings)
  assert.equal(totals.missing_pvout, report.baseline.pvout_missing)
  assert(Math.abs(totals.capacity_mwp - report.baseline.capacity_mwp) < 1e-6)
  assert(Math.abs(totals.annual_gwh - report.baseline.annual_gwh) < 1e-6)
  const uids = [...new Set(evidence.fields.map(f => f.uid))], fields = [...new Set(evidence.fields.map(f => f.field))]
  assert.equal(uids.length, 45); assert.equal(evidence.fields.length, 74); assert.equal(report.source_attribute_issues.length, 76)
  assert(fields.every(f => schema.some(s => s.name === f && s.type === 'REAL')))
  const rows = gpkg.prepare(`SELECT building_uid,eligible,${fields.map(f => `"${f}"`).join(',')} FROM ${quoted}
    WHERE building_uid IN (${uids.map(() => '?').join(',')})`).all(...uids.map(uid => { assert(/^[1-9][0-9]*$/.test(uid)); const n = Number(uid); assert(Number.isSafeInteger(n)); return n }))
  assert.equal(rows.length, uids.length)
  const byUid = new Map(rows.map(r => [String(r.building_uid), r])), authoritative = new Map()
  for (const f of evidence.fields) {
    const row = byUid.get(f.uid), actual = row[f.field]
    assert.equal(row.eligible, 1); assert(Number.isFinite(actual)); assert.equal(actual, f.candidate, `GeoPackage disagrees ${f.uid}/${f.field}`)
    for (const z of [14, 15, 16]) {
      const seen = f.observations[`${report.previous.input}:z${z}`]
      assert(seen?.numeric_instances > 0 && seen.values.length > 0 && seen.values.every(v => v === actual))
    }
    assert(f.observations[`${report.source.path}:z13`]?.values.includes(actual))
    assert([17, 18].some(z => f.observations[`${report.source.path}:z${z}`]?.values.includes(actual)), 'No intact high-zoom witness')
    authoritative.set(`${f.uid}/${f.field}`, actual)
  }
  const groups = new Map(), changes = []
  for (const bad of evidence.bad_instances) {
    const key = `${bad.z}/${bad.x}/${bad.y}`
    if (!groups.has(key)) groups.set(key, { z: bad.z, x: bad.x, y: bad.y, changes: [] })
    const change = { feature_index: bad.feature_index, uid: bad.uid, field: bad.field, before: bad.value,
      replacement: authoritative.get(`${bad.uid}/${bad.field}`), authority: { path: gpkgPath, layer, building_uid: Number(bad.uid), column: bad.field } }
    assert(Number.isFinite(change.replacement)); assert.equal(change.before, '17')
    groups.get(key).changes.push(change)
  }
  assert.equal(evidence.bad_instances.length, 78); assert.equal(groups.size, 3)
  const getTile = source.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?')
  const edited = []
  for (const tile of groups.values()) {
    const original = Buffer.from(getTile.get(tile.z, tile.x, 2 ** tile.z - 1 - tile.y).tile_data)
    const converted = execFileSync(cli, ['tile', resolve(root, report.output.path), String(tile.z), String(tile.x), String(tile.y)], { maxBuffer: 32 * 1024 * 1024 })
    assert(original.equals(converted), 'PMTiles conversion changed a defective payload')
    const plain = gunzipSync(original), rawLayer = mvtLayers(plain).find(l => l.name === layer)
    const decoded = new VectorTile(new PbfReader(plain)).layers[layer]
    for (const change of tile.changes) {
      const raw = mvtFeature(rawLayer, rawLayer.features[change.feature_index])
      assert.equal(raw.properties.building_uid, change.uid); assert.equal(raw.properties[change.field], '17')
      assert.deepEqual({ ...raw.properties }, { ...decoded.feature(change.feature_index).properties }, 'Independent decoders disagree')
    }
    const result = repairMvtAttributes(plain, layer, tile.changes)
    const independent = new VectorTile(new PbfReader(result.bytes)).layers[layer]
    for (const change of tile.changes) assert.equal(independent.feature(change.feature_index).properties[change.field], change.replacement)
    edited.push({ ...tile, original, payload: gzipSync(result.bytes, { level: 9 }) })
    changes.push(...result.applied.map(c => ({ z: tile.z, x: tile.x, y: tile.y, ...c })))
  }
  const plan = { status: 'GeoPackage-verified repair plan', inputs, authority: { path: gpkgPath, layer, contents: candidates[0], schema, totals },
    reported_zoom_uid_field_issues: 76, unique_uid_fields: 74, unique_uids: 45, field_instances: changes.length, changed_tiles: groups.size, changes,
    origin: 'Invalid string Value references are already encoded in the new MBTiles MVT payloads. GeoPackage has correct numeric values; independent wire and MapLibre decoders agree, and conversion preserves payload bytes. The defect predates PMTiles conversion; exact exporter implementation is unavailable.',
    outputs: { mbtiles: repairedMb, pmtiles: repairedPm }, limitations: ['Attribute verification does not certify the original solar model, topology or publication rights'] }
  await writeFile(resolve(qa, 'repair-plan.json'), JSON.stringify(plan, null, 2) + '\n')
  console.log(JSON.stringify({ progress: 'repair-plan-verified', authority: gpkgPath, layer, reported_issues: 76, field_instances: changes.length, changed_tiles: groups.size }))
  if (process.argv.includes('--apply')) {
    for (const path of [repairedMb, repairedPm]) {
      let exists = true
      try { await stat(resolve(root, path)) } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e }
      assert(!exists, `Refusing to overwrite ${path}`)
    }
    await copyFile(resolve(root, report.source.path), resolve(root, repairedMb), constants.COPYFILE_EXCL)
    const repaired = new DatabaseSync(resolve(root, repairedMb))
    try {
      repaired.exec('BEGIN IMMEDIATE')
      const update = repaired.prepare('UPDATE tiles SET tile_data=? WHERE zoom_level=? AND tile_column=? AND tile_row=?')
      for (const tile of edited) assert.equal(update.run(tile.payload, tile.z, tile.x, 2 ** tile.z - 1 - tile.y).changes, 1)
      repaired.exec('COMMIT')
      assert.deepEqual(repaired.prepare('PRAGMA quick_check').all().map(r => r.quick_check), ['ok'])
      assert.deepEqual(repaired.prepare('SELECT * FROM metadata ORDER BY name').all(), source.prepare('SELECT * FROM metadata ORDER BY name').all())
      let unchanged = 0, changed = 0
      const getRepaired = repaired.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?')
      for (const row of source.prepare('SELECT * FROM tiles').iterate()) {
        const bytes = Buffer.from(getRepaired.get(row.zoom_level, row.tile_column, row.tile_row).tile_data)
        const key = `${row.zoom_level}/${row.tile_column}/${2 ** row.zoom_level - 1 - row.tile_row}`
        if (groups.has(key)) { assert(bytes.equals(edited.find(t => `${t.z}/${t.x}/${t.y}` === key).payload)); changed++ }
        else { assert(bytes.equals(Buffer.from(row.tile_data)), `Unrelated tile changed: ${key}`); unchanged++ }
      }
      assert.equal(changed, 3)
      assert.equal(repaired.prepare('SELECT count(*) AS n FROM tiles').get().n, unchanged + changed)
      plan.payload_preservation = { unchanged_tiles_byte_identical: unchanged, changed_tiles: changed,
        changed_tile_features: 'Only approved tag value references changed; all geometry/ID/type fields and unrelated feature bytes preserved' }
    } finally { repaired.close() }
    run(['convert', resolve(root, repairedMb), resolve(root, repairedPm)])
    plan.container_verify = run(['verify', resolve(root, repairedPm)]).trim()
    for (const tile of edited) {
      const bytes = execFileSync(cli, ['tile', resolve(root, repairedPm), String(tile.z), String(tile.x), String(tile.y)], { maxBuffer: 32 * 1024 * 1024 })
      assert(bytes.equals(tile.payload))
    }
    plan.output_fingerprints = [await fingerprint(repairedMb), await fingerprint(repairedPm)]
    for (const input of inputs) assert.deepEqual(await fingerprint(input.path), input, `Source changed: ${input.path}`)
    plan.status = 'Repaired separate archives; exhaustive compatibility and browser QA required before activation'
    await writeFile(resolve(qa, 'repair-report.json'), JSON.stringify(plan, null, 2) + '\n')
    console.log(JSON.stringify({ progress: 'separate-repair-complete', ...plan.payload_preservation, outputs: plan.output_fingerprints }))
  }
} finally { source.close(); gpkg.close() }
