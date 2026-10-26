import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeVarint, mvtFeature, mvtLayers, repairMvtAttributes, wireField, wireFields } from '../scripts/lib/mvt-attributes.mjs'

const string = s => wireField(1, 2, Buffer.from(s))
const double = n => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return wireField(3, 1, b) }
const packed = numbers => Buffer.concat(numbers.map(encodeVarint))
const geometry = Buffer.from([9, 0, 0, 26, 20, 0, 0, 20, 19, 0, 15])
function fixture() {
  const feature = (uid, area) => wireField(2, 2, Buffer.concat([
    wireField(1, 0, encodeVarint(0x8000000000000007n)),
    wireField(2, 2, packed([0, uid, 1, area, 2, 1])),
    wireField(3, 0, encodeVarint(3)), wireField(4, 2, geometry), wireField(31, 2, Buffer.from('opaque feature data')),
  ]))
  const otherLayer = wireField(3, 2, Buffer.concat([wireField(1, 2, Buffer.from('other')), wireField(15, 0, encodeVarint(2))]))
  const main = wireField(3, 2, Buffer.concat([
    wireField(1, 2, Buffer.from('buildings')), feature(0, 1), feature(2, 3),
    ...['building_uid', 'area_m2', 'NAMBANG'].map(s => wireField(3, 2, Buffer.from(s))),
    ...[string('1097775'), string('17'), string('untouched'), double(200)].map(b => wireField(4, 2, b)),
    wireField(5, 0, encodeVarint(4096)), wireField(15, 0, encodeVarint(2)),
  ]))
  return Buffer.concat([wireField(20, 2, Buffer.from('opaque tile data')), main, otherLayer])
}
const change = { feature_index: 0, uid: '1097775', field: 'area_m2', before: '17', replacement: 128.27499098191038 }

test('surgical MVT repair preserves shared strings, geometry bytes, uint64 IDs, other records and layers', () => {
  const original = fixture(), snapshot = Buffer.from(original)
  const result = repairMvtAttributes(original, 'buildings', [change])
  assert(original.equals(snapshot), 'Input buffer must remain unchanged')
  const before = mvtLayers(original), after = mvtLayers(result.bytes)
  assert(before[1].field.raw.equals(after[1].field.raw))
  assert(before[0].features[1].raw.equals(after[0].features[1].raw))
  const first = mvtFeature(after[0], after[0].features[0])
  assert.equal(first.properties.area_m2, change.replacement)
  assert.equal(first.properties.NAMBANG, '17')
  assert.equal(after[0].values[1], '17', 'Shared dictionary entry stays intact')
  const old = mvtFeature(before[0], before[0].features[0])
  for (const field of old.fields.filter(f => f.number !== 2)) assert(first.fields.some(f => f.raw.equals(field.raw)))
  assert(wireFields(original)[0].raw.equals(wireFields(result.bytes)[0].raw))
  assert.equal(result.applied.length, 1)
})

test('numeric replacement roundtrips exact double precision including zero', () => {
  for (const n of [0, 1.2345678901234567, Number.MIN_VALUE, Number.MAX_VALUE]) {
    const result = repairMvtAttributes(fixture(), 'buildings', [{ ...change, replacement: n }])
    const layer = mvtLayers(result.bytes)[0]
    assert.equal(mvtFeature(layer, layer.features[0]).properties.area_m2, n)
  }
})

test('repair rejects stale identity, changed source value, missing properties and duplicate targets', () => {
  for (const bad of [{ uid: 'wrong' }, { before: '18' }, { field: 'absent' }, { feature_index: 1 }, { feature_index: 99 }]) {
    assert.throws(() => repairMvtAttributes(fixture(), 'buildings', [{ ...change, ...bad }]))
  }
  assert.throws(() => repairMvtAttributes(fixture(), 'buildings', [change, change]))
  assert.throws(() => repairMvtAttributes(fixture(), 'missing', [change]))
})

test('repair rejects nonnumeric/nonfinite replacements and refuses to overwrite an intact numeric property', () => {
  for (const replacement of ['128', null, NaN, Infinity, -Infinity]) {
    assert.throws(() => repairMvtAttributes(fixture(), 'buildings', [{ ...change, replacement }]))
  }
  assert.throws(() => repairMvtAttributes(fixture(), 'buildings', [{ ...change, feature_index: 1, uid: 'untouched', before: 200 }]))
})

test('wire reader rejects truncation, invalid field numbers, invalid wire types and varint overflow', () => {
  for (const bytes of [Buffer.from([0]), Buffer.from([10, 3, 1]), Buffer.from([11]), Buffer.from([128]), Buffer.from(Array(11).fill(255))]) {
    assert.throws(() => wireFields(bytes))
  }
  assert.throws(() => encodeVarint(-1n))
  assert.throws(() => encodeVarint(1n << 64n))
})
