import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { BUILDING_ARCHIVE } from '../../src/map/buildingArchive.ts'

export const LOCAL_PMTILES_PATH = BUILDING_ARCHIVE.localUrl
export const MAX_RANGE_BYTES = 16 * 1024 * 1024

export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return null
  let start: number, end: number
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix); end = size - 1
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null
    end = Math.min(end, size - 1)
  }
  return start < 0 || start >= size || end < start || end - start + 1 > MAX_RANGE_BYTES ? null : { start, end }
}

export function archiveMiddleware(archivePath: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    let path: string
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname) }
    catch { res.writeHead(400); res.end('Invalid URL.'); return }
    if (path !== LOCAL_PMTILES_PATH) {
      // Prevent Vite's normal static middleware from serving complete research archives.
      if (/\.(pmtiles|mbtiles)$/i.test(path)) { res.writeHead(403); res.end('Archive access requires the local byte-range endpoint.'); return }
      next(); return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return }
    try {
      const info = await stat(archivePath)
      const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
      const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, max-age=0, must-revalidate', ETag: etag }
      if (req.method === 'HEAD') { res.writeHead(200, { ...headers, 'Content-Length': info.size }); res.end(); return }
      if (req.headers['if-match'] && req.headers['if-match'] !== etag) { res.writeHead(412, headers); res.end(); return }
      const range = parseByteRange(req.headers.range, info.size)
      if (!range) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }); res.end('A bounded single byte range is required.'); return }
      res.writeHead(206, { ...headers, 'Content-Length': range.end - range.start + 1,
        'Content-Range': `bytes ${range.start}-${range.end}/${info.size}` })
      const stream = createReadStream(archivePath, range)
      res.on('close', () => stream.destroy())
      stream.on('error', error => res.destroy(error))
      stream.pipe(res)
    } catch {
      if (!res.headersSent) { res.writeHead(503); res.end('The local building archive is unavailable.'); }
    }
  }
}

/** Development only; never exposes a production API or copies an archive into the build. */
export function localPmtilesPlugin(): Plugin {
  const archive = fileURLToPath(new URL(`../../${BUILDING_ARCHIVE.localFile}`, import.meta.url))
  return { name: 'local-research-pmtiles', apply: 'serve', configureServer(server) { server.middlewares.use(archiveMiddleware(archive)) } }
}
