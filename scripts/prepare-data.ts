import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDataset, serializeDataset } from './lib/data-pipeline.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
assert(args.every(a => a === '--check') && args.length <= 1, 'Usage: node scripts/prepare-data.ts [--check]')
const bundle = await loadDataset(root) // validates every input before writing anything
const files = serializeDataset(bundle)
const output = resolve(root, 'public/data')
if (args.includes('--check')) {
  assert.deepEqual((await readdir(output)).sort(), [...files.keys()].sort(), 'Generated file inventory differs')
  for (const [name, expected] of files)
    assert.equal(await readFile(resolve(output, name), 'utf8'), expected, `${name} is stale or altered; regenerate`)
} else {
  await mkdir(output, { recursive: true })
  for (const [name, content] of files) await writeFile(resolve(output, name), content, 'utf8')
}
console.log(JSON.stringify({ mode: args.includes('--check') ? 'verified' : 'generated', files: files.size,
  data_version: bundle.regions.metadata.data_version, totals: bundle.regions.overall,
  administrative_joins: { regions: bundle.regions.regions.length, districts: bundle.districts.districts.length,
    aliases: bundle.adminCrosswalk.districts.filter(d => d.alias_applied).length, unmatched: 0 } }, null, 2))
