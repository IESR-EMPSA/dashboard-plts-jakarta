// Launches only an isolated diagnostic in an existing Chrome installation.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qa = resolve(root, 'data/processed/qa')
await mkdir(qa, { recursive: true })
const profile = resolve(qa, `chrome-profile-${process.pid}`)
assert(profile.startsWith(qa + sep), 'Browser profile must stay inside ignored QA directory')
const chrome = process.env.CHROME_PATH || resolve(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
await access(chrome)
const db = new DatabaseSync(resolve(root, 'data/raw/buildings_eligible_pvout.mbtiles'), { readOnly: true })
const cli = resolve(root, '.tools/pmtiles/pmtiles.exe')
const cache = new Map(), requests = [], exceptions = [], assetFailures = []
const assets = {
  '/': ['scripts/qa/browser.html', 'text/html'], '/qa.js': ['scripts/qa/browser.js', 'text/javascript'],
  '/maplibre-gl.mjs': ['node_modules/maplibre-gl/dist/maplibre-gl.mjs', 'text/javascript'],
  '/maplibre-gl-worker.mjs': ['node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'text/javascript'],
  '/maplibre-gl-shared.mjs': ['node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs', 'text/javascript'],
  '/maplibre.css': ['node_modules/maplibre-gl/dist/maplibre-gl.css', 'text/css'],
}
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname
    if (assets[pathname]) {
      const [file, type] = assets[pathname]
      const bytes = await readFile(resolve(root, file))
      res.writeHead(200, { 'Content-Type': type })
      res.end(bytes)
      return
    }
    const m = /^\/(mb|pm)\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(pathname)
    if (!m) { if (req.url !== '/favicon.ico') assetFailures.push(req.url); res.writeHead(404); res.end(); return }
    const [, archive, zs, xs, ys] = m, z = Number(zs), x = Number(xs), y = Number(ys)
    const original = db.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?').get(z, x, 2 ** z - 1 - y)
    if (!original) { res.writeHead(204); res.end(); return }
    if (!cache.has(req.url)) cache.set(req.url, archive === 'mb' ? Buffer.from(original.tile_data)
      : execFileSync(cli, ['tile', resolve(root, 'data/processed/buildings_eligible_dki.pmtiles'), zs, xs, ys], { maxBuffer: 16 * 1024 * 1024 }))
    const bytes = cache.get(req.url)
    requests.push({ archive, z, x, y, bytes: bytes.length })
    res.writeHead(200, { 'Content-Type': 'application/x-protobuf', 'Content-Encoding': 'gzip', 'Content-Length': bytes.length })
    res.end(bytes)
  } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(e.message) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--window-size=1100,800', `http://127.0.0.1:${port}/`],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let browserLog = '', socket
browser.stderr.on('data', b => { browserLog += b.toString() })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let debuggingPort
  for (let i = 0; i < 120; i++) {
    if (browser.exitCode !== null) throw Error(`Chrome exited ${browser.exitCode}: ${browserLog.slice(-2000)}`)
    try { debuggingPort = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break }
    catch { await pause(250) }
  }
  assert(debuggingPort, 'Chrome debugging port unavailable')
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json()
  const target = targets.find(t => t.type === 'page' && t.url.includes(`127.0.0.1:${port}`))
  assert(target, 'Diagnostic page unavailable')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = event => {
    const m = JSON.parse(event.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result) }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails)
  }
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id
    pending.set(messageId, { resolve, reject })
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })
  await command('Runtime.enable')
  const browserVersion = await command('Browser.getVersion')
  let result, progress
  for (let i = 0; i < 480; i++) {
    const response = await command('Runtime.evaluate', { expression: 'window.__qaResults || null', returnByValue: true })
    result = response.result.value
    if (result) break
    const p = await command('Runtime.evaluate', { expression: 'window.__qaProgress || null', returnByValue: true })
    if (p.result.value?.running !== progress?.running) {
      progress = p.result.value
      console.log(JSON.stringify({ progress }))
    }
    await pause(250)
  }
  if (!result) {
    await writeFile(resolve(qa, 'browser-report.json'), JSON.stringify({ browserVersion, progress, exceptions, browserLog, timed_out: true }, null, 2))
    throw Error('Diagnostic timed out; partial browser-report.json retained')
  }
  if (result.fatal) {
    await writeFile(resolve(qa, 'browser-report.json'), JSON.stringify({ browserVersion, ...result, exceptions, browserLog }, null, 2))
    throw Error(result.fatal)
  }
  for (const r of result.results) {
    const screenshotBytes = Buffer.from(r.screenshot.split(',')[1], 'base64')
    await writeFile(resolve(qa, `${r.name}.png`), screenshotBytes)
    r.screenshot_sha256 = createHash('sha256').update(screenshotBytes).digest('hex')
    r.screenshot = `data/processed/qa/${r.name}.png`
    r.visibleUidSha256 = createHash('sha256').update(JSON.stringify(r.visibleUids)).digest('hex')
    r.distinctVisibleUids = r.visibleUids.length
    delete r.visibleUids
  }
  const filtered = result.results.filter(r => r.polygonFilter)
  const mb = filtered.find(r => r.name === 'island-mb-polygon'), pm = filtered.find(r => r.name === 'island-pm-polygon')
  const validation = {
    unfiltered_geometry_error_reproduced: result.results.some(r => !r.polygonFilter && r.errors.includes('feature has no geometry')),
    filtered_render_and_interaction_pass: filtered.every(r => r.settled && r.tilesLoaded && r.errors.length === 0 && r.coloredPixels > 0 && r.click?.uid && r.hover?.state.hover),
    filtered_mb_pm_visible_ids_identical: mb.visibleUidSha256 === pm.visibleUidSha256,
    filtered_mb_pm_pixel_counts_identical: mb.coloredPixels === pm.coloredPixels,
    filtered_mb_pm_screenshots_identical: mb.screenshot_sha256 === pm.screenshot_sha256,
  }
  const archiveReport = JSON.parse(await readFile(resolve(qa, 'archive-report.json'), 'utf8'))
  const report = { scope: 'Isolated Chrome software-WebGL diagnostic; no Vue/app integration or remote hosting',
    data_version: archiveReport.data_version, mbtiles_sha256: archiveReport.source.sha256,
    pmtiles_sha256: archiveReport.output.sha256,
    browserVersion, cases: result.results, requests, exceptions, assetFailures,
    comparison: validation,
    limitations: ['Synthetic DOM hover/click; no human touch review', 'Representative z16 island/dense views, not exhaustive visual QA',
      'PMTiles sample MVT served via official CLI; PMTiles browser protocol and remote Range/CORS are not integrated/tested'] }
  await writeFile(resolve(qa, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, requests: `${requests.length} local tile requests` }, null, 2))
  if (!Object.values(validation).every(Boolean)) process.exitCode = 1
  await command('Browser.close').catch(() => {})
} finally {
  socket?.close()
  if (browser.exitCode === null) browser.kill()
  await new Promise(resolve => server.close(resolve))
  db.close()
  await pause(1000)
  // Only remove the diagnostic's own resolved profile, never a user's browser profile.
  assert(profile.startsWith(qa + sep))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
}
