// Actual local Vue application QA using an existing Chrome installation and CDP.
// No browser dependency, production data mutation, or remote writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { messages } from '../src/i18n/messages.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qaRelative = 'data/processed/qa/localization'
const qa = resolve(root, qaRelative)
await mkdir(qa, { recursive: true })
const profile = resolve(qa, `chrome-profile-${process.pid}`)
assert(profile.startsWith(qa + sep))
const chrome = process.env.CHROME_PATH || resolve(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
await access(chrome)
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--window-size=1440,1100', 'about:blank'],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let browserLog = '', socket
browser.stderr.on('data', b => { browserLog += b.toString() })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const exceptions = [], consoleErrors = [], ranges = [], failures = [], checks = {}, screenshots = []
const requests = new Map()
let command, evaluate
const regions = JSON.parse(await readFile(resolve(root, 'public/data/summary_wilayah.json'), 'utf8'))
const districts = JSON.parse(await readFile(resolve(root, 'public/data/summary_kecamatan.json'), 'utf8'))
const types = JSON.parse(await readFile(resolve(root, 'public/data/summary_jenis.json'), 'utf8'))
const admin = JSON.parse(await readFile(resolve(root, 'public/data/admin_kabkot.geojson'), 'utf8'))
const positions = admin.features.flatMap(f => f.geometry.coordinates.flat(2))
const fullBounds = [[Math.min(...positions.map(p=>p[0])),Math.min(...positions.map(p=>p[1]))],
  [Math.max(...positions.map(p=>p[0])),Math.max(...positions.map(p=>p[1]))]]
const imageryResponses = []
const fmt = (n, digits = 2, locale = 'id') => n === null ? locale === 'id' ? 'Tidak tersedia' : 'Unavailable' : new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
const expectedKpis = (row, locale = 'id') => [fmt(row.eligible_buildings, 0, locale), fmt(row.capacity_mwp / 1000, 2, locale), fmt(row.annual_gwh === null ? null : row.annual_gwh / 1000, 2, locale), fmt(row.eligibility_rate === null ? null : row.eligibility_rate * 100, 2, locale)]
async function setLanguage(locale) {
  await evaluate(`document.querySelector('[data-testid="language-${locale}"]').click()`)
  await waitFor(`document.documentElement.lang==='${locale}'`, `${locale} language`)
  await pause(50)
  assert.equal(await evaluate(`document.querySelector('[data-testid="language-${locale}"]').getAttribute('aria-pressed')`), 'true')
}
async function checkEnglishText() {
  // Inspect all text nodes, including select options, dialogs, tooltips and hidden menus.
  const originals = Object.values(messages).filter(m => m.id !== m.en && !m.id.includes('{')).map(m => m.id)
  const leftovers = await evaluate(`(()=>{const originals=new Set(${JSON.stringify(originals)}),walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),found=[];let n;while(n=walker.nextNode()){if(!['SCRIPT','STYLE'].includes(n.parentElement?.tagName)&&originals.has(n.textContent.trim()))found.push(n.textContent.trim())}for(const e of document.querySelectorAll('[title],[aria-label],[placeholder]'))for(const attr of ['title','aria-label','placeholder'])if(originals.has(e.getAttribute(attr)?.trim()))found.push(attr+': '+e.getAttribute(attr));return [...new Set(found)]})()`)
  assert.deepEqual(leftovers, [], 'No untranslated Indonesian UI text in English mode')
  assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-zoom-in').getAttribute('aria-label')`), 'Zoom in')
  assert.equal(await evaluate(`document.querySelector('.maplibregl-canvas').getAttribute('aria-label')`), messages['map.canvas'].en)
}
async function languageSnapshot() {
  return evaluate(`(()=>{const m=window.__SOLAR_MAP__;return {filters:['region-filter','district-filter','type-filter'].map(id=>document.querySelector('[data-testid="'+id+'"]').value),selected:document.querySelector('[data-testid="building-id"]')?.textContent,center:m.getCenter().toArray(),zoom:m.getZoom(),bearing:m.getBearing(),pitch:m.getPitch(),filter:m.getFilter('solar-building-fill')}})()`)
}
async function choose(testId, value) {
  await evaluate(`new Promise(resolve=>{const e=document.querySelector('[data-testid="${testId}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));requestAnimationFrame(()=>requestAnimationFrame(resolve))})`)
}
async function kpiValues() { return evaluate(`[...document.querySelectorAll('.kpi-number strong')].map(e=>e.textContent)`) }
// Representative archive locations belong only to QA; the application has no demo navigation.
async function navigateSample(kind) {
  const place = kind === 'urban' ? {region:'Jakarta Barat',district:'Cengkareng',tile:[52200.5,33888.5]}
    : {region:'Kepulauan Seribu',district:'Kepulauan Seribu Selatan',tile:[52155.03,33824.94]}
  await choose('type-filter', '')
  const region = regions.regions.find(r=>r.wilayah===place.region)
  await choose('region-filter', region.id)
  await choose('district-filter', districts.districts.find(d=>d.region_id===region.id&&d.kecamatan===place.district).id)
  const [x,y]=place.tile,center=[x/2**16*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/2**16)))*180/Math.PI]
  await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:${JSON.stringify(center)},zoom:16.3,padding:0,bearing:0,pitch:0})`)
}
async function checkFullExtent(label) {
  const result = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,b=${JSON.stringify(fullBounds)},r=m.getCanvas().getBoundingClientRect();return {bounds:m.getBounds().toArray(),zoom:m.getZoom(),fits:[[b[0][0],b[0][1]],[b[0][0],b[1][1]],[b[1][0],b[0][1]],[b[1][0],b[1][1]]].every(c=>{const p=m.project(c);return p.x>=16&&p.y>=16&&p.x<=r.width-16&&p.y<=r.height-16})}})()`)
  assert(result.fits, `${label}: all six administrative regions must fit, including north and south extremes`)
  return result
}
async function checkMapFitsScreen(label) {
  const layout = await evaluate(`(()=>{const r=document.querySelector('.map-panel').getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect(),s=document.querySelector('.analysis-sidebar');return {width:innerWidth,height:innerHeight,mapTop:r.top,mapBottom:r.bottom,mapHeight:r.height,headerBottom:h.bottom,pageScroll:scrollY,sidebarHeight:s.clientHeight,sidebarContentHeight:s.scrollHeight}})()`)
  assert(layout.mapTop >= layout.headerBottom - 1, `${label}: map top must be below the header`)
  assert(layout.mapBottom <= layout.height - 8, `${label}: map bottom must fit without page scrolling`)
  return layout
}
async function checkIconCentered(selector) {
  const alignment = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),s=b.querySelector('svg').getBoundingClientRect();return {dx:s.left+s.width/2-r.left-r.width/2,dy:s.top+s.height/2-r.top-r.height/2,buttonWidth:r.width,buttonHeight:r.height}})()`)
  assert(Math.abs(alignment.dx)<=0.5 && Math.abs(alignment.dy)<=0.5, `${selector}: icon must be centered inside its button`)
  return alignment
}
async function mouseClick(selector) {
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await command('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1})
  await command('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',clickCount:1})
}
async function waitFor(expression, label, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (typeof expression === 'function' ? await expression() : await evaluate(expression)) return; await pause(150) }
  throw Error(`Timed out: ${label}`)
}
async function screenshot(name, full = false) {
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full })
  await writeFile(resolve(qa, `${name}.png`), Buffer.from(result.data, 'base64'))
  screenshots.push(`${qaRelative}/${name}.png`)
}
try {
  let port
  for (let i = 0; i < 120; i++) {
    if (browser.exitCode !== null) throw Error(`Chrome exited: ${browserLog.slice(-1500)}`)
    try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break }
    catch { await pause(250) }
  }
  assert(port, 'Chrome debugging port unavailable')
  console.log(JSON.stringify({ progress: 'browser-started', port }))
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const target = targets.find(t => t.type === 'page')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = event => {
    const m = JSON.parse(event.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result) }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
    if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, m.params.request)
    if (m.method === 'Network.loadingFailed') failures.push({ url: requests.get(m.params.requestId)?.url, error: m.params.errorText })
    if (m.method === 'Network.responseReceived' && m.params.response.url.startsWith('https://mt0.google.com/vt/')) imageryResponses.push({url:m.params.response.url,status:m.params.response.status,mimeType:m.params.response.mimeType})
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/_local/buildings.pmtiles')) {
      const r = m.params.response
      const requestHeaders = requests.get(m.params.requestId)?.headers ?? {}
      const header = (headers, name) => Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1]
      ranges.push({ status: r.status, range: header(requestHeaders, 'range'), contentRange: header(r.headers, 'content-range'), bytes: Number(header(r.headers, 'content-length')) })
    }
  }
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id
    const timeout = setTimeout(() => { pending.delete(messageId); reject(Error(`CDP command timed out: ${method}`)) }, 20000)
    pending.set(messageId, { resolve: r => { clearTimeout(timeout); resolve(r) }, reject: e => { clearTimeout(timeout); reject(e) } })
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })
  evaluate = async expression => {
    const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable')
  console.log(JSON.stringify({ progress: 'cdp-ready' }))
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  const browserVersion = await command('Browser.getVersion')
  console.log(JSON.stringify({ progress: 'navigate', result: await command('Page.navigate', { url: 'http://localhost:5173/' }) }))
  await waitFor('!!window.__SOLAR_MAP__', 'Vue / MapLibre initialization')
  checks.devLoadTiming = await evaluate(`(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),firstContentfulPaintMs:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime??0),mapReadyMs:Math.round(performance.now())}})()`)
  await pause(2000)
  checks.initial = await evaluate(`({title:document.title,kpis:[...document.querySelectorAll('.kpi-number strong')].map(e=>e.textContent),mapError:document.querySelector('.map-error')?.textContent,baseFallback:!!document.querySelector('.basemap-notice'),charts:document.querySelectorAll('.chart-card').length})`)
  assert.deepEqual(checks.initial.kpis, expectedKpis(regions.overall))
  assert.equal(checks.initial.mapError, undefined); assert.equal(checks.initial.charts, 3)
  await screenshot('01-overview')
  console.log(JSON.stringify({ progress: 'initial', ...checks.initial }))
  checks.initialFullDkiExtent = await checkFullExtent('Initial extent')
  assert(await evaluate(`!document.querySelector('.model-badge')`), 'Modeled-data badge removed')
  await setLanguage('en')
  await checkEnglishText()
  assert.deepEqual(await kpiValues(), expectedKpis(regions.overall, 'en'))
  assert.equal(await evaluate(`document.querySelector('h1').textContent`), messages['app.title'].en + '.')
  assert.equal(await evaluate(`document.title`), messages['app.title'].en + ' | IESR')
  assert((await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').textContent`)).includes('Analysis: IESR'))
  assert((await evaluate(`[...document.querySelectorAll('.admin-map-label')].map(e=>e.textContent).join(' ')`)).includes('THOUSAND ISLANDS'))
  await screenshot('14-english-overview')
  await setLanguage('id')
  checks.languageOverview = { switchInNavbar: true, badgeRemoved: true, textAndAccessibility: true, localizedNumbers: true, mapLabelsAndAttribution: true }
  const brokenLabels = await evaluate(`[...document.querySelectorAll('[aria-labelledby]')].flatMap(e=>e.getAttribute('aria-labelledby').split(/\\s+/).filter(id=>!document.getElementById(id)))`)
  assert.deepEqual(brokenLabels, [], 'Accessible labels must reference existing elements')
  checks.accessibleLabelReferences = true
  assert(await evaluate(`!document.querySelector('.example-locations,.scope-row,.technical-caption,.closing-note,.app-footer .text-button')`))
  assert(!(await evaluate(`document.querySelector('main').innerText`)).includes('RISET ENERGI'))
  checks.requestedElementsRemoved = true
  checks.iconAlignment = { extent: await checkIconCentered('[data-testid="map-extent"]') }
  checks.viewportLayouts = []
  for (const [width,height] of [[1440,900],[1366,768],[1280,720],[1280,600],[1920,1080]]) {
    await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false})
    await evaluate(`window.scrollTo(0,0)`); await pause(300)
    checks.viewportLayouts.push(await checkMapFitsScreen(`${width} × ${height}`))
    await checkFullExtent(`${width} × ${height} extent`)
    if (width===1366) await screenshot('12-laptop-map-without-page-scroll')
    await setLanguage('en')
    await checkMapFitsScreen(`English ${width} × ${height}`)
    await checkFullExtent(`English ${width} × ${height} extent`)
    if (width===1366) await screenshot('20-english-laptop-layout')
    await setLanguage('id')
  }
  await command('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await evaluate(`window.scrollTo(0,0)`); await pause(200)
  const beforeSidebarScroll = await checkMapFitsScreen('Before sidebar scroll')
  await evaluate(`document.querySelector('.analysis-sidebar').scrollTop=200`)
  await pause(100)
  const afterSidebarScroll = await checkMapFitsScreen('After sidebar scroll')
  assert.equal(afterSidebarScroll.mapTop,beforeSidebarScroll.mapTop)
  assert.equal(afterSidebarScroll.mapBottom,beforeSidebarScroll.mapBottom)
  assert.equal(afterSidebarScroll.pageScroll,0)
  assert(await evaluate(`document.querySelector('.analysis-sidebar').scrollTop>0`))
  await evaluate(`document.querySelector('.analysis-sidebar').scrollTop=0`)
  checks.sidebarScrollIndependent = true
  // Full interaction suite follows below; this flag also supports a quick visual inspection.
  if (!process.argv.includes('--smoke')) {
    // Navigate all actual dropdown options, reconciling the UI with every summary row.
    let regionCount = 0, districtCount = 0
    assert.equal(await evaluate(`document.querySelector('[data-testid="region-filter"]').options.length`), 7)
    for (const region of regions.regions) {
      await choose('region-filter', region.id)
      assert.equal(await evaluate(`document.querySelector('[data-testid="district-filter"]').value`), '', 'Region resets incompatible district')
      assert.deepEqual(await kpiValues(), expectedKpis(region))
      const rows = districts.districts.filter(d => d.region_id === region.id)
      assert.equal(await evaluate(`document.querySelector('[data-testid="district-filter"]').options.length`), rows.length + 1)
      for (const district of rows) {
        await choose('district-filter', district.id)
        assert.deepEqual(await kpiValues(), expectedKpis(district), district.kecamatan)
        districtCount++
      }
      regionCount++
    }
    checks.allAdministrativeSelections = { regions: regionCount, districts: districtCount, allKpisReconciled: true, dependentReset: true }
    await choose('region-filter', '')
    for (const type of types.types) { await choose('type-filter', type.id); assert.deepEqual(await kpiValues(), expectedKpis(type)) }
    checks.allBuildingTypes = types.types.length
    await choose('type-filter', '')
    await setLanguage('en')
    for (const region of regions.regions) {
      await choose('region-filter', region.id)
      assert.deepEqual(await kpiValues(), expectedKpis(region, 'en'))
      for (const district of districts.districts.filter(d=>d.region_id===region.id)) {
        await choose('district-filter', district.id)
        assert.deepEqual(await kpiValues(), expectedKpis(district, 'en'))
      }
    }
    await choose('region-filter', '')
    for (const type of types.types) { await choose('type-filter', type.id); assert.deepEqual(await kpiValues(), expectedKpis(type, 'en')) }
    await checkEnglishText()
    await setLanguage('id')
    checks.englishAllSelections = { regions: 6, districts: 44, types: 7, allKpisReconciled: true }
    await choose('region-filter', regions.regions[0].id)
    assert.deepEqual(await kpiValues(), ['—','—','—','—'])
    assert(await evaluate(`!!document.querySelector('.unsupported-notice')`))
    checks.unsupportedCombination = true
    const unsupportedBefore = await languageSnapshot()
    await setLanguage('en')
    assert.deepEqual(await languageSnapshot(), unsupportedBefore)
    assert.deepEqual(await kpiValues(), ['—','—','—','—'])
    assert((await evaluate(`document.querySelector('.unsupported-notice').innerText`)).includes('Combined area × building type statistics are unavailable.'))
    await checkEnglishText()
    await setLanguage('id')
    checks.languageFilterPreservation = true
    await evaluate(`window.scrollTo(0,0)`); await pause(100)
    checks.unsupportedLayout = await checkMapFitsScreen('Unsupported filter notice')
    await screenshot('04-unsupported-combination')
    await evaluate(`document.querySelector('.unsupported-notice button').click()`)
    await pause(100); assert.deepEqual(await kpiValues(), expectedKpis(regions.regions[0]))
    await choose('region-filter', '')
    await evaluate(`document.querySelector('[data-testid="generation-chart-tab"]').click();document.querySelector('#analisis').scrollIntoView({block:'start'})`)
    await pause(300); await screenshot('05-analytics')
    await setLanguage('en')
    await checkEnglishText()
    await screenshot('21-english-charts')
    await setLanguage('id')
    assert.equal(await evaluate(`document.querySelectorAll('.type-bars .chart-row').length`), 7)
    checks.chartScopes = await evaluate(`({region:document.querySelector('.region-chart footer').innerText,types:document.querySelector('.chart-scope-note').innerText,eligibility:document.querySelector('.eligibility-chart footer').innerText})`)
    await evaluate(`document.querySelector('#workspace').scrollIntoView({block:'start'})`)
    await navigateSample('urban')
    await waitFor(`window.__SOLAR_MAP__.getZoom()>16 && window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length>0`, 'dense urban polygons')
    checks.urban = await evaluate(`({zoom:window.__SOLAR_MAP__.getZoom(),rendered:window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length,filters:['solar-building-fill','solar-building-outline'].map(id=>window.__SOLAR_MAP__.getFilter(id))})`)
    // Find an actual footprint under an unobstructed screen point, then send real mouse events.
    const hit = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,r=m.getCanvas().getBoundingClientRect();for(let y=150;y<Math.min(r.height-150,500);y+=12)for(let x=260;x<Math.min(r.width-300,700);x+=12){const f=m.queryRenderedFeatures([x,y],{layers:['solar-building-fill']})[0];if(f)return {x:r.left+x,y:r.top+y,id:String(f.properties.building_uid),capacity_kwp:f.properties.capacity_kwp}}return null})()`)
    assert(hit, 'Real clickable urban footprint found')
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y })
    await pause(100)
    assert(await evaluate(`!!document.querySelector('.map-tooltip')`), 'Building hover tooltip')
    await setLanguage('en')
    assert((await evaluate(`document.querySelector('.map-tooltip').innerText`)).includes(`Building ${hit.id}`))
    await setLanguage('id')
    assert((await evaluate(`document.querySelector('.map-tooltip').innerText`)).includes(`Bangunan ${hit.id}`))
    checks.languageLiveTooltip = true
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 })
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 })
    await waitFor(`!!document.querySelector('[data-testid="building-details"]')`, 'real building detail')
    assert.equal(await evaluate(`document.querySelector('[data-testid="building-id"]').textContent`), hit.id)
    checks.urban.realMouseClick = hit
    assert(await evaluate(`window.__SOLAR_MAP__.getFeatureState({source:'solar-buildings',sourceLayer:'buildings_eligible_pvout',id:${JSON.stringify(hit.id)}}).selected===true`), 'Selected building feature state')
    checks.urban.detail = await evaluate(`document.querySelector('[data-testid="building-details"]').innerText`)
    checks.iconAlignment.buildingClose = await checkIconCentered('[aria-label="Tutup detail bangunan"]')
    await screenshot('02-urban-building')
    const selectedBefore = await languageSnapshot()
    await evaluate(`window.__QA_MAP__=window.__SOLAR_MAP__;window.__QA_SOURCE__=window.__SOLAR_MAP__.getSource('solar-buildings');void 0`)
    await setLanguage('en')
    await checkEnglishText()
    assert.deepEqual(await languageSnapshot(), selectedBefore, 'Language preserves camera, filters, and selected building')
    assert(await evaluate(`window.__QA_MAP__===window.__SOLAR_MAP__&&window.__QA_SOURCE__===window.__SOLAR_MAP__.getSource('solar-buildings')`), 'Language retains map/source instances')
    assert(await evaluate(`window.__SOLAR_MAP__.getFeatureState({source:'solar-buildings',sourceLayer:'buildings_eligible_pvout',id:${JSON.stringify(hit.id)}}).selected===true`))
    assert((await evaluate(`document.querySelector('[data-testid="building-details"]').innerText`)).includes('Building footprint area'))
    assert.equal(await evaluate(`document.querySelector('.detail-capacity strong').textContent.trim()`), fmt(hit.capacity_kwp, 2, 'en') + ' kWp')
    await screenshot('15-english-building')
    await setLanguage('id')
    checks.languageBuildingPreservation = true
    console.log(JSON.stringify({ progress: 'urban', ...checks.urban }))
    await mouseClick('[aria-label="Tutup detail bangunan"]')
    await waitFor(`!document.querySelector('[data-testid="building-details"]')`, 'close building details')
    assert(await evaluate(`window.__SOLAR_MAP__.getFeatureState({source:'solar-buildings',sourceLayer:'buildings_eligible_pvout',id:${JSON.stringify(hit.id)}}).selected===false`))
    checks.buildingCloseButton = true
    await evaluate(`void window.__SOLAR_MAP__.jumpTo({zoom:18.3})`)
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length>0`, 'overzoomed z16 building source')
    checks.overzoom = await evaluate(`({zoom:window.__SOLAR_MAP__.getZoom(),sourceMaxzoom:window.__SOLAR_MAP__.getSource('solar-buildings').maxzoom})`)
    assert.equal(checks.overzoom.sourceMaxzoom,16)
    await navigateSample('islands')
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length>0`, 'island polygons')
    await evaluate(`document.querySelector('[data-testid="inspect-center"]').click()`)
    await waitFor(`!!document.querySelector('[data-testid="building-details"]')`, 'island detail')
    checks.island = await evaluate(`({rendered:window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length,detail:document.querySelector('[data-testid="building-details"]').innerText})`)
    assert(checks.island.detail.includes('Tidak tersedia'))
    await screenshot('03-island-building')
    await setLanguage('en')
    assert.equal(await evaluate(`document.querySelector('[data-testid="building-generation"]').textContent`), 'Unavailable')
    assert((await evaluate(`document.querySelector('.coverage-warning').textContent`)).includes('PVOUT unavailable'))
    await checkEnglishText()
    await screenshot('16-english-missing-pvout')
    await setLanguage('id')
    checks.languageNullGeneration = true
    console.log(JSON.stringify({ progress: 'island', ...checks.island }))
    await choose('district-filter', districts.districts.find(d=>d.kecamatan==='Kepulauan Seribu Utara').id)
    assert.equal((await kpiValues())[2], 'Tidak tersedia')
    await evaluate(`document.querySelector('[data-testid="generation-chart-tab"]').click()`)
    assert((await evaluate(`document.querySelector('.region-chart').innerText`)).includes('Tidak tersedia'))
    checks.allNullDistrictGeneration = true
    await choose('region-filter', '')
    await evaluate(`document.querySelector('#map-metric').value='annual_gwh';document.querySelector('#map-metric').dispatchEvent(new Event('change',{bubbles:true}))`)
    await pause(200)
    assert((await evaluate(`JSON.stringify(window.__SOLAR_MAP__.getPaintProperty('solar-region-fill','fill-color'))`)).includes('annual_gwh'))
    await evaluate(`document.querySelector('.layer-menu').open=true;document.querySelector('.layer-popover input').click()`)
    await pause(100)
    assert.equal(await evaluate(`window.__SOLAR_MAP__.getLayoutProperty('solar-building-fill','visibility')`),'none')
    await evaluate(`document.querySelector('.layer-popover input').click();document.querySelector('[data-testid="basemap-google"]').click()`)
    await waitFor(()=>imageryResponses.some(r=>r.status===200&&r.mimeType.startsWith('image/')), 'actual Google imagery response')
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('google-imagery')`, 'Google imagery tiles')
    assert.equal(await evaluate(`window.__SOLAR_MAP__.getLayoutProperty('google-imagery-raster','visibility')`),'visible')
    assert(!(await evaluate(`!!document.querySelector('.basemap-notice')`)), 'Google imagery must render without fallback')
    assert((await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').innerText`)).includes('Google Maps'))
    await screenshot('10-google-imagery')
    await evaluate(`document.querySelector('[data-testid="basemap-openfreemap"]').click()`)
    await pause(100)
    assert.equal(await evaluate(`window.__SOLAR_MAP__.getLayoutProperty('google-imagery-raster','visibility')`),'none')
    checks.basemapSwitching = { googleTilesLoaded: true, attributionVisible: true, openFreeMapRestored: true }
    await evaluate(`document.querySelector('.layer-menu').open=false;document.querySelector('.header-actions .button').click()`)
    assert(await evaluate(`document.querySelector('dialog').open`))
    assert(!(await evaluate(`document.querySelector('dialog').innerText`)).includes('Aritmetika ekspor'))
    assert(!(await evaluate(`document.querySelector('dialog').innerText`)).includes('Model belum menyelesaikan'))
    assert(!(await evaluate(`document.querySelector('dialog').innerText`)).includes('Sumber & status verifikasi'))
    assert(!(await evaluate(`document.querySelector('dialog').innerText`)).includes('Versi ringkasan'))
    assert(!(await evaluate(`document.querySelector('dialog').innerText`)).includes('dki-solar-'))
    checks.iconAlignment.methodologyClose = await checkIconCentered('[aria-label="Tutup metodologi"]')
    await setLanguage('en')
    assert(await evaluate(`document.querySelector('dialog').open`), 'Open dialog survives language switching')
    await checkEnglishText()
    assert((await evaluate(`document.querySelector('dialog').innerText`)).includes('A Roof Utilization Factor of 0.33'))
    await screenshot('17-english-methodology')
    await setLanguage('id')
    checks.languageMethodology = true
    await screenshot('13-methodology-clean')
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await pause(100); assert.equal(await evaluate(`document.querySelector('dialog').open`), false)
    checks.controlsAndMethodology = true
    await evaluate(`document.querySelectorAll('.header-nav button')[0].click()`)
    await pause(100)
    checks.mapNavigationLayout = await checkMapFitsScreen('Return to map navigation')
    await evaluate(`void window.__SOLAR_MAP__.jumpTo({bearing:32,pitch:40,zoom:15})`)
    await evaluate(`document.querySelector('[data-testid="map-extent"]').click()`)
    await pause(250)
    checks.fullDkiExtent = await checkFullExtent('Extent button after pitched/rotated detail view')
    await mouseClick('.maplibregl-ctrl-fullscreen')
    await waitFor(`document.fullscreenElement?.classList.contains('map-panel')`, 'native fullscreen')
    await setLanguage('en')
    assert(await evaluate(`document.fullscreenElement?.classList.contains('map-panel')`))
    assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-shrink').getAttribute('aria-label')`), 'Exit fullscreen')
    await pause(250)
    await evaluate(`document.querySelector('[data-testid="map-extent"]').click()`)
    await pause(200)
    checks.fullscreen = {native: true, entireDkiFits: (await checkFullExtent('Fullscreen extent')).fits}
    await screenshot('09-fullscreen-map')
    await mouseClick('.maplibregl-ctrl-shrink')
    await waitFor(`!document.fullscreenElement`, 'exit fullscreen')
    assert.equal(await evaluate(`document.querySelector('.maplibregl-ctrl-fullscreen').getAttribute('aria-label')`), 'View map in fullscreen')
    await setLanguage('id')
    checks.languageFullscreen = true
    await pause(250)
    checks.fullscreen.extentRetainedAfterExit = (await checkFullExtent('Extent after leaving fullscreen')).fits
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await evaluate(`window.scrollTo(0,0)`); await pause(300)
    assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`), 'No mobile horizontal overflow')
    await screenshot('06-mobile-top')
    await evaluate(`document.querySelector('#workspace .map-panel').scrollIntoView({block:'start'})`)
    await pause(150)
    checks.mobileMapFitsScreen = await checkMapFitsScreen('Mobile map')
    await navigateSample('urban')
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length>0`, 'mobile real footprints')
    await evaluate(`document.querySelector('[data-testid="inspect-center"]').click()`)
    await waitFor(`!!document.querySelector('[data-testid="building-details"]')`, 'mobile building sheet')
    checks.iconAlignment.mobileBuildingClose = await checkIconCentered('[aria-label="Tutup detail bangunan"]')
    await screenshot('07-mobile-map')
    checks.mobile = { width: 390, noHorizontalOverflow: true }
    await setLanguage('en')
    await checkEnglishText()
    assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`))
    await screenshot('18-english-mobile-building')
    await evaluate(`window.scrollTo(0,0)`)
    await screenshot('19-english-mobile-navbar')
    for (const width of [320, 390]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
      await pause(150)
      assert(await evaluate(`(()=>{const e=document.querySelector('.language-switcher').getBoundingClientRect();return e.left>=0&&e.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth})()`), `${width}px: language switch visible without overflow`)
    }
    await setLanguage('id')
    checks.languageMobile = { widths: [320,390], noOverflow: true, navbarSwitchVisible: true }
    await evaluate(`document.querySelector('.reset-filters').click()`)
    await pause(150)
    assert.deepEqual(await kpiValues(), expectedKpis(regions.overall))
    assert(await evaluate(`!document.querySelector('[data-testid="building-details"]') && ['region-filter','district-filter','type-filter'].every(id=>document.querySelector('[data-testid="'+id+'"]').value==='')`))
    checks.resetAll = true
    checks.mobileFullDkiExtent = await checkFullExtent('Mobile reset extent')
    await command('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true })
    await evaluate(`document.querySelector('#workspace .map-panel').scrollIntoView({block:'start'})`)
    await mouseClick('.maplibregl-ctrl-fullscreen')
    await waitFor(`document.fullscreenElement?.classList.contains('map-panel')`, 'landscape fullscreen')
    await pause(250)
    checks.landscapeFullscreen = await checkFullExtent('Short landscape fullscreen')
    await screenshot('11-landscape-fullscreen')
    await mouseClick('.maplibregl-ctrl-shrink')
    await waitFor(`!document.fullscreenElement`, 'exit landscape fullscreen')
    // Deliberately fail the external basemap; the local map, summaries and archive must remain usable.
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
    await command('Network.setBlockedURLs', { urls: ['*openfreemap.org*'] })
    await setLanguage('en')
    await command('Page.reload', { ignoreCache: true })
    await waitFor(`!!window.__SOLAR_MAP__ && !!document.querySelector('.basemap-notice')`, 'neutral basemap fallback')
    assert.equal(await evaluate(`document.documentElement.lang`), 'en', 'Language survives reload')
    assert((await evaluate(`document.querySelector('.basemap-notice').textContent`)).includes('Research layers remain active.'))
    await navigateSample('urban')
    await evaluate(`document.querySelector('#workspace').scrollIntoView({block:'start'})`)
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length>0`, 'local footprints with external basemap unavailable')
    await screenshot('08-basemap-fallback')
    checks.basemapFallback = { localBuildingsRendered: true, noMainAppError: !(await evaluate(`!!document.querySelector('.map-error')`)) }
    await command('Network.setBlockedURLs', { urls: ['*summary_wilayah.json*'] })
    await command('Page.reload', { ignoreCache: true })
    await waitFor(`!!document.querySelector('.app-alert')`, 'data loading error state')
    assert((await evaluate(`document.querySelector('.app-alert').textContent`)).includes('Data could not be loaded.'))
    await setLanguage('id')
    assert((await evaluate(`document.querySelector('.app-alert').textContent`)).includes('Data belum dapat dimuat.'))
    await setLanguage('en')
    assert.deepEqual(await kpiValues(), ['—','—','—','—'])
    await command('Network.setBlockedURLs', { urls: [] })
    await evaluate(`document.querySelector('.app-alert button').click()`)
    await waitFor(`!!window.__SOLAR_MAP__ && !document.querySelector('.app-alert')`, 'data retry recovery')
    assert.deepEqual(await kpiValues(), expectedKpis(regions.overall, 'en'))
    await checkEnglishText()
    await setLanguage('id')
    checks.languagePersistenceAndErrors = true
    checks.dataErrorAndRetry = true
  }
  checks.noCriticalErrors = exceptions.length === 0 && consoleErrors.length === 0
  checks.rangeOnly = ranges.every(r => r.status === 206 && r.range && r.bytes < 16 * 1024 * 1024)
  const report = { scope: 'Actual Vue application at http://localhost:5173; local Range PMTiles via official browser protocol', browserVersion, checks, ranges, imageryResponses, exceptions, consoleErrors, failures, screenshots,
    limitations: ['Headless Chrome / software WebGL, not a physical mobile or GPU performance certification', 'Range bytes reflect representative views and canceled navigation requests, not a production bandwidth budget', 'Blocked external basemap and navigation cancellations are intentional network failures'] }
  await writeFile(resolve(qa, 'app-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ checks, rangeRequests: ranges.length, rangeBytes: ranges.reduce((n, r) => n + r.bytes, 0), exceptions, consoleErrors, failures }, null, 2))
  assert(checks.noCriticalErrors, 'Critical browser errors')
  assert(checks.rangeOnly, 'All archive requests must use bounded Range / 206')
  await command('Browser.close').catch(() => {})
} catch (error) {
  if (command) { await screenshot('failure').catch(() => {}); console.log(await evaluate(`({url:location.href,state:document.readyState,html:document.documentElement.outerHTML.slice(0,3000),map:!!window.__SOLAR_MAP__})`).catch(() => null)) }
  await writeFile(resolve(qa, 'failure-report.json'), JSON.stringify({ checks, ranges, exceptions, consoleErrors, failures, requests:[...requests.values()].map(r=>r.url),browserLog:browserLog.slice(-3000),error: String(error) }, null, 2))
  throw error
} finally {
  socket?.close(); if (browser.exitCode === null) browser.kill()
  await pause(1000)
  assert(profile.startsWith(qa + sep))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
}
