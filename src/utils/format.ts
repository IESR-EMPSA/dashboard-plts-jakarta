/** Display conversions only. Values in data services/selectors retain their original units. */
export const mwpToGwp = (value: number | null): number | null => value === null ? null : value / 1_000
export const gwhToTwh = (value: number | null): number | null => value === null ? null : value / 1_000
export const ratioToPercent = (value: number | null): number | null => value === null ? null : value * 100

export function formatNumber(value: number | null, options: { locale?: string; decimals?: number; unavailable?: string } = {}): string {
  if (value === null || !Number.isFinite(value)) return options.unavailable ?? 'Data unavailable'
  const decimals = options.decimals ?? 2
  return new Intl.NumberFormat(options.locale ?? 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}
