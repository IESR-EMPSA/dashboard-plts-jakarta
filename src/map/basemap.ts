import type { StyleSpecification } from 'maplibre-gl'

export const BASEMAP_URL = 'https://tiles.openfreemap.org/styles/positron'
export const neutralStyle = (): StyleSpecification => ({ version: 8, sources: {},
  layers: [{ id: 'solar-background', type: 'background', paint: { 'background-color': '#e8eff0' } }] })

/** The data overlays always work with a neutral style if the external map cannot load. */
export async function loadBasemap(): Promise<{ style: StyleSpecification; fallback: boolean }> {
  try {
    const response = await fetch(BASEMAP_URL, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) throw Error(`Basemap HTTP ${response.status}`)
    const style = await response.json() as StyleSpecification
    if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)) throw Error('Invalid basemap style')
    return { style, fallback: false }
  } catch { return { style: neutralStyle(), fallback: true } }
}
