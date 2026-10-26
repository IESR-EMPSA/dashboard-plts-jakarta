import { inject, readonly, ref } from 'vue'
import type { InjectionKey } from 'vue'
import { formatNumber } from '../utils/format.ts'
import { messages } from './messages.ts'
import type { Locale, MessageKey } from './messages.ts'

export const LANGUAGE_STORAGE_KEY = 'jakarta-solar-language'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const typeKeys: Record<string, MessageKey> = { Hunian: 'type.residential', 'Non Hunian': 'type.nonResidential', 'Tidak diketahui': 'type.unknown', Pemerintahan: 'type.government', Kelistrikan: 'type.electricity', Masjid: 'type.mosque', Mushola: 'type.prayerRoom' }
const regionKeys: Record<string, MessageKey> = { 'Jakarta Pusat': 'region.central', 'Jakarta Utara': 'region.north', 'Jakarta Barat': 'region.west', 'Jakarta Selatan': 'region.south', 'Jakarta Timur': 'region.east', 'Kepulauan Seribu': 'region.islands' }
const districtKeys: Record<string, MessageKey> = { 'Kepulauan Seribu Utara': 'district.northIslands', 'Kepulauan Seribu Selatan': 'district.southIslands' }

/** Per-application state; storage is optional so privacy settings never prevent startup. */
export function createI18n(storage?: Storage) {
  const locale = ref<Locale>('id')
  try { const saved = storage?.getItem(LANGUAGE_STORAGE_KEY); if (saved === 'id' || saved === 'en') locale.value = saved } catch { /* Storage may be blocked. */ }
  function setLocale(value: Locale) {
    if (value !== 'id' && value !== 'en') return
    locale.value = value
    try { storage?.setItem(LANGUAGE_STORAGE_KEY, value) } catch { /* Keep the current session usable. */ }
  }
  function t(key: MessageKey, params: Record<string, string | number> = {}): string {
    return messages[key][locale.value].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder))
  }
  function n(value: number | null, decimals = 2) {
    return formatNumber(value, { locale: locale.value === 'id' ? 'id-ID' : 'en-US', decimals, unavailable: t('common.unavailable') })
  }
  const name = (keys: Record<string, MessageKey>, value: string) => keys[value] ? t(keys[value]) : value
  function errorMessage(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'network' || code === 'http' || code === 'timeout') return t(`error.${code}`)
    if (['parse', 'validation', 'integrity', 'version', 'invalid-filter', 'invalid-building'].includes(String(code))) return t('error.invalid')
    return t('error.generic')
  }
  return { locale: readonly(locale), setLocale, t, n, errorMessage,
    typeName: (value: string) => name(typeKeys, value),
    regionName: (value: string) => name(regionKeys, value),
    districtName: (value: string) => name(districtKeys, value),
  }
}
export type I18n = ReturnType<typeof createI18n>
export const i18nKey: InjectionKey<I18n> = Symbol('i18n')
export function useI18n(): I18n {
  const i18n = inject(i18nKey)
  if (!i18n) throw new Error('The application i18n provider is missing')
  return i18n
}
