// Actual local Vue application QA using an existing Chrome installation and CDP.
// No browser dependency, production data mutation, or remote writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { messages } from '../src/i18n/messages.ts'
import { BUILDING_ARCHIVE } from '../src/map/buildingArchive.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const chartNavigationOnly = process.argv.includes('--chart-navigation-only')
const mapFramingOnly = process.argv.includes('--map-framing-only')
const opacityResponseOnly = process.argv.includes('--opacity-response-only')
const opacityBaseline = process.argv.includes('--opacity-baseline')
const layerControlsOnly = process.argv.includes('--layer-controls-only') || opacityResponseOnly
const isolatedUi = chartNavigationOnly || mapFramingOnly || layerControlsOnly
const zoomOnly = process.argv.includes('--archive-zooms-only')
const archiveUpdate = process.argv.includes('--archive-update') || zoomOnly
const qaRelative = layerControlsOnly ? 'data/processed/qa/layer-controls' : mapFramingOnly ? 'data/processed/qa/map-framing' : chartNavigationOnly ? 'data/processed/qa/chart-toolbar' : zoomOnly ? 'data/processed/qa/archive-z13-18/browser-native-zooms' : archiveUpdate ? 'data/processed/qa/archive-z13-18/browser' : 'data/processed/qa/chart-refinement'
const archiveBytes = (await stat(resolve(root, BUILDING_ARCHIVE.localFile))).size
const qa = resolve(root, opacityResponseOnly ? `data/processed/qa/opacity-response${opacityBaseline ? '-before' : '-after'}` : qaRelative)
await mkdir(qa, { recursive: true })
const profile = resolve(qa, `chrome-profile-${process.pid}`)
assert(profile.startsWith(qa + sep))
// Isolate focused UI verification from ISP/R2 DNS availability. This applies only
// to the QA process/server; the user's port 5173 and .env.local remain unchanged.
let chartServer
let appUrl = 'http://localhost:5173/'
if (isolatedUi) {
  process.env.VITE_BUILDINGS_PMTILES_URL = ''
  const { createServer } = await import('vite')
  chartServer = await createServer({ cacheDir: resolve(qa, 'vite-cache'), server: { port: layerControlsOnly ? 5175 : 5174, strictPort: true, open: false }, clearScreen: false })
  await chartServer.listen()
  appUrl = chartServer.resolvedUrls.local[0]
}
const chrome = process.env.CHROME_PATH || resolve(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
await access(chrome)
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  ...(isolatedUi ? ['--disable-features=AsyncDns'] : []),
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
const mainlandPositions = admin.features.filter(f=>f.properties.wilayah!=='Kepulauan Seribu').flatMap(f=>f.geometry.coordinates.flat(2))
const mainlandBounds = [[Math.min(...mainlandPositions.map(p=>p[0])),Math.min(...mainlandPositions.map(p=>p[1]))],
  [Math.max(...mainlandPositions.map(p=>p[0])),Math.max(...mainlandPositions.map(p=>p[1]))]]
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
  return checkFittedExtent(label, fullBounds, 24)
}
async function checkOpeningExtent(label) {
  const padding = await evaluate(`(()=>{const c=window.__SOLAR_MAP__.getCanvas();return Math.round(Math.min(c.clientWidth,c.clientHeight)*0.1)})()`)
  return checkFittedExtent(label, mainlandBounds, padding)
}
async function checkFittedExtent(label, bounds, padding) {
  const result = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,b=${JSON.stringify(bounds)},r=m.getCanvas().getBoundingClientRect(),points=[[b[0][0],b[0][1]],[b[0][0],b[1][1]],[b[1][0],b[0][1]],[b[1][0],b[1][1]]].map(c=>m.project(c)),insets={left:Math.min(...points.map(p=>p.x)),right:r.width-Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:r.height-Math.max(...points.map(p=>p.y))};return {bounds:m.getBounds().toArray(),zoom:m.getZoom(),insets,fits:Object.values(insets).every(v=>v>=${padding}-0.75)}})()`)
  assert(result.fits, `${label}: all target geometry must fit inside the small padding`)
  const {left,right,top,bottom} = result.insets
  assert(Math.abs(left-right)<1 && Math.abs(top-bottom)<1, `${label}: bounds centered with symmetric padding`)
  assert(Math.abs(Math.min(left,right,top,bottom)-padding)<1, `${label}: tightest fitting extent without extra zoom-out`)
  return result
}
async function checkMapOverlays(label) {
  const result = await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}},viewport=box(document.querySelector('.map-viewport')),legend=box(document.querySelector('.map-legend')),status=box(document.querySelector('.map-instructions')),attribution=box(document.querySelector('.maplibregl-ctrl-attrib'));return {width:innerWidth,left:legend.left-viewport.left,bottom:viewport.bottom-status.bottom,gap:status.top-legend.bottom,visible:legend.top>=viewport.top&&status.right<=viewport.right,attributionClear:status.right<=attribution.left||status.bottom<=attribution.top,overflow:document.documentElement.scrollWidth>innerWidth,attributionGap:attribution.top-status.bottom}})()`)
  assert(Math.abs(result.left-8)<0.5 && Math.abs(result.gap-6)<0.5, `${label}: compact left inset and stack gap`)
  assert(result.visible && result.attributionClear && !result.overflow, `${label}: panels fit and leave attribution visible`)
  assert(Math.abs(result.bottom-8)<0.5 || Math.abs(result.attributionGap-6)<0.5, `${label}: smallest bottom inset that clears attribution`)
  return result
}
async function checkMapFraming() {
  checks.openingMainlandExtent = await checkOpeningExtent('Opening mainland')
  await screenshot('01-opening-mainland')
  const sizes = [[1920,1080],[1440,900],[1366,768],[1280,600],[768,1024],[390,844],[320,740]]
  checks.openingLayouts = []
  checks.workspaceHeight = []
  for (const [width,height] of sizes) {
    await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<540})
    await pause(250)
    await evaluate(`document.querySelector('.map-panel').scrollIntoView({block:'start'})`)
    for (const locale of ['id','en']) {
      await setLanguage(locale)
      checks.openingLayouts.push({width,height,locale,extent:await checkOpeningExtent('Resized opening'),overlays:await checkMapOverlays('Opening overlays')})
      checks.workspaceHeight.push({locale,...await checkWorkspaceHeight()})
    }
    if (width===1440 || width===390) await screenshot(`opening-${width}`)
  }
  await mouseClick('[data-testid="map-extent"]')
  await pause(100)
  checks.fullDkiLayouts = []
  for (const [width,height] of sizes) {
    await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<540})
    await pause(250)
    await evaluate(`document.querySelector('.map-panel').scrollIntoView({block:'start'})`)
    checks.fullDkiLayouts.push({width,height,extent:await checkFullExtent('Full DKI'),overlays:await checkMapOverlays('Full DKI overlays')})
    if (width===1440 || width===390) await screenshot(`full-dki-${width}`)
  }
  await command('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await evaluate(`window.scrollTo(0,0)`)
  await pause(250)
  await mouseClick('.maplibregl-ctrl-fullscreen')
  await waitFor(`!!document.fullscreenElement`, 'fullscreen')
  await pause(250)
  checks.fullscreenExtent = await checkFullExtent('Fullscreen DKI')
  await checkMapOverlays('Fullscreen overlays')
  await screenshot('fullscreen-dki')
  await mouseClick('.maplibregl-ctrl-shrink')
  await waitFor(`!document.fullscreenElement`, 'exit fullscreen')
  await pause(250)
  checks.afterFullscreenExtent = await checkFullExtent('DKI after fullscreen')
  // A real navigation control must turn off automatic fitting on later resizes.
  await mouseClick('.maplibregl-ctrl-zoom-in')
  await pause(100)
  const camera = await evaluate(`({center:window.__SOLAR_MAP__.getCenter().toArray(),zoom:window.__SOLAR_MAP__.getZoom()})`)
  await command('Emulation.setDeviceMetricsOverride', {width:1366,height:768,deviceScaleFactor:1,mobile:false})
  await pause(250)
  const resizedCamera = await evaluate(`({center:window.__SOLAR_MAP__.getCenter().toArray(),zoom:window.__SOLAR_MAP__.getZoom()})`)
  assert.deepEqual(resizedCamera,camera,'Manual navigation preserved on resize')
  checks.manualCameraPreserved = true
  const region = regions.regions.find(r=>r.wilayah==='Jakarta Selatan')
  await choose('region-filter',region.id)
  await pause(100)
  const beforeExtent = await kpiValues()
  await mouseClick('[data-testid="map-extent"]')
  await pause(100)
  await checkFullExtent('DKI with region selected')
  assert.equal(await evaluate(`document.querySelector('[data-testid="region-filter"]').value`),region.id)
  assert.deepEqual(await kpiValues(),beforeExtent,'Extent button preserves selected statistics')
  checks.extentPreservesFilters = true
}
async function checkWorkspaceHeight() {
  const result = await evaluate(`(()=>{const root=document.documentElement,property='--workspace-extra-height',previous=root.style.getPropertyValue(property),read=()=>{const m=document.querySelector('.map-panel').getBoundingClientRect(),sidebar=document.querySelector('.analysis-sidebar'),s=sidebar.getBoundingClientRect(),c=document.querySelector('.analytics-section').getBoundingClientRect(),coverage=document.querySelector('.coverage-card').getBoundingClientRect();return {map:m.height,sidebar:s.height,top:m.top,sidebarTop:s.top,chartTop:c.top,mapBottom:m.bottom,coverageBottom:coverage.bottom,sidebarScrollable:sidebar.scrollHeight>sidebar.clientHeight+1}},taller=read();root.style.setProperty(property,'0px');const baseline=read();if(previous)root.style.setProperty(property,previous);else root.style.removeProperty(property);return {width:innerWidth,height:innerHeight,taller,baseline,overflow:root.scrollWidth>innerWidth}})()`)
  const extra = result.width > 860 ? 50 : 0
  assert(Math.abs(result.taller.map-result.baseline.map-extra)<1,'Map receives exactly the desktop height increase')
  assert(Math.abs(result.taller.sidebar-result.baseline.sidebar-extra)<1,'Sidebar receives the same height increase')
  assert(Math.abs(result.taller.chartTop-result.baseline.chartTop-extra)<1,'Charts remain below the taller workspace')
  if (extra) {
    assert(Math.abs(result.taller.map-result.taller.sidebar)<1,'Map and sidebar heights remain aligned')
    assert(Math.abs(result.taller.top-result.taller.sidebarTop)<1,'Map and sidebar top edges remain aligned')
    if (!result.taller.sidebarScrollable) assert(Math.abs(result.taller.coverageBottom-result.taller.mapBottom)<1,'Visible sidebar card fills the taller workspace')
  }
  assert(!result.overflow,'Height adjustment causes no horizontal overflow')
  return result
}
async function checkMapFitsScreen(label) {
  const layout = await evaluate(`(()=>{const r=document.querySelector('.map-panel').getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect(),s=document.querySelector('.analysis-sidebar');return {width:innerWidth,height:innerHeight,mapTop:r.top,mapBottom:r.bottom,mapHeight:r.height,headerBottom:h.bottom,pageScroll:scrollY,sidebarHeight:s.clientHeight,sidebarContentHeight:s.scrollHeight,extraHeight:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-extra-height'))||0}})()`)
  assert(layout.mapTop >= layout.headerBottom - 1, `${label}: map top must be below the header`)
  assert(layout.mapBottom <= layout.height + layout.extraHeight - 8, `${label}: map bottom respects the approved extra desktop height`)
  return layout
}
async function checkIconCentered(selector) {
  const alignment = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect(),s=b.querySelector('svg').getBoundingClientRect();return {dx:s.left+s.width/2-r.left-r.width/2,dy:s.top+s.height/2-r.top-r.height/2,buttonWidth:r.width,buttonHeight:r.height}})()`)
  assert(Math.abs(alignment.dx)<=0.5 && Math.abs(alignment.dy)<=0.5, `${selector}: icon must be centered inside its button`)
  return alignment
}
async function mouseClick(selector) {
  const point = await evaluate(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));e.scrollIntoView({block:'nearest',behavior:'instant'});await frame();let r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(!e.contains(document.elementFromPoint(x,y))){e.scrollIntoView({block:'center',behavior:'instant'});await frame();r=e.getBoundingClientRect();x=r.left+r.width/2;y=r.top+r.height/2}if(!e.contains(document.elementFromPoint(x,y)))throw Error('Click target is covered: '+${JSON.stringify(selector)});return {x,y}})()`)
  await command('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1})
  await command('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',clickCount:1})
}
async function measureOpacityResponse(slider, toggle) {
  await mouseClick('.layer-menu > summary')
  await mouseClick(toggle)
  await waitFor(`window.__SOLAR_MAP__.loaded()`, 'settled map before opacity measurement')
  const requestsBefore=ranges.length
  await evaluate(`(() => {
    const m=window.__SOLAR_MAP__,manager=m.style.tileManagers['solar-buildings'],reload=manager.reload;
    const s=document.querySelector(${JSON.stringify(slider)}),initial=Number(s.value),inputs=[],frames=[];
    let reloads=0,lastInput=null;
    const input=()=>{lastInput=performance.now();inputs.push({value:Number(s.value),at:lastInput})};
    const render=()=>{if(lastInput!==null){frames.push({value:Number(s.value),delayMs:performance.now()-lastInput,evaluatedOpacity:m.getLayer('solar-building-fill').paint.get('fill-layer-opacity')});lastInput=null}};
    manager.reload=function(...args){reloads++;return reload.apply(this,args)};
    s.addEventListener('input',input);m.on('render',render);
    window.__OPACITY_QA__={started:performance.now(),finish:()=>{
      manager.reload=reload;s.removeEventListener('input',input);m.off('render',render);
      return {zoom:m.getZoom(),initial,final:Number(s.value),reloads,inputs,frames,sourceLoaded:m.isSourceLoaded('solar-buildings'),
        paint:m.getPaintProperty('solar-building-fill','fill-layer-opacity')??m.getPaintProperty('solar-building-fill','fill-opacity'),
        lastInputToSettledMs:inputs.length?performance.now()-inputs.at(-1).at:null,
        elapsedMs:performance.now()-window.__OPACITY_QA__.started};
    }};
  })()`)
  try {
    const rect=await evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(slider)}),r=s.getBoundingClientRect();return {left:r.left+8,width:r.width-16,y:r.top+r.height/2,value:Number(s.value)}})()`)
    const point=value=>({x:rect.left+rect.width*value/100,y:rect.y})
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point(rect.value)})
    await command('Input.dispatchMouseEvent',{type:'mousePressed',...point(rect.value),button:'left',buttons:1,clickCount:1})
    for(const value of [80,60,40,20,0,20,40,60,80,100]) {
      await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point(value),button:'left',buttons:1})
      await pause(35)
    }
    const whileHeld=await evaluate(`({value:Number(document.querySelector(${JSON.stringify(slider)}).value),paint:window.__SOLAR_MAP__.getPaintProperty('solar-building-fill','fill-layer-opacity')??window.__SOLAR_MAP__.getPaintProperty('solar-building-fill','fill-opacity'),evaluatedOpacity:window.__SOLAR_MAP__.getLayer('solar-building-fill').paint.get('fill-layer-opacity')})`)
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point(100),button:'left',clickCount:1})
    await waitFor(`window.__SOLAR_MAP__.loaded()`, 'settled map after opacity drag')
    const result=await evaluate(`window.__OPACITY_QA__.finish()`)
    result.whileHeld=whileHeld
    result.completedRangeResponsesDuringDrag=ranges.length-requestsBefore
    assert(result.inputs.length>=8,'Drag emits continuous input before pointer release')
    if(!opacityBaseline) {
      assert.equal(result.reloads,0,'Opacity dragging must not reprocess vector tiles')
      assert.equal(whileHeld.paint,whileHeld.value/100,'Paint must follow input while pointer remains pressed')
      assert.equal(whileHeld.evaluatedOpacity,whileHeld.value/100,'Rendered paint must update before pointer release')
      assert(result.frames.length>=8&&result.frames.every(f=>Math.abs(f.evaluatedOpacity-f.value/100)<1e-9),'Rendered frames follow continuous input without a delayed transition')
      assert.equal(result.completedRangeResponsesDuringDrag,0,'Dragging does not fetch building tiles')
    }
    checks.opacityResponses??=[]
    checks.opacityResponses.push(result)
    console.log(JSON.stringify({progress:'opacity-response',baseline:opacityBaseline,...result}))
  } finally {
    await evaluate(`window.__OPACITY_QA__?.finish();delete window.__OPACITY_QA__`)
    await mouseClick('[data-testid="layer-close"]')
  }
}
async function checkLayerControls() {
  const slider='[data-testid="building-opacity"]',toggle='[data-testid="opacity-toggle"]'
  const isExpanded=()=>evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-expanded')==='true'`)
  const fill=()=>evaluate(`window.__SOLAR_MAP__.getPaintProperty('solar-building-fill','fill-layer-opacity')`)
  async function key(name,code){await command('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code});await command('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code})}
  checks.brandingAssets=await evaluate(`(async()=>{
    const logo=document.querySelector('.brand-logo'),icon=document.querySelector('link[rel="icon"]');
    await logo.decode();const favicon=new Image();favicon.src=icon.href;await favicon.decode();
    return {logoWidth:logo.naturalWidth,logoHeight:logo.naturalHeight,logoLocal:new URL(logo.src).origin===location.origin,
      organization:document.querySelector('.brand-name').firstChild.textContent.trim(),project:document.querySelector('.brand-name>span').textContent.trim(),
      faviconLocal:new URL(icon.href).origin===location.origin,faviconSvg:icon.type==='image/svg+xml',faviconDecoded:favicon.naturalWidth>0};
  })()`)
  assert.deepEqual(checks.brandingAssets,{logoWidth:6271,logoHeight:3168,logoLocal:true,organization:'IESR',project:'JAKARTA SOLAR EXPLORER',faviconLocal:true,faviconSvg:true,faviconDecoded:true})
  await navigateSample('urban')
  // A camera change can briefly report the previous view as loaded. Wait for
  // actual rendered buildings in the same bounded area as the inspection UI.
  await waitFor(`(()=>{const m=window.__SOLAR_MAP__,c=m.getCanvas(),x=c.clientWidth/2,y=c.clientHeight/2;return m.isSourceLoaded('solar-buildings')&&!m.isMoving()&&m.queryRenderedFeatures([[x-100,y-100],[x+100,y+100]],{layers:['solar-building-fill']}).length>0})()`,'rendered urban tiles for opacity')
  if(opacityResponseOnly) {
    // Compare the original urban view first, then exercise dense native z13 and
    // detailed z18. All navigation/loading happens outside the drag measurement.
    for(const targetZoom of opacityBaseline?[16.3]:[16.3,13.3,18.3]) {
      await evaluate(`void window.__SOLAR_MAP__.jumpTo({zoom:${targetZoom}})`)
      await pause(250)
      await waitFor(`window.__SOLAR_MAP__.loaded()`, `loaded opacity view at ${targetZoom}`)
      await measureOpacityResponse(slider,toggle)
    }
    return
  }
  const beforeKpis=await kpiValues(),beforeFilter=await evaluate(`window.__SOLAR_MAP__.getFilter('solar-building-fill')`)
  const beforeOutline=await evaluate(`window.__SOLAR_MAP__.getPaintProperty('solar-building-outline','line-opacity')`)
  checks.layerControls=[]
  for(const locale of ['id','en']) {
    await setLanguage(locale)
    await mouseClick('.layer-menu > summary')
    assert(await evaluate(`document.querySelector('.layer-menu').open`))
    assert.equal(await isExpanded(),false,'Enabling buildings must not auto-expand opacity controls')
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-label')`),messages['map.adjustOpacity'][locale])
    await mouseClick(toggle);assert(await isExpanded())
    if(locale==='id')assert.equal(await evaluate(`document.querySelector(${JSON.stringify(slider)}).value`),'80')
    const fixedPaint=await evaluate(`({base:window.__SOLAR_MAP__.getPaintProperty('solar-building-fill','fill-opacity'),highlight:window.__SOLAR_MAP__.getPaintProperty('solar-building-highlight','fill-opacity')})`)
    assert.equal(fixedPaint.highlight[2],0.9,'Selected/hover highlight keeps the original opacity')
    assert.equal(fixedPaint.base[2],0,'Selected/hovered buildings are not painted twice')
    assert.deepEqual(await evaluate(`window.__SOLAR_MAP__.getPaintProperty('solar-building-fill','fill-layer-opacity-transition')`),{duration:0,delay:0})
    await mouseClick(slider)
    for(const [name,code,value] of [['End',35,100],['Home',36,0],['ArrowRight',39,5]]) {
      await key(name,code)
      assert.equal(await evaluate(`Number(document.querySelector(${JSON.stringify(slider)}).value)`),value)
      const paint=await fill();assert(Math.abs(paint-value/100)<1e-9)
      assert.deepEqual(await evaluate(`({base:window.__SOLAR_MAP__.getPaintProperty('solar-building-fill','fill-opacity'),highlight:window.__SOLAR_MAP__.getPaintProperty('solar-building-highlight','fill-opacity')})`),fixedPaint,'Dragging changes only constant layer paint')
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(slider)}).getAttribute('aria-valuetext')`),messages['map.opacityValue'][locale].replace('{value}',String(value)))
    }
    // Real building inspection still works after changing opacity.
    await mouseClick('[data-testid="layer-close"]')
    assert.equal(await evaluate(`document.activeElement?.matches('.layer-menu > summary')`),true)
    await waitFor(`(()=>{const m=window.__SOLAR_MAP__,c=m.getCanvas(),x=c.clientWidth/2,y=c.clientHeight/2;return m.isSourceLoaded('solar-buildings')&&m.queryRenderedFeatures([[x-100,y-100],[x+100,y+100]],{layers:['solar-building-fill']}).length>0})()`,'rendered inspection target after paint change')
    await mouseClick('[data-testid="inspect-center"]')
    await waitFor(`!!document.querySelector('[data-testid="building-details"]')`,'actual building inspection with opacity')
    const inspectedId=await evaluate(`document.querySelector('[data-testid="building-id"]').textContent`)
    assert.equal(await evaluate(`window.__SOLAR_MAP__.getFeatureState({source:'solar-buildings',sourceLayer:'buildings_eligible_pvout',id:${JSON.stringify(inspectedId)}}).selected`),true)
    await screenshot(`opacity-inspection-${locale}`)
    await mouseClick('.building-details header button')
    await mouseClick('.layer-menu > summary');assert.equal(await isExpanded(),false)
    await mouseClick(toggle)
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(slider)}).value`),'5','Closing the layer popup preserves the value')
    await mouseClick(toggle);assert.equal(await isExpanded(),false)
    await mouseClick(toggle);assert(await isExpanded())
    await mouseClick('[data-testid="buildings-visible"]')
    assert.equal(await isExpanded(),false)
    assert.deepEqual(await evaluate(`['solar-building-fill','solar-building-highlight','solar-building-outline'].map(id=>window.__SOLAR_MAP__.getLayoutProperty(id,'visibility'))`),['none','none','none'])
    assert(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).disabled`))
    await mouseClick('[data-testid="buildings-visible"]');assert.equal(await isExpanded(),false)
    await mouseClick(toggle)
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(slider)}).value`),'5')
    const menuState=await evaluate(`({checks:[...document.querySelectorAll('.layer-popover input[type="checkbox"]')].map(e=>e.checked),basemap:document.querySelector('[data-testid="basemap-openfreemap"]').getAttribute('aria-pressed')})`)
    await mouseClick('[data-testid="basemap-google"]')
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(slider)}).value`),'5')
    await mouseClick('[data-testid="basemap-openfreemap"]')
    assert.deepEqual(await evaluate(`({checks:[...document.querySelectorAll('.layer-popover input[type="checkbox"]')].map(e=>e.checked),basemap:document.querySelector('[data-testid="basemap-openfreemap"]').getAttribute('aria-pressed')})`),menuState)
    const layouts=[]
    for(const width of [1440,390,320]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<500})
      await evaluate(`document.querySelector('.map-panel-header').scrollIntoView({block:'center'})`);await pause(150)
      const bounds=await evaluate(`(()=>{const r=document.querySelector('.layer-popover').getBoundingClientRect(),s=document.querySelector(${JSON.stringify(slider)}).getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect(),b=document.querySelector('.brand').getBoundingClientRect(),l=document.querySelector('.brand-logo').getBoundingClientRect(),a=document.querySelector('.header-actions').getBoundingClientRect();return {width:innerWidth,fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,sliderFits:s.left>=r.left&&s.right<=r.right,overflow:document.documentElement.scrollWidth>innerWidth,brandFits:b.left>=0&&b.right<a.left&&l.top>=h.top&&l.bottom<=h.bottom,logoProportions:Math.abs(l.width-l.height)<0.01&&getComputedStyle(document.querySelector('.brand-logo')).objectFit==='cover'&&getComputedStyle(document.querySelector('.brand-logo')).objectPosition==='0% 50%',brandTextVisible:document.querySelector('.brand-name>span').getBoundingClientRect().width>0}})()`)
      assert(bounds.fits&&bounds.sliderFits&&!bounds.overflow&&bounds.brandFits&&bounds.logoProportions&&bounds.brandTextVisible,JSON.stringify(bounds));layouts.push(bounds)
      await screenshot(`opacity-${locale}-${width}`)
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false})
    await evaluate(`document.querySelector('[data-testid="building-opacity"]').focus()`)
    await key('Escape',27)
    assert.equal(await evaluate(`document.querySelector('.layer-menu').open`),false)
    assert.equal(await evaluate(`document.activeElement?.matches('.layer-menu > summary')`),true)
    checks.layerControls.push({locale,keyboardRangeAndEsc:true,collapsedByDefault:true,valueRetained:true,disabledWithLayer:true,realBuildingDetail:true,inspectedId,layouts})
    console.log(JSON.stringify({progress:'layer-controls',locale,passed:true}))
  }
  await setLanguage('id')
  assert.deepEqual(await kpiValues(),beforeKpis)
  assert.deepEqual(await evaluate(`window.__SOLAR_MAP__.getFilter('solar-building-fill')`),beforeFilter)
  assert.equal(await evaluate(`window.__SOLAR_MAP__.getPaintProperty('solar-building-outline','line-opacity')`),beforeOutline)
  assert.deepEqual(await evaluate(`window.__SOLAR_MAP__.getFilter('solar-building-highlight')`),beforeFilter)
  checks.opacityDoesNotChangeStatisticsFiltersOrOutline=true
}
async function checkChartNavigation() {
  // Focused UI regression only; keep tile loading out of the chart interaction cases.
  await evaluate(`(()=>{const e=document.querySelector('.layer-popover input');if(e.checked)e.click()})()`)
  const region = [...regions.regions].sort((a,b)=>(b.annual_gwh??-1)-(a.annual_gwh??-1))[0]
  const district = districts.districts.filter(d=>d.region_id===region.id).sort((a,b)=>(b.annual_gwh??-1)-(a.annual_gwh??-1))[0]
  const selected = () => evaluate(`['region-filter','district-filter','type-filter'].map(id=>document.querySelector('[data-testid="'+id+'"]').value)`)
  const assertEnergy = async () => assert.equal(await evaluate(`document.querySelector('[data-testid="generation-chart-tab"]').getAttribute('aria-pressed')`),'true')
  const chartDimensions = () => evaluate(`(()=>{const c=document.querySelector('.region-chart'),r=c.getBoundingClientRect(),toolbar=c.querySelector('.comparison-toolbar').getBoundingClientRect(),first=c.querySelector('.chart-row').getBoundingClientRect();return {height:r.height,toolbarHeight:toolbar.height,firstRowOffset:first.top-r.top}})()`)
  const checkMethodology = async locale => {
    await mouseClick('.header-actions > .button')
    assert(await evaluate(`document.querySelector('.methodology-dialog').open`))
    const text=await evaluate(`document.querySelector('.methodology-content').textContent`)
    for(const key of ['method.lead','method.energyText','method.nulls'])assert(text.includes(messages[key][locale]),`Relocated ${key} remains in ${locale} methodology`)
    const dialog=await evaluate(`(()=>{const d=document.querySelector('.methodology-dialog'),r=d.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth,overflow:d.scrollWidth>d.clientWidth+1}})()`)
    assert(dialog.fits&&!dialog.overflow)
    await screenshot(`methodology-${locale}-${await evaluate('innerWidth')}`)
    await mouseClick('.methodology-dialog header button')
    assert.equal(await evaluate(`document.querySelector('.methodology-dialog').open`),false)
  }
  checks.chartNavigation = []
  for (const locale of ['id','en']) {
    await setLanguage(locale);await choose('region-filter','');await choose('type-filter','')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.comparison-navigation button')].map(b=>b.disabled)`),[true,true])
    assert.equal(await evaluate(`!!document.querySelector('.research-note,.generation-caption')`),false)
    assert((await evaluate(`document.querySelector('[data-testid="kpi-generation"] p').textContent`)).includes(messages['kpi.generationNote'][locale]))
    await checkMethodology(locale)
    await mouseClick('[data-testid="generation-chart-tab"]')
    await mouseClick('.region-chart .chart-row')
    assert.deepEqual(await selected(),[region.id,'',''])
    assert.deepEqual(await kpiValues(),expectedKpis(region,locale))
    assert.equal(await evaluate(`document.querySelector('[data-testid="chart-back"]').textContent.trim()`),messages['chart.back'][locale])
    assert.equal(await evaluate(`document.querySelector('[data-testid="chart-reset-area"]').disabled`),false)
    const parentDimensions=await chartDimensions()
    await mouseClick('.region-chart .chart-row')
    assert.deepEqual(await selected(),[region.id,district.id,''])
    assert.deepEqual(await kpiValues(),expectedKpis(district,locale))
    const selectedDimensions=await chartDimensions()
    for(const key of ['height','toolbarHeight','firstRowOffset'])assert(Math.abs(parentDimensions[key]-selectedDimensions[key])<1,`${locale}: district selection must not add a control row or change card height`)
    assert.equal(await evaluate(`document.querySelector('.region-chart .selected-row').getAttribute('aria-pressed')`),'true')
    assert.equal(await evaluate(`document.querySelector('[data-testid="chart-reset-area"]').textContent.trim()`),messages['chart.resetArea'][locale])
    await mouseClick('[data-testid="chart-back"]')
    assert.deepEqual(await selected(),[region.id,'','']);await assertEnergy()
    assert.deepEqual(await kpiValues(),expectedKpis(region,locale))
    assert.equal(await evaluate(`document.activeElement?.dataset.testid`),'chart-back')
    // The retained Back button can be activated a second time from the keyboard.
    await command('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await command('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await waitFor(`document.querySelector('[data-testid="region-filter"]').value===''`,'Back to DKI')
    assert.deepEqual(await selected(),['','','']);await assertEnergy()
    assert.deepEqual(await kpiValues(),expectedKpis(regions.overall,locale))
    assert.equal(await evaluate(`document.activeElement?.matches('.region-chart .chart-row')`),true,'Focus returns to the chart when navigation becomes disabled')
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.comparison-navigation button')].map(b=>b.disabled)`),[true,true])
    await mouseClick('.region-chart .chart-row');await mouseClick('.region-chart .chart-row')
    checks.chartNavigation.push({locale,layouts:[]})
    for (const width of [1920,1440,1024,768,390,320]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<500})
      await pause(100)
      const layout=await evaluate(`(()=>{const c=document.querySelector('.region-chart'),r=c.getBoundingClientRect(),toolbar=c.querySelector('.comparison-toolbar').getBoundingClientRect(),metric=c.querySelector('.chart-tabs').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,toolbarHeight:toolbar.height,buttons:[...c.querySelectorAll('.comparison-navigation button')].map(b=>{const p=b.getBoundingClientRect();return {text:b.getAttribute('aria-label'),fits:p.left>=r.left&&p.right<=r.right&&p.top>=toolbar.top&&p.bottom<=toolbar.bottom&&p.left>=metric.right,height:p.height}})}})()`)
      assert(!layout.overflow);assert(layout.buttons.every(b=>b.fits&&b.height>=32));assert(layout.toolbarHeight<=38,'Toolbar stays on one line')
      const withDistrict=await chartDimensions()
      await choose('district-filter','')
      const withoutDistrict=await chartDimensions()
      for(const key of ['height','toolbarHeight','firstRowOffset'])assert(Math.abs(withDistrict[key]-withoutDistrict[key])<1,`${locale} ${width}px: Back/reset state must not shift the chart`)
      await choose('district-filter',district.id)
      checks.chartNavigation.at(-1).layouts.push(layout)
      if(width===1920||width===1440||width===320)await screenshotCharts(`chart-navigation-${locale}-${width}`)
      if(width===320)await checkMethodology(locale)
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false})
    await mouseClick('[data-testid="chart-reset-area"]')
    assert.deepEqual(await selected(),['','','']);await assertEnergy()
    assert.deepEqual(await kpiValues(),expectedKpis(regions.overall,locale))
    assert.equal(await evaluate(`document.activeElement?.matches('.region-chart .chart-row')`),true)
    // Reset area must preserve the unrelated type filter and its exact DKI aggregate.
    const type=types.types[0]
    await choose('type-filter',type.id)
    await mouseClick('.region-chart .chart-row');await mouseClick('.region-chart .chart-row')
    assert.deepEqual(await selected(),[region.id,district.id,type.id])
    assert(await evaluate(`!!document.querySelector('.unsupported-notice')`))
    await mouseClick('[data-testid="chart-reset-area"]')
    assert.deepEqual(await selected(),['','',type.id]);await assertEnergy()
    assert.deepEqual(await kpiValues(),expectedKpis(type,locale))
    await choose('type-filter','')
    const nullDistrict=districts.districts.find(d=>d.annual_gwh===null)
    await choose('region-filter',nullDistrict.region_id);await choose('district-filter',nullDistrict.id)
    assert.deepEqual(await kpiValues(),expectedKpis(nullDistrict,locale))
    await mouseClick('[data-testid="chart-back"]')
    assert.deepEqual(await selected(),[nullDistrict.region_id,'',''])
    await mouseClick('[data-testid="chart-back"]')
    assert.deepEqual(await selected(),['','',''])
    Object.assign(checks.chartNavigation.at(-1),{realChartClicks:true,backAndDirectReset:true,metricAndTypePreserved:true,nullEnergyPreserved:true,keyboardAndFocus:true,stableToolbarAndCardHeight:true,explanationsMovedToMethodology:true})
    console.log(JSON.stringify({progress:'chart-navigation',locale,passed:true}))
  }
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
async function screenshotCharts(name) {
  const clip = await evaluate(`(()=>{const r=document.querySelector('#analisis').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}})()`)
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip })
  await writeFile(resolve(qa, `${name}.png`), Buffer.from(result.data, 'base64'))
  screenshots.push(`${qaRelative}/${name}.png`)
}
async function checkChartLayout(label) {
  const result = await evaluate(`(()=>{const cards=[...document.querySelectorAll('.chart-card')].map(e=>{const r=e.getBoundingClientRect(),footer=e.querySelector('footer').getBoundingClientRect(),bodies=[...e.querySelectorAll(':scope>.chart-caveat,:scope>.energy-availability,:scope>.bar-chart,:scope>.donut-layout')];return {name:e.dataset.testid,height:r.height,footerGap:bodies.length?footer.top-Math.max(...bodies.map(b=>b.getBoundingClientRect().bottom)):0}});return {width:innerWidth,cards,overflow:document.documentElement.scrollWidth>innerWidth,typeLabelsFit:[...document.querySelectorAll('.type-bars .chart-label')].every(e=>e.scrollWidth<=e.clientWidth+1),typeRows:document.querySelectorAll('.type-bars .chart-row').length}})()`)
  assert(!result.overflow, `${label}: charts must not cause horizontal overflow`)
  assert(result.typeLabelsFit, `${label}: complete building type labels fit`)
  assert.equal(result.typeRows, 7)
  for (const card of result.cards) assert(card.footerGap<=24, `${label}: ${card.name} has unnecessary blank space before its footer`)
  return result
}
async function checkSummaryCardLayout(label) {
  const result = await evaluate(`(()=>{const cards=[...document.querySelectorAll('.kpi-card')].map(e=>{const r=e.getBoundingClientRect(),number=e.querySelector('.kpi-number'),heading=e.querySelector('.kpi-heading'),note=e.querySelector('p');return {key:e.dataset.testid,top:r.top,height:r.height,numberTop:number.getBoundingClientRect().top,headingTop:heading.getBoundingClientRect().top,noteTop:note.getBoundingClientRect().top,contentMetrics:[heading,number,note].map(n=>({className:n.className,width:n.clientWidth,scrollWidth:n.scrollWidth,height:n.clientHeight,scrollHeight:n.scrollHeight,box:n.getBoundingClientRect().height})),contentFits:[heading,number,note].every(n=>{const b=n.getBoundingClientRect();return n.scrollWidth<=n.clientWidth+1&&b.top>=r.top&&b.bottom<=r.bottom&&(getComputedStyle(n).overflowY==='visible'||n.scrollHeight<=n.clientHeight+1)})}});return {width:innerWidth,sharedRows:CSS.supports('grid-template-rows','subgrid'),cards,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
  assert(!result.overflow, `${label}: summary cards must not cause horizontal overflow`)
  const rows = []
  for (const card of result.cards) {
    assert(card.contentFits, `${label}: ${card.key} content must remain visible: ${JSON.stringify(card.contentMetrics)}`)
    let row = rows.find(r=>Math.abs(r[0].top-card.top)<1)
    if (!row) rows.push(row=[])
    row.push(card)
  }
  for (const row of rows) {
    assert(Math.max(...row.map(c=>c.height))-Math.min(...row.map(c=>c.height))<=1, `${label}: summary cards in the same row have equal height`)
    if (result.sharedRows) for (const key of ['headingTop','numberTop','noteTop']) {
      assert(Math.max(...row.map(c=>c[key]))-Math.min(...row.map(c=>c[key]))<=1, `${label}: summary ${key} must align`)
    }
  }
  for (const card of result.cards) delete card.contentMetrics
  return result
}
async function checkNativeArchiveZooms() {
  checks.nativeArchiveZooms = []
  for (const zoom of [BUILDING_ARCHIVE.minZoom + 0.3, BUILDING_ARCHIVE.maxZoom]) {
    const start = Date.now(), expectedTileZoom = Math.floor(zoom)
    await evaluate(`void window.__SOLAR_MAP__.jumpTo({zoom:${zoom}})`)
    // Inspect the installed MapLibre 6.15 tile-manager API in QA only. This rules
    // out counting temporarily retained parent/child tiles as native-zoom success.
    const renderable = `window.__SOLAR_MAP__.style.tileManagers['solar-buildings']`
    await waitFor(`(()=>{const m=window.__SOLAR_MAP__,t=${renderable},ids=t.getRenderableIds();return m.isSourceLoaded('solar-buildings')&&ids.length>0&&ids.every(id=>t.getTileByID(id).tileID.canonical.z===${expectedTileZoom})})()`, `actual native tiles at zoom ${zoom}`, 120000)
    const result = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,t=${renderable};return {zoom:m.getZoom(),rendered:m.queryRenderedFeatures({layers:['solar-building-fill']}).length,minzoom:m.getSource('solar-buildings').minzoom,maxzoom:m.getSource('solar-buildings').maxzoom,canonicalZooms:[...new Set(t.getRenderableIds().map(id=>t.getTileByID(id).tileID.canonical.z))]}})()`)
    assert(result.rendered>0); assert.equal(result.minzoom,BUILDING_ARCHIVE.minZoom); assert.equal(result.maxzoom,BUILDING_ARCHIVE.maxZoom)
    result.waitMs = Date.now()-start; checks.nativeArchiveZooms.push(result)
  }
}

