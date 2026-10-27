<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FullscreenControl, Map as MapLibreMap, Marker, NavigationControl, ScaleControl } from 'maplibre-gl'
import type { ExpressionSpecification, MapMouseEvent, StyleSpecification } from 'maplibre-gl'
import type { Feature, MultiPolygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useDashboard } from '../../composables/useDashboard.ts'
import { copyBoundaryGeoJson } from '../../services/boundaryGeoJson.ts'
import { adaptBuildingProperties } from '../../services/normalization.ts'
import type { NormalizedBuildingProperties } from '../../types/dashboard.ts'
import type { MessageKey } from '../../i18n/messages.ts'
import { BUILDING_MIN_ZOOM, BUILDING_MAX_ZOOM, BUILDING_SOURCE_LAYER, buildingFilter, collectionBounds, featureCenter, geometryBounds, mainlandBounds } from '../../map/mapModel.ts'
import type { MapMetric } from '../../map/mapModel.ts'
import { buildingArchiveUrl, prepareMapRuntime } from '../../map/protocol.ts'
import { viewportHasFeatures } from '../../map/renderedFeatures.ts'
import { GOOGLE_IMAGERY_LAYER, GOOGLE_IMAGERY_SOURCE, googleImagerySource, loadBasemap, neutralStyle } from '../../map/basemap.ts'
import type { BasemapId } from '../../map/basemap.ts'
import AppIcon from '../AppIcon.vue'

const { t, n, locale, regionName, districtName, typeName } = useI18n()

const props = defineProps<{ selectedId: string | null; scope: string }>()
const emit = defineEmits<{ select: [building: Readonly<NormalizedBuildingProperties> | null] }>()
const dashboard = useDashboard()
const { data, filters, boundaries } = dashboard
const panel = ref<HTMLElement | null>(null)
const container = ref<HTMLDivElement | null>(null)
const layerMenu = ref<HTMLDetailsElement | null>(null)
const overlays = ref<HTMLDivElement | null>(null)
const metric = ref<MapMetric>('capacity_mwp')
const buildingsVisible = ref(true), boundariesVisible = ref(true), districtLinesVisible = ref(false), choroplethVisible = ref(true)
const opacityOpen = ref(false), buildingOpacity = ref(80)
const buildingFillOpacity = computed(() => buildingOpacity.value / 100)
const highlightedBuilding: ExpressionSpecification =
  ['any', ['boolean', ['feature-state', 'selected'], false], ['boolean', ['feature-state', 'hover'], false]]
const basemap = ref<BasemapId>('openfreemap'), imageryUnavailable = ref(false)
const busy = ref(true), ready = ref(false), baseUnavailable = ref(false), mapError = ref<MessageKey | null>(null), zoom = ref(10.7)
const emptyView = ref(false)
type Tooltip = { x: number; y: number } & (
  { kind: 'building'; id: string; capacity: number | null; type: string; missing: boolean } |
  { kind: 'area'; name: string; district: boolean; value: number | null }
)
const tooltip = ref<Tooltip | null>(null)
const tooltipText = computed(() => {
  const item = tooltip.value
  if (!item) return null
  return item.kind === 'building'
    ? { title: t('map.building', { id: item.id }), detail: `${n(item.capacity)} kWp · ${item.missing ? t('common.pvoutMissing') : typeName(item.type)}` }
    : { title: item.district ? districtName(item.name) : regionName(item.name), detail: item.value === null ? t('map.noEnergy') : `${legendNumber(item.value)} ${metricUnit.value}` }
})
let map: MapLibreMap | undefined, disposed = false, hoveredId: string | number | null = null
let fittedView: 'mainland' | 'dki' | null = 'mainland'
let emptyViewNeedsCheck = true
let baseLayers: string[] = [], baseSources = new Set<string>()
const markers: { marker: Marker; name: string }[] = []
const metricLabels: Record<MapMetric, MessageKey> = { capacity_mwp: 'chart.capacity', annual_gwh: 'chart.energy', eligibility_rate: 'kpi.eligibility' }
let resizeObserver: ResizeObserver | undefined
let overlayResizeObserver: ResizeObserver | undefined
const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650
const activeRows = computed(() => !data.value ? [] : filters.regionId ? data.value.districts.districts.filter(d => d.region_id === filters.regionId) : data.value.regions.regions)
const metricMax = computed(() => Math.max(0.000001, ...activeRows.value.map(row => row[metric.value] ?? 0)))
const metricUnit = computed(() => metric.value === 'capacity_mwp' ? 'MWp' : metric.value === 'annual_gwh' ? t('unit.gwhYear') : '%')
const legendNumber = (value: number) => n(metric.value === 'eligibility_rate' ? value * 100 : value, metric.value === 'eligibility_rate' ? 1 : 0)
const basemapNotice = computed(() => {
  if (basemap.value === 'google-imagery' && !imageryUnavailable.value) return null
  if (basemap.value === 'google-imagery') return baseUnavailable.value
    ? t('map.externalUnavailable')
    : t('map.googleUnavailable')
  return baseUnavailable.value ? t('map.openUnavailable') : null
})

