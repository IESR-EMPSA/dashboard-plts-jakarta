<script setup lang="ts">
import { useI18n } from './i18n/index.ts'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useDashboard } from './composables/useDashboard.ts'
import type { NormalizedBuildingProperties } from './types/dashboard.ts'
import AppIcon from './components/AppIcon.vue'
import KpiCards from './components/dashboard/KpiCards.vue'
import CoverageCard from './components/dashboard/CoverageCard.vue'
import AnalyticalCharts from './components/dashboard/AnalyticalCharts.vue'
import AdminFilters from './components/filters/AdminFilters.vue'
import MapLoading from './components/map/MapLoading.vue'
import BuildingDetails from './components/map/BuildingDetails.vue'
import MethodologyPanel from './components/methodology/MethodologyPanel.vue'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import iesrLogo from './assets/iesr-logo.png'

const { t, errorMessage, locale, regionName, districtName, typeName } = useI18n()
watchEffect(() => {
  document.documentElement.lang = locale.value
  document.title = `${t('app.title')} | IESR`
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'))
})

// Keep the data dashboard usable while the larger WebGL module loads separately.
const SolarMap = defineAsyncComponent({ loader: () => import('./components/map/SolarMap.vue'),
  loadingComponent: MapLoading, errorComponent: MapLoading, delay: 0, timeout: 30000 })
const dashboard = useDashboard()
const { data, status, error, filters, kpis } = dashboard
const selected = shallowRef<Readonly<NormalizedBuildingProperties> | null>(null)
const solarMap = ref<InstanceType<typeof SolarMap> | null>(null)
const methodology = ref<InstanceType<typeof MethodologyPanel> | null>(null)
const activeTab = ref('map')
const scope = computed(() => {
  const district = data.value?.districts.districts.find(d => d.id === filters.districtId)
  const region = data.value?.regions.regions.find(r => r.id === filters.regionId)
  const type = data.value?.types.types.find(t => t.id === filters.typeId)
  const area = district ? districtName(district.kecamatan) : region ? regionName(region.wilayah) : t('common.allJakarta')
  return type ? `${area} · ${typeName(type.jenis_group)}` : area
})
async function reset() { dashboard.resetFilters(); selected.value = null; await nextTick(); solarMap.value?.resetView() }
function navigate(id: string) { activeTab.value = id; document.getElementById(id === 'map' ? 'map-overview' : 'analisis')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }
function escape(event: KeyboardEvent) { if (event.key === 'Escape') selected.value = null }
onMounted(() => { void dashboard.load(); window.addEventListener('keydown', escape) })
onBeforeUnmount(() => window.removeEventListener('keydown', escape))
</script>

<template>
  <a class="skip-link" href="#main-content">{{ t('app.skip') }}</a>
  <header class="app-header">
    <a class="brand" href="#main-content" aria-label="IESR Jakarta Solar Explorer"><img class="brand-logo" :src="iesrLogo" alt="" width="40" height="40"><span class="brand-name">IESR<span>JAKARTA SOLAR EXPLORER</span></span></a>
    <nav class="header-nav" :aria-label="t('app.nav')"><button :aria-current="activeTab === 'map' ? 'page' : undefined" @click="navigate('map')">{{ t('app.mapTab') }}</button><button :aria-current="activeTab === 'analisis' ? 'page' : undefined" @click="navigate('analisis')">{{ t('app.analysisTab') }}</button></nav>
    <div class="header-actions"><LanguageSwitcher /><button class="button button-outline" @click="methodology?.open()" :aria-label="t('app.methodology')" :title="t('app.methodology')"><AppIcon name="info" :size="16" />{{ t('app.methodology') }}</button></div>
  </header>
  <main id="main-content">
    <section id="map-overview" class="map-overview" :aria-label="t('app.overview')">
      <section class="intro-row"><h1>{{ t('app.title') }}</h1><div class="intro-context"><AppIcon name="pin" :size="18" /><div><strong>{{ t('app.location') }}</strong><span>{{ data ? t('app.areaCounts', { regions: data.regions.regions.length, districts: data.districts.districts.length }) : t('app.preparingAreas') }}</span></div></div></section>
      <div v-if="status === 'error'" class="app-alert" role="alert"><AppIcon name="info" /><div><strong>{{ t('app.dataError') }}</strong><p>{{ errorMessage(error) }}</p></div><button class="button button-outline" @click="dashboard.refresh()">{{ t('app.retry') }}</button></div>
      <div v-if="kpis.status === 'unsupported'" class="unsupported-notice" role="status"><AppIcon name="info" :size="18" /><p>{{ t('app.unsupported') }}</p><button class="text-button" @click="dashboard.setBuildingType(null)">{{ t('app.regionalStats') }} <AppIcon name="arrow" :size="15" /></button></div>
      <KpiCards :selection="kpis" :loading="status === 'loading' || status === 'idle'" />
      <section id="workspace" class="workspace">
        <aside class="analysis-sidebar" tabindex="0" :aria-label="t('app.sidebar')"><AdminFilters @reset="reset" /><CoverageCard :selection="kpis" :scope="scope" /></aside>
        <SolarMap v-if="data" ref="solarMap" :selected-id="selected?.building_uid ?? null" :scope="scope" @select="selected = $event">
          <BuildingDetails v-if="selected" :building="selected" @close="selected = null" />
        </SolarMap>
        <MapLoading v-else :error="error" />
      </section>
    </section>
    <AnalyticalCharts v-if="data" :scope="scope" />
  </main>
  <footer class="app-footer"><span><strong>IESR</strong> · Jakarta Solar Explorer</span></footer>
  <MethodologyPanel ref="methodology" />
</template>
