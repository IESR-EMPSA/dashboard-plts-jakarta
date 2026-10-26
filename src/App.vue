<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
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
  const area = district?.kecamatan ?? region?.wilayah ?? 'Seluruh DKI Jakarta'
  return type ? `${area} · ${type.jenis_group}` : area
})
const filtered = computed(() => Boolean(filters.regionId || filters.districtId || filters.typeId))
async function reset() { dashboard.resetFilters(); selected.value = null; await nextTick(); solarMap.value?.resetView() }
function navigate(id: string) { activeTab.value = id; document.getElementById(id === 'map' ? 'workspace' : 'analisis')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }
function escape(event: KeyboardEvent) { if (event.key === 'Escape') selected.value = null }
onMounted(() => { void dashboard.load(); window.addEventListener('keydown', escape) })
onBeforeUnmount(() => window.removeEventListener('keydown', escape))
</script>

<template>
  <a class="skip-link" href="#main-content">Lewati ke konten utama</a>
  <header class="app-header">
    <a class="brand" href="#main-content" aria-label="IESR Jakarta Solar Explorer"><span class="brand-emblem"><AppIcon name="sun" :size="23" /></span><span class="brand-name">IESR<span>JAKARTA SOLAR EXPLORER</span></span></a>
    <nav class="header-nav" aria-label="Navigasi utama"><button :aria-current="activeTab === 'map' ? 'page' : undefined" @click="navigate('map')">Peta & potensi</button><button :aria-current="activeTab === 'analisis' ? 'page' : undefined" @click="navigate('analisis')">Analisis data</button></nav>
    <div class="header-actions"><span class="model-badge"><span class="status-dot" />Data termodelkan</span><button class="button button-outline" @click="methodology?.open()"><AppIcon name="info" :size="16" />Metodologi</button></div>
  </header>
  <main id="main-content">
    <section class="intro-row"><div><div class="section-eyebrow">RISET ENERGI · DKI JAKARTA</div><h1>Potensi Surya Atap Jakarta<span>.</span></h1><p>Memetakan peluang energi bersih, satu atap pada satu waktu.</p></div><div class="intro-context"><AppIcon name="pin" :size="18" /><div><strong>Daerah Khusus Ibukota Jakarta</strong><span>{{ data ? `${data.regions.regions.length} kabupaten / kota · ${data.districts.districts.length} kecamatan` : 'Menyiapkan cakupan wilayah…' }}</span></div></div></section>
    <div class="scope-row"><div><span class="scope-label">CAKUPAN ANALISIS</span><span class="scope-pill" data-testid="scope-label"><AppIcon name="globe" :size="15" />{{ scope }}<button v-if="filtered" aria-label="Hapus semua filter" @click="reset"><AppIcon name="close" :size="13" /></button></span></div><span class="technical-caption">Potensi teknis, bukan kapasitas terpasang</span></div>
    <div v-if="status === 'error'" class="app-alert" role="alert"><AppIcon name="info" /><div><strong>Data belum dapat dimuat.</strong><p>{{ error?.message }}</p></div><button class="button button-outline" @click="dashboard.refresh()">Coba lagi</button></div>
    <div v-if="kpis.status === 'unsupported'" class="unsupported-notice" role="status"><AppIcon name="info" :size="18" /><p>Statistik gabungan <strong>wilayah × jenis bangunan</strong> belum tersedia. Peta tetap mengikuti pilihan Anda; KPI tidak dihitung dari bangunan yang terlihat.</p><button class="text-button" @click="dashboard.setBuildingType(null)">Lihat statistik wilayah <AppIcon name="arrow" :size="15" /></button></div>
    <KpiCards :selection="kpis" :loading="status === 'loading' || status === 'idle'" />
    <div class="generation-caption"><AppIcon name="info" :size="14" /><span>Estimasi listrik hanya mencakup bangunan dengan PVOUT. Nilai tidak tersedia tidak dianggap nol.</span></div>
    <section id="workspace" class="workspace">
      <aside class="analysis-sidebar"><AdminFilters @reset="reset" @methodology="methodology?.open()" /><CoverageCard :selection="kpis" :scope="scope" /></aside>
      <SolarMap v-if="data" ref="solarMap" :selected-id="selected?.building_uid ?? null" :scope="scope" @select="selected = $event">
        <BuildingDetails v-if="selected" :building="selected" @close="selected = null" />
      </SolarMap>
      <MapLoading v-else :error="error" />
    </section>
    <AnalyticalCharts v-if="data" :scope="scope" />
    <section class="closing-note"><span class="closing-icon"><AppIcon name="sun" :size="23" /></span><div><h2>Angka besar dimulai dari pemahaman yang tepat.</h2><p>Potensi ini adalah titik awal untuk riset, perencanaan energi, dan kajian tapak yang lebih mendalam.</p></div><button class="button button-outline" @click="methodology?.open()">Baca metodologi <AppIcon name="arrow" :size="16" /></button></section>
  </main>
  <footer class="app-footer"><span><strong>IESR</strong> · Jakarta Solar Explorer</span><span>Analisis potensi PLTS atap · Data penelitian, bukan rekomendasi kelayakan lokasi</span><button class="text-button" @click="methodology?.open()">Sumber & keterbatasan <AppIcon name="arrow" :size="14" /></button></footer>
  <MethodologyPanel ref="methodology" />
</template>
