<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FullscreenControl, Map as MapLibreMap, Marker, NavigationControl, ScaleControl } from 'maplibre-gl'
import type { ExpressionSpecification, MapMouseEvent, StyleSpecification } from 'maplibre-gl'
import type { Feature, MultiPolygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useDashboard } from '../../composables/useDashboard.ts'
import { copyBoundaryGeoJson } from '../../services/boundaryGeoJson.ts'
import { adaptBuildingProperties } from '../../services/normalization.ts'
import type { NormalizedBuildingProperties } from '../../types/dashboard.ts'
import { numberId } from '../../utils/presentation.ts'
import { BUILDING_MIN_ZOOM, BUILDING_SOURCE_LAYER, METRIC_LABELS, buildingFilter, collectionBounds, featureCenter, geometryBounds } from '../../map/mapModel.ts'
import type { MapMetric } from '../../map/mapModel.ts'
import { buildingArchiveUrl, prepareMapRuntime } from '../../map/protocol.ts'
import { GOOGLE_IMAGERY_LAYER, GOOGLE_IMAGERY_SOURCE, googleImagerySource, loadBasemap, neutralStyle } from '../../map/basemap.ts'
import type { BasemapId } from '../../map/basemap.ts'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ selectedId: string | null; scope: string }>()
const emit = defineEmits<{ select: [building: Readonly<NormalizedBuildingProperties> | null] }>()
const dashboard = useDashboard()
const { data, filters, boundaries } = dashboard
const panel = ref<HTMLElement | null>(null)
const container = ref<HTMLDivElement | null>(null)
const metric = ref<MapMetric>('capacity_mwp')
const buildingsVisible = ref(true), boundariesVisible = ref(true), districtLinesVisible = ref(false), choroplethVisible = ref(true)
const basemap = ref<BasemapId>('openfreemap'), imageryUnavailable = ref(false)
const busy = ref(true), ready = ref(false), baseUnavailable = ref(false), mapError = ref<string | null>(null), zoom = ref(10.7)
const emptyView = ref(false)
const tooltip = ref<{ x: number; y: number; title: string; detail: string } | null>(null)
let map: MapLibreMap | undefined, disposed = false, hoveredId: string | number | null = null
let viewingFullExtent = true
let baseLayers: string[] = [], baseSources = new Set<string>()
const markers: Marker[] = []
let resizeObserver: ResizeObserver | undefined
const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650
const activeRows = computed(() => !data.value ? [] : filters.regionId ? data.value.districts.districts.filter(d => d.region_id === filters.regionId) : data.value.regions.regions)
const metricMax = computed(() => Math.max(0.000001, ...activeRows.value.map(row => row[metric.value] ?? 0)))
const metricUnit = computed(() => metric.value === 'capacity_mwp' ? 'MWp' : metric.value === 'annual_gwh' ? 'GWh/tahun' : '%')
const legendNumber = (n: number) => numberId(metric.value === 'eligibility_rate' ? n * 100 : n, metric.value === 'eligibility_rate' ? 1 : 0)
const basemapNotice = computed(() => {
  if (basemap.value === 'google-imagery' && !imageryUnavailable.value) return null
  if (basemap.value === 'google-imagery') return baseUnavailable.value
    ? 'Peta dasar eksternal tidak tersedia. Layer penelitian tetap aktif.'
    : 'Imagery Google tidak tersedia. Menggunakan OpenFreeMap.'
  return baseUnavailable.value ? 'OpenFreeMap tidak tersedia. Layer penelitian tetap aktif.' : null
})

function fullExtent() { return collectionBounds((boundaries.region.data.value?.features ?? []).map(f => f.geometry)) }
function extentPadding() { return { top: 32, right: 32, bottom: 100, left: 32 } }