async function checkRepairedBuildingInteractions() {
  const source = JSON.parse(await readFile(resolve(root, 'data/processed/qa/archive-z13-18/repaired-source-check.json'), 'utf8'))
  await choose('type-filter','')
  await choose('region-filter','')
  checks.repairedBuildings = []
  const cases = [...source.targets.map(target=>({target,zoom:17.3})), {target:source.targets.find(t=>t.uid==='1097775'),zoom:18.3}]
  for (const [caseIndex,{target,zoom}] of cases.entries()) {
    // Isolate batches like separate browser test cases, releasing software-WebGL
    // resources from prior dense-map/chart tests. This is not a soak benchmark.
    if (caseIndex%15===0) {
      const query = `?qa_archive_batch=${caseIndex}`
      await command('Page.navigate',{url:`http://localhost:5173/${query}`})
      await waitFor(`location.search===${JSON.stringify(query)} && !!window.__SOLAR_MAP__`, 'fresh repaired-building batch')
      await setLanguage('id')
    }
    await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:${JSON.stringify(target.center)},zoom:${zoom},padding:0,bearing:0,pitch:0})`)
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill'],filter:['==',['get','building_uid'],${JSON.stringify(target.uid)}]}).length>0`, `repaired building ${target.uid}`, 120000)
    const hit = await evaluate(`(()=>{const m=window.__SOLAR_MAP__,r=m.getCanvas().getBoundingClientRect(),id=${JSON.stringify(target.uid)},features=m.queryRenderedFeatures({layers:['solar-building-fill'],filter:['==',['get','building_uid'],id]});for(const f of features){const coordinates=f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2),points=coordinates.map(c=>m.project(c)),xs=points.map(p=>p.x),ys=points.map(p=>p.y),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);for(const fy of [.5,.3,.7,.1,.9])for(const fx of [.5,.3,.7,.1,.9]){const x=a+(b-a)*fx,y=c+(d-c)*fy;if(x<28||y<28||x>r.width-28||y>r.height-28)continue;const top=m.queryRenderedFeatures([x,y],{layers:['solar-building-fill']})[0];if(String(top?.properties.building_uid)===id)return {x:r.left+x,y:r.top+y,properties:top.properties}}}return null})()`)
    assert(hit, `Unobstructed real mouse target for ${target.uid}`)
    for (const [field, expected] of Object.entries(target.expected)) {
      if (field === 'building_uid') continue
      const actual = hit.properties[field]
      if (expected == null) assert(actual == null)
      else {
        assert(Number.isFinite(actual), `${target.uid}/${field}: numeric type`)
        assert(Math.abs(actual-expected)<=Math.max(1e-9,Math.abs(expected)*1e-12), `${target.uid}/${field}: source value`)
        if (target.repaired_fields.includes(field)) assert.equal(actual,expected)
      }
    }
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:hit.x,y:hit.y})
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1})
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1})
    await waitFor(`document.querySelector('[data-testid="building-id"]')?.textContent===${JSON.stringify(target.uid)}`, `detail for repaired ${target.uid}`)
    const details = {}
    for (const language of ['id','en']) {
      await setLanguage(language)
      const display = await evaluate(`({id:document.querySelector('[data-testid="building-id"]').textContent,capacity:document.querySelector('.detail-capacity strong').textContent.trim(),metrics:[...document.querySelectorAll('.detail-metrics dd')].map(e=>e.textContent.replace(/\\s+/g,' ').trim())})`)
      assert.equal(display.id,target.uid)
      assert.equal(display.capacity,fmt(target.expected.capacity_kwp,2,language)+' kWp')
      assert.equal(display.metrics[0],fmt(target.expected.area_m2,2,language)+' m²')
      assert.equal(display.metrics[1],fmt(target.expected.useable_m2,2,language)+' m²')
      details[language] = display
    }
    if (target.uid==='1097775' && zoom>18) await screenshot('repaired-1097775-english-z18')
    await setLanguage('id')
    await mouseClick('[aria-label="Tutup detail bangunan"]')
    await waitFor(`!document.querySelector('[data-testid="building-details"]')`, 'close repaired detail')
    checks.repairedBuildings.push({uid:target.uid,zoom,numericPropertiesMatchGeoPackage:true,realMouseClick:true,details})
    if (checks.repairedBuildings.length%10===0) console.log(JSON.stringify({progress:'repaired-building-browser-checks',complete:checks.repairedBuildings.length,total:cases.length}))
  }
  assert.equal(new Set(checks.repairedBuildings.map(b=>b.uid)).size,45)
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
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes(BUILDING_ARCHIVE.localUrl)) {
      const r = m.params.response
      const requestHeaders = requests.get(m.params.requestId)?.headers ?? {}
      const header = (headers, name) => Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1]
      ranges.push({ status: r.status, range: header(requestHeaders, 'range'), contentRange: header(r.headers, 'content-range'), bytes: Number(header(r.headers, 'content-length')) })
    }
  }
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id
    const timeout = setTimeout(() => { pending.delete(messageId); reject(Error(`CDP command timed out: ${method}`)) }, archiveUpdate ? 60000 : 20000)
    pending.set(messageId, { resolve: r => { clearTimeout(timeout); resolve(r) }, reject: e => { clearTimeout(timeout); reject(e) } })
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })
  evaluate = async expression => {
    let r
    try { r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) }
    catch (error) { throw Error(`${error.message}; expression: ${expression.slice(0,500)}`, {cause:error}) }
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable')
  console.log(JSON.stringify({ progress: 'cdp-ready' }))
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  const browserVersion = await command('Browser.getVersion')
  console.log(JSON.stringify({ progress: 'navigate', url: appUrl, result: await command('Page.navigate', { url: appUrl }) }))
  await waitFor('!!window.__SOLAR_MAP__', 'Vue / MapLibre initialization')
  checks.firstVisitLanguage = await evaluate(`({language:document.documentElement.lang,englishSelected:document.querySelector('[data-testid="language-en"]').getAttribute('aria-pressed'),title:document.title,description:document.querySelector('meta[name="description"]').content})`)
  assert.deepEqual(checks.firstVisitLanguage,{language:'en',englishSelected:'true',title:messages['app.title'].en+' | IESR',description:messages['app.description'].en})
  assert.deepEqual(await kpiValues(),expectedKpis(regions.overall,'en'))
  await checkEnglishText()
  // Existing comparison scenarios use Indonesian explicitly, independent of
  // the first-visit default and any preference written by this test profile.
  await setLanguage('id')
  if (layerControlsOnly) {
    await checkLayerControls()
  } else if (chartNavigationOnly) {
    await checkChartNavigation()
  } else if (mapFramingOnly) {
    await checkMapFraming()
  } else {
  checks.devLoadTiming = await evaluate(`(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),firstContentfulPaintMs:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime??0),mapReadyMs:Math.round(performance.now())}})()`)
  await pause(2000)
  checks.initial = await evaluate(`({title:document.title,kpis:[...document.querySelectorAll('.kpi-number strong')].map(e=>e.textContent),mapError:document.querySelector('.map-error')?.textContent,baseFallback:!!document.querySelector('.basemap-notice'),charts:document.querySelectorAll('.chart-card').length})`)
  assert.deepEqual(checks.initial.kpis, expectedKpis(regions.overall))
  assert.equal(checks.initial.mapError, undefined); assert.equal(checks.initial.charts, 3)
  await screenshot('01-overview')
  console.log(JSON.stringify({ progress: 'initial', ...checks.initial }))
  checks.initialMainlandExtent = await checkOpeningExtent('Initial extent')
  checks.initialSummaryLayout = await checkSummaryCardLayout('Initial DKI summary cards')
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
  assert(await evaluate(`!document.querySelector('.example-locations,.scope-row,.technical-caption,.closing-note,.app-footer .text-button,.research-note,.generation-caption')`))
  assert(!(await evaluate(`document.querySelector('main').innerText`)).includes('RISET ENERGI'))
  checks.requestedElementsRemoved = true
  checks.iconAlignment = { extent: await checkIconCentered('[data-testid="map-extent"]') }
  checks.viewportLayouts = []
  for (const [width,height] of [[1440,900],[1366,768],[1280,720],[1280,600],[1920,1080]]) {
    await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false})
    await evaluate(`window.scrollTo(0,0)`); await pause(300)
    checks.viewportLayouts.push(await checkMapFitsScreen(`${width} × ${height}`))
    await checkOpeningExtent(`${width} × ${height} extent`)
    if (width===1366) await screenshot('12-laptop-map-without-page-scroll')
    await setLanguage('en')
    await checkMapFitsScreen(`English ${width} × ${height}`)
    await checkOpeningExtent(`English ${width} × ${height} extent`)
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
  if (zoomOnly) { await navigateSample('urban'); await checkNativeArchiveZooms() }
  if (!process.argv.includes('--smoke') && !zoomOnly) {
    // Statistical selectors must work independently of tile visibility. Avoid loading
    // every district's dense tiles while rapidly testing hundreds of KPI selections.
    await evaluate(`(()=>{const c=document.querySelector('.layer-popover input');if(c.checked)c.click()})()`)
    await waitFor(`window.__SOLAR_MAP__.getLayoutProperty('solar-building-fill','visibility')==='none'`, 'hide buildings for independent summary checks')
    checks.summaryIndependentOfBuildingVisibility = true
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
    checks.compactChartLayouts = []
    checks.summaryCardLayouts = []
    const south = regions.regions.find(r=>r.wilayah==='Jakarta Selatan')
    await choose('region-filter', south.id)
    for (const width of [1920,1440,1024,768,390,320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: width<861?844:1080, deviceScaleFactor: 1, mobile: width<861 })
      for (const locale of ['id','en']) {
        await setLanguage(locale)
        await pause(100)
        await choose('region-filter', '')
        assert.deepEqual(await kpiValues(), expectedKpis(regions.overall, locale))
        checks.summaryCardLayouts.push({locale,scope:'DKI',...await checkSummaryCardLayout(`${locale} ${width}px DKI summary cards`)})
        const dkiLayout = await checkChartLayout(`${locale} ${width}px six-region chart`)
        await choose('region-filter', south.id)
        assert.deepEqual(await kpiValues(), expectedKpis(south, locale))
        checks.summaryCardLayouts.push({locale,scope:'Jakarta Selatan',...await checkSummaryCardLayout(`${locale} ${width}px regional summary cards`)})
        const layout = await checkChartLayout(`${locale} ${width}px ten-district chart`)
        assert(layout.cards[0].height>dkiLayout.cards[0].height+30, 'Comparison grows to fit ten districts')
        assert(Math.abs(layout.cards[1].height-dkiLayout.cards[1].height)<=1, 'Type card keeps its own height when the comparison grows')
        if (width>1190) assert(Math.abs(layout.cards[2].height-dkiLayout.cards[2].height)<=1, 'Eligibility card keeps its own height when the comparison grows')
        if (width>1190) assert(Math.max(...layout.cards.map(c=>c.height))-Math.min(...layout.cards.map(c=>c.height))>20, 'Desktop cards follow their content height')
        checks.compactChartLayouts.push({locale,...layout})
        assert(await evaluate(`!!document.querySelector('.comparison-footer .chart-interaction-hint')&&!document.querySelector('.comparison-footer svg')`))
        const text = await evaluate(`document.querySelector('.chart-caveat').textContent`)
        assert(!/arsiran|hatching|PVOUT/.test(text), 'Energy note uses plain language')
        if (locale==='en') await checkEnglishText()
        if ([1920,390].includes(width)) await screenshotCharts(`22-charts-${width}-${locale}`)
      }
    }
    await command('Emulation.setDeviceMetricsOverride', { width:720, height:450, deviceScaleFactor:2, mobile:false })
    checks.zoomEquivalentLayouts = []
    for (const locale of ['id','en']) {
      await setLanguage(locale)
      await pause(100)
      checks.zoomEquivalentLayouts.push({locale,summary:await checkSummaryCardLayout(`${locale} 200% equivalent viewport`),charts:await checkChartLayout(`${locale} 200% equivalent viewport`)})
    }
    // The published all-null district must fit the compact summary layout too.
    await command('Emulation.setDeviceMetricsOverride', { width:320, height:844, deviceScaleFactor:1, mobile:true })
    const islands = regions.regions.find(r=>r.wilayah==='Kepulauan Seribu')
    const noEnergy = districts.districts.find(d=>d.kecamatan==='Kepulauan Seribu Utara')
    await choose('region-filter', islands.id)
    await choose('district-filter', noEnergy.id)
    for (const locale of ['id','en']) {
      await setLanguage(locale)
      assert.deepEqual(await kpiValues(), expectedKpis(noEnergy, locale))
      checks.summaryCardLayouts.push({locale,scope:'Unavailable generation',...await checkSummaryCardLayout(`${locale} 320px unavailable generation`)})
      await evaluate(`window.scrollTo(0,0)`)
      await screenshot(`24-unavailable-summary-320-${locale}`)
    }
    await command('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false })
    await setLanguage('id')
    await choose('region-filter', '')
    await evaluate(`document.querySelector('#workspace').scrollIntoView({block:'start'})`)
    await evaluate(`(()=>{const c=document.querySelector('.layer-popover input');if(!c.checked)c.click()})()`)
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
    await checkNativeArchiveZooms()
    await evaluate(`void window.__SOLAR_MAP__.jumpTo({zoom:${BUILDING_ARCHIVE.maxZoom + 0.3}})`)
    await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings') && window.__SOLAR_MAP__.queryRenderedFeatures({layers:['solar-building-fill']}).length>0`, 'overzoomed updated building source')
    checks.overzoom = await evaluate(`({zoom:window.__SOLAR_MAP__.getZoom(),sourceMaxzoom:window.__SOLAR_MAP__.getSource('solar-buildings').maxzoom})`)
    assert.equal(checks.overzoom.sourceMaxzoom,BUILDING_ARCHIVE.maxZoom)
    if (archiveUpdate) await checkRepairedBuildingInteractions()
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
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.no-data-bar>i')).display`), 'none')
    await checkChartLayout('Unavailable district energy')
    await screenshotCharts('23-unavailable-energy-id')
    await setLanguage('en')
    assert((await evaluate(`document.querySelector('.no-data-bar').closest('.chart-row').innerText`)).includes('Unavailable'))
    await checkChartLayout('English unavailable district energy')
    await screenshotCharts('23-unavailable-energy-en')
    await setLanguage('id')
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
    await waitFor(`!!document.querySelector('.maplibregl-ctrl-fullscreen')`, 'fullscreen control finishes its exit transition')
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
  }
  checks.noCriticalErrors = exceptions.length === 0 && consoleErrors.length === 0
  if (!isolatedUi) checks.rangeOnly = ranges.length > 0 && ranges.every(r => r.status === 206 && r.range && r.bytes <= 16 * 1024 * 1024 && r.contentRange?.endsWith(`/${archiveBytes}`))
  const report = { scope: opacityResponseOnly ? 'Focused real mouse opacity drag, source-reload count and rendered paint while pointer is held; isolated local archive' : layerControlsOnly ? 'Focused building opacity disclosure, real MapLibre paint/inspection, value retention, keyboard/close controls and bilingual responsive UI; isolated local archive, no full UAT' : mapFramingOnly ? 'Focused opening mainland/full-DKI framing, tight symmetric bounds, overlays, resize/fullscreen and camera/filter preservation; isolated UI server, no full UAT' : chartNavigationOnly ? 'Focused bilingual chart Back/reset, filter semantics, keyboard focus and responsive layout on an isolated Vite/local-archive server; primary R2 configuration unchanged; no full UAT or archive revalidation' : 'Actual Vue application at http://localhost:5173; local Range PMTiles via official browser protocol', appUrl, browserVersion, checks, ranges, imageryResponses, exceptions, consoleErrors, failures, screenshots,
    limitations: ['Headless Chrome / software WebGL, not a physical mobile or GPU performance certification', 'Range bytes reflect representative views and canceled navigation requests, not a production bandwidth budget', 'Blocked external basemap and navigation cancellations are intentional network failures'] }
  await writeFile(resolve(qa, 'app-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ checks, rangeRequests: ranges.length, rangeBytes: ranges.reduce((n, r) => n + r.bytes, 0), exceptions, consoleErrors, failures }, null, 2))
  assert(checks.noCriticalErrors, 'Critical browser errors')
  if (!isolatedUi) assert(checks.rangeOnly, 'All archive requests must use bounded Range / 206')
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
  await chartServer?.close()
}
