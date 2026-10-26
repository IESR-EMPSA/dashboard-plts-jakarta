// Exhaustive offline MBTiles-to-PMTiles payload comparison, without rendering or editing.
import assert from 'node:assert/strict'
import { open, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { Compression, PMTiles } from 'pmtiles'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), qa = resolve(root, 'data/processed/qa/archive-z13-18')
const proof = JSON.parse(await readFile(resolve(qa, 'repair-report.json'), 'utf8'))
const db = new DatabaseSync(resolve(root, proof.outputs.mbtiles), { readOnly: true })
const file = await open(resolve(root, proof.outputs.pmtiles), 'r')
const etag = proof.output_fingerprints.find(f => f.path === proof.outputs.pmtiles).sha256
const asArrayBuffer = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const source = {
  getKey: () => proof.outputs.pmtiles,
  getBytes: async (offset, length) => {
    const bytes = Buffer.alloc(length)
    let read = 0
    while (read < length) {
      const result = await file.read(bytes, read, length - read, offset + read)
      assert(result.bytesRead > 0, 'Unexpected archive EOF'); read += result.bytesRead
    }
    return { data: asArrayBuffer(bytes), etag }
  },
}
const archive = new PMTiles(source, undefined, async (bytes, compression) => {
  if (compression === Compression.None) return bytes
  assert.equal(compression, Compression.Gzip)
  return asArrayBuffer(gunzipSync(bytes))
})
try {
  const header = await archive.getHeader(), zooms = {}
  assert.equal(header.minZoom, 13); assert.equal(header.maxZoom, 18)
  let tiles = 0
  for (const row of db.prepare('SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles ORDER BY zoom_level,tile_column,tile_row').iterate()) {
    const z = row.zoom_level, x = row.tile_column, y = 2 ** z - 1 - row.tile_row
    const delivered = await archive.getZxy(z, x, y)
    assert(delivered, `Missing tile ${z}/${x}/${y}`)
    assert(gunzipSync(row.tile_data).equals(Buffer.from(delivered.data)), `MVT payload differs ${z}/${x}/${y}`)
    tiles++; zooms[z] = (zooms[z] ?? 0) + 1
    if (tiles % 5000 === 0) console.log(JSON.stringify({ progress: 'all-payload-comparison', tiles }))
  }
  assert.equal(tiles, 37710); assert.equal(header.numAddressedTiles, tiles)
  const report = { result: 'Every addressed MVT payload is byte-identical after decompression', mbtiles: proof.outputs.mbtiles,
    pmtiles: proof.outputs.pmtiles, tiles, zooms, header,
    scope: 'All tile bytes including geometries/IDs/attributes; MBTiles repair preservation is recorded separately in repair-report.json' }
  await writeFile(resolve(qa, 'payload-preservation-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ progress: 'every-payload-verified', tiles, zooms }))
} finally { db.close(); await file.close() }