function setFeature(id: string | number | null, state: Record<string, boolean>) {
  if (id !== null && map?.getSource('solar-buildings')) map.setFeatureState({ source: 'solar-buildings', sourceLayer: BUILDING_SOURCE_LAYER, id }, state)
}
function clearHover() { setFeature(hoveredId, { hover: false }); hoveredId = null; tooltip.value = null; if (map) map.getCanvas().style.cursor = '' }
function focusSelection() {
  if (!map || !ready.value) return
  const collection = filters.districtId ? boundaries.district.data.value : boundaries.region.data.value
  const id = filters.districtId || filters.regionId
  const feature = collection?.features.find(f => f.id === id)
  if (feature) { viewingFullExtent = false; map.fitBounds(geometryBounds(feature.geometry), { padding: 58, maxZoom: 16, bearing: 0, pitch: 0, duration: duration() }) }
}
function resetView() {
  if (!map) return
  const bounds = fullExtent()
  if (bounds) { viewingFullExtent = true; map.fitBounds(bounds, { padding: extentPadding(), bearing: 0, pitch: 0, duration: duration() }) }
}
function inspectCenter() {
  if (!map || !ready.value || zoom.value < BUILDING_MIN_ZOOM) return
  const canvas = map.getCanvas(), x = canvas.clientWidth / 2, y = canvas.clientHeight / 2
  const features = map.queryRenderedFeatures([[x - 100, y - 100], [x + 100, y + 100]], { layers: ['solar-building-fill'] })
  if (features[0]) selectProperties(features[0].properties)
}
function selectProperties(properties: unknown) {
  if (!data.value) return
  try { emit('select', adaptBuildingProperties(properties, data.value)); mapError.value = null }
  catch (error) { mapError.value = error instanceof Error ? error.message : 'Detail bangunan tidak dapat dibaca'; console.error('Building detail validation failed', error) }
}
function updateAppearance() {
  if (!map || !ready.value || !data.value) return
  const filter = buildingFilter(data.value, filters)
  for (const id of ['solar-building-fill', 'solar-building-outline']) {
    if (map.getLayer(id)) { map.setFilter(id, filter); map.setLayoutProperty(id, 'visibility', buildingsVisible.value ? 'visible' : 'none') }
  }
  const imageryActive = basemap.value === 'google-imagery' && !imageryUnavailable.value
  for (const id of baseLayers) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', !imageryActive && !baseUnavailable.value ? 'visible' : 'none')
  map.setLayoutProperty(GOOGLE_IMAGERY_LAYER, 'visibility', imageryActive ? 'visible' : 'none')
  for (const id of ['solar-region-line', 'solar-region-selected', 'solar-district-selected']) map.setLayoutProperty(id, 'visibility', boundariesVisible.value ? 'visible' : 'none')
  map.setLayoutProperty('solar-district-line', 'visibility', boundariesVisible.value && (districtLinesVisible.value || filters.regionId) ? 'visible' : 'none')
  map.setFilter('solar-region-selected', ['==', ['get', 'id'], filters.regionId ?? ''])
  map.setFilter('solar-district-selected', ['==', ['get', 'id'], filters.districtId ?? ''])
  map.setFilter('solar-district-line', filters.regionId ? ['==', ['get', 'region_id'], filters.regionId] : null)
  const max = metricMax.value
  const paint: ExpressionSpecification = ['case', ['==', ['get', metric.value], null], '#bcc8c6',
    ['interpolate', ['linear'], ['coalesce', ['get', metric.value], 0], 0, '#fff0d6', max / 3, '#f5d29b', max * 2 / 3, '#e5a463', max, '#aa6136']]
  for (const level of ['region', 'district']) {
    map.setPaintProperty(`solar-${level}-fill`, 'fill-color', paint)
    map.setLayoutProperty(`solar-${level}-fill`, 'visibility', choroplethVisible.value && (level === 'district' ? Boolean(filters.regionId) : !filters.regionId) ? 'visible' : 'none')
  }
  map.setFilter('solar-district-fill', filters.regionId ? ['==', ['get', 'region_id'], filters.regionId] : null)
}
function handleMove(event: MapMouseEvent) {
  if (!map || !ready.value) return
  const layers = zoom.value >= BUILDING_MIN_ZOOM && buildingsVisible.value && map.getLayer('solar-building-fill') ? ['solar-building-fill'] : ['solar-region-fill', 'solar-district-fill']
  const feature = map.queryRenderedFeatures(event.point, { layers })[0]
  if (!feature) { clearHover(); return }
  map.getCanvas().style.cursor = 'pointer'
  if (feature.source === 'solar-buildings') {
    if (feature.id !== hoveredId) { setFeature(hoveredId, { hover: false }); hoveredId = feature.id ?? null; setFeature(hoveredId, { hover: true }) }
    tooltip.value = { x: Math.min(event.point.x + 14, map.getCanvas().clientWidth - 225), y: Math.max(12, event.point.y - 68),
      title: `Bangunan ${feature.properties.building_uid}`, detail: `${numberId(feature.properties.capacity_kwp as number)} kWp · ${feature.properties.pvout_status === 'NoData' ? 'PVOUT belum tersedia' : feature.properties.jenis_group}` }
  } else {
    const name = feature.properties.kecamatan ?? feature.properties.wilayah
    const value = feature.properties[metric.value] as number | null
    tooltip.value = { x: Math.min(event.point.x + 14, map.getCanvas().clientWidth - 225), y: Math.max(12, event.point.y - 68),
      title: name, detail: value === null ? 'Estimasi energi tidak tersedia' : `${legendNumber(value)} ${metricUnit.value}` }
  }
}
function handleClick(event: MapMouseEvent) {
  if (!map || !ready.value) return
  const building = zoom.value >= BUILDING_MIN_ZOOM && buildingsVisible.value && map.getLayer('solar-building-fill') ? map.queryRenderedFeatures(event.point, { layers: ['solar-building-fill'] })[0] : null
  if (building) { selectProperties(building.properties); return }
  emit('select', null)
  if (zoom.value >= BUILDING_MIN_ZOOM) return
  const feature = map.queryRenderedFeatures(event.point, { layers: ['solar-district-fill', 'solar-region-fill'] })[0]
  if (feature?.source === 'solar-regions') dashboard.setRegion(String(feature.properties.id))
  else if (feature?.source === 'solar-districts') dashboard.setDistrict(String(feature.properties.id))
}

