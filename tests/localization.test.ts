import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { computed } from 'vue'
import { createI18n, LANGUAGE_STORAGE_KEY } from '../src/i18n/index.ts'
import { messages } from '../src/i18n/messages.ts'
import type { MessageKey } from '../src/i18n/messages.ts'

test('every message has both languages and matching interpolation parameters', () => {
  const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
  for (const [key, pair] of Object.entries(messages)) {
    assert(pair.id.trim(), `${key}: missing Indonesian`)
    assert(pair.en.trim(), `${key}: missing English`)
    assert.deepEqual(params(pair.id), params(pair.en), key)
    assert(!/[<>]/.test(pair.id + pair.en), `${key}: translations are plain text`)
  }
})

test('language changes reactively update messages, numbers, and existing scopes', () => {
  const i18n = createI18n()
  const scope = computed(() => `${i18n.regionName('Jakarta Barat')} · ${i18n.typeName('Hunian')}`)
  const metric = computed(() => `${i18n.t('kpi.eligible')}: ${i18n.n(1470399, 0)}`)
  assert.equal(scope.value, 'Jakarta Barat · Hunian')
  assert.equal(metric.value, 'Bangunan layak: 1.470.399')
  i18n.setLocale('en')
  assert.equal(scope.value, 'West Jakarta · Residential')
  assert.equal(metric.value, 'Eligible buildings: 1,470,399')
  assert.equal(i18n.t('chart.missing', { count: i18n.n(4124, 0) }), '4,124 eligible buildings without PVOUT')
  i18n.setLocale('id')
  assert.equal(metric.value, 'Bangunan layak: 1.470.399')
})

test('display formatting preserves null, zero, units and original measurement precision', () => {
  const i18n = createI18n()
  const capacity = 18627.76699292319
  for (const locale of ['id', 'en'] as const) {
    i18n.setLocale(locale)
    assert.equal(i18n.n(null), locale === 'id' ? 'Tidak tersedia' : 'Unavailable')
    assert.equal(i18n.n(0), locale === 'id' ? '0,00' : '0.00')
    assert.equal(i18n.n(Number.NaN), i18n.n(null))
    assert.equal(i18n.n(capacity, 3), locale === 'id' ? '18.627,767' : '18,627.767')
    assert.equal(i18n.t('unit.pvoutYear'), locale === 'id' ? 'kWh/kWp/tahun' : 'kWh/kWp/year')
  }
  assert.equal(capacity, 18627.76699292319)
})

test('all published region, district and building type labels have display mappings without changing IDs', async () => {
  const load = async (file: string) => JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url), 'utf8'))
  const [regions, districts, types] = await Promise.all([load('summary_wilayah.json'), load('summary_kecamatan.json'), load('summary_jenis.json')])
  const before = JSON.stringify({ regions, districts, types })
  const i18n = createI18n()
  i18n.setLocale('en')
  assert.equal(regions.regions.length, 6)
  for (const row of regions.regions) assert.notEqual(i18n.regionName(row.wilayah), row.wilayah)
  assert.equal(types.types.length, 7)
  for (const row of types.types) assert.notEqual(i18n.typeName(row.jenis_group), row.jenis_group)
  assert.equal(districts.districts.length, 44)
  for (const row of districts.districts) {
    const label = i18n.districtName(row.kecamatan)
    assert(label)
    if (row.kecamatan.startsWith('Kepulauan Seribu')) assert.notEqual(label, row.kecamatan)
    else assert.equal(label, row.kecamatan, 'Proper district names remain unchanged')
  }
  assert.equal(i18n.typeName('Future category'), 'Future category')
  assert.equal(JSON.stringify({ regions, districts, types }), before)
})

test('language preference survives app recreation and unsupported values default to Indonesian', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const first = createI18n(storage)
  assert.equal(first.locale.value, 'id')
  first.setLocale('en')
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), 'en')
  assert.equal(createI18n(storage).locale.value, 'en')
  values.set(LANGUAGE_STORAGE_KEY, 'fr')
  assert.equal(createI18n(storage).locale.value, 'id')
})

test('blocked storage never prevents starting or switching languages', () => {
  const storage = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceededError') } }
  const i18n = createI18n(storage)
  assert.equal(i18n.locale.value, 'id')
  assert.doesNotThrow(() => i18n.setLocale('en'))
  assert.equal(i18n.locale.value, 'en')
  assert.equal(createI18n().locale.value, 'id', 'App instances are isolated')
})

test('errors are understandable in both languages without exposing developer diagnostics', () => {
  const i18n = createI18n()
  for (const locale of ['id', 'en'] as const) {
    i18n.setLocale(locale)
    for (const code of ['network', 'http', 'timeout', 'validation', 'parse', 'integrity', 'version', 'invalid-filter', 'invalid-building', 'unknown']) {
      const error = { code, message: 'Internal file /secret/path failed with developer diagnostics' }
      assert(!i18n.errorMessage(error).includes('/secret/path'))
      const key: MessageKey = code === 'network' || code === 'http' || code === 'timeout' ? `error.${code}` : code === 'unknown' ? 'error.generic' : 'error.invalid'
      assert.equal(i18n.errorMessage(error), i18n.t(key))
    }
    assert.equal(i18n.errorMessage(null), i18n.t('error.generic'))
  }
})
