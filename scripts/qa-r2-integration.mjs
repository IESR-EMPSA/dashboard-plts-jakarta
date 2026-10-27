// Read-only delivery QA against the actual localhost app. Never bypass TLS/CORS.
// Use the same route/profile settings for local and remote comparisons.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILDING_ARCHIVE } from '../src/map/buildingArchive.ts'
import { adaptBuildingProperties } from '../src/services/normalization.ts'
import { createSolarDataService } from '../src/services/solarDataService.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const mode = option('mode', 'remote'), label = option('label', mode)
const base = option('base', 'http://localhost:5173')
// Use Windows' configured resolver (including its DoH) rather than Chrome's
// separate plaintext DNS client. No IP mapping, TLS exception or OS setting edit.
const browserResolver = option('browser-resolver', 'windows')
assert(['windows', 'default'].includes(browserResolver))
assert(!process.argv.some(a => a.startsWith('--resolve-ip=')), 'IP overrides are not supported')
const netlog = process.argv.includes('--netlog')
const remote = 'https://pub-780258dd404b45ddaec3dc7bd19afed1.r2.dev/buildings_eligible_dki_z13-18_repaired.pmtiles'
assert(['local', 'remote', 'probe'].includes(mode)); assert(/^[a-z0-9-]+$/.test(label))
assert(['http://localhost:5173', 'http://127.0.0.1:5173'].includes(base))
const expectedUrl = mode === 'local' ? new URL(BUILDING_ARCHIVE.localUrl, base).href : remote
const qa = resolve(root, 'data/processed/qa/r2-integration', label)
const profile = resolve(qa, `chrome-profile-${process.pid}`)
await mkdir(qa, { recursive: true })
const bytes = 1667964549, started = Date.now()
const result = { mode, base, expectedUrl, viewport: [1440, 900], gpuMode: 'default',
  dns: { mode: 'system-default', browserResolver, ipOverride: false, systemSettingsChanged: false },
  status: 'running', node: process.version, connection: [], browserCors: [], steps: [], inspections: [],
  statistics: [], requests: [], errors: [], failures: [], limitations: [
    'Fresh isolated headless Chrome profile per run; default GPU; no network emulation.',
    'Navigation uses jumpTo, with a 200 ms polling floor; no forced GC or page reload during the route.',
    'Completed encoded bytes are CDP transfer measurements, not advertised Content-Length of canceled requests.',
    'r2.dev is a development endpoint. These runs do not certify production/device budgets.',
  ] }
const local = await open(resolve(root, BUILDING_ARCHIVE.localFile), 'r')
const first = Buffer.alloc(16384); await local.read(first, 0, first.length, 0); await local.close()
const service = createSolarDataService({ fetch: async input => new Response(await readFile(resolve(root,
  'public/data', new URL(String(input), 'https://local.test').pathname.split('/').at(-1)))) })
const data = await service.loadSummaries()

async function connectionProbe(origin) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000)
  const begin = performance.now(), check = { origin, url: expectedUrl }
  try {
    const init = { headers: { Range: 'bytes=0-16383', Origin: origin }, signal: controller.signal }
    const r = await fetch(expectedUrl, init)
    Object.assign(check, { status: r.status, headers: Object.fromEntries(r.headers) })
    // Reject a whole-object response before reading its body.
    if (r.status !== 206 || r.headers.get('content-range') !== `bytes 0-16383/${bytes}` || r.headers.get('content-length') !== '16384') {
      controller.abort(); throw Error('Expected bounded 16 KiB Range/206 response')
    }
    const chunks = []; let count = 0
    for await (const chunk of r.body) { count += chunk.length; if (count > 16384) { controller.abort(); throw Error('Oversized range body') }; chunks.push(chunk) }
    assert.equal(count, first.length); assert.deepEqual(Buffer.concat(chunks), first)
    if (mode !== 'local') {
      assert.equal(r.headers.get('access-control-allow-origin'), origin)
      const exposed = (r.headers.get('access-control-expose-headers') ?? '').toLowerCase().split(',').map(h => h.trim())
      for (const name of ['etag', 'content-range']) assert(exposed.includes(name) || exposed.includes('*'), `Missing exposed ${name}`)
    }
    Object.assign(check, { receivedBytes: count, identicalLocalBytes: true, passed: true })
  } catch (e) { Object.assign(check, { passed: false, error: e.message, cause: e.cause?.code ?? null }) }
  finally { clearTimeout(timer); check.elapsedMs = performance.now() - begin; result.connection.push(check) }
  console.log(JSON.stringify({ progress: 'connection', ...check }))
}
await connectionProbe(base)
if (mode !== 'local') await connectionProbe(base === 'http://localhost:5173' ? 'http://127.0.0.1:5173' : 'http://localhost:5173')