async function initialize() {
  prepareMapRuntime()
  const [base, regionOk, districtOk] = await Promise.all([loadBasemap(), dashboard.loadBoundaries('region'), dashboard.loadBoundaries('district')])
  if (disposed || !container.value) return
  if (!regionOk || !districtOk || !data.value) { busy.value = false; mapError.value = 'Batas wilayah belum dapat dimuat. Muat ulang data untuk mencoba lagi.'; return }
  baseUnavailable.value = base.fallback
  baseLayers = base.style.layers.map(l => l.id).filter(id => id !== 'solar-background')
  baseSources = new Set(Object.keys(base.style.sources))
  const style: StyleSpecification = { ...base.style, sources: { ...base.style.sources, [GOOGLE_IMAGERY_SOURCE]: googleImagerySource() },
    layers: [...neutralStyle().layers, ...base.style.layers.filter(l => l.id !== 'solar-background'),
      { id: GOOGLE_IMAGERY_LAYER, type: 'raster', source: GOOGLE_IMAGERY_SOURCE, layout: { visibility: 'none' } }] }
  map = new MapLibreMap({ container: container.value, style, bounds: fullExtent()!, fitBoundsOptions: { padding: extentPadding() },
    minZoom: 5, maxZoom: 20, renderWorldCopies: false,
    locale: { 'FullscreenControl.Enter': 'Tampilkan peta layar penuh', 'FullscreenControl.Exit': 'Keluar dari layar penuh' },
    attributionControl: { compact: false }, canvasContextAttributes: { preserveDrawingBuffer: true } })
  map.getCanvas().setAttribute('aria-label', 'Peta interaktif potensi surya atap DKI Jakarta')
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new FullscreenControl({ container: panel.value! }), 'top-right')
  map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-right')
  map.on('error', event => {
    const source = 'sourceId' in event ? String(event.sourceId) : ''
    const message = event.error?.message ?? 'Peta tidak dapat dimuat'
    if (source === GOOGLE_IMAGERY_SOURCE || /mt0\.google\.com/.test(message)) { imageryUnavailable.value = true; return }
    if (baseSources.has(source) || /openfreemap\.org/.test(message)) { baseUnavailable.value = true; return }
    mapError.value = message; console.error('Solar map error', event.error)
  })
  map.on('zoom', () => { zoom.value = map!.getZoom(); for (const marker of markers) marker.getElement().style.display = zoom.value < 13 ? '' : 'none' })
  map.on('movestart', event => { if (event.originalEvent) viewingFullExtent = false })
  map.on('mousemove', handleMove); map.on('click', handleClick); map.on('mouseout', clearHover)
  map.on('idle', () => {
    emptyView.value = Boolean(ready.value && buildingsVisible.value && zoom.value >= BUILDING_MIN_ZOOM && map?.getLayer('solar-building-fill')
      && map.queryRenderedFeatures({ layers: ['solar-building-fill'] }).length === 0)
  })
  map.on('dataloading', event => { if ('sourceId' in event && event.sourceId === 'solar-buildings') busy.value = true })
  map.on('sourcedata', event => { if (event.sourceId === 'solar-buildings' && event.isSourceLoaded) busy.value = false })
  map.once('load', () => {
    if (!map || disposed || !data.value) return
    const regions = copyBoundaryGeoJson(boundaries.region.data.value!), districts = copyBoundaryGeoJson(boundaries.district.data.value!)
    for (const [geo, rows] of [[regions, data.value.regions.regions], [districts, data.value.districts.districts]] as const) {
      for (const f of geo.features) { const summary = rows.find(r => r.id === f.properties.id)!; Object.assign(f.properties, { capacity_mwp: summary.capacity_mwp, annual_gwh: summary.annual_gwh, eligibility_rate: summary.eligibility_rate }) }
    }
    map.addSource('solar-regions', { type: 'geojson', data: regions })
    map.addSource('solar-districts', { type: 'geojson', data: districts })
    for (const level of ['region', 'district']) {
      const source = level === 'region' ? 'solar-regions' : 'solar-districts'
      map.addLayer({ id: `solar-${level}-fill`, type: 'fill', source, paint: { 'fill-color': '#f1cd91', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.62, 13, 0.32, 15, 0.04] } })
      map.addLayer({ id: `solar-${level}-line`, type: 'line', source, paint: { 'line-color': level === 'region' ? '#6d817a' : '#9aaa9e', 'line-width': level === 'region' ? 1.2 : 0.8, 'line-opacity': 0.8 } })
      map.addLayer({ id: `solar-${level}-selected`, type: 'line', source, filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#175a4c', 'line-width': 3, 'line-opacity': 0.95 } })
    }
    const archive = buildingArchiveUrl()
    if (archive) {
      map.addSource('solar-buildings', { type: 'vector', url: `pmtiles://${archive}`, minzoom: 14, maxzoom: 16, promoteId: 'building_uid',
        attribution: 'Bangunan: Pemprov DKI Jakarta · Analisis: IESR' })
      const filter = buildingFilter(data.value, filters)
      map.addLayer({ id: 'solar-building-fill', type: 'fill', source: 'solar-buildings', 'source-layer': BUILDING_SOURCE_LAYER, minzoom: BUILDING_MIN_ZOOM, filter,
        paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ed9138', ['boolean', ['feature-state', 'hover'], false], '#f3b55d', ['==', ['get', 'pvout_status'], 'NoData'], '#c7973d',
          ['interpolate', ['linear'], ['get', 'capacity_kwp'], 0, '#a5d4c8', 8, '#5aa895', 25, '#267f79', 100, '#15586b', 500, '#163d56']], 'fill-opacity': 0.9 } })
      map.addLayer({ id: 'solar-building-outline', type: 'line', source: 'solar-buildings', 'source-layer': BUILDING_SOURCE_LAYER, minzoom: BUILDING_MIN_ZOOM, filter,
        paint: { 'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#a24918', ['boolean', ['feature-state', 'hover'], false], '#ba6a29', '#346f6a'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, ['boolean', ['feature-state', 'hover'], false], 1.5, 0.25], 'line-opacity': 0.8 } })
    } else { buildingsVisible.value = false; mapError.value = 'Arsip bangunan belum dikonfigurasi untuk mode ini. Peta wilayah tetap tersedia.' }
    for (const feature of regions.features) {
      const element = document.createElement('div'); element.className = 'admin-map-label'; element.textContent = feature.properties.wilayah.replace('Jakarta ', 'JAKARTA\n').toUpperCase()
      element.setAttribute('aria-hidden', 'true')
      markers.push(new Marker({ element }).setLngLat(featureCenter(feature as Feature<MultiPolygon>) as [number, number]).addTo(map))
    }
    ready.value = true; busy.value = false; updateAppearance(); focusSelection()
    if (import.meta.env.DEV) window.__SOLAR_MAP__ = map
  })
  // Retain the full administrative extent through fullscreen/responsive resizes,
  // while preserving detail views after the user navigates the map.
  resizeObserver = new ResizeObserver(() => { map?.resize(); if (viewingFullExtent) resetView() }); resizeObserver.observe(container.value)
}

