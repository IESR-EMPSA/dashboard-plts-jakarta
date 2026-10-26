// Minimal wire-level MVT attribute editor. Geometry and unrelated wire bytes stay opaque.
import assert from 'node:assert/strict'

export function encodeVarint(value) {
  let n = BigInt(value)
  assert(n >= 0n && n <= 0xffffffffffffffffn, 'Unsigned 64-bit varint required')
  const bytes = []
  do { const byte = Number(n & 127n); n >>= 7n; bytes.push(byte | (n ? 128 : 0)) } while (n)
  return Buffer.from(bytes)
}
function token(bytes, cursor) {
  const start = cursor.i
  let value = 0n
  for (let shift = 0n; shift < 70n; shift += 7n) {
    assert(cursor.i < bytes.length, 'Truncated varint')
    const byte = bytes[cursor.i++]
    if (shift === 63n) assert(byte <= 1, 'Varint exceeds uint64')
    value |= BigInt(byte & 127) << shift
    if (byte < 128) return { value, raw: bytes.subarray(start, cursor.i) }
  }
  throw Error('Invalid varint')
}
export function wireField(number, wire, payload) {
  const tag = encodeVarint(BigInt(number) * 8n + BigInt(wire))
  return Buffer.concat(wire === 2 ? [tag, encodeVarint(payload.length), payload] : [tag, payload])
}
export function wireFields(bytes) {
  const fields = [], cursor = { i: 0 }
  while (cursor.i < bytes.length) {
    const start = cursor.i, tag = Number(token(bytes, cursor).value)
    const number = Math.floor(tag / 8), wire = tag & 7
    assert(number > 0, 'Invalid Protobuf field number')
    let payload
    if (wire === 0) payload = token(bytes, cursor).raw
    else {
      const size = wire === 2 ? Number(token(bytes, cursor).value) : wire === 1 ? 8 : wire === 5 ? 4 : -1
      assert(Number.isSafeInteger(size) && size >= 0, 'Unsupported Protobuf wire type')
      assert(cursor.i + size <= bytes.length, 'Truncated Protobuf field')
      payload = bytes.subarray(cursor.i, cursor.i + size); cursor.i += size
    }
    fields.push({ number, wire, payload, raw: bytes.subarray(start, cursor.i) })
  }
  return fields
}
function scalar(bytes) { return token(bytes, { i: 0 }).value }
function value(message) {
  const fields = wireFields(message)
  assert.equal(fields.length, 1, 'Ambiguous MVT Value')
  const f = fields[0]
  if (f.number === 1 && f.wire === 2) return f.payload.toString('utf8')
  if (f.number === 2 && f.wire === 5) return f.payload.readFloatLE()
  if (f.number === 3 && f.wire === 1) return f.payload.readDoubleLE()
  assert(f.wire === 0 && [4, 5, 6, 7].includes(f.number), 'Unexpected MVT Value encoding')
  const n = scalar(f.payload)
  if (f.number === 7) return n !== 0n
  if (f.number === 6) return Number((n >> 1n) ^ -(n & 1n))
  return Number(f.number === 4 ? BigInt.asIntN(64, n) : n)
}
export function mvtLayers(bytes) {
  return wireFields(bytes).filter(f => f.number === 3 && f.wire === 2).map(field => {
    const fields = wireFields(field.payload)
    return { field, fields, name: fields.find(f => f.number === 1)?.payload.toString('utf8'),
      keys: fields.filter(f => f.number === 3).map(f => f.payload.toString('utf8')),
      values: fields.filter(f => f.number === 4).map(f => value(f.payload)),
      features: fields.filter(f => f.number === 2) }
  })
}
export function mvtFeature(layer, feature) {
  const fields = wireFields(feature.payload), properties = Object.create(null), tags = []
  for (const field of fields.filter(f => f.number === 2)) {
    assert.equal(field.wire, 2, 'Expected packed feature tags')
    const tokens = [], cursor = { i: 0 }
    while (cursor.i < field.payload.length) tokens.push(token(field.payload, cursor))
    assert.equal(tokens.length % 2, 0, 'Incomplete feature tag pair')
    for (let i = 0; i < tokens.length; i += 2) {
      const keyIndex = Number(tokens[i].value), valueIndex = Number(tokens[i + 1].value)
      assert(keyIndex < layer.keys.length && valueIndex < layer.values.length, 'Invalid dictionary index')
      const key = layer.keys[keyIndex]
      assert(!Object.hasOwn(properties, key), 'Duplicate feature property')
      properties[key] = layer.values[valueIndex]
    }
    tags.push({ field, tokens })
  }
  return { fields, tags, properties }
}