function fullExtent() { return collectionBounds((boundaries.region.data.value?.features ?? []).map(f => f.geometry)) }
function openingExtent() { return boundaries.region.data.value ? mainlandBounds(boundaries.region.data.value) : null }
function openingPadding() { return Math.round(Math.min(container.value!.clientWidth, container.value!.clientHeight) * 0.1) }
function fitView(view: 'mainland' | 'dki', animationDuration = duration()) {
  const bounds = view === 'mainland' ? openingExtent() : fullExtent()
  if (!map || !bounds) return
  fittedView = view
  map.fitBounds(bounds, { padding: view === 'mainland' ? openingPadding() : 24, bearing: 0, pitch: 0, duration: animationDuration })
}
function positionOverlays() {
  const attribution = container.value?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib')
  if (!attribution || !overlays.value || !container.value) return
  const attributionBox = attribution.getBoundingClientRect(), overlayBox = overlays.value.getBoundingClientRect()
  // Keep the corner inset small; only lift the stack when attribution occupies it.
  const bottom = overlayBox.right + 8 > attributionBox.left ? container.value.getBoundingClientRect().bottom - attributionBox.top + 6 : 8
  overlays.value.style.bottom = `${bottom}px`
}

// Update public control elements in place: MapLibre's constructor locale is static.
// This preserves the fullscreen session, source cache, camera and feature state.
function updateMapLanguage() {
  if (!map) return
  for (const id of ['solar-buildings', 'solar-regions', 'solar-districts']) {
    const source = map.getSource(id)
    if (source) source.attribution = t('map.attribution')
  }
  map.fire('styledata', { dataType: 'style' })
  map.getCanvas().setAttribute('aria-label', t('map.canvas'))
  const labels: [string, MessageKey][] = [
    ['.maplibregl-ctrl-zoom-in', 'map.zoomIn'], ['.maplibregl-ctrl-zoom-out', 'map.zoomOut'],
    ['.maplibregl-ctrl-fullscreen', 'map.fullscreenEnter'], ['.maplibregl-ctrl-shrink', 'map.fullscreenExit'],
    ['.maplibregl-ctrl-attrib-button', 'map.toggleAttribution'],
  ]
  for (const [selector, key] of labels) {
    const element = map.getContainer().querySelector<HTMLElement>(selector)
    element?.setAttribute('aria-label', t(key)); element?.setAttribute('title', t(key))
  }
  for (const { marker, name } of markers) marker.getElement().textContent = regionName(name).toUpperCase()
}

