import { formatNumber } from './format.ts'

export const numberId = (value: number | null, decimals = 2) =>
  formatNumber(value, { locale: 'id-ID', decimals, unavailable: 'Tidak tersedia' })

export const shortRegionName = (name: string) => name.replace('Jakarta ', 'Jak. ')
