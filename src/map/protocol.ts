import { addProtocol, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'

let protocol: Protocol | undefined
export function prepareMapRuntime(): void {
  setWorkerUrl(workerUrl)
  if (!protocol) { protocol = new Protocol(); addProtocol('pmtiles', protocol.tile) }
}

export function buildingArchiveUrl(): string | null {
  const configured = import.meta.env.VITE_BUILDINGS_PMTILES_URL as string | undefined
  if (configured) return configured
  return import.meta.env.DEV ? new URL('/_local/buildings.pmtiles', window.location.origin).href : null
}