/** Each change specifies an exact feature index/UID/field and a verified numeric value. */
export function repairMvtAttributes(bytes, layerName, changes) {
  const layers = mvtLayers(bytes), matches = layers.filter(l => l.name === layerName)
  assert.equal(matches.length, 1, 'Expected exactly one target layer')
  const layer = matches[0], byFeature = new Map(), applied = []
  for (const change of changes) {
    assert(Number.isInteger(change.feature_index) && change.feature_index >= 0 && change.feature_index < layer.features.length)
    assert(Number.isFinite(change.replacement), 'Finite verified replacement required')
    if (!byFeature.has(change.feature_index)) byFeature.set(change.feature_index, new Map())
    const fields = byFeature.get(change.feature_index)
    assert(!fields.has(change.field), 'Duplicate repair target')
    fields.set(change.field, change)
  }
  const replacements = new Map(), addedValues = []
  for (const [index, wanted] of byFeature) {
    const feature = layer.features[index], decoded = mvtFeature(layer, feature)
    for (const change of wanted.values()) {
      assert.equal(decoded.properties.building_uid, change.uid, 'Feature identity changed')
      assert(Object.hasOwn(decoded.properties, change.field), 'Missing repair property')
      assert.equal(decoded.properties[change.field], change.before, 'Source value changed')
      assert.equal(typeof change.before, 'string', 'Refuse to overwrite an existing numeric attribute')
    }
    const tagReplacements = new Map()
    for (const { field, tokens } of decoded.tags) {
      const output = tokens.map(t => t.raw)
      for (let i = 0; i < tokens.length; i += 2) {
        const key = layer.keys[Number(tokens[i].value)], change = wanted.get(key)
        if (!change) continue
        const double = Buffer.alloc(8); double.writeDoubleLE(change.replacement)
        const valueIndex = layer.values.length + addedValues.length
        addedValues.push(wireField(4, 2, wireField(3, 1, double)))
        output[i + 1] = encodeVarint(valueIndex)
        applied.push({ ...change, original_value_index: Number(tokens[i + 1].value), new_value_index: valueIndex })
      }
      tagReplacements.set(field, wireField(2, 2, Buffer.concat(output)))
    }
    replacements.set(feature, wireField(2, 2, Buffer.concat(decoded.fields.map(f => tagReplacements.get(f) ?? f.raw))))
  }
  assert.equal(applied.length, changes.length, 'Not every requested repair was applied')
  const repairedLayer = wireField(3, 2, Buffer.concat([...layer.fields.map(f => replacements.get(f) ?? f.raw), ...addedValues]))
  const output = Buffer.concat(wireFields(bytes).map(f => f.number === 3 && f.raw.equals(layer.field.raw) ? repairedLayer : f.raw))
  // Independently enforce preservation within this editor, including opaque geometry/id fields.
  const after = mvtLayers(output).find(l => l.name === layerName)
  assert.equal(after.features.length, layer.features.length)
  assert.deepEqual(after.keys, layer.keys)
  assert.deepEqual(after.values.slice(0, layer.values.length), layer.values)
  for (let i = 0; i < layer.features.length; i++) {
    if (!byFeature.has(i)) { assert(layer.features[i].raw.equals(after.features[i].raw)); continue }
    const beforeFeature = mvtFeature(layer, layer.features[i]), afterFeature = mvtFeature(after, after.features[i])
    assert(Buffer.concat(beforeFeature.fields.filter(f => f.number !== 2).map(f => f.raw)).equals(
      Buffer.concat(afterFeature.fields.filter(f => f.number !== 2).map(f => f.raw))), 'Geometry, ID, type or unknown fields changed')
    const expected = Object.assign(Object.create(null), beforeFeature.properties)
    for (const change of byFeature.get(i).values()) expected[change.field] = change.replacement
    assert.deepEqual(afterFeature.properties, expected, 'Unrequested property changed')
  }
  return { bytes: output, applied }
}