const chrome = process.env.CHROME_PATH || resolve(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
await access(chrome)
assert(profile.startsWith(qa + sep))
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-port=0',
  ...(netlog ? [`--log-net-log=${resolve(qa, 'chrome-netlog.json')}`] : []),
  ...(browserResolver === 'windows' ? ['--disable-features=AsyncDns'] : []),
  `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let browserLog = '', socket, command, evaluate, step = 'startup'
browser.stderr.on('data', b => { browserLog += b.toString() })
const pause = ms => new Promise(r => setTimeout(r, ms)), requests = new Map()
const header = (headers, name) => Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === name)?.[1] ?? null
const archiveRequest = url => url === remote || url.includes(BUILDING_ARCHIVE.localUrl)
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null
async function waitFor(expression, name, timeout = 60000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await evaluate(expression)) return
    if (step.startsWith('route/') && (result.failures.some(f => f.archive && !f.canceled) || result.requests.some(r => r.status >= 400))) throw Error(`Archive transport failed during ${name}`)
    await pause(200)
  }
  throw Error(`Timed out: ${name}`)
}
async function choose(id, value) {
  await evaluate(`new Promise(resolve=>{const e=document.querySelector('[data-testid="${id}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));requestAnimationFrame(()=>requestAnimationFrame(resolve))})`)
}
const formatted = (n, digits = 2) => n === null ? 'Tidak tersedia' : new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
async function checkStatistics(row, name) {
  const actual = await evaluate(`[...document.querySelectorAll('.kpi-number strong')].map(e=>e.textContent)`)
  const expected = [formatted(row.eligible_buildings, 0), formatted(row.capacity_mwp / 1000), formatted(row.annual_gwh === null ? null : row.annual_gwh / 1000), formatted(row.eligibility_rate * 100)]
  assert.deepEqual(actual, expected, `${name}: authoritative KPIs`)
  const charts = await evaluate(`({types:[...document.querySelectorAll('.type-bars .chart-row strong')].map(e=>e.textContent),comparison:[...document.querySelectorAll('.region-chart .chart-row strong')].map(e=>e.textContent)})`)
  const comparison = row.kecamatan || row.wilayah ? data.districts.districts.filter(d => d.region_id === (row.region_id ?? row.id)) : data.regions.regions
  assert.deepEqual(charts.types, [...data.types.types].sort((a,b) => b.capacity_mwp-a.capacity_mwp).map(r => formatted(r.capacity_mwp, 3)))
  assert.deepEqual(charts.comparison, [...comparison].sort((a,b) => b.capacity_mwp-a.capacity_mwp).map(r => formatted(r.capacity_mwp/1000)))
  result.statistics.push({ name, actual, expected, chartsVerified: true })
}
async function inspect(name) {
  const selected = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,c=m.getCanvas(),rect=c.getBoundingClientRect();for(const dx of [0,20,-20,50,-50,90,-90])for(const dy of [0,20,-20,50,-50,90,-90]){const x=c.clientWidth/2+dx,y=c.clientHeight/2+dy;if(document.elementFromPoint(rect.left+x,rect.top+y)!==c)continue;const f=m.queryRenderedFeatures([x,y],{layers:['solar-building-fill']})[0];if(f)return {props:f.properties,x:rect.left+x,y:rect.top+y}}return null})()`)
  assert(selected, `${name}: visible footprint`)
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: selected.x, y: selected.y })
  for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, x: selected.x, y: selected.y, button: 'left', clickCount: 1 })
  await waitFor(`!!document.querySelector('[data-testid="building-id"]')`, 'real building detail')
  // CDP pointer coordinates can land on the adjacent polygon at a fractional CSS edge.
  // Validate the actually selected ID against real geometry at that pixel, then all displayed values.
  const picked = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,r=m.getCanvas().getBoundingClientRect(),id=document.querySelector('[data-testid="building-id"]').textContent,x=${selected.x}-r.left,y=${selected.y}-r.top;return m.queryRenderedFeatures([[x-1,y-1],[x+1,y+1]],{layers:['solar-building-fill']}).find(f=>f.properties.building_uid===id)?.properties??null})()`)
  assert(picked, `${name}: selected identity must belong to a real polygon at the click`)
  const b = adaptBuildingProperties(picked, data)
  const detail = await evaluate(`({capacity:document.querySelector('.detail-capacity strong').textContent.replace(/\\s+/g,' ').trim(),energy:document.querySelector('[data-testid="building-generation"]').textContent.replace(/\\s+/g,' ').trim()})`)
  assert.equal(detail.capacity, `${formatted(b.capacity_kwp)} kWp`)
  assert(detail.energy.startsWith(formatted(b.annual_kwh)))
  if (b.pvout_status === 'NoData') assert.equal(b.annual_kwh, null)
  result.inspections.push({ name, uid: b.building_uid, status: b.pvout_status, annual_kwh: b.annual_kwh, detail })
  await evaluate(`document.querySelector('.building-details header button').click()`)
}
const tileCenter = (x,y) => [x/2**16*360-180, Math.atan(Math.sinh(Math.PI*(1-2*y/2**16)))*180/Math.PI]
const route = [
  ...[13,14,15,16,17,18].map(z => ({ name: `dense-z${z}`, center: tileCenter(52200.5,33888.5), zoom: z+0.3 })),
  { name: 'repaired-z18', center: [106.9435,-6.1935], zoom: 18.3, inspect: true },
  { name: 'islands-z16', center: tileCenter(52155.03,33824.94), zoom: 16.3, inspect: true },
  { name: 'islands-z18', center: tileCenter(52155.03,33824.94), zoom: 18.3 },
  { name: 'return-dense-z16', center: tileCenter(52200.5,33888.5), zoom: 16.3, inspect: true },
]
try {
  let port
  for (let n=0; n<100; n++) { try { port=Number((await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); break } catch { await pause(200) } }
  assert(port)
  const listing = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  socket = new WebSocket(listing.webSocketDebuggerUrl); await new Promise((r,j) => { socket.onopen=r; socket.onerror=j })
  let id=0, sessionId; const pending = new Map()
  socket.onmessage = e => {
    const m=JSON.parse(e.data), p=pending.get(m.id)
    if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result) }
    if (m.method==='Runtime.exceptionThrown') result.errors.push({ kind:'exception', detail:m.params.exceptionDetails })
    if (m.method==='Runtime.consoleAPICalled' && m.params.type==='error') result.errors.push({ kind:'console', args:m.params.args.map(a=>a.value??a.description) })
    if (m.method==='Network.requestWillBeSent') {
      const q=m.params.request; const row={id:m.params.requestId,url:q.url,method:q.method,step,start:m.params.timestamp,range:header(q.headers,'range'),origin:header(q.headers,'origin')}
      requests.set(row.id,row); if(archiveRequest(row.url)) result.requests.push(row)
    }
    if (m.method==='Network.requestWillBeSentExtraInfo') { const q=requests.get(m.params.requestId); if(q) Object.assign(q,{range:header(m.params.headers,'range')??q.range,origin:header(m.params.headers,'origin')??q.origin}) }
    if (m.method==='Network.responseReceived') {
      const q=requests.get(m.params.requestId),r=m.params.response
      if (q && archiveRequest(q.url)) Object.assign(q,{status:r.status,contentRange:header(r.headers,'content-range'),contentLength:Number(header(r.headers,'content-length')),etag:header(r.headers,'etag'),allowOrigin:header(r.headers,'access-control-allow-origin'),exposeHeaders:header(r.headers,'access-control-expose-headers'),protocol:r.protocol,remoteIPAddress:r.remoteIPAddress,fromDiskCache:r.fromDiskCache??false,ttfbMs:r.timing?r.timing.receiveHeadersStart-r.timing.sendStart:null})
    }
    if (m.method==='Network.loadingFinished') { const q=requests.get(m.params.requestId); if(q) Object.assign(q,{completed:true,encodedBytes:m.params.encodedDataLength,durationMs:(m.params.timestamp-q.start)*1000}) }
    if (m.method==='Network.loadingFailed') { const q=requests.get(m.params.requestId); if(q) { const f={url:q.url,step:q.step,error:m.params.errorText,canceled:m.params.canceled??false,cors:m.params.corsErrorStatus??null,archive:archiveRequest(q.url)};Object.assign(q,{failure:f.error,canceled:f.canceled});result.failures.push(f) } }
  }
  command = (method,params={},browserLevel=false) => new Promise((r,j) => {
    const messageId=++id,timer=setTimeout(()=>{pending.delete(messageId);j(Error(`CDP timeout: ${method}`))},20000)
    pending.set(messageId,{resolve:v=>{clearTimeout(timer);r(v)},reject:e=>{clearTimeout(timer);j(e)}})
    socket.send(JSON.stringify({id:messageId,method,params,...(!browserLevel&&sessionId?{sessionId}:{})}))
  })
  const target=(await command('Target.getTargets',{},true)).targetInfos.find(t=>t.type==='page')
  sessionId=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId
  evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
  await command('Runtime.enable');await command('Network.enable');await command('Page.enable')
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  result.browser=await command('Browser.getVersion',{},true)
  result.gpu=(await command('SystemInfo.getInfo',{},true)).gpu
  step='initial';const initial=Date.now();await command('Page.navigate',{url:base})
  await waitFor(`!!window.__SOLAR_MAP__&&!!window.__SOLAR_MAP__.getLayer('solar-building-fill')`,'initial map')
  result.initialReadyMs=Date.now()-initial
  // This historical comparison uses Indonesian formatting regardless of the app's first-visit default.
  await evaluate(`new Promise(resolve=>{document.querySelector('[data-testid="language-id"]').click();requestAnimationFrame(()=>requestAnimationFrame(resolve))})`)
  result.actualSource=await evaluate(`window.__SOLAR_MAP__.getSource('solar-buildings').url`)
  if(mode!=='probe')assert.equal(result.actualSource,`pmtiles://${expectedUrl}`)
  await evaluate(`window.__DELIVERY_QA__={contextLost:0};document.addEventListener('webglcontextlost',()=>window.__DELIVERY_QA__.contextLost++,true);window.__SOLAR_MAP__.on('error',e=>console.error('delivery-map-error',e.sourceId??'',e.error?.message??''))`)
  step='cors-probe'
  const cors=await evaluate(`(async()=>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch(${JSON.stringify(expectedUrl)},{headers:{Range:'bytes=0-16383'},signal:c.signal});if(r.status!==206||r.headers.get('content-length')!=='16384'){c.abort();throw Error('Invalid range response')}const b=await r.arrayBuffer();return {status:r.status,bytes:b.byteLength,contentRange:r.headers.get('content-range'),etag:r.headers.get('etag'),allowOrigin:r.headers.get('access-control-allow-origin')}}catch(e){return {error:e.message}}finally{clearTimeout(timer)}})()`)
  result.browserCors.push(cors);console.log(JSON.stringify({progress:'browser-cors',actualSource:result.actualSource,...cors}))
  assert.equal(cors.status,206,'Real browser Range/CORS request')
  assert.equal(cors.contentRange,`bytes 0-16383/${bytes}`);assert(cors.etag)
  assert(result.connection.every(c=>c.passed), 'Both connection origins must pass, including in probe mode')
  if(mode==='probe'){result.status='probe-passed'} else {
    const total=data.regions.regions.reduce((a,r)=>({total_buildings:a.total_buildings+r.total_buildings,eligible_buildings:a.eligible_buildings+r.eligible_buildings,capacity_mwp:a.capacity_mwp+r.capacity_mwp,annual_gwh:(a.annual_gwh??0)+(r.annual_gwh??0)}),{total_buildings:0,eligible_buildings:0,capacity_mwp:0,annual_gwh:0});total.eligibility_rate=total.eligible_buildings/total.total_buildings
    await checkStatistics(total,'DKI')
    for(const place of route){
      step=`route/${place.name}`;const begin=Date.now(),count=result.requests.length
      await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:${JSON.stringify(place.center)},zoom:${place.zoom},padding:0,bearing:0,pitch:0})`)
      // Tile-manager state can still belong to the preceding camera until the next render.
      await pause(100)
      const z=Math.floor(place.zoom)
      await waitFor(`(()=>{const m=window.__SOLAR_MAP__,t=m.style.tileManagers['solar-buildings'];return !m.isMoving()&&m.isSourceLoaded('solar-buildings')&&t.getRenderableIds().length>0&&t.getRenderableIds().every(id=>t.getTileByID(id).tileID.canonical.z===${z})})()`,place.name)
      const row={name:place.name,zoom:place.zoom,settleMs:Date.now()-begin,requests:result.requests.length-count}
      result.steps.push(row);console.log(JSON.stringify({progress:'navigation',...row}))
      if(place.inspect)await inspect(place.name)
    }
    step='representative-filters'
    for(const [regionName,districtName] of [['Jakarta Barat','Cengkareng'],['Kepulauan Seribu','Kepulauan Seribu Utara']]){
      const region=data.regions.regions.find(r=>r.wilayah===regionName),district=data.districts.districts.find(d=>d.region_id===region.id&&d.kecamatan===districtName)
      await choose('region-filter',region.id);await checkStatistics(region,regionName)
      await choose('district-filter',district.id);await checkStatistics(district,districtName)
    }
    await choose('region-filter','');await checkStatistics(total,'DKI-restored')
    await pause(1500)
    const screenshot=await command('Page.captureScreenshot',{format:'png'});await writeFile(resolve(qa,'dashboard.png'),Buffer.from(screenshot.data,'base64'))
    result.contextLost=await evaluate('window.__DELIVERY_QA__.contextLost');assert.equal(result.contextLost,0)
    assert(result.connection.every(c=>c.passed));assert.equal(result.errors.length,0)
    assert(!result.failures.some(f=>f.archive&&!f.canceled))
    const get=result.requests.filter(r=>r.method==='GET')
    assert(get.length>0&&get.every(r=>r.url===expectedUrl))
    assert(get.filter(r=>r.status).every(r=>r.status===206&&r.contentLength<=16*1024*1024&&r.contentRange?.endsWith(`/${bytes}`)))
    assert(!get.some(r=>!r.range),'Every archive GET must be bounded')
    result.status='passed'
  }
} catch(e) { result.status='failed';result.error=String(e);result.failedStep=step;result.browserDiagnostic=browserLog.slice(-2000);process.exitCode=1 }
finally {
  const get=result.requests.filter(r=>r.method==='GET'),seen=new Set();let duplicates=0
  for(const r of get){if(seen.has(r.range))duplicates++;seen.add(r.range)}
  result.elapsedMs=Date.now()-started
  result.summary={navigationP50Ms:percentile(result.steps.map(s=>s.settleMs),.5),navigationP95Ms:percentile(result.steps.map(s=>s.settleMs),.95),rangeRequests:get.length,completedRequests:get.filter(r=>r.completed).length,completedEncodedBytes:get.reduce((n,r)=>n+(r.encodedBytes??0),0),advertisedBytes:get.reduce((n,r)=>n+(r.contentLength??0),0),duplicateRequests:duplicates,ttfbP95Ms:percentile(get.map(r=>r.ttfbMs).filter(Number.isFinite),.95),canceledRequests:get.filter(r=>r.canceled).length,httpErrors:get.filter(r=>r.status>=400).length}
  await writeFile(resolve(qa,'report.json'),JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify({progress:'delivery-complete',mode,label,status:result.status,error:result.error,initialReadyMs:result.initialReadyMs,...result.summary}))
  if(command)await command('Browser.close',{},true).catch(()=>{});socket?.close()
  if(browser.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,5000);browser.once('exit',()=>{clearTimeout(timer);resolve()})})
  if(browser.exitCode===null)browser.kill()
  await pause(500);assert(profile.startsWith(qa+sep));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})
}
