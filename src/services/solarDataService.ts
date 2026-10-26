import type { AdminBoundaries, DataManifest } from '../types/solar.ts'
import type { BoundaryLevel, ReadonlyBoundaries, ReadonlyDashboardData, SolarDataService } from '../types/dashboard.ts'
import { asDataError, assertData, SolarDataError } from './dataError.ts'
import { BOUNDARY_FILES, DATA_FILES, deepFreeze, validateBoundaries, validateDashboardData, validateManifest } from './dataValidation.ts'

export interface SolarDataServiceOptions {
  /** Public directory URL, including the Vite base path if deployed below /. */
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  requestTimeoutMs?: number
}

/** Per-app release cache. Administrative geometry is loaded only when requested. */
export function createSolarDataService(options: SolarDataServiceOptions = {}): SolarDataService {
  const base = (options.baseUrl ?? '/data/').replace(/\/?$/, '/')
  const fetcher = options.fetch ?? globalThis.fetch
  const timeout = options.requestTimeoutMs ?? 15_000
  assertData(typeof fetcher === 'function', 'A fetch implementation is required')
  assertData(Number.isFinite(timeout) && timeout > 0, 'requestTimeoutMs must be positive')
  const cache = new Map<string, Promise<unknown>>()

  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = cache.get(key)
    if (existing) return existing as Promise<T>
    const promise = load()
    cache.set(key, promise)
    void promise.catch(() => { if (cache.get(key) === promise) cache.delete(key) })
    return promise
  }

  async function fetchJson(filename: string, manifest?: DataManifest): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetcher(base + filename, { signal: controller.signal, cache: 'no-cache' })
      if (!response.ok) throw new SolarDataError('http', `Unable to fetch ${filename} (HTTP ${response.status})`, { resource: filename, status: response.status })
      const bytes = await response.arrayBuffer()
      if (manifest) {
        const entry = manifest.outputs.find(o => o.path === `public/data/${filename}`)
        assertData(entry, `${filename}: missing manifest entry`)
        if (bytes.byteLength !== entry.bytes) throw new SolarDataError('integrity', `${filename}: byte size differs from the release manifest`, { resource: filename })
        if (!globalThis.crypto?.subtle) throw new SolarDataError('integrity', 'Web Crypto is required for release verification; use HTTPS or localhost', { resource: filename })
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
        const sha = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
        if (sha !== entry.sha256) throw new SolarDataError('integrity', `${filename}: SHA-256 differs from the release manifest`, { resource: filename })
      }
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
      catch (cause) { throw new SolarDataError('parse', `${filename}: invalid JSON or UTF-8`, { resource: filename, cause }) }
    } catch (cause) {
      if (controller.signal.aborted) throw new SolarDataError('timeout', `Request timed out: ${filename}`, { resource: filename, cause })
      if (cause instanceof SolarDataError) throw cause
      throw new SolarDataError('network', `Unable to load ${filename}`, { resource: filename, cause })
    } finally { clearTimeout(timer) }
  }

  function loadSummaries(): Promise<ReadonlyDashboardData> {
    return cached('summaries', async () => {
      const manifest = await fetchJson('data_manifest.json')
      validateManifest(manifest)
      const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([key, file]) => [key, await fetchJson(file, manifest)] as const))
      const data: unknown = { manifest, ...Object.fromEntries(entries) }
      validateDashboardData(data)
      return deepFreeze(data)
    })
  }

  function loadBoundaries(level: BoundaryLevel): Promise<ReadonlyBoundaries> {
    assertData(level === 'region' || level === 'district', 'Unknown administrative boundary level')
    return cached(`boundaries:${level}`, async () => {
      const data = await loadSummaries()
      const geo = await fetchJson(BOUNDARY_FILES[level], data.manifest as DataManifest)
      validateBoundaries(geo, level, data)
      return deepFreeze(geo as AdminBoundaries)
    })
  }

  return { loadSummaries, loadBoundaries, clearCache: () => cache.clear() }
}

export { asDataError }