function setFeature(id: string | number | null, state: Record<string, boolean>) {
  if (id !== null && map?.getSource('solar-buildings')) map.setFeatureState({ source: 'solar-buildings', sourceLayer: BUILDING_SOURCE_LAYER, id }, state)
}
function clearHover() { setFeature(hoveredId, { hover: false }); hoveredId = null; tooltip.value = null; if (map) map.getCanvas().style.cursor = '' }
function focusSelection() {
  if (!map || !ready.value) return
  const collection = filters.districtId ? boundaries.district.data.value : boundaries.region.data.value
  const id = filters.districtId || filters.regionId
  const feature = collection?.features.find(f => f.id === id)
  if (feature) { fittedView = null; map.fitBounds(geometryBounds(feature.geometry), { padding: 58, maxZoom: 16, bearing: 0, pitch: 0, duration: duration() }) }
}
function resetView() {
  fitView('dki')
}
function closeLayers() {
  if (!layerMenu.value) return
  layerMenu.value.open = false
  layerMenu.value.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
}
function handleLayerMenuToggle(event: Event) {
  if (!(event.currentTarget as HTMLDetailsElement).open) opacityOpen.value = false
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
  catch (error) { mapError.value = 'map.detailError'; console.error('Building detail validation failed', error) }
}
function updateAppearance() {
  if (!map || !ready.value || !data.value) return
  emptyViewNeedsCheck = true
  const filter = buildingFilter(data.value, filters)
  for (const id of ['solar-building-fill', 'solar-building-highlight', 'solar-building-outline']) {
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
      kind: 'building', id: String(feature.properties.building_uid), capacity: feature.properties.capacity_kwp ?? null,
      missing: feature.properties.pvout_status === 'NoData', type: String(feature.properties.jenis_group) }
  } else {
    const name = feature.properties.kecamatan ?? feature.properties.wilayah
    const value = feature.properties[metric.value] as number | null
    tooltip.value = { x: Math.min(event.point.x + 14, map.getCanvas().clientWidth - 225), y: Math.max(12, event.point.y - 68),
      kind: 'area', name, district: Boolean(feature.properties.kecamatan), value: value ?? null }
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
  if (!regionOk || !districtOk || !data.value) { busy.value = false; mapError.value = 'map.boundaryError'; return }
  baseUnavailable.value = base.fallback
  baseLayers = base.style.layers.map(l => l.id).filter(id => id !== 'solar-background')
  baseSources = new Set(Object.keys(base.style.sources))
  const style: StyleSpecification = { ...base.style, sources: { ...base.style.sources, [GOOGLE_IMAGERY_SOURCE]: googleImagerySource() },
    layers: [...neutralStyle().layers, ...base.style.layers.filter(l => l.id !== 'solar-background'),
      { id: GOOGLE_IMAGERY_LAYER, type: 'raster', source: GOOGLE_IMAGERY_SOURCE, layout: { visibility: 'none' } }] }
  map = new MapLibreMap({ container: container.value, style, bounds: openingExtent()!, fitBoundsOptions: { padding: openingPadding() },
    minZoom: 5, maxZoom: 20, renderWorldCopies: false,
    // Dense z13 geometry is expensive to retain after navigation. Bound the
    // viewport-sized cache without changing source zooms, geometry or filters.
    maxTileCacheZoomLevels: 2,
    locale: { 'FullscreenControl.Enter': t('map.fullscreenEnter'), 'FullscreenControl.Exit': t('map.fullscreenExit'),
      'NavigationControl.ZoomIn': t('map.zoomIn'), 'NavigationControl.ZoomOut': t('map.zoomOut'),
      'AttributionControl.ToggleAttribution': t('map.toggleAttribution'), 'Map.Title': t('map.canvas') },
    attributionControl: { compact: false }, canvasContextAttributes: { preserveDrawingBuffer: true } })
  zoom.value = map.getZoom()
  map.getCanvas().setAttribute('aria-label', t('map.canvas'))
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  const fullscreen = new FullscreenControl({ container: panel.value! })
  fullscreen.on('fullscreenstart', updateMapLanguage)
  fullscreen.on('fullscreenend', updateMapLanguage)
  map.addControl(fullscreen, 'top-right')
  map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-right')
  map.on('error', event => {
    const source = 'sourceId' in event ? String(event.sourceId) : ''
    const message = event.error?.message ?? ''
    if (source === GOOGLE_IMAGERY_SOURCE || /mt0\.google\.com/.test(message)) { imageryUnavailable.value = true; return }
    if (baseSources.has(source) || /openfreemap\.org/.test(message)) { baseUnavailable.value = true; return }
    mapError.value = 'map.renderError'; console.error('Solar map error', event.error)
  })
  map.on('zoom', () => { zoom.value = map!.getZoom(); for (const { marker } of markers) marker.getElement().style.display = zoom.value < 13 ? '' : 'none' })
  map.on('movestart', event => { if (event.originalEvent) fittedView = null })
  map.on('moveend', () => { emptyViewNeedsCheck = true })
  map.on('mousemove', handleMove); map.on('click', handleClick); map.on('mouseout', clearHover)
  map.on('idle', () => {
    // Hover/selection repainting doesn't change whether any building is visible.
    if (!emptyViewNeedsCheck) return
    emptyViewNeedsCheck = false
    const canvas = map!.getCanvas()
    emptyView.value = Boolean(ready.value && buildingsVisible.value && zoom.value >= BUILDING_MIN_ZOOM && map?.getLayer('solar-building-fill')
      && !viewportHasFeatures(canvas.clientWidth, canvas.clientHeight,
        box => map!.queryRenderedFeatures(box, { layers: ['solar-building-fill'] })))
  })
  map.on('dataloading', event => { if ('sourceId' in event && event.sourceId === 'solar-buildings') busy.value = true })
  map.on('sourcedata', event => {
    if (event.sourceId === 'solar-buildings') {
      if (event.sourceDataType === 'content') emptyViewNeedsCheck = true
      if (event.isSourceLoaded) busy.value = false
    }
  })
  map.once('load', () => {
    if (!map || disposed || !data.value) return
    const regions = copyBoundaryGeoJson(boundaries.region.data.value!), districts = copyBoundaryGeoJson(boundaries.district.data.value!)
    for (const [geo, rows] of [[regions, data.value.regions.regions], [districts, data.value.districts.districts]] as const) {
      for (const f of geo.features) { const summary = rows.find(r => r.id === f.properties.id)!; Object.assign(f.properties, { capacity_mwp: summary.capacity_mwp, annual_gwh: summary.annual_gwh, eligibility_rate: summary.eligibility_rate }) }
    }
    map.addSource('solar-regions', { type: 'geojson', data: regions, attribution: t('map.attribution') })
    map.addSource('solar-districts', { type: 'geojson', data: districts, attribution: t('map.attribution') })
    for (const level of ['region', 'district']) {
      const source = level === 'region' ? 'solar-regions' : 'solar-districts'
      map.addLayer({ id: `solar-${level}-fill`, type: 'fill', source, paint: { 'fill-color': '#f1cd91', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.62, 13, 0.32, 15, 0.04] } })
      map.addLayer({ id: `solar-${level}-line`, type: 'line', source, paint: { 'line-color': level === 'region' ? '#6d817a' : '#9aaa9e', 'line-width': level === 'region' ? 1.2 : 0.8, 'line-opacity': 0.8 } })
      map.addLayer({ id: `solar-${level}-selected`, type: 'line', source, filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#175a4c', 'line-width': 3, 'line-opacity': 0.95 } })
    }
    const archive = buildingArchiveUrl()
    if (archive) {
      map.addSource('solar-buildings', { type: 'vector', url: `pmtiles://${archive}`, minzoom: BUILDING_MIN_ZOOM, maxzoom: BUILDING_MAX_ZOOM, promoteId: 'building_uid',
        attribution: t('map.attribution') })
      const filter = buildingFilter(data.value, filters)
      // Keep feature-state expressions fixed: rewriting them on every slider
      // input makes MapLibre reprocess the source tiles. Layer opacity is a
      // constant paint update; highlighted buildings render independently.
      map.addLayer({ id: 'solar-building-fill', type: 'fill', source: 'solar-buildings', 'source-layer': BUILDING_SOURCE_LAYER, minzoom: BUILDING_MIN_ZOOM, filter,
        paint: { 'fill-color': ['case', ['==', ['get', 'pvout_status'], 'NoData'], '#c7973d',
          ['interpolate', ['linear'], ['get', 'capacity_kwp'], 0, '#a5d4c8', 8, '#5aa895', 25, '#267f79', 100, '#15586b', 500, '#163d56']],
          'fill-opacity': ['case', highlightedBuilding, 0, 1],
          'fill-layer-opacity': buildingFillOpacity.value, 'fill-layer-opacity-transition': { duration: 0, delay: 0 } } })
      map.addLayer({ id: 'solar-building-highlight', type: 'fill', source: 'solar-buildings', 'source-layer': BUILDING_SOURCE_LAYER, minzoom: BUILDING_MIN_ZOOM, filter,
        paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ed9138', '#f3b55d'],
          'fill-opacity': ['case', highlightedBuilding, 0.9, 0] } })
      map.addLayer({ id: 'solar-building-outline', type: 'line', source: 'solar-buildings', 'source-layer': BUILDING_SOURCE_LAYER, minzoom: BUILDING_MIN_ZOOM, filter,
        paint: { 'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#a24918', ['boolean', ['feature-state', 'hover'], false], '#ba6a29', '#346f6a'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, ['boolean', ['feature-state', 'hover'], false], 1.5, 0.25], 'line-opacity': 0.8 } })
    } else { buildingsVisible.value = false; mapError.value = 'map.archiveError' }
    for (const feature of regions.features) {
      const element = document.createElement('div'); element.className = 'admin-map-label'
      element.setAttribute('aria-hidden', 'true')
      markers.push({ marker: new Marker({ element }).setLngLat(featureCenter(feature as Feature<MultiPolygon>) as [number, number]).addTo(map), name: feature.properties.wilayah })
    }
    ready.value = true; busy.value = false; updateAppearance(); updateMapLanguage(); focusSelection()
    if (import.meta.env.DEV) window.__SOLAR_MAP__ = map
  })
  // Refit the current opening/full-DKI view on resize, preserving manual navigation.
  resizeObserver = new ResizeObserver(() => { map?.resize(); if (fittedView) fitView(fittedView, 0); positionOverlays() })
  resizeObserver.observe(container.value)
  overlayResizeObserver = new ResizeObserver(positionOverlays)
  if (overlays.value) overlayResizeObserver.observe(overlays.value)
  const attribution = container.value.querySelector('.maplibregl-ctrl-attrib')
  if (attribution) overlayResizeObserver.observe(attribution)
}