watch([metric, buildingsVisible, boundariesVisible, districtLinesVisible, choroplethVisible, basemap, baseUnavailable, imageryUnavailable, () => filters.regionId, () => filters.districtId, () => filters.typeId], updateAppearance)
watch(() => [filters.regionId, filters.districtId], () => { emit('select', null); clearHover(); filters.regionId ? focusSelection() : resetView() })
watch(() => filters.typeId, () => { emit('select', null); clearHover() })
watch(() => props.selectedId, (id, previous) => { setFeature(previous, { selected: false }); setFeature(id, { selected: true }) })
onMounted(() => { void initialize().catch(error => { busy.value = false; mapError.value = error instanceof Error ? error.message : 'Peta gagal dimuat'; console.error('Map initialization failed', error) }) })
onBeforeUnmount(() => { disposed = true; resizeObserver?.disconnect(); markers.forEach(m => m.remove()); if (import.meta.env.DEV) delete window.__SOLAR_MAP__; map?.remove() })
defineExpose({ resetView })
declare global { interface Window { __SOLAR_MAP__?: MapLibreMap } }
</script>

<template>
  <section ref="panel" class="map-panel" aria-label="Peta potensi surya" :class="{ 'imagery-basemap': basemap === 'google-imagery' && !imageryUnavailable }">
    <header class="map-panel-header"><div class="map-title"><AppIcon name="globe" :size="18" /><strong>Peta potensi</strong><span class="map-scope">{{ scope }}</span></div>
      <div class="map-toolbar"><details class="layer-menu"><summary class="button button-quiet"><AppIcon name="layers" :size="16" /> Layer</summary><div class="layer-popover">
        <strong>Tampilan peta</strong><label><input v-model="buildingsVisible" type="checkbox"> Bangunan layak <small>zoom 14+</small></label><label><input v-model="choroplethVisible" type="checkbox"> Choropleth wilayah</label><label><input v-model="boundariesVisible" type="checkbox"> Batas wilayah</label><label><input v-model="districtLinesVisible" type="checkbox"> Seluruh batas kecamatan</label>
        <div class="filter-divider" /><span class="field-label">Peta dasar</span><div class="segmented basemap-options" role="group" aria-label="Pilih peta dasar"><button :aria-pressed="basemap === 'openfreemap'" data-testid="basemap-openfreemap" @click="basemap = 'openfreemap'">OpenFreeMap</button><button :aria-pressed="basemap === 'google-imagery'" data-testid="basemap-google" @click="basemap = 'google-imagery'">Google Imagery</button></div>
      </div></details><button class="icon-button" data-testid="map-extent" title="Tampilkan seluruh DKI Jakarta" aria-label="Tampilkan seluruh DKI Jakarta" @click="resetView"><AppIcon name="extent" :size="18" /></button></div>
    </header>
    <div class="map-viewport">
      <div ref="container" class="map-canvas" data-testid="solar-map" />
      <div v-if="basemapNotice" class="basemap-notice" role="status">{{ basemapNotice }}</div>
      <div v-if="mapError" class="map-error" role="alert"><AppIcon name="info" :size="17" />{{ mapError }}</div>
      <div v-else-if="emptyView && !busy" class="map-empty" role="status">Belum ada bangunan sesuai filter pada tampilan ini. Geser peta atau ubah filter.</div>
      <div v-if="!ready && busy" class="map-loading"><span class="spinner" /><strong>Menyiapkan peta Jakarta…</strong><span>Memuat batas wilayah dan lapisan penelitian</span></div>
      <div v-if="tooltip" class="map-tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }" aria-hidden="true"><strong>{{ tooltip.title }}</strong><span>{{ tooltip.detail }}</span></div>
      <div class="map-legend">
        <template v-if="zoom < 14 || !buildingsVisible"><label for="map-metric">WARNA WILAYAH</label><select id="map-metric" v-model="metric" aria-label="Metrik choropleth"><option v-for="(label, key) in METRIC_LABELS" :key="key" :value="key">{{ label }}</option></select><div class="choropleth-ramp" /><div class="legend-ticks"><span>0</span><span>{{ legendNumber(metricMax) }} {{ metricUnit }}</span></div><p><i class="legend-dot missing" /> Energi tidak tersedia</p></template>
        <template v-else><label>POTENSI BANGUNAN · kWp</label><div class="building-ramp" /><div class="legend-ticks"><span>0</span><span>25</span><span>≥ 500</span></div><p><i class="legend-dot amber" /> PVOUT belum tersedia</p></template>
      </div>
      <div class="map-instructions"><span class="status-dot" :class="{ pending: busy }" /><span>{{ zoom < 14 ? 'Perbesar untuk melihat bangunan' : 'Klik bangunan untuk melihat potensi atap' }}</span><button v-if="zoom >= 14 && buildingsVisible" title="Pilih bangunan di dekat pusat peta" aria-label="Inspeksi bangunan di dekat pusat peta" data-testid="inspect-center" @click="inspectCenter"><AppIcon name="cursor" :size="15" /> Inspeksi</button><small>z{{ numberId(zoom, 1) }}</small></div>
      <slot />
    </div>
  </section>
</template>
