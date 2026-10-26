import * as maplibregl from '/maplibre-gl.mjs'
// Isolated archive diagnostic. No Vue/application source imports and no external basemap.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const center = (x, y, z = 16) => [x / 2 ** z * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI]
const sourceLayer = 'buildings_eligible_pvout'
maplibregl.setWorkerUrl(window.location.origin + '/maplibre-gl-worker.mjs')

async function runCase({ name, archive, polygonFilter, location }) {
  const errors = []
  const map = new maplibregl.Map({
    container: 'map', center: location, zoom: 16, fadeDuration: 0, attributionControl: false,
    renderWorldCopies: false, canvasContextAttributes: { preserveDrawingBuffer: true },
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eeeeee' } }] },
  })
  map.on('error', event => errors.push(event.error?.message || String(event.error)))
  try {
    await new Promise((resolve, reject) => {
      map.once('load', resolve)
      setTimeout(() => reject(Error('Map initialization timed out')), 10000)
    })
    map.addSource('buildings', { type: 'vector', tiles: [`${locationOrigin()}/${archive}/{z}/{x}/{y}.pbf`],
      minzoom: 14, maxzoom: 16, promoteId: 'building_uid',
      attribution: 'Building footprints: Pemprov DKI Jakarta; Solar potential analysis: IESR' })
    const layer = { id: 'buildings', type: 'fill', source: 'buildings', 'source-layer': sourceLayer,
      paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#e77900', '#14678a'], 'fill-opacity': 0.9 } }
    if (polygonFilter) layer.filter = ['==', ['geometry-type'], 'Polygon']
    map.addLayer(layer)
    // Wait for the first source update and all tile work, not the initially empty cache.
    const settled = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 12000)
      map.once('idle', () => { clearTimeout(timer); resolve(true) })
      map.triggerRepaint()
    })
    await pause(100)
    const canvas = map.getCanvas(), gl = canvas.getContext('webgl2')
    const visible = map.queryRenderedFeatures({ layers: ['buildings'] })
    const visibleUids = [...new Set(visible.map(f => f.properties.building_uid))].sort()
    let hover = null, click = null, point = null
    map.on('mousemove', 'buildings', event => {
      const f = event.features[0]
      map.setFeatureState({ source: 'buildings', sourceLayer, id: f.id }, { hover: true })
      hover = { id: f.id, uid: f.properties.building_uid,
        state: map.getFeatureState({ source: 'buildings', sourceLayer, id: f.id }) }
    })
    map.on('click', 'buildings', event => {
      const f = event.features[0]
      click = { id: f.id, uid: f.properties.building_uid, capacity_kwp: f.properties.capacity_kwp,
        pvout_status: f.properties.pvout_status, annual_gwh: f.properties.annual_gwh ?? null }
    })
    // Search actual rendered pixels, then send DOM mouse events through MapLibre's handlers.
    const candidates = [...visible.filter(f => f.properties.building_uid === '1742057'), ...visible.slice(0, 100)]
    for (const f of candidates) {
      const coordinates = f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates.flat(2)
      const longitude = coordinates.map(p => p[0]), latitude = coordinates.map(p => p[1])
      const p = map.project([(Math.min(...longitude) + Math.max(...longitude)) / 2,
        (Math.min(...latitude) + Math.max(...latitude)) / 2])
      if (p.x >= 0 && p.x < 1000 && p.y >= 0 && p.y < 680 && map.queryRenderedFeatures(p, { layers: ['buildings'] }).length) {
        point = { x: p.x, y: p.y }; break
      }
    }
    if (point) {
      const rect = canvas.getBoundingClientRect()
      for (const type of ['mousemove', 'mousedown', 'mouseup', 'click']) canvas.dispatchEvent(new MouseEvent(type,
        { clientX: rect.left + point.x, clientY: rect.top + point.y, bubbles: true, button: 0, buttons: type === 'mousedown' ? 1 : 0 }))
      await pause(100)
    }
    const screenshot = canvas.toDataURL('image/png')
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let coloredPixels = 0
    for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - pixels[i + 2]) > 20) coloredPixels++
    return { name, archive, polygonFilter, errors, settled, tilesLoaded: map.areTilesLoaded(),
      visibleFeatureInstances: visible.length, visibleUids, coloredPixels, hover, click, point,
      affectedSampleVisible: visibleUids.includes('1742057'), screenshot,
      renderer: gl.getParameter(gl.RENDERER), version: maplibregl.getVersion() }
  } finally { map.remove() }
}
function locationOrigin() { return window.location.origin }

;(async () => {
  const island = center(52155.03, 33824.94), dense = center(52200.5, 33888.5)
  const results = []
  for (const location of [{ id: 'island', center: island }, { id: 'dense', center: dense }]) {
    for (const archive of location.id === 'island' ? ['mb', 'pm'] : ['pm']) {
      for (const polygonFilter of [false, true]) {
        const name = `${location.id}-${archive}-${polygonFilter ? 'polygon' : 'unfiltered'}`
        window.__qaProgress = { running: name, completed: results.map(r => ({ name: r.name, errors: r.errors,
          visible: r.visibleFeatureInstances, coloredPixels: r.coloredPixels, hover: r.hover, click: r.click, settled: r.settled })) }
        const result = await runCase({ name,
          archive, polygonFilter, location: location.center })
        results.push(result)
      }
    }
  }
  window.__qaResults = { results }
})().catch(error => { window.__qaResults = { fatal: error.stack || error.message } })