watch([metric, buildingsVisible, boundariesVisible, districtLinesVisible, choroplethVisible, basemap, baseUnavailable, imageryUnavailable, () => filters.regionId, () => filters.districtId, () => filters.typeId], updateAppearance)
watch(buildingsVisible, visible => { if (!visible) opacityOpen.value = false })
watch(buildingFillOpacity, opacity => {
  if (map?.getLayer('solar-building-fill')) map.setPaintProperty('solar-building-fill', 'fill-layer-opacity', opacity)
})
watch(() => [filters.regionId, filters.districtId], () => { emit('select', null); clearHover(); filters.regionId ? focusSelection() : resetView() })
watch(() => filters.typeId, () => { emit('select', null); clearHover() })
watch(() => props.selectedId, (id, previous) => { setFeature(previous, { selected: false }); setFeature(id, { selected: true }) })
watch(locale, updateMapLanguage)
onMounted(() => { void initialize().catch(error => { busy.value = false; mapError.value = 'map.initializeError'; console.error('Map initialization failed', error) }) })
onBeforeUnmount(() => { disposed = true; resizeObserver?.disconnect(); overlayResizeObserver?.disconnect(); markers.forEach(({ marker }) => marker.remove()); if (import.meta.env.DEV) delete window.__SOLAR_MAP__; map?.remove() })
defineExpose({ resetView })
declare global { interface Window { __SOLAR_MAP__?: MapLibreMap } }
</script>

