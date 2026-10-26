// Read-only investigation. No archive, geometry or statistical output is modified.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qa = resolve(root, 'data/processed/qa/archive-z13-18')
const report = JSON.parse(await readFile(resolve(qa, 'archive-report.json'), 'utf8'))
assert.equal(report.source_attribute_issues.length, 76, 'Unexpected audit inventory; review before investigating')
const require = createRequire(import.meta.url)
const mapRequire = createRequire(require.resolve('maplibre-gl/package.json'))
const { VectorTile } = await import(pathToFileURL(mapRequire.resolve('@mapbox/vector-tile')))
const { PbfReader } = await import(pathToFileURL(mapRequire.resolve('pbf')))
const targets = new Map()
for (const issue of report.source_attribute_issues) {
  assert.equal(issue.kind, 'invalid-numeric')
  assert.equal(issue.after, '17')
  assert(Number.isFinite(issue.before))
  if (!targets.has(issue.uid)) targets.set(issue.uid, new Map())
  const fields = targets.get(issue.uid)
  if (fields.has(issue.field)) assert.equal(fields.get(issue.field).candidate, issue.before)
  else fields.set(issue.field, { candidate: issue.before, used_by_application: issue.used_by_application, observations: {} })
}
async function hashFile(path) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(resolve(root, path))) h.update(chunk)
  return h.digest('hex')
}
const badInstances = []
for (const [path, fingerprint, zooms] of [
  [report.previous.input, report.previous.input_sha256, [14, 15, 16]],
  [report.source.path, report.source.sha256, [13, 17, 18]],
]) {
  assert.equal(await hashFile(path), fingerprint)
  const db = new DatabaseSync(resolve(root, path), { readOnly: true })
  try {
    for (const z of zooms) {
      let tiles = 0, matches = 0
      for (const row of db.prepare('SELECT tile_column,tile_row,tile_data FROM tiles WHERE zoom_level=? ORDER BY tile_column,tile_row').iterate(z)) {
        tiles++
        const layer = new VectorTile(new PbfReader(gunzipSync(row.tile_data))).layers.buildings_eligible_pvout
        if (!layer) continue
        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i), p = feature.properties, fields = targets.get(p.building_uid)
          if (!fields) continue
          matches++
          for (const [field, evidence] of fields) {
            const key = `${path}:z${z}`
            evidence.observations[key] ??= { numeric_instances: 0, invalid_instances: 0, values: [], maximum_candidate_difference: 0 }
            const observation = evidence.observations[key], value = p[field]
            if (Number.isFinite(value)) {
              observation.numeric_instances++
              if (!observation.values.includes(value)) observation.values.push(value)
              observation.maximum_candidate_difference = Math.max(observation.maximum_candidate_difference, Math.abs(value - evidence.candidate))
              assert(Math.abs(value - evidence.candidate) <= Math.max(1e-9, Math.abs(evidence.candidate) * 1e-12), `Conflicting numeric candidate ${p.building_uid}/${field}`)
            } else {
              observation.invalid_instances++
              badInstances.push({ input: path, z, x: row.tile_column, y: 2 ** z - 1 - row.tile_row, feature_index: i,
                uid: p.building_uid, field, value, value_type: typeof value, candidate: evidence.candidate, geometry_type: feature.type })
              assert.equal(path, report.source.path, 'Invalid value in baseline; stop')
              assert.equal(value, '17', 'Unexpected corruption pattern; stop')
            }
          }
        }
      }
      console.log(JSON.stringify({ progress: 'affected-attributes-compared', input: path, zoom: z, tiles, matching_instances: matches }))
    }
  } finally { db.close() }
  assert.equal(await hashFile(path), fingerprint, 'Input changed during investigation')
}
const fields = []
for (const [uid, byField] of targets) for (const [field, evidence] of byField) {
  for (const [path, zooms] of [[report.previous.input, [14, 15, 16]], [report.source.path, [13]]]) {
    for (const z of zooms) assert(evidence.observations[`${path}:z${z}`]?.numeric_instances > 0, `Missing corroboration ${uid}/${field}/${z}`)
  }
  fields.push({ uid, field, ...evidence })
}
assert.equal(badInstances.length, report.source_attribute_issues.reduce((n, issue) => n + issue.instances, 0))
const result = { status: 'Cross-zoom delivery values corroborated; GeoPackage verification is a separate source gate',
  inputs: { baseline: report.previous, replacement: report.source }, fields, bad_instances: badInstances,
  limitations: ['Agreement between tile exports establishes delivery consistency, not independent verification of the original GIS analysis',
    'No GeoPackage is present in the repository; its location was requested from the user',
    'No replacement values were calculated from solar formulas, geometry or summary totals'] }
await mkdir(qa, { recursive: true })
await writeFile(resolve(qa, 'attribute-investigation.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ progress: 'attribute-investigation-complete', unique_uids: targets.size, unique_uid_fields: fields.length,
  corrupt_instances: badInstances.length, corrupt_tiles: [...new Set(badInstances.map(i => `${i.z}/${i.x}/${i.y}`))], report: 'data/processed/qa/archive-z13-18/attribute-investigation.json' }))
