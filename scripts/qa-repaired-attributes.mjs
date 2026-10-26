// Verify repaired PMTiles values against the read-only GeoPackage; write QA and repair ledger.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), qa = resolve(root, 'data/processed/qa/archive-z13-18')
const repair = JSON.parse(await readFile(resolve(qa, 'repair-report.json'), 'utf8'))
const original = JSON.parse(await readFile(resolve(qa, 'archive-report.json'), 'utf8'))
const audit = JSON.parse(await readFile(resolve(qa, 'archive-repaired-report.json'), 'utf8'))
assert.equal(audit.compatibility_passed, true)
assert.equal(audit.output.sha256, repair.output_fingerprints.find(f => f.path.endsWith('.pmtiles')).sha256)
const require = createRequire(import.meta.url), mapRequire = createRequire(require.resolve('maplibre-gl/package.json'))
const { VectorTile } = await import(pathToFileURL(mapRequire.resolve('@mapbox/vector-tile')))
const { PbfReader } = await import(pathToFileURL(mapRequire.resolve('pbf')))
const db = new DatabaseSync(resolve(root, repair.authority.path), { readOnly: true })
try {
  const uids = [...new Set(repair.changes.map(c => c.uid))]
  const numeric = ['Shape_Length','Shape_Area','area_m2','setback_m2','eligible','useable_m2','capacity_kwp','capacity_mwp','pvout_1','annual_kwh','annual_gwh']
  const rows = db.prepare(`SELECT building_uid,${numeric.join(',')} FROM buildings_eligible_pvout WHERE building_uid IN (${uids.map(() => '?').join(',')})`).all(...uids.map(Number))
  assert.equal(rows.length, 45)
  const byUid = new Map(rows.map(r => [String(r.building_uid), r])), cache = new Map(), targets = new Map()
  for (const c of repair.changes) {
    const key = `${c.z}/${c.x}/${c.y}`
    if (!cache.has(key)) {
      const bytes = execFileSync(resolve(root, '.tools/pmtiles/pmtiles.exe'), ['tile', resolve(root, audit.output.path), String(c.z), String(c.x), String(c.y)], { maxBuffer: 32 * 1024 * 1024 })
      cache.set(key, new VectorTile(new PbfReader(gunzipSync(bytes))).layers.buildings_eligible_pvout)
    }
    const feature = cache.get(key).feature(c.feature_index), p = feature.properties, source = byUid.get(c.uid)
    assert.equal(p.building_uid, c.uid); assert.equal(p[c.field], source[c.field]); assert.equal(p[c.field], c.replacement)
    for (const field of numeric) {
      if (source[field] == null) assert(p[field] == null)
      else { assert(Number.isFinite(p[field])); assert(Math.abs(p[field] - source[field]) <= Math.max(1e-9, Math.abs(source[field]) * 1e-12), `${c.uid}/${field}`) }
    }
    if (!targets.has(c.uid)) {
      assert.equal(feature.type, 3)
      const points = feature.loadGeometry().flat(), x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2
      const y = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2
      const worldX = (c.x + x / feature.extent) / 2 ** c.z, worldY = (c.y + y / feature.extent) / 2 ** c.z
      targets.set(c.uid, { uid: c.uid, center: [worldX * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180 / Math.PI],
        expected: source, repaired_fields: [...new Set(repair.changes.filter(i => i.uid === c.uid).map(i => i.field))] })
    }
  }
  assert.equal(targets.size, 45)
  const result = { authority: repair.authority.path, layer: repair.authority.layer, checked_field_instances: repair.changes.length,
    affected_uids: targets.size, numeric_fields_checked_per_instance: numeric, targets: [...targets.values()] }
  await writeFile(resolve(qa, 'repaired-source-check.json'), JSON.stringify(result, null, 2) + '\n')
  const header = ['zoom','building_uid','attribute','invalid_value','verified_numeric_value','affected_instances','authoritative_file','authoritative_layer','authoritative_column']
  const csv = [header, ...original.source_attribute_issues.map(i => [i.zoom,i.uid,i.field,JSON.stringify(i.after),byUid.get(i.uid)[i.field],i.instances,repair.authority.path,repair.authority.layer,i.field])]
    .map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n') + '\n'
  await writeFile(resolve(root, 'docs/ARCHIVE_ATTRIBUTE_REPAIRS.csv'), csv)
  console.log(JSON.stringify({ verified_numeric_field_instances: repair.changes.length, verified_uids: targets.size, ledger_rows: original.source_attribute_issues.length, source: repair.authority.path }))
} finally { db.close() }