<template>
  <section ref="panel" class="map-panel" :aria-label="t('map.label')" :class="{ 'imagery-basemap': basemap === 'google-imagery' && !imageryUnavailable }">
    <header class="map-panel-header"><div class="map-title"><AppIcon name="globe" :size="18" /><strong>{{ t('map.title') }}</strong><span class="map-scope">{{ scope }}</span></div>
      <div class="map-toolbar"><details ref="layerMenu" class="layer-menu" @toggle="handleLayerMenuToggle" @keydown.esc.stop.prevent="closeLayers"><summary class="button button-quiet"><AppIcon name="layers" :size="16" /> {{ t('map.layers') }}</summary><div class="layer-popover">
        <div class="layer-popover-header"><strong>{{ t('map.display') }}</strong><button type="button" class="icon-button" data-testid="layer-close" :aria-label="t('map.closeLayers')" :title="t('map.closeLayers')" @click="closeLayers"><AppIcon name="close" :size="16" /></button></div>
        <div class="building-layer-row">
          <label><input v-model="buildingsVisible" type="checkbox" data-testid="buildings-visible"> {{ t('kpi.eligible') }} <small>zoom {{ BUILDING_MIN_ZOOM }}+</small></label>
          <button type="button" class="icon-button opacity-toggle" data-testid="opacity-toggle" :disabled="!buildingsVisible" :aria-expanded="opacityOpen" aria-controls="building-opacity-panel" :aria-label="t('map.adjustOpacity')" :title="t('map.adjustOpacity')" @click="opacityOpen = !opacityOpen"><AppIcon name="filter" :size="16" /></button>
        </div>
        <div v-show="opacityOpen" id="building-opacity-panel" class="building-opacity" role="group" :aria-label="t('map.buildingOpacity')">
          <div class="opacity-heading"><label for="building-opacity">{{ t('map.opacity') }}</label><output for="building-opacity">{{ n(buildingOpacity, 0) }}%</output></div>
          <input id="building-opacity" v-model.number="buildingOpacity" data-testid="building-opacity" type="range" min="0" max="100" step="5" :disabled="!buildingsVisible" :aria-valuetext="t('map.opacityValue', { value: n(buildingOpacity, 0) })">
          <div class="opacity-limits" aria-hidden="true"><span>{{ t('map.moreTransparent') }}</span><span>{{ t('map.moreSolid') }}</span></div>
        </div>
        <label><input v-model="choroplethVisible" type="checkbox"> {{ t('map.choropleth') }}</label><label><input v-model="boundariesVisible" type="checkbox"> {{ t('map.boundaries') }}</label><label><input v-model="districtLinesVisible" type="checkbox"> {{ t('map.districts') }}</label>
        <div class="filter-divider" /><span class="field-label">{{ t('map.basemap') }}</span><div class="segmented basemap-options" role="group" :aria-label="t('map.chooseBasemap')"><button :aria-pressed="basemap === 'openfreemap'" data-testid="basemap-openfreemap" @click="basemap = 'openfreemap'">OpenFreeMap</button><button :aria-pressed="basemap === 'google-imagery'" data-testid="basemap-google" @click="basemap = 'google-imagery'">{{ t('map.google') }}</button></div>
      </div></details><button class="icon-button" data-testid="map-extent" :title="t('map.extent')" :aria-label="t('map.extent')" @click="resetView"><AppIcon name="extent" :size="18" /></button></div>
    </header>
    <div class="map-viewport">
      <div ref="container" class="map-canvas" data-testid="solar-map" />
      <div v-if="basemapNotice" class="basemap-notice" role="status">{{ basemapNotice }}</div>
      <div v-if="mapError" class="map-error" role="alert"><AppIcon name="info" :size="17" />{{ t(mapError) }}</div>
      <div v-else-if="emptyView && !busy" class="map-empty" role="status">{{ t('map.empty') }}</div>
      <div v-if="!ready && busy" class="map-loading"><span class="spinner" /><strong>{{ t('map.preparing') }}</strong><span>{{ t('map.loading') }}</span></div>
      <div v-if="tooltip && tooltipText" class="map-tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }" aria-hidden="true"><strong>{{ tooltipText.title }}</strong><span>{{ tooltipText.detail }}</span></div>
      <div ref="overlays" class="map-overlays">
        <div class="map-legend">
          <template v-if="zoom < BUILDING_MIN_ZOOM || !buildingsVisible"><label for="map-metric">{{ t('map.areaColors') }}</label><select id="map-metric" v-model="metric" :aria-label="t('map.metric')"><option v-for="(label, key) in metricLabels" :key="key" :value="key">{{ t(label) }}</option></select><div class="choropleth-ramp" /><div class="legend-ticks"><span>0</span><span>{{ legendNumber(metricMax) }} {{ metricUnit }}</span></div><p><i class="legend-dot missing" /> {{ t('map.energyUnavailable') }}</p></template>
          <template v-else><label>{{ t('map.buildingPotential') }}</label><div class="building-ramp" /><div class="legend-ticks"><span>0</span><span>25</span><span>≥ 500</span></div><p><i class="legend-dot amber" /> {{ t('common.pvoutMissing') }}</p></template>
        </div>
        <div class="map-instructions"><span class="status-dot" :class="{ pending: busy }" /><span>{{ zoom < BUILDING_MIN_ZOOM ? t('map.zoomHint') : t('map.clickHint') }}</span><button v-if="zoom >= BUILDING_MIN_ZOOM && buildingsVisible" :title="t('map.inspectTitle')" :aria-label="t('map.inspectLabel')" data-testid="inspect-center" @click="inspectCenter"><AppIcon name="cursor" :size="15" /> {{ t('map.inspect') }}</button><small>z{{ n(zoom, 1) }}</small></div>
      </div>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.map-overlays { position: absolute; left: 8px; bottom: 8px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: calc(100% - 16px); z-index: 2; pointer-events: none; }
.map-overlays > .map-legend, .map-overlays > .map-instructions { position: static; inset: auto; max-width: 100%; pointer-events: auto; }
.map-overlays > .map-instructions { flex-wrap: wrap; row-gap: 4px; }
.layer-popover-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.layer-popover-header .icon-button { width: 32px; height: 32px; }
.building-layer-row { display: flex; align-items: center; gap: 6px; }
.building-layer-row > label { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; margin: 4px 0; }
.building-layer-row small { margin-left: auto; color: #767f76; font-size: 10px; white-space: nowrap; }
.building-layer-row .opacity-toggle { width: 28px; height: 28px; background: transparent; border-color: transparent; }
.opacity-toggle[aria-expanded="true"] { color: var(--green); background: #edf4ed; }
.building-opacity { margin: 5px 0 12px 22px; padding: 10px; border: 1px solid #e3ebe3; border-radius: 7px; background: #f5f8f3; }
.opacity-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; }
.opacity-heading output { color: var(--green); font-weight: 650; font-variant-numeric: tabular-nums; }
.building-opacity input[type="range"] { display: block; width: 100%; height: 20px; margin: 8px 0 4px; cursor: pointer; }
.opacity-limits { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 9px; }
</style>
